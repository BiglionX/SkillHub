//! protocol.rs — 注册 skillhub:// 协议
//!
//! Windows：写注册表 HKCU\Software\Classes\skillhub
//! Mac：靠 tauri.conf.json 的 bundle 配置（CFBundleURLTypes）

use anyhow::{Context, Result};
use std::env;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

/// 协议 URL 解析
#[derive(Debug, Clone)]
pub enum ProtocolAction {
    Install { slug: String, version: Option<String>, job_id: Option<String> },
    Uninstall { slug: String },
    OpenHelper,
}

pub fn parse_url(url: &str) -> Option<ProtocolAction> {
    // skillhub://install/xxx?version=1.0&job=cuid
    let url = url.strip_prefix("skillhub://")?;

    let (action_part, query) = match url.split_once('?') {
        Some((a, q)) => (a, q),
        None => (url, ""),
    };

    let parts: Vec<&str> = action_part.trim_start_matches('/').split('/').collect();

    match parts.first().copied().unwrap_or("") {
        "install" => {
            let slug = parts.get(1).copied().unwrap_or("").to_string();
            if slug.is_empty() { return None; }
            let (version, job_id) = parse_query(query);
            Some(ProtocolAction::Install { slug, version, job_id })
        }
        "uninstall" => {
            let slug = parts.get(1).copied().unwrap_or("").to_string();
            if slug.is_empty() { return None; }
            Some(ProtocolAction::Uninstall { slug })
        }
        "helper" => Some(ProtocolAction::OpenHelper),
        _ => None,
    }
}

fn parse_query(query: &str) -> (Option<String>, Option<String>) {
    let mut version = None;
    let mut job_id = None;
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            match k {
                "version" => version = Some(v.to_string()),
                "job" => job_id = Some(v.to_string()),
                _ => {}
            }
        }
    }
    (version, job_id)
}

/// 注册协议（Windows 实现 + Mac 文档说明）
pub fn register() -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        register_windows()?;
    }

    #[cfg(target_os = "macos")]
    {
        // macOS 通过 tauri.conf.json 的 bundle.macOS.frameworks 或 Info.plist 的 CFBundleURLTypes
        // 由 tauri build 自动生成。我们只需确保 config 文件正确，运行时不需要额外注册
        log::info!("macOS 协议注册由 tauri.conf.json 完成，无需运行时操作");
    }

    #[cfg(target_os = "linux")]
    {
        register_linux()?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn register_windows() -> Result<()> {
    let exe_path = env::current_exe().context("获取当前 exe 路径失败")?;
    let exe_str = exe_path.to_string_lossy().to_string();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let base_path = r"Software\Classes\skillhub";

    // 创建 skillhub 节点
    let (key, _) = hkcu.create_subkey(base_path).context("创建 skillhub 注册表键失败")?;
    key.set_value("", &"URL:SkillHub Protocol").context("写入默认值值失败")?;
    key.set_value("URL Protocol", &"").context("写入 URL Protocol 失败")?;

    // shell\open\command
    let (cmd_key, _) = hkcu
        .create_subkey(format!(r"{}\shell\open\command", base_path))
        .context("创建 command 子键失败")?;
    let cmd_value = format!("\"{}\" \"%1\"", exe_str);
    cmd_key.set_value("", &cmd_value).context("写入 command 值失败")?;

    log::info!("已注册 Windows 协议 skillhub:// -> {}", exe_str);
    Ok(())
}

#[cfg(target_os = "linux")]
fn register_linux() -> Result<()> {
    // Linux 通过 .desktop 文件 + xdg-mime 注册（开发环境一般跳过）
    log::warn!("Linux 协议注册需要 .desktop 文件，请参考 docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md");
    Ok(())
}

/// 取消注册
pub fn unregister() -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let _ = hkcu.delete_subkey_all(r"Software\Classes\skillhub");
    }
    Ok(())
}

/// 检查协议是否已注册
pub fn is_registered() -> bool {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        hkcu.open_subkey(r"Software\Classes\skillhub\shell\open\command").is_ok()
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_install_url() {
        let action = parse_url("skillhub://install/photoshop-skin?version=1.0&job=cuid123").unwrap();
        match action {
            ProtocolAction::Install { slug, version, job_id } => {
                assert_eq!(slug, "photoshop-skin");
                assert_eq!(version, Some("1.0".to_string()));
                assert_eq!(job_id, Some("cuid123".to_string()));
            }
            _ => panic!("应解析为 Install"),
        }
    }

    #[test]
    fn test_parse_install_no_query() {
        let action = parse_url("skillhub://install/vscode-debug").unwrap();
        match action {
            ProtocolAction::Install { slug, version, job_id } => {
                assert_eq!(slug, "vscode-debug");
                assert_eq!(version, None);
                assert_eq!(job_id, None);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn test_parse_uninstall() {
        let action = parse_url("skillhub://uninstall/foo").unwrap();
        match action {
            ProtocolAction::Uninstall { slug } => assert_eq!(slug, "foo"),
            _ => panic!(),
        }
    }

    #[test]
    fn test_parse_invalid() {
        assert!(parse_url("http://example.com").is_none());
        assert!(parse_url("skillhub://").is_none());
        assert!(parse_url("skillhub://unknown").is_none());
    }
}