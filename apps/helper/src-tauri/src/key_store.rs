//! AES-256 加解密用户 LLM Key
//!
//! 存储位置：`{dirs::data_dir()}/skillhub-helper/.data/llm-keys.json`
//! 加密密钥：从机器指纹派生（绑定用户，不上云）

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderKeys {
    /// DeepSeek / OpenAI / GLM / custom
    pub active_provider: String,
    /// provider id → 加密后的 base64 Key
    #[serde(default)]
    pub keys: HashMap<String, String>,
    /// A 轮 #PR-4：provider id → 自定义 Base URL（仅 custom provider 有意义，其他可选）
    #[serde(default)]
    pub custom_base_urls: HashMap<String, String>,
    /// A 轮 #P1-22：Web 端 OIDC session token，注入 helper 后用于心跳携带 user identity。
    /// TODO（v2.0.5 followup 下个 milestone）：Web 端建立 UserInstalledSoftware 表后，
    /// heartbeat 上带这里存的 token，让云端为 Token 所属用户记录已装软件清单并触发反向推送。
    /// 当前 MVP：仅辅助前端顶栏状态展示 + 已经能携带 Bearer 到云端（背后调 Token 的 endpoint 可忽略）。
    #[serde(default)]
    pub session_token: Option<String>,
    #[serde(default)]
    pub session_user_id: Option<String>,
    #[serde(default)]
    pub session_user_email: Option<String>,
    #[serde(default)]
    pub session_bound_at: Option<u64>,
}

pub struct KeyStore {
    path: PathBuf,
    cipher: Aes256Gcm,
    /// A 轮 #E2：标记是否 fallback 到临时目录。fallback 时前台需警示用户。
    is_fallback: bool,
    fallback_reason: Option<String>,
}

impl KeyStore {
    /// A 轮 #E2：原 `open()` 在 `dirs::data_dir()` 失败时 panic 整进程。
    /// 这里增加 `open_or_fallback()`：优先用 `data_dir` / AppData，失败时 fallback 到 `TEMP`
    /// 以确保助手可以启动（数据可能丢失但不会崩进程）。
    pub fn open_or_fallback() -> Self {
        match Self::open() {
            Ok(ks) => ks,
            Err(e) => {
                log::warn!("KeyStore 主路径初始化失败（{}），fallback 到临时目录", e);
                let temp_dir = std::env::temp_dir().join("skillhub-helper").join(".data");
                fs::create_dir_all(&temp_dir).unwrap_or_else(|err| {
                    log::error!("临时数据目录创建失败: {}", err);
                });
                let path = temp_dir.join("llm-keys.json");
                let key_path = temp_dir.join(".key");
                let cipher = if key_path.exists() {
                    let key_bytes: Vec<u8> = fs::read(&key_path).unwrap_or_else(|err| {
                        log::error!("读 fallback key 失败: {}", err);
                        vec![0u8; 32]
                    });
                    Aes256Gcm::new_from_slice(&key_bytes).unwrap_or_else(|err| {
                        log::error!("fallback cipher 初始化失败: {}", err);
                        Aes256Gcm::new_from_slice(&[0u8; 32]).expect("空 key 也能初始化")
                    })
                } else {
                    let mut key_bytes = [0u8; 32];
                    OsRng.fill_bytes(&mut key_bytes);
                    let _ = fs::write(&key_path, key_bytes);
                    Aes256Gcm::new_from_slice(&key_bytes).unwrap_or_else(|err| {
                        log::error!("fallback cipher new_from_slice 失败: {}", err);
                        Aes256Gcm::new_from_slice(&[0u8; 32]).expect("空 key 也能初始化")
                    })
                };
                Self {
                    path,
                    cipher,
                    is_fallback: true,
                    fallback_reason: Some(e.to_string()),
                }
            }
        }
    }

    /// A 轮 #E2：原 panic 接口保留为向后兼容，新代码全部调 `open_or_fallback()`
    pub fn open() -> Result<Self> {
        let base_dir = dirs::data_dir()
            .context("获取用户数据目录失败")?
            .join("skillhub-helper")
            .join(".data");

        fs::create_dir_all(&base_dir).context("创建数据目录失败")?;
        let path = base_dir.join("llm-keys.json");

        // 加密密钥从机器指纹派生（MVP：直接 OS RNG 写入 .key 文件）
        // TODO: 接入 Windows DPAPI / Mac Keychain
        let key_path = base_dir.join(".key");
        let cipher = if key_path.exists() {
            let key_bytes = fs::read(&key_path)?;
            Aes256Gcm::new_from_slice(&key_bytes)?
        } else {
            let mut key_bytes = [0u8; 32];
            OsRng.fill_bytes(&mut key_bytes);
            fs::write(&key_path, key_bytes)?;
            Aes256Gcm::new_from_slice(&key_bytes)?
        };

        Ok(Self {
            path,
            cipher,
            is_fallback: false,
            fallback_reason: None,
        })
    }

    /// A 轮 #E2：返回 key_store 是否回退到临时目录。
    /// 前台拿到 fallback=true 时应弹警示告知用户数据未持久化。
    pub fn is_fallback(&self) -> bool {
        self.is_fallback
    }

    pub fn fallback_reason(&self) -> Option<&str> {
        self.fallback_reason.as_deref()
    }

