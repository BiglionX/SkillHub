//! LLM Provider 适配层
//!
//! 支持 DeepSeek / OpenAI / GLM（OpenAI 兼容协议）
//! 自定义 baseURL 用于自托管 vLLM 等

pub mod deepseek;
pub mod glm;
pub mod openai;

use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub provider: String, // "deepseek" | "openai" | "glm" | "custom"
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub json_mode: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    /// 总 token 数（in + out），保留旧字段以兼容既有调用方
    pub tokens_used: u32,
    /// 输入 token 数（OpenAI 兼容响应 `usage.prompt_tokens`），用于按 Provider 单价精确估算成本
    /// 若上游未返回，按 `tokens_used / 2` 估算
    pub tokens_in: u32,
    /// 输出 token 数（OpenAI 兼容响应 `usage.completion_tokens`）
    /// 若上游未返回，按 `tokens_used - tokens_in` 补齐
    pub tokens_out: u32,
    pub duration_ms: u64,
    /// 实际使用的模型 ID（取自请求体 `model` 字段，不是上游回显的 `model`）。
    /// 重要：桌面端 `llm_proxy.rs` 会把此字段写入 `usage_records.model`，若缺失
    /// 会导致 SQLite 里所有记录的 model 列被填成 tokens 数字串（见 commit 后
    /// CRITICAL #2 复盘）。
    pub model: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("HTTP 请求失败: {0}")]
    Http(String),
    #[error("Provider 返回错误: {0}")]
    Api(String),
    #[error("配置错误: {0}")]
    Config(String),
}

/// IPv4 地址是否属于禁止访问网段：私有 / 回环 / 链路本地 / 未指定 / 组播 / 保留 / 云元数据。
fn is_blocked_v4(v: Ipv4Addr) -> bool {
    let [a, b, _, _] = v.octets();
    v.is_private()
        || v.is_loopback()   // 127.0.0.0/8
        || v.is_link_local() // 169.254.0.0/16（含 169.254.169.254 云元数据）
        || v.is_unspecified() // 0.0.0.0
        || a == 0
        || a >= 224 // 组播 + 保留
        || (a == 100 && b == 100) // 阿里云元数据 100.100.0.0/16
}

/// IPv6 地址是否属于禁止访问网段：回环 / 未指定 / 链路本地 / 唯一本地 fc00::/7。
fn is_blocked_v6(v: Ipv6Addr) -> bool {
    let o = v.octets();
    v.is_loopback()      // ::1
        || v.is_unspecified() // ::
        || v.is_unicast_link_local() // fe80::/10
        || (o[0] & 0xfe) == 0xfc // fc00::/7
}

