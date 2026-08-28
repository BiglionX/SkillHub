//! playbook.rs — 安装剧本执行引擎
//!
//! 读 YAML 剧本 → 变量插值 → 顺序执行 steps → 上报进度 → 回滚支持

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playbook {
    pub id: String,
    pub software: String,
    pub description: String,
    #[serde(default)]
    pub preflight: Vec<PreflightStep>,
    pub steps: Vec<Step>,
    pub success: Outcome,
    #[serde(default)]
    pub failure: FailureConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PreflightStep {
    Detect { detect: String },
    EnsureDiskSpace { ensure_disk_space: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub id: String,
    #[serde(rename = "type")]
    pub step_type: String,
    #[serde(default)]
    pub description: Option<String>,
    // 各类型专属字段（用 Value 接住）
    #[serde(flatten)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Outcome {
    pub message: String,
    #[serde(default)]
    pub cta: Option<CTA>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CTA {
    pub label: String,
    pub action: String, // open-path:/path/to/dir
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FailureConfig {
    #[serde(default = "default_true")]
    pub rollback: bool,
    #[serde(default = "default_true")]
    pub show_error: bool,
}

fn default_true() -> bool {
    true
}

/// 剧本执行上下文（变量 + 临时目录）
pub struct Context {
    pub vars: HashMap<String, String>,
    pub temp_dir: PathBuf,
    pub installed_software_path: Option<PathBuf>,
}

impl Context {
    pub fn new(temp_dir: PathBuf) -> Self {
        let mut vars = HashMap::new();
        vars.insert("temp_dir".to_string(), temp_dir.to_string_lossy().to_string());
        Self {
            vars,
            temp_dir,
            installed_software_path: None,
        }
    }

    pub fn interpolate(&self, template: &str) -> String {
        // 简易变量插值：${var.path}
        let mut result = template.to_string();
        for (k, v) in &self.vars {
            result = result.replace(&format!("${{{}}}", k), v);
        }
        result
    }
}

/// 进度事件
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProgressEvent {
    Started { playbook_id: String },
    PreflightPassed,
    StepStarted { step_id: String, description: Option<String> },
    StepCompleted { step_id: String, duration_ms: u64 },
    StepFailed { step_id: String, error: String },
    Succeeded,
    Failed { error: String },
}

/// 执行一个剧本
pub async fn execute<F>(
    playbook: &Playbook,
    ctx: &mut Context,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(ProgressEvent) + Send,
{
    on_progress(ProgressEvent::Started {
        playbook_id: playbook.id.clone(),
    });

    // 1. Preflight
    for step in &playbook.preflight {
        execute_preflight(step, ctx).await?;
    }
    on_progress(ProgressEvent::PreflightPassed);

    // 2. Steps（顺序执行 + 回滚）
    let mut executed_steps: Vec<&Step> = Vec::new();
    for step in &playbook.steps {
        on_progress(ProgressEvent::StepStarted {
            step_id: step.id.clone(),
            description: step.description.clone(),
        });

        let started = std::time::Instant::now();
        match execute_step(step, ctx).await {
            Ok(()) => {
                executed_steps.push(step);
                on_progress(ProgressEvent::StepCompleted {
                    step_id: step.id.clone(),
                    duration_ms: started.elapsed().as_millis() as u64,
                });
            }
            Err(e) => {
                on_progress(ProgressEvent::StepFailed {
                    step_id: step.id.clone(),
                    error: e.to_string(),
                });

                // 回滚（LIFO）
                if playbook.failure.rollback {
                    log::warn!("剧本失败，开始回滚");
                    for s in executed_steps.iter().rev() {
                        if let Err(re) = rollback_step(s, ctx).await {
                            log::error!("回滚 {} 失败: {}", s.id, re);
                        }
                    }
                }

                on_progress(ProgressEvent::Failed {
                    error: e.to_string(),
                });
                return Err(e);
            }
        }
    }

    on_progress(ProgressEvent::Succeeded);
    Ok(())
}

async fn execute_preflight(step: &PreflightStep, _ctx: &Context) -> Result<()> {
    match step {
        PreflightStep::Detect { detect: _ } => {
            // 检测软件路径（由 caller 注入 installed_software_path）
            // M2 简化：假设 caller 已注入
            Ok(())
        }
        PreflightStep::EnsureDiskSpace { ensure_disk_space } => {
            let required_mb = parse_size_mb(ensure_disk_space);
            let available = available_disk_space_mb().unwrap_or(u64::MAX);
            if available < required_mb {
                return Err(anyhow!("磁盘空间不足：需要 {}MB，可用 {}MB", required_mb, available));
            }
            Ok(())
        }
    }
}

async fn execute_step(step: &Step, ctx: &Context) -> Result<()> {
    match step.step_type.as_str() {
        "http" => step_http(step, ctx).await,
        "extract" => step_extract(step, ctx).await,
        "copy" => step_copy(step, ctx).await,
        "move" => step_move(step, ctx).await,
        "delete" => step_delete(step, ctx).await,
        "command" => step_command(step, ctx).await,
        "file-exists" => step_file_exists(step, ctx).await,
        "register-dll" => step_register_dll(step, ctx).await,
        "pip-install" => step_pip_install(step, ctx).await,
        "npm-install" => step_npm_install(step, ctx).await,
        "open-path" => step_open_path(step, ctx).await,
        other => Err(anyhow!("未知 step 类型: {}", other)),
    }
}

async fn rollback_step(step: &Step, _ctx: &Context) -> Result<()> {
    // 简化版：仅 file copy/move 支持回滚（删除复制目标）
    match step.step_type.as_str() {
        "copy" | "move" => {
            // 暂不实现回滚（M3）
            Ok(())
        }
        _ => Ok(()),
    }
}

async fn step_http(step: &Step, ctx: &Context) -> Result<()> {
    let url = step.params.get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("http step 缺少 url"))?;
    let to = step.params.get("to")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("http step 缺少 to"))?;
    let sha256_expected = step.params.get("sha256").and_then(|v| v.as_str());

    let url = ctx.interpolate(url);
    let to = ctx.interpolate(to);

    log::info!("HTTP 下载: {} -> {}", url, to);

    let response = reqwest::get(&url).await.context("HTTP 请求失败")?;
    if !response.status().is_success() {
        return Err(anyhow!("HTTP 下载失败: {}", response.status()));
    }
    let bytes = response.bytes().await.context("读取响应体失败")?;

    // 写入文件
    let path = Path::new(&to);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.context("创建目录失败")?;
    }
    fs::write(path, &bytes).await.context("写入文件失败")?;

    // SHA256  校验
    if let Some(expected) = sha256_expected {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(anyhow!("SHA256 校验失败：期望 {}，实际 {}", expected, actual));
        }
    }

    Ok(())
}

async fn step_extract(step: &Step, ctx: &Context) -> Result<()> {
    let archive = step.params.get("archive").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("extract step 缺少 archive"))?;
    let to = step.params.get("to").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("extract step 缺少 to"))?;

    let archive = ctx.interpolate(archive);
    let to = ctx.interpolate(to);

    fs::create_dir_all(&to).await.context("创建解压目录失败")?;

    let file = std::fs::File::open(&archive).context("打开压缩包失败")?;
    let mut zip = zip::ZipArchive::new(file).context("解析 zip 失败")?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).context("读取 entry 失败")?;
        let entry_path = Path::new(&to).join(entry.name());

        if entry.is_dir() {
            fs::create_dir_all(&entry_path).await?;
            continue;
        }

        if let Some(parent) = entry_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let mut out = std::fs::File::create(&entry_path).context("创建文件失败")?;
        std::io::copy(&mut entry, &mut out).context("写入文件失败")?;
    }

    Ok(())
}

