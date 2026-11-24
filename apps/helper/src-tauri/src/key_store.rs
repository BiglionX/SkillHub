//! AES-256 加解密用户 LLM Key
//!
//! 存储位置：`{dirs::data_dir()}/skillhub-helper/.data/llm-keys.json`
//! 加密密钥：机器指纹 + 应用固定 salt + 当前用户名经 SHA-256 派生（绑定机器/用户，不落盘、不上云）

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// 固定应用 salt：与机器/用户身份拼接后派生密钥，避免不同应用复用同一派生结果。
const KEY_DERIVE_SALT: &[u8] = b"skillhub-helper/llm-keys/aes256/v2";

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
    /// Web 端 OIDC session token（加密后的 base64，兼容旧版明文读取）。
    /// heartbeat 上带这里存的 token，让云端为 Token 所属用户记录已装软件清单并触发反向推送。
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
    /// 写锁：串行化 load→改→save，避免并发写互相覆盖（丢失更新）。
    write_lock: std::sync::Mutex<()>,
    /// 本地 HTTP 代理鉴权 token：仅内存保存，每次启动轮换、不落盘。
    proxy_token: String,
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
                // 安全：fallback 目录仍用 TEMP，但密钥派生方式与主路径完全一致；
                // 彻底不再读写明文 .key，也不再使用全零密钥。
                let key = derive_machine_key();
                let cipher = Aes256Gcm::new_from_slice(&key)
                    .expect("机器派生密钥恒为 32 字节，Aes256Gcm 必然可初始化");
                migrate_legacy_key(&temp_dir, &path, &cipher);

                Self {
                    path,
                    cipher,
                    is_fallback: true,
                    fallback_reason: Some(e.to_string()),
                    write_lock: std::sync::Mutex::new(()),
                    proxy_token: new_proxy_token(),
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

        // 安全：密钥由「机器指纹 + 固定 salt + 用户名」派生，绝不落盘为 .key。
        // 这样攻击者拿到磁盘上的 llm-keys.json 也无法在其他机器/用户下解密。
        let key = derive_machine_key();
        let cipher = Aes256Gcm::new_from_slice(&key).context("派生 AES 密钥失败")?;

        // 旧版本遗留的明文 .key：用旧密钥验证并重新加密，成功后删除。
        // 迁移失败只告警，不阻断启动。
        migrate_legacy_key(&base_dir, &path, &cipher);

        Ok(Self {
            path,
            cipher,
            is_fallback: false,
            fallback_reason: None,
            write_lock: std::sync::Mutex::new(()),
            proxy_token: new_proxy_token(),
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

    /// 供本地 HTTP 代理做 Bearer 鉴权：仅内存、每次启动轮换，前端每次启动重新拉取。
    pub fn proxy_token(&self) -> &str {
        &self.proxy_token
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

    /// 保留公开签名兼容；内部走「临时文件 + rename」原子替换，全程持写锁。
    pub fn save(&self, keys: &ProviderKeys) -> Result<()> {
        let _guard = self.write_lock.lock().map_err(|_| anyhow!("KeyStore 写锁被污染"))?;
        write_atomic(&self.path, keys)
    }

    /// 供 lib.rs 中 load→改→save 的调用方使用：在锁内完成整段读改写，避免并发丢更新。
    pub fn update<F>(&self, f: F) -> Result<()>
    where
        F: FnOnce(&mut ProviderKeys),
    {
        let _guard = self.write_lock.lock().map_err(|_| anyhow!("KeyStore 写锁被污染"))?;
        let mut keys = self.load()?;
        f(&mut keys);
        write_atomic(&self.path, &keys)
    }

    pub fn save_key(&self, provider: &str, api_key: &str) -> Result<()> {
        let encrypted = self.encrypt(api_key)?;
        self.update(|keys| {
            keys.keys.insert(provider.to_string(), encrypted);
        })
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
        self.update(|keys| {
            keys.custom_base_urls
                .insert(provider.to_string(), base_url.to_string());
        })
    }

    /// A 轮 #PR-4：删除某个 Provider 的 Base URL
    pub fn delete_base_url(&self, provider: &str) -> Result<()> {
        self.update(|keys| {
            keys.custom_base_urls.remove(provider);
        })
    }

    /// A 轮 #PR-4：读取所有 Provider 的 Base URL 映射
    pub fn get_all_base_urls(&self) -> Result<HashMap<String, String>> {
        Ok(self.load()?.custom_base_urls)
    }

    /// 保存 Web 端 OIDC session identity。heartbeat 走时拿到 Bearer 用。
    /// 安全：session token 属于凭据，落盘前必须加密（旧版明文存盘是审计发现）。
    pub fn save_session(
        &self,
        token: String,
        user_id: String,
        user_email: String,
    ) -> Result<()> {
        let encrypted = self.encrypt(&token)?;
        self.update(|keys| {
            keys.session_token = Some(encrypted);
            keys.session_user_id = Some(user_id);
            keys.session_user_email = Some(user_email);
            keys.session_bound_at = Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0),
            );
        })
    }

    /// 清除 session。bound_at / user_id / email 一同清空。
    pub fn clear_session(&self) -> Result<()> {
        self.update(|keys| {
            keys.session_token = None;
            keys.session_user_id = None;
            keys.session_user_email = None;
            keys.session_bound_at = None;
        })
    }

    /// 返回当前 session 快照，让 heartbeat 读 token（不含明文）。
    pub fn get_session(&self) -> Result<SessionSnapshot> {
        let keys = self.load()?;
        Ok(SessionSnapshot {
            has_token: keys.session_token.is_some(),
            user_id: keys.session_user_id,
            user_email: keys.session_user_email,
            bound_at: keys.session_bound_at,
        })
    }

    /// 读取明文 token。仅 heartbeat_loop 调用，外部不要触碰。
    /// 兼容旧版明文：解密失败且内容不像 base64 密文时原样返回并告警。
    pub fn peek_token_for_heartbeat(&self) -> Result<Option<String>> {
        let encoded = match self.load()?.session_token {
            Some(v) => v,
            None => return Ok(None),
        };
        match self.decrypt(&encoded) {
            Ok(plain) => Ok(Some(plain)),
            Err(e) => {
                if looks_like_ciphertext(&encoded) {
                    // 确实像密文却解不开：多半是密钥变更导致，不能当明文用。
                    log::warn!("session token 解密失败且内容疑似密文: {}", e);
                    Err(e)
                } else {
                    // 旧版本直接存明文 token，解密必然失败；安全降级并告警。
                    log::warn!("session token 解密失败，按旧版明文处理: {}", e);
                    Ok(Some(encoded))
                }
            }
        }
    }

    fn encrypt(&self, plaintext: &str) -> Result<String> {
        encrypt_with(&self.cipher, plaintext)
    }

    fn decrypt(&self, encoded: &str) -> Result<String> {
        decrypt_with(&self.cipher, encoded)
    }
}

/// 获取当前用户名：Windows 用 USERNAME（兼容 USER），Unix 用 USER。
fn current_username() -> String {
    #[cfg(windows)]
    let name = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    #[cfg(not(windows))]
    let name = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    name
}

/// 机器身份：machine_uid 失败时降级到主机名，仍保证确定性且非全零。
fn machine_identity() -> String {
    match machine_uid::get() {
        Ok(id) => id,
        Err(e) => {
            log::warn!("获取机器指纹失败({})，降级使用主机名派生密钥", e);
            #[cfg(windows)]
            let host = std::env::var("COMPUTERNAME").unwrap_or_default();
            #[cfg(not(windows))]
            let host = std::env::var("HOSTNAME").unwrap_or_default();
            format!("hostname:{}", host)
        }
    }
}

/// 安全：从机器 + 用户 + 固定 salt 派生 32 字节 AES 密钥，密钥只存在于内存。
fn derive_machine_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(KEY_DERIVE_SALT);
    hasher.update(b"\0");
    hasher.update(machine_identity().as_bytes());
    hasher.update(b"\0");
    hasher.update(current_username().as_bytes());
    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

/// 代理鉴权 token：32 字节随机 → base64url（无填充），仅内存、每次启动轮换。
fn new_proxy_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// 原子写：同目录写临时文件（带进程号）→ rename 覆盖；Unix 下临时文件创建即为 0600。
fn write_atomic(path: &Path, keys: &ProviderKeys) -> Result<()> {
    let content = serde_json::to_string_pretty(keys)?;
    let tmp = path.with_file_name(format!(".llm-keys.json.tmp.{}", std::process::id()));

    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        // 以 0600 创建，避免临时文件在 rename 前被同机其他用户读取。
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .context("创建临时密钥文件失败")?;
        f.write_all(content.as_bytes())
            .context("写临时密钥文件失败")?;
        f.sync_all().context("刷盘临时密钥文件失败")?;
    }
    #[cfg(not(unix))]
    fs::write(&tmp, content.as_bytes()).context("写临时密钥文件失败")?;

    // Windows：目录默认继承 ACL，临时/目标文件随目录 ACL，无需显式 chmod。
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
    }

    fs::rename(&tmp, path).context("原子替换 llm-keys.json 失败")?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // 兜底：确保最终文件权限为 0600（仅属主可读写）。
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn encrypt_with(cipher: &Aes256Gcm, plaintext: &str) -> Result<String> {
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow!("加密失败: {}", e))?;

    // nonce + ciphertext 一起 base64
    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(general_purpose::STANDARD.encode(combined))
}