/// SSRF 防护：校验 Provider 的 Base URL。
///
/// - 必须以 `http://` 或 `https://` 开头；
/// - 拒绝 IP 字面量指向私有 / 回环 / 链路本地 / 云元数据地址；
/// - `allow_localhost = true` 时仅额外放行 `localhost` / `127.0.0.1`（含 `::1`）的 http；
/// - 非本地地址必须使用 https；域名形式的 `metadata.google.internal` 直接拒绝。
///
/// 不引入 `url` crate，使用字符串解析 + `std::net::IpAddr::from_str`。
pub fn validate_base_url(url: &str, allow_localhost: bool) -> Result<(), ProviderError> {
    let config_err = |msg: String| ProviderError::Config(msg);

    let (scheme, rest) = url.split_once("://").ok_or_else(|| {
        config_err("Base URL 必须以 http:// 或 https:// 开头".to_string())
    })?;
    let is_https = match scheme {
        "https" => true,
        "http" => false,
        other => {
            return Err(config_err(format!(
                "不支持的协议 '{}'，仅允许 http/https",
                other
            )))
        }
    };

    // 取 authority，去掉 userinfo（@ 之前），防止 `https://evil.com@localhost` 混淆
    let authority = rest.split('/').next().unwrap_or("");
    let host_port = authority.rsplit('@').next().unwrap_or(authority);

    // 拆 host / port，兼容 IPv6 字面量 [::1]:8080
    let host_raw = if let Some(inner) = host_port.strip_prefix('[') {
        inner.rsplit_once(']').map(|(h, _)| h).unwrap_or(host_port)
    } else if let Some((h, p)) = host_port.rsplit_once(':') {
        if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) {
            h
        } else {
            host_port
        }
    } else {
        host_port
    };

    if host_raw.is_empty() {
        return Err(config_err("Base URL 缺少主机名".to_string()));
    }
    if host_raw
        .chars()
        .any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(config_err("Base URL 主机名包含非法字符".to_string()));
    }

    let host_lower = host_raw.to_ascii_lowercase();
    let localhost_alias =
        host_lower == "localhost" || host_lower == "127.0.0.1" || host_lower == "::1";

    // IP 字面量黑名单
    if let Ok(ip) = IpAddr::from_str(host_raw) {
        let blocked = match ip {
            IpAddr::V4(v) => is_blocked_v4(v),
            IpAddr::V6(v) => is_blocked_v6(v),
        };
        // 唯一例外：显式允许 localhost，且地址确实是 loopback
        if blocked && !(allow_localhost && ip.is_loopback()) {
            return Err(config_err(format!(
                "Base URL 指向被禁止的地址 '{}'（私有/回环/链路本地/云元数据）",
                host_raw
            )));
        }
    } else if host_lower == "metadata.google.internal"
        || host_lower.ends_with(".metadata.google.internal")
    {
        return Err(config_err("云元数据域名被禁止".to_string()));
    }

    // 协议约束：localhost 仅在 allow_localhost 下允许 http；其余一律 https
    if localhost_alias {
        if !(allow_localhost && !is_https) {
            return Err(config_err(
                "localhost/127.0.0.1 仅允许在 allow_localhost=true 时使用 http".to_string(),
            ));
        }
    } else if !is_https {
        return Err(config_err(
            "Base URL 必须使用 https（仅本地 localhost / 127.0.0.1 可用 http）".to_string(),
        ));
    }

    Ok(())
}

pub struct LlmProvider;

impl LlmProvider {
    /// 调 LLM 聊天（OpenAI 兼容协议）
    pub async fn chat(
        config: &ProviderConfig,
        req: &ChatRequest,
    ) -> Result<ChatResponse, ProviderError> {
        let (base_url, default_model) = match config.provider.as_str() {
            // 内置 Provider：忽略传入的 base_url，强制使用硬编码官方地址，
            // 防止被篡改的配置把用户 Key 发到恶意端点。
            "deepseek" => (
                "https://api.deepseek.com".to_string(),
                "deepseek-chat".to_string(),
            ),
            "openai" => (
                "https://api.openai.com/v1".to_string(),
                "gpt-4o-mini".to_string(),
            ),
            "glm" => (
                "https://open.bigmodel.cn/api/paas/v4".to_string(),
                "glm-4-flash".to_string(),
            ),
            "custom" => {
                let base = config.base_url.clone().ok_or_else(|| {
                    ProviderError::Config("custom Provider 必须提供 base_url".to_string())
                })?;
                (base, config.model.clone())
            }
            _ => {
                return Err(ProviderError::Config(format!(
                    "未知 Provider: {}",
                    config.provider
                )))
            }
        };

        // 统一在构造请求 URL 前做 SSRF 校验：
        // 内置为硬编码 https 常量必然通过；custom 允许 localhost。
        validate_base_url(&base_url, config.provider == "custom")?;

        let model = if config.model.is_empty() {
            default_model
        } else {
            config.model.clone()
        };

        // 构造 OpenAI 兼容请求体
        let mut body = serde_json::json!({
            "model": model,
            "messages": req.messages,
        });
        if let Some(t) = req.temperature {
            body["temperature"] = serde_json::json!(t);
        }
        if let Some(m) = req.max_tokens {
            body["max_tokens"] = serde_json::json!(m);
        }
        if req.json_mode.unwrap_or(false) {
            body["response_format"] = serde_json::json!({"type": "json_object"});
        }

        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
        let started = std::time::Instant::now();

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| ProviderError::Http(e.to_string()))?;

