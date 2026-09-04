//! scanner.rs — 跨平台软件扫描器
//!
//! 读取 `resources/scanner-rules.yml`，按 OS 扫描本机已装软件。
//! 扫描结果返回给 Web 端展示（用户确认 + 手动补位）。

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use winreg::enums::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedSoftware {
    pub software_tag: String,
    pub display_name: String,
    pub path: String,
    pub version: Option<String>,
    pub source: ScanSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScanSource {
    Registry,    // Windows 注册表
    BundleId,    // Mac bundle ID
    CommonPath,  // 常见路径扫描
    Manual,      // 用户手动指定
}

#[derive(Debug, Deserialize)]
struct ScannerRules {
    #[serde(flatten)]
    software: std::collections::HashMap<String, SoftwareRule>,
}

#[derive(Debug, Deserialize)]
struct SoftwareRule {
    display_name: String,
    software_tag: String,
    #[serde(default)]
    windows: Option<OsRules>,
    #[serde(default)]
    #[serde(rename = "macos")]
    macos: Option<OsRules>,
}

#[derive(Debug, Deserialize)]
struct OsRules {
    #[serde(default)]
    uninstall_keys: Vec<String>,
    #[serde(default)]
    registry_paths: Vec<String>,
    #[serde(default)]
    common_paths: Vec<String>,
    #[serde(default)]
    bundle_ids: Vec<String>,
}

/// 扫描本机所有已知软件
pub async fn scan_all() -> Vec<ScannedSoftware> {
    let rules_yaml = include_str!("../../resources/scanner-rules.yml");
    let rules: ScannerRules = serde_yaml::from_str(rules_yaml).unwrap_or_else(|e| {
        log::warn!("scanner-rules.yml 解析失败: {}", e);
        ScannerRules { software: Default::default() }
    });

    let mut results = Vec::new();
    for (key, rule) in rules.software {
        if let Some(sw) = scan_one(&key, &rule).await {
            results.push(sw);
        }
    }
    results
}

async fn scan_one(_key: &str, rule: &SoftwareRule) -> Option<ScannedSoftware> {
    #[cfg(target_os = "windows")]
    {
        if let Some(win) = &rule.windows {
            // v2.0.7+：scanner.rs 注册表匹配改为通用 DisplayName 子串，
            // 把 rule.software_tag + rule.display_name 都作为 needle 传入。
            // 修复前 hardcode "photoshop" 导致 21 个 software_tag 只有 photoshop 能命中注册表。
            if let Some(found) = scan_windows(win, &rule.software_tag, &rule.display_name) {
                return Some(ScannedSoftware {
                    software_tag: rule.software_tag.clone(),
                    display_name: rule.display_name.clone(),
                    path: found,
                    version: None,
                    source: ScanSource::Registry,
                });
            }
            if let Some(found) = scan_common_paths(&win.common_paths) {
                return Some(ScannedSoftware {
                    software_tag: rule.software_tag.clone(),
                    display_name: rule.display_name.clone(),
                    path: found,
                    version: None,
                    source: ScanSource::CommonPath,
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(mac) = &rule.macos {
            if let Some(found) = scan_macos(mac) {
                return Some(ScannedSoftware {
                    software_tag: rule.software_tag.clone(),
                    display_name: rule.display_name.clone(),
                    path: found,
                    version: None,
                    source: ScanSource::BundleId,
                });
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn scan_windows(rules: &OsRules, software_tag: &str, display_name: &str) -> Option<String> {
    use winreg::RegKey;
    use winreg::enums::HKEY_LOCAL_MACHINE;

    // 仅当 rule 显式声明了 uninstall_keys / registry_paths 时才扫注册表，
    // 避免对每个 rule 都遍历整个 HKLM Uninstall（21 个 rule × 数百个 subkey 太慢）。
    if rules.uninstall_keys.is_empty() && rules.registry_paths.is_empty() {
        return None;
    }

    // v2.0.7+：needle 改为 rule 自身的 display_name + software_tag（小写）。
    // 修复前 hardcode "photoshop" 让 21 个 rule 里只有 photoshop 能命中注册表。
    let needles = [
        display_name.to_lowercase(),
        software_tag.to_lowercase(),
    ];
    // needles 为空（理论上不会发生，yml 顶层字段都有 default）就跳过注册表。
    if needles.iter().all(|n| n.is_empty()) {
        return None;
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let uninstall = hklm
        .open_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall")
        .ok()?;
    for key in uninstall.enum_keys().flatten() {
        let sub = match uninstall.open_subkey(&key) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let name = match sub.get_value::<String, _>("DisplayName") {
            Ok(n) => n,
            Err(_) => continue,
        };
        let lower = name.to_lowercase();
        if !needles.iter().any(|n| !n.is_empty() && lower.contains(n.as_str())) {
            continue;
        }
        if let Ok(install_location) = sub.get_value::<String, _>("InstallLocation") {
            if !install_location.is_empty() && Path::new(&install_location).exists() {
                return Some(install_location);
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn scan_macos(rules: &OsRules) -> Option<String> {
    // 1. 通过 mdfind 查 bundle ID
    for bundle_id in &rules.bundle_ids {
        let output = Command::new("mdfind")
            .args(["kMDItemCFBundleIdentifier", bundle_id])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() && Path::new(&path).exists() {
                    return Some(path);
                }
            }
        }
    }

    // 2. 常见路径兜底
    scan_common_paths(&rules.common_paths)
}

fn scan_common_paths(patterns: &[String]) -> Option<String> {
    use glob::glob;
    for pattern in patterns {
        // 展开环境变量
        let expanded = expand_env(pattern);
        if let Ok(entries) = glob(&expanded) {
            for entry in entries.flatten() {
                if entry.is_dir() || entry.is_file() {
                    return Some(entry.to_string_lossy().to_string());
                }
            }
        }
    }
    None
}

fn expand_env(s: &str) -> String {
    let mut result = s.to_string();
    if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
        result = result.replace("%LOCALAPPDATA%", &local_app);
    }
    if let Ok(app_data) = std::env::var("APPDATA") {
        result = result.replace("%APPDATA%", &app_data);
    }
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        result = result.replace("%ProgramFiles%", &program_files);
    }
    result
}

/// 用户手动指定软件路径（覆盖扫描结果）
pub fn manual_override(software_tag: &str, path: &str) -> ScannedSoftware {
    ScannedSoftware {
        software_tag: software_tag.to_string(),
        display_name: software_tag.to_string(),
        path: path.to_string(),
        version: None,
        source: ScanSource::Manual,
    }
}

/// A 轮 #D2：手动添加软件到 manual list（A 轮「手动补位」 UI 调用）
/// 持久化到 `manual-software.json`，下次 `scan_all` 时 merge 进去。
pub fn save_manual_software(list: &[(String, String)]) -> anyhow::Result<()> {
    let path = std::path::PathBuf::from(std::env::var("APPDATA").unwrap_or_default())
        .join("skillhub-helper")
        .join(".data")
        .join("manual-software.json");
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(list)?;
    std::fs::write(&path, json)?;
    Ok(())
}

pub fn load_manual_software() -> Vec<(String, String)> {
    let path = std::path::PathBuf::from(std::env::var("APPDATA").unwrap_or_default())
        .join("skillhub-helper")
        .join(".data")
        .join("manual-software.json");
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<(String, String)>>(&raw).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_env() {
        std::env::set_var("TEST_LOCALAPPDATA", "C:\\Users\\Test\\AppData\\Local");
        let r = expand_env("%TEST_LOCALAPPDATA%\\foo");
        // 没匹配上（因为只替换白名单几个）
        assert_eq!(r, "%TEST_LOCALAPPDATA%\\foo");

        let r2 = expand_env("%LOCALAPPDATA%\\foo");
        // 取决于实际环境变量
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            assert_eq!(r2, format!("{}\\foo", local));
        }
    }

    #[test]
    fn test_manual_override() {
        let sw = manual_override("photoshop", "C:\\PS\\");
        assert_eq!(sw.software_tag, "photoshop");
        assert_eq!(sw.path, "C:\\PS\\");
        assert_eq!(sw.source, ScanSource::Manual);
    }
}