async fn step_copy(step: &Step, ctx: &Context) -> Result<()> {
    let from = step.params.get("from").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("copy step 缺少 from"))?;
    let to = step.params.get("to").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("copy step 缺少 to"))?;

    let from = ctx.interpolate(from);
    let to = ctx.interpolate(to);

    let from_path = Path::new(&from);
    let to_path = Path::new(&to);

    if !from_path.exists() {
        return Err(anyhow!("源文件不存在: {}", from));
    }
    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::copy(from_path, to_path).await.context("复制失败")?;
    Ok(())
}

async fn step_move(step: &Step, ctx: &Context) -> Result<()> {
    let from = step.params.get("from").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("move step 缺少 from"))?;
    let to = step.params.get("to").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("move step 缺少 to"))?;

    let from = ctx.interpolate(from);
    let to = ctx.interpolate(to);

    let to_path = Path::new(&to);
    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::rename(&from, &to).await.context("移动失败")?;
    Ok(())
}

async fn step_delete(step: &Step, ctx: &Context) -> Result<()> {
    let path = step.params.get("path").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("delete step 缺少 path"))?;
    let path = ctx.interpolate(path);

    if Path::new(&path).exists() {
        fs::remove_dir_all(&path).await.or_else(|_| {
            // 退化为删除文件
            std::fs::remove_file(&path).map_err(|e| anyhow!("删除失败: {}", e))
        })?;
    }
    Ok(())
}

