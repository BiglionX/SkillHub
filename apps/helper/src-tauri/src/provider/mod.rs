//! LLM Provider 适配层
//!
//! 支持 DeepSeek / OpenAI / GLM（OpenAI 兼容协议）
//! 自定义 baseURL 用于自托管 vLLM 等

pub mod deepseek;
pub mod glm;
pub mod openai;

use serde::{Deserialize, Serialize};

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

pub struct LlmProvider;

impl LlmProvider {
    /// 调 LLM 聊天（OpenAI 兼容协议）
    pub async fn chat(
        config: &ProviderConfig,
        req: &ChatRequest,
    ) -> Result<ChatResponse, ProviderError> {
        let (base_url, default_model) = match config.provider.as_str() {
            "deepseek" => (
                config.base_url.clone().unwrap_or_else(|| "https://api.deepseek.com".to_string()),
                "deepseek-chat".to_string(),
            ),
            "openai" => (
                config.base_url.clone().unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
                "gpt-4o-mini".to_string(),
            ),
            "glm" => (
                config.base_url.clone().unwrap_or_else(|| "https://open.bigmodel.cn/api/paas/v4".to_string()),
                "glm-4-flash".to_string(),
            ),
            "custom" => (
                config.base_url.clone().ok_or_else(|| ProviderError::Config("custom Provider 必须提供 base_url".to_string()))?,
                config.model.clone(),
            ),
            _ => return Err(ProviderError::Config(format!("未知 Provider: {}", config.provider))),
        };

        let model = if config.model.is_empty() { default_model } else { config.model.clone() };

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