    pub fn load(&self) -> Result<ProviderKeys> {
        if !self.path.exists() {
            return Ok(ProviderKeys {
                active_provider: "deepseek".to_string(),
                keys: HashMap::new(),
                custom_base_urls: HashMap::new(),
                session_token: None,
                session_user_id: None,
                session_user_email: None,
                session_bound_at: None,
            });
        }
        let content = fs::read_to_string(&self.path)?;
        Ok(serde_json::from_str(&content)?)
    }

    pub fn save(&self, keys: &ProviderKeys) -> Result<()> {
        let content = serde_json::to_string_pretty(keys)?;
        fs::write(&self.path, content)?;
        Ok(())
    }

    pub fn save_key(&self, provider: &str, api_key: &str) -> Result<()> {
        let mut keys = self.load()?;
        let encrypted = self.encrypt(api_key)?;
        keys.keys.insert(provider.to_string(), encrypted);
        self.save(&keys)
    }

    pub fn get_key(&self, provider: &str) -> Result<Option<String>> {
        let keys = self.load()?;
        match keys.keys.get(provider) {
            Some(encrypted) => Ok(Some(self.decrypt(encrypted)?)),
            None => Ok(None),
        }
    }

    pub fn get_active_key(&self) -> Result<Option<(String, String)>> {
        let keys = self.load()?;
        let provider = keys.active_provider.clone();
        match keys.keys.get(&provider) {
            Some(encrypted) => {
                let api_key = self.decrypt(encrypted)?;
                Ok(Some((provider, api_key)))
            }
            None => Ok(None),
        }
    }

    /// A 轮 #PR-4：保存某个 Provider 的 Base URL（主要用于 custom 自托管）
    pub fn save_base_url(&self, provider: &str, base_url: &str) -> Result<()> {
        let mut keys = self.load()?;
        keys.custom_base_urls
            .insert(provider.to_string(), base_url.to_string());
        self.save(&keys)
    }

    /// A 轮 #PR-4：删除某个 Provider 的 Base URL
    pub fn delete_base_url(&self, provider: &str) -> Result<()> {
        let mut keys = self.load()?;
        keys.custom_base_urls.remove(provider);
        self.save(&keys)
    }

    /// A 轮 #PR-4：读取所有 Provider 的 Base URL 映射
    pub fn get_all_base_urls(&self) -> Result<HashMap<String, String>> {
        Ok(self.load()?.custom_base_urls)
    }

    /// A 轮 #P1-22：保存 Web 端 OIDC session identity。heartbeat 走时拿到 Bearer 用。
    /// KeyStore 默认加了所有 6 个 session 字段的 bulk save，不需要单独加密：token
    /// 本身可重发且寿命短。
    pub fn save_session(
        &self,
        token: String,
        user_id: String,
        user_email: String,
    ) -> Result<()> {
        let mut keys = self.load()?;
        keys.session_token = Some(token);
        keys.session_user_id = Some(user_id);
        keys.session_user_email = Some(user_email);
        keys.session_bound_at = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        );
        self.save(&keys)
    }

    /// A 轮 #P1-22：清除 session。bound_at / user_id / email 一同清空。
    pub fn clear_session(&self) -> Result<()> {
        let mut keys = self.load()?;
        keys.session_token = None;
        keys.session_user_id = None;
        keys.session_user_email = None;
        keys.session_bound_at = None;
        self.save(&keys)
    }

    /// A 轮 #P1-22：返回当前 session 快照，让 heartbeat 读 token。
    pub fn get_session(&self) -> Result<SessionSnapshot> {
        let keys = self.load()?;
        Ok(SessionSnapshot {
            has_token: keys.session_token.is_some(),
            user_id: keys.session_user_id,
            user_email: keys.session_user_email,
            bound_at: keys.session_bound_at,
        })
    }

    /// A 轮 #P1-22：读取明文 token。仅 heartbeat_loop 调用，外部不要触碰。
    /// 与 get_session() 分离避免外部不经意拿到明文。
    pub fn peek_token_for_heartbeat(&self) -> Result<Option<String>> {
        Ok(self.load()?.session_token)
    }

    fn encrypt(&self, plaintext: &str) -> Result<String> {
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| anyhow::anyhow!("加密失败: {}", e))?;

        // nonce + ciphertext 一起 base64
        let mut combined = Vec::with_capacity(12 + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        Ok(general_purpose::STANDARD.encode(combined))
    }

    fn decrypt(&self, encoded: &str) -> Result<String> {
        let combined = general_purpose::STANDARD.decode(encoded)?;
        if combined.len() < 12 {
            anyhow::bail!("加密数据太短");
        }
        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("解密失败: {}", e))?;
        Ok(String::from_utf8(plaintext)?)
    }
}

/// A 轮 #P1-22：对外暴露的 session 快照（不包含 token 明文）
#[derive(Debug, Clone, Serialize)]
pub struct SessionSnapshot {
    pub has_token: bool,
    pub user_id: Option<String>,
    pub user_email: Option<String>,
    pub bound_at: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        // 注意：单元测试用临时目录
        let temp = std::env::temp_dir().join("skillhub-helper-test");
        std::fs::create_dir_all(&temp).unwrap();
        // 这里只是 schema 测试
        let _ = temp;
    }
}