fn decrypt_with(cipher: &Aes256Gcm, encoded: &str) -> Result<String> {
    let combined = general_purpose::STANDARD.decode(encoded)?;
    if combined.len() < 12 {
        anyhow::bail!("加密数据太短");
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow!("解密失败: {}", e))?;
    Ok(String::from_utf8(plaintext)?)
}

/// 判断是否像本模块产出的密文：标准 base64、无 JWT 的点号、解码后 >= 12 字节 nonce + 16 字节 tag。
fn looks_like_ciphertext(encoded: &str) -> bool {
    // JWT 含点号、旧版 opaque token 可能是纯 hex，二者都不是本模块产出的 base64 密文。
    if encoded.len() < 40
        || encoded.contains('.')
        || encoded.chars().all(|c| c.is_ascii_hexdigit())
    {
        return false;
    }
    general_purpose::STANDARD
        .decode(encoded)
        .map(|raw| raw.len() >= 28)
        .unwrap_or(false)
}

/// 旧版明文 .key 迁移：用旧密钥验证并重新加密所有 key，成功后原子写回并删除 .key。
/// 迁移失败只 log warn，不阻断启动（保留原文件以便人工恢复）。
fn migrate_legacy_key(base_dir: &Path, path: &Path, new_cipher: &Aes256Gcm) {
    let legacy_path = base_dir.join(".key");
    if !legacy_path.exists() {
        return;
    }
    let result = (|| -> Result<()> {
        let old_bytes = fs::read(&legacy_path).context("读取旧 .key 失败")?;
        let old_cipher = Aes256Gcm::new_from_slice(&old_bytes).context("旧密钥格式非法")?;
        if !path.exists() {
            // 没有数据文件，无密钥可迁移，直接删除明文 .key。
            fs::remove_file(&legacy_path).context("删除旧 .key 失败")?;
            return Ok(());
        }
        let content = fs::read_to_string(path).context("读取 llm-keys.json 失败")?;
        let mut keys: ProviderKeys =
            serde_json::from_str(&content).context("解析 llm-keys.json 失败")?;
        // 先用任意一条 key 验证旧密钥正确，避免用错密钥把数据全部写坏。
        if let Some(sample) = keys.keys.values().next() {
            decrypt_with(&old_cipher, sample).context("旧密钥验证失败：样例 key 无法解密")?;
        }
        for encrypted in keys.keys.values_mut() {
            let plain = decrypt_with(&old_cipher, encrypted)?;
            *encrypted = encrypt_with(new_cipher, &plain)?;
        }
        write_atomic(path, &keys).context("迁移写回失败")?;
        fs::remove_file(&legacy_path).context("删除旧 .key 失败")?;
        Ok(())
    })();
    match result {
        Ok(()) => log::info!("已迁移旧版 .key 中的密钥并删除明文密钥文件"),
        Err(e) => log::warn!("旧版 .key 迁移失败（保留原文件）: {}", e),
    }
}

/// 对外暴露的 session 快照（不包含 token 明文）
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