async fn step_command(step: &Step, ctx: &Context) -> Result<()> {
    let cmd = step.params.get("cmd")
        .ok_or_else(|| anyhow!("command step 缺少 cmd"))?;
    let args: Vec<String> = step.params.get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    // cmd 可能是字符串 或 {windows: "...", macos: "...", linux: "..."}
    let cmd_str = if let Some(s) = cmd.as_str() {
        s.to_string()
    } else if let Some(obj) = cmd.as_object() {
        let os_key = match std::env::consts::OS {
            "windows" => "windows",
            "macos" => "macos",
            _ => "linux",
        };
        obj.get(os_key)
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("cmd 缺少 {} 配置", os_key))?
            .to_string()
    } else {
        return Err(anyhow!("cmd 格式错误"));
    };

    let args: Vec<String> = args.iter().map(|a| ctx.interpolate(a)).collect();

    log::info!("执行命令: {} {:?}", cmd_str, args);

    let output = std::process::Command::new(&cmd_str)
        .args(&args)
        .output()
        .context("命令执行失败")?;

    if !output.status.success() {
        return Err(anyhow!(
            "命令退出码非零: {} (stderr: {})",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

async fn step_file_exists(step: &Step, ctx: &Context) -> Result<()> {
    let path = step.params.get("path").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("file-exists step 缺少 path"))?;
    let path = ctx.interpolate(path);

    if !Path::new(&path).exists() {
        return Err(anyhow!("文件不存在: {}", path));
    }
    Ok(())
}

async fn step_register_dll(step: &Step, ctx: &Context) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let path = step.params.get("path").and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("register-dll step 缺少 path"))?;
        let path = ctx.interpolate(path);

        let output = std::process::Command::new("regsvr32")
            .arg("/s") // 静默
            .arg(&path)
            .output()
            .context("regsvr32 启动失败")?;

        if !output.status.success() {
            return Err(anyhow!("regsvr32 失败: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Err(anyhow!("register-dll 仅在 Windows 上支持"));
    }
    Ok(())
}

async fn step_pip_install(step: &Step, ctx: &Context) -> Result<()> {
    let packages: Vec<String> = step.params.get("packages")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .ok_or_else(|| anyhow!("pip-install step 缺少 packages"))?;

    let python = std::env::var("SKILLHUB_PYTHON")
        .unwrap_or_else(|_| "python".to_string());

    let mut args = vec!["-m".to_string(), "pip".to_string(), "install".to_string()];
    args.extend(packages);

    log::info!("执行 pip install: {:?}", args);

    let output = std::process::Command::new(&python)
        .args(&args)
        .output()
        .context("pip install 启动失败")?;

    if !output.status.success() {
        return Err(anyhow!("pip install 失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

async fn step_npm_install(step: &Step, ctx: &Context) -> Result<()> {
    let packages: Vec<String> = step.params.get("packages")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .ok_or_else(|| anyhow!("npm-install step 缺少 packages"))?;

    let npm = std::env::var("SKILLHUB_NPM")
        .unwrap_or_else(|_| "npm".to_string());

    let mut args = vec!["install".to_string(), "-g".to_string()];
    args.extend(packages);

    log::info!("执行 npm install: {:?}", args);

    let output = std::process::Command::new(&npm)
        .args(&args)
        .output()
        .context("npm install 启动失败")?;

    if !output.status.success() {
        return Err(anyhow!("npm install 失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

async fn step_open_path(step: &Step, ctx: &Context) -> Result<()> {
    let path = step.params.get("path").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("open-path step 缺少 path"))?;
    let path = ctx.interpolate(path);

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .context("explorer 启动失败")?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .context("open 启动失败")?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .context("xdg-open 启动失败")?;

    Ok(())
}

fn parse_size_mb(s: &str) -> u64 {
    let s = s.trim().to_uppercase();
    if let Some(num) = s.strip_suffix("MB") {
        num.trim().parse().unwrap_or(100)
    } else if let Some(num) = s.strip_suffix("GB") {
        num.trim().parse::<u64>().unwrap_or(1) * 1024
    } else {
        s.parse().unwrap_or(100)
    }
}

#[cfg(target_os = "windows")]
fn available_disk_space_mb() -> Option<u64> {
    // M2 简化：返回 None 表示跳过检查
    None
}

#[cfg(not(target_os = "windows"))]
fn available_disk_space_mb() -> Option<u64> {
    None
}

/// 加载内置剧本
pub fn load_builtin(name: &str) -> Result<Playbook> {
    let yaml = match name {
        "photoshop-plugin" => include_str!("../../resources/playbooks/photoshop-plugin.yml"),
        "vscode-extension" => include_str!("../../resources/playbooks/vscode-extension.yml"),
        "blender-addon" => include_str!("../../resources/playbooks/blender-addon.yml"),
        "excel-automation" => include_str!("../../resources/playbooks/excel-automation.yml"),
        "powerpoint-template" => include_str!("../../resources/playbooks/powerpoint-template.yml"),
        _ => return Err(anyhow!("未知剧本: {}", name)),
    };
    Ok(serde_yaml::from_str(yaml)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpolate() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "foo".to_string());
        let mut ctx = Context::new(PathBuf::from("/tmp"));
        ctx.vars.extend(vars);

        assert_eq!(ctx.interpolate("${name}.txt"), "foo.txt");
        assert_eq!(ctx.interpolate("${temp_dir}/x"), "/tmp/x");
    }

    #[test]
    fn test_parse_size_mb() {
        assert_eq!(parse_size_mb("100MB"), 100);
        assert_eq!(parse_size_mb("1GB"), 1024);
        assert_eq!(parse_size_mb("500"), 500);
    }

    #[test]
    fn test_load_builtin_playbooks() {
        for name in &["photoshop-plugin", "vscode-extension", "blender-addon", "excel-automation", "powerpoint-template"] {
            let p = load_builtin(name).expect(&format!("load {} failed", name));
            assert!(!p.steps.is_empty(), "{} 没有 steps", name);
            assert!(p.success.message.len() > 0, "{} 没有 success.message", name);
        }
    }
}