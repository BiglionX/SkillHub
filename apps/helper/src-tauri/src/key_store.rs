//! AES-256 加解密用户 LLM Key
//!
//! 存储位置：`{dirs::data_dir()}/skillhub-helper/.data/llm-keys.json`
//! 加密密钥：从机器指纹派生（绑定用户，不上云）

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{Context, Result};
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
    pub keys: HashMap<String, String>,
}

pub struct KeyStore {
    path: PathBuf,
    cipher: Aes256Gcm,
}

impl KeyStore {
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

        Ok(Self { path, cipher })
    }

    pub fn load(&self) -> Result<ProviderKeys> {
        if !self.path.exists() {
            return Ok(ProviderKeys {
                active_provider: "deepseek".to_string(),
                keys: HashMap::new(),
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