        let res = client
            .post(&url)
            .bearer_auth(&config.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| ProviderError::Http(e.to_string()))?;

        let status_code = res.status();
        if !status_code.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(ProviderError::Api(format!("{} {}", status_code, text)));
        }

        let data: serde_json::Value = res
            .json()
            .await
            .map_err(|e| ProviderError::Http(format!("解析响应失败: {}", e)))?;

        let content = data["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| ProviderError::Api("响应缺少 choices".to_string()))?
            .to_string();

        // M4：从 OpenAI 兼容 usage 字段拆出 prompt / completion token 数（用于按 Provider 单价精确估算成本）
        let usage = &data["usage"];
        let total_tokens = usage["total_tokens"].as_u64().unwrap_or(0) as u32;
        let prompt_tokens = usage["prompt_tokens"].as_u64().map(|n| n as u32);
        let completion_tokens = usage["completion_tokens"].as_u64().map(|n| n as u32);
        // fallback：上游若未拆字段（如某些自托管 vLLM），按 total / 2 估算
        let (tokens_in, tokens_out) = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => (p, c),
            _ => {
                let half = total_tokens / 2;
                (half, total_tokens - half)
            }
        };

        Ok(ChatResponse {
            content,
            tokens_used: total_tokens,
            tokens_in,
            tokens_out,
            duration_ms: started.elapsed().as_millis() as u64,
            model: model.clone(),
        })
    }

    /// 测试 Key 是否有效（小请求）
    pub async fn test_connection(config: &ProviderConfig) -> Result<Vec<String>, String> {
        let req = ChatRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "hi".to_string(),
            }],
            temperature: Some(0.0),
            max_tokens: Some(5),
            json_mode: None,
        };

        match Self::chat(config, &req).await {
            Ok(_) => Ok(vec![config.model.clone()]),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_https_domain() {
        assert!(validate_base_url("https://api.deepseek.com/v1", false).is_ok());
        assert!(validate_base_url("https://open.bigmodel.cn/api/paas/v4", false).is_ok());
        assert!(validate_base_url("https://user:pass@example.com:8443/v1", false).is_ok());
    }

    #[test]
    fn validate_rejects_private_and_loopback_ips() {
        let bad = [
            "http://10.0.0.5",
            "http://172.16.0.1",
            "http://192.168.1.1",
            "http://0.0.0.0",
            "http://[fc00::1]",
            "http://[fe80::1]",
        ];
        for url in bad {
            assert!(
                validate_base_url(url, true).is_err(),
                "should reject private/loopback address: {}",
                url
            );
        }
        // 127.0.0.1 在 allow_localhost=false 时必须拒绝
        assert!(validate_base_url("http://127.0.0.1:8000", false).is_err());
    }

    #[test]
    fn validate_rejects_cloud_metadata() {
        assert!(validate_base_url("http://169.254.169.254/latest/meta-data", true).is_err());
        assert!(validate_base_url("http://100.100.100.200/latest/meta-data", true).is_err());
        assert!(validate_base_url("http://metadata.google.internal", true).is_err());
    }

    #[test]
    fn validate_allows_localhost_when_enabled() {
        assert!(validate_base_url("http://127.0.0.1:8000/v1", true).is_ok());
        assert!(validate_base_url("http://localhost:11434", true).is_ok());
        assert!(validate_base_url("http://[::1]:8080", true).is_ok());
    }

    #[test]
    fn validate_requires_https_for_non_localhost() {
        assert!(validate_base_url("http://api.example.com/v1", true).is_err());
        assert!(validate_base_url("ftp://example.com", true).is_err());
        assert!(validate_base_url("api.example.com/v1", true).is_err());
    }
}
