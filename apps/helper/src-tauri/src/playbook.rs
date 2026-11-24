//! playbook.rs — 安装剧本执行引擎
//!
//! 读 YAML 剧本 → 变量插值 → 顺序执行 steps → 上报进度 → 回滚支持
//!
//! 安全约束（安装链路加固）：
//! - 所有文件目标路径必须落在 ctx.temp_dir / installed_software_path / vars["software.path"] 白名单根之下，
//!   且禁止 `..`、绝对路径越界、反斜杠绕过。
//! - zip 解压做 Zip Slip + 符号链接 + zip bomb 三重防护。
//! - HTTP 下载仅允许 https 或本地 http；先校验 SHA256 再落盘。
//! - 命令与参数走白名单，始终使用 std::process::Command（不经过 shell）。

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playbook {
    pub id: String,
    pub software: String,
    pub description: String,
    #[serde(default, deserialize_with = "deserialize_preflight")]
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
    /// A 轮 #D3：预先检查依赖命令是否存在（如 python / npm / node）
    /// 失败时返回 `install_hint` 让前端展示「需要安装 X 才能继续」。
    RequireCommand {
        require_command: String,
        install_hint: String,
    },
}

/// 兼容内置剧本的历史 preflight 写法。
///
/// 5 个内置 YAML 用的是 `- detect: software` / `- ensure-disk-space: 100MB`
/// 这种无 tag 的 map，而 PreflightStep 是 internally tagged enum 且字段名是下划线
/// （`ensure_disk_space`），直接反序列化会因缺 `type` / 字段名不匹配而失败。
/// 这里只在 Playbook.preflight 的反序列化入口补齐 tag、归一化字段名，
/// 不改变 PreflightStep 定义、公开 API 或 Serialize 行为，同时兼容已有的 tagged 写法。
fn deserialize_preflight<'de, D>(deserializer: D) -> std::result::Result<Vec<PreflightStep>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error as _;

    let values = Vec::<serde_json::Value>::deserialize(deserializer)?;
    let mut steps = Vec::with_capacity(values.len());

    for value in values {
        let mut map = match value {
            serde_json::Value::Object(map) => map,
            _ => return Err(D::Error::custom("preflight 条目必须是映射")),
        };

        // 连字符字段名 → 下划线字段名
        for (from, to) in [
            ("ensure-disk-space", "ensure_disk_space"),
            ("require-command", "require_command"),
            ("install-hint", "install_hint"),
        ] {
            if let Some(v) = map.remove(from) {
                map.insert(to.to_string(), v);
            }
        }

        // 兼容 `type: ensure-disk-space` 这类连字符 tag
        if let Some(tag) = map.get_mut("type") {
            if let Some(s) = tag.as_str() {
                if s.contains('-') {
                    *tag = serde_json::Value::String(s.replace('-', "_"));
                }
            }
        }

        // 补齐 internally tagged enum 所需的 `type`
        if !map.contains_key("type") {
            let tag = if map.contains_key("detect") {
                "detect"
            } else if map.contains_key("ensure_disk_space") {
                "ensure_disk_space"
            } else if map.contains_key("require_command") {
                "require_command"
            } else {
                return Err(D::Error::custom("无法识别的 preflight 步骤"));
            };
            map.insert("type".to_string(), serde_json::Value::String(tag.to_string()));
        }

        let step = serde_json::from_value::<PreflightStep>(serde_json::Value::Object(map))
            .map_err(D::Error::custom)?;
        steps.push(step);
    }

    Ok(steps)
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
pub struct ExecutionContext {
    pub vars: HashMap<String, String>,
    pub temp_dir: PathBuf,
    pub installed_software_path: Option<PathBuf>,
}

impl ExecutionContext {
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

// ===========================================================================
// 安全常量与内部辅助函数
// ===========================================================================

/// 单 entry 解压上限（100MB）
const MAX_ZIP_ENTRY_BYTES: u64 = 100 * 1024 * 1024;
/// 整个压缩包解压总量上限（500MB）
const MAX_ZIP_TOTAL_BYTES: u64 = 500 * 1024 * 1024;
/// entry 数量上限
const MAX_ZIP_ENTRIES: usize = 5000;
/// 单次下载字节上限（200MB）
const MAX_DOWNLOAD_BYTES: u64 = 200 * 1024 * 1024;
/// 单条命令参数长度上限
const MAX_ARG_LEN: usize = 1000;
/// copy 回滚备份的原文件最大尺寸（超过则跳过备份，仅 log warn）
const MAX_BACKUP_BYTES: u64 = 100 * 1024 * 1024;

/// 禁止出现在命令参数中的 shell 元字符。
/// 虽然我们始终用 std::process::Command（不经 shell），但仍拦截这些字符，
/// 以防参数被下游组件拼进 cmd.exe / shell 或作为脚本片段解释。
const SHELL_META_CHARS: &[char] = &[';', '&', '|', '`', '$', '\n', '\r', '>', '<'];

/// 命令白名单（basename 匹配，忽略 .exe/.cmd/.bat 后缀）。
/// 前 11 项为通用安装命令；最后 3 项是内置剧本固定的可信命令
/// （code / blender / reg 来自 playbook 自身，而非前端可控的 skill 元数据）。
const ALLOWED_COMMANDS: &[&str] = &[
    "python",
    "python3",
    "pip",
    "npm",
    "node",
    "regsvr32",
    "explorer",
    "open",
    "xdg-open",
    "powershell",
    "cmd",
    "code",
    "blender",
    "reg",
];

/// 规范化一个可能尚不存在的路径：对「已存在的最长祖先」做 canonicalize，再拼回缺失后缀。
/// 这样既能解析符号链接（防逃逸），又适用于写盘前的目标路径。
fn canonicalize_allow_missing(path: &Path) -> Result<PathBuf> {
    let mut existing = path;
    let mut missing: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if existing.exists() {
            break;
        }
        let name = existing
            .file_name()
            .ok_or_else(|| anyhow!("无法规范化路径: {}", path.display()))?
            .to_os_string();
        missing.push(name);
        match existing.parent() {
            Some(parent) => existing = parent,
            None => break,
        }
    }
    let mut result = std::fs::canonicalize(existing)
        .with_context(|| format!("规范化路径失败: {}", existing.display()))?;
    for part in missing.iter().rev() {
        result.push(part);
    }
    Ok(result)
}

/// 确认 path 位于 root 之下（含 root 本身），使用组件级前缀比较。
fn ensure_within(root: &Path, path: &Path, label: &str) -> Result<()> {
    let root_c = canonicalize_allow_missing(root)?;
    let path_c = canonicalize_allow_missing(path)?;
    if path_c.starts_with(&root_c) {
        Ok(())
    } else {
        Err(anyhow!(
            "{} 越界: {} 不在允许根目录 {} 之下",
            label,
            path.display(),
            root.display()
        ))
    }
}

/// 路径白名单校验。返回规范化后的绝对路径（供后续文件操作使用）。
///
/// 允许的根：
/// 1. `ctx.temp_dir`
/// 2. `ctx.installed_software_path`（若 Some）
/// 3. `ctx.vars["software.path"]`（scanner 扫描结果，内置 5 个剧本均依赖此根）
///
/// 拒绝：`..` 组件（含反斜杠形式）、相对路径、任何不在上述根下的绝对路径。
/// 目标路径可以尚不存在（copy / find 场景）。
fn ensure_safe_path(path: &str, ctx: &ExecutionContext) -> Result<PathBuf> {
    if path.is_empty() {
        return Err(anyhow!("路径为空"));
    }

    // 反斜杠统一当分隔符处理：Windows 上 `..\` 也是遍历
    let normalized = path.replace('\\', "/");
    for component in Path::new(&normalized).components() {
        if matches!(component, Component::ParentDir) {
            return Err(anyhow!("路径包含 .. 组件，拒绝: {}", path));
        }
    }

    let raw = Path::new(path);
    if !raw.is_absolute() {
        return Err(anyhow!("路径必须为白名单根下的绝对路径，拒绝: {}", path));
    }

    let target = canonicalize_allow_missing(raw)?;

    let mut roots: Vec<PathBuf> = Vec::new();
    roots.push(canonicalize_allow_missing(&ctx.temp_dir)?);
    if let Some(ref installed) = ctx.installed_software_path {
        roots.push(canonicalize_allow_missing(installed)?);
    }
    // 内置剧本使用 ${software.path}/... （如 Photoshop Plug-ins 目录），该值来自
    // scanner 扫描结果（lib.rs 注入），是可信根；但其后不允许再出现 `..`（上面已拦截）。
    if let Some(software_path) = ctx.vars.get("software.path") {
        if !software_path.is_empty() {
            roots.push(canonicalize_allow_missing(Path::new(software_path))?);
        }
    }

    for root in &roots {
        if target.starts_with(root) {
            return Ok(target);
        }
    }

    Err(anyhow!("路径不在白名单根目录内，拒绝: {}", path))
}

/// 校验 zip entry 名，防 Zip Slip / Windows 盘符 / 反斜杠绕过。
fn validate_zip_entry_name(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(anyhow!("zip entry 名为空"));
    }
    // 反斜杠统一当分隔符：`a\..\evil` 在 Windows 上同样是遍历
    let normalized = name.replace('\\', "/");
    // 绝对路径 / UNC 路径
    if normalized.starts_with('/') {
        return Err(anyhow!("zip entry 含绝对路径，拒绝: {}", name));
    }
    // Windows 盘符（C:/... 或 C:foo）
    let bytes = normalized.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return Err(anyhow!("zip entry 含 Windows 盘符，拒绝: {}", name));
    }
    // .. 组件
    for component in Path::new(&normalized).components() {
        if matches!(component, Component::ParentDir) {
            return Err(anyhow!("zip entry 含 .. 组件，拒绝: {}", name));
        }
    }
    Ok(())
}

/// 受限拷贝：写入前累计字节数，超过 max 立即报错（防 zip bomb）。
fn copy_limited<R: Read, W: Write>(reader: &mut R, writer: &mut W, max: u64) -> Result<u64> {
    let mut buf = [0u8; 8192];
    let mut total = 0u64;
    loop {
        let n = reader.read(&mut buf).context("解压读取数据失败")?;
        if n == 0 {
            break;
        }
        total = total
            .checked_add(n as u64)
            .ok_or_else(|| anyhow!("解压字节数溢出"))?;
        if total > max {
            return Err(anyhow!("单个 entry 解压超过上限 {}MB", max / 1024 / 1024));
        }
        writer.write_all(&buf[..n]).context("解压写入数据失败")?;
    }
    Ok(total)
}

/// 取命令 basename 并剥离常见可执行后缀，防路径前缀绕过（如 /usr/bin/evil）。
fn command_basename(cmd: &str) -> String {
    let slash_normalized = cmd.replace('\\', "/");
    let base = Path::new(&slash_normalized)
        .file_name()
        .map(|s| s.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    for ext in [".exe", ".cmd", ".bat"] {
        if let Some(stem) = base.strip_suffix(ext) {
            return stem.to_string();
        }
    }
    base
}

/// 命令白名单校验。
fn ensure_allowed_command(cmd: &str) -> Result<()> {
    let base = command_basename(cmd);
    if ALLOWED_COMMANDS.contains(&base.as_str()) {
        Ok(())
    } else {
        Err(anyhow!("命令不在白名单，拒绝: {} (basename={})", cmd, base))
    }
}

/// 单条命令参数校验：拒绝 shell 元字符与超长参数。
fn validate_command_arg(arg: &str) -> Result<()> {
    if arg.len() > MAX_ARG_LEN {
        return Err(anyhow!("命令参数超过 {} 字符，拒绝", MAX_ARG_LEN));
    }
    if let Some(ch) = arg.chars().find(|c| SHELL_META_CHARS.contains(c)) {
        return Err(anyhow!("命令参数含禁止字符 {:?}，拒绝", ch));
    }
    Ok(())
}

/// pip / npm 包名校验（手工字符检查，等价于 ^[A-Za-z0-9_@./-]{1,120}$）。
fn validate_package_name(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 120 {
        return Err(anyhow!("包名长度非法（1..120）: {}", name));
    }
    for ch in name.chars() {
        let ok = ch.is_ascii_alphanumeric()
            || matches!(ch, '_' | '@' | '.' | '/' | '-');
        if !ok {
            return Err(anyhow!("包名含非法字符 {:?}，拒绝: {}", ch, name));
        }
    }
    Ok(())
}

/// 下载 URL 校验：仅 https 或本地回环 http，禁止 file:// / ftp:// 及伪装 host。
fn validate_download_url(url: &str) -> Result<()> {
    let lower = url.to_ascii_lowercase();
    let allowed = lower.starts_with("https://")
        || lower == "http://localhost"
        || lower.starts_with("http://localhost:")
        || lower.starts_with("http://localhost/")
        || lower == "http://127.0.0.1"
        || lower.starts_with("http://127.0.0.1:")
        || lower.starts_with("http://127.0.0.1/")
        || lower.starts_with("http://[::1]:")
        || lower.starts_with("http://[::1]/");
    if allowed {
        Ok(())
    } else {
        Err(anyhow!("不允许的下载 URL（仅 https 或本地 http）: {}", url))
    }
}

/// 一个已成功执行步骤的回滚信息。
#[derive(Debug)]
struct ExecutedStep {
    id: String,
    rollback: RollbackAction,
}

/// 回滚动作。
#[derive(Debug)]
enum RollbackAction {
    None,
    /// copy 前记录目标原内容；None 表示原本不存在
    Copy { to: PathBuf, backup: Option<Vec<u8>> },
    /// move 回滚：把目标移回源
    Move { from: PathBuf, to: PathBuf },
}

/// 执行一个剧本（对外签名保持不变）
pub async fn execute<F>(
    playbook: &Playbook,
    ctx: &mut ExecutionContext,
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

    // 2. Steps（顺序执行 + 携带回滚信息的 LIFO 回滚）
    let mut executed_steps: Vec<ExecutedStep> = Vec::new();
    for step in &playbook.steps {
        on_progress(ProgressEvent::StepStarted {
            step_id: step.id.clone(),
            description: step.description.clone(),
        });

        let started = std::time::Instant::now();
        match execute_step(step, ctx).await {
            Ok(rollback) => {
                executed_steps.push(ExecutedStep {
                    id: step.id.clone(),
                    rollback,
                });
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
                    for executed in executed_steps.iter().rev() {
                        if let Err(re) = rollback_step(&executed.rollback).await {
                            log::error!("回滚 {} 失败: {}", executed.id, re);
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

async fn execute_preflight(step: &PreflightStep, _ctx: &ExecutionContext) -> Result<()> {
    match step {
        PreflightStep::Detect { detect: _ } => {
            // 检测软件路径（由 caller 注入 installed_software_path）
            // M2 简化：假设 caller 已注入
            Ok(())
        }
        PreflightStep::EnsureDiskSpace { ensure_disk_space } => {
            let required_mb = parse_size_mb(ensure_disk_space);
            // TODO: available_disk_space_mb() 尚未接线平台 API
            // （Windows GetDiskFreeSpaceExW / Unix statvfs，需新增依赖）。
            // 按安全要求不伪造检查结果，明确跳过并告警；接线后恢复下面的比较逻辑。
            log::warn!("跳过磁盘空间预检（平台 API 未接线，需要 {}MB）", required_mb);
            Ok(())
        }
        PreflightStep::RequireCommand { require_command, install_hint } => {
            // A 轮 #D3：检查命令是否在 PATH 中。
            // 使用 `where`（Windows）/ `which`（Unix）查询命令存在性。
            #[cfg(target_os = "windows")]
            let probe_result = std::process::Command::new("where")
                .arg(require_command)
                .output();
            #[cfg(not(target_os = "windows"))]
            let probe_result = std::process::Command::new("which")
                .arg(require_command)
                .output();
            match probe_result {
                Ok(out) if out.status.success() => Ok(()),
                _ => Err(anyhow!(
                    "依赖命令 {} 不存在：{}",
                    require_command,
                    install_hint
                )),
            }
        }
    }
}

async fn execute_step(step: &Step, ctx: &ExecutionContext) -> Result<RollbackAction> {
    match step.step_type.as_str() {
        "http" => {
            step_http(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "extract" => {
            step_extract(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "copy" => step_copy(step, ctx).await,
        "move" => step_move(step, ctx).await,
        "delete" => {
            step_delete(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "command" => {
            step_command(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "file-exists" => {
            step_file_exists(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "register-dll" => {
            step_register_dll(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "pip-install" => {
            step_pip_install(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "npm-install" => {
            step_npm_install(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        "open-path" => {
            step_open_path(step, ctx).await?;
            Ok(RollbackAction::None)
        }
        other => Err(anyhow!("未知 step 类型: {}", other)),
    }
}

/// 按回滚动作恢复原状态（copy 恢复原文件/删除新增文件；move 移回源）。
async fn rollback_step(action: &RollbackAction) -> Result<()> {
    match action {
        RollbackAction::None => Ok(()),
        RollbackAction::Copy { to, backup } => {
            if let Some(bytes) = backup {
                fs::write(to, bytes)
                    .await
                    .with_context(|| format!("恢复原文件失败: {}", to.display()))?;
            } else if to.exists() {
                fs::remove_file(to)
                    .await
                    .with_context(|| format!("删除复制产物失败: {}", to.display()))?;
            }
            Ok(())
        }
        RollbackAction::Move { from, to } => {
            if to.exists() {
                if let Some(parent) = from.parent() {
                    fs::create_dir_all(parent).await.ok();
                }
                fs::rename(to, from)
                    .await
                    .with_context(|| format!("移回源文件失败: {}", to.display()))?;
            }
            Ok(())
        }
    }
}

async fn step_http(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    let url = step.params.get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("http step 缺少 url"))?;
    let to = step.params.get("to")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("http step 缺少 to"))?;
    let sha256_expected = step.params.get("sha256").and_then(|v| v.as_str());

    let url = ctx.interpolate(url);
    let to = ctx.interpolate(to);

    // 1) URL scheme / host 白名单
    validate_download_url(&url)?;

    // 2) 下载目标必须在 temp_dir 下（比 ensure_safe_path 更严格）
    let path = ensure_safe_path(&to, ctx)?;
    ensure_within(&ctx.temp_dir, &path, "下载目标")?;

    log::info!("HTTP 下载: {} -> {}", url, path.display());

    let response = reqwest::get(&url).await.context("HTTP 请求失败")?;
    if !response.status().is_success() {
        return Err(anyhow!("HTTP 下载失败: {}", response.status()));
    }

    // 3) 下载字节数上限：先看 Content-Length，再以实际字节数为准
    if let Some(len) = response.content_length() {
        if len > MAX_DOWNLOAD_BYTES {
            return Err(anyhow!(
                "下载大小 {} 超过上限 {}MB",
                len,
                MAX_DOWNLOAD_BYTES / 1024 / 1024
            ));
        }
    }
    let bytes = response.bytes().await.context("读取响应体失败")?;
    if bytes.len() as u64 > MAX_DOWNLOAD_BYTES {
        return Err(anyhow!(
            "下载字节数 {} 超过上限 {}MB",
            bytes.len(),
            MAX_DOWNLOAD_BYTES / 1024 / 1024
        ));
    }

    // 4) SHA256 前置校验：失败则不写盘
    if let Some(expected_template) = sha256_expected {
        let expected = ctx.interpolate(expected_template);
        // lib.rs 允许空 checksum（表示未提供），此时跳过校验
        if !expected.is_empty() {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let actual = format!("{:x}", hasher.finalize());
            if !actual.eq_ignore_ascii_case(&expected) {
                return Err(anyhow!("SHA256 校验失败：期望 {}，实际 {}", expected, actual));
            }
        }
    }

    // 5) 校验通过后才落盘
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.context("创建目录失败")?;
    }
    fs::write(&path, &bytes).await.context("写入文件失败")?;

    Ok(())
}

async fn step_extract(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    let archive = step.params.get("archive").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("extract step 缺少 archive"))?;
    let to = step.params.get("to").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("extract step 缺少 to"))?;

    let archive = ctx.interpolate(archive);
    let to = ctx.interpolate(to);

    // 归档与解压目录都做路径白名单校验；解压目录额外收紧到 temp_dir 下
    let archive_path = ensure_safe_path(&archive, ctx)?;
    let to_path = ensure_safe_path(&to, ctx)?;
    ensure_within(&ctx.temp_dir, &to_path, "解压目录")?;

    fs::create_dir_all(&to_path).await.context("创建解压目录失败")?;

    // zip crate 的内部 reader 持有 dyn Read（非 Send），不能跨 await 点；
    // 整段解压放到阻塞线程池里执行
    tokio::task::spawn_blocking(move || -> Result<()> {
        let file = std::fs::File::open(&archive_path).context("打开压缩包失败")?;
        let mut zip = zip::ZipArchive::new(file).context("解析 zip 失败")?;

        // zip bomb 防护：entry 数量上限
        if zip.len() > MAX_ZIP_ENTRIES {
            return Err(anyhow!("zip entry 数量 {} 超过上限 {}", zip.len(), MAX_ZIP_ENTRIES));
        }

        let base = std::fs::canonicalize(&to_path).context("规范化解压目录失败")?;
        let mut total_written = 0u64;

        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).context("读取 entry 失败")?;
            let name = entry.name().to_string();

            // Zip Slip 防护：拒绝绝对路径 / 盘符 / .. / 反斜杠绕过
            validate_zip_entry_name(&name)?;

            // 拒绝符号链接 entry，防止经由已存在的链接逃逸出 base
            if let Some(mode) = entry.unix_mode() {
                if (mode & 0o170000) == 0o120000 {
                    return Err(anyhow!("zip 含符号链接 entry，拒绝: {}", name));
                }
            }

            let entry_path = base.join(&name);

            // 防符号链接逃逸：创建父目录后确认其规范化结果仍在 base 下
            if let Some(parent) = entry_path.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("创建 entry 父目录失败: {}", name))?;
                ensure_within(&base, parent, "zip entry 父目录")?;
            }

            if entry.is_dir() {
                std::fs::create_dir_all(&entry_path)?;
                continue;
            }

            let mut out = std::fs::File::create(&entry_path).context("创建文件失败")?;
            let written = copy_limited(&mut entry, &mut out, MAX_ZIP_ENTRY_BYTES)
                .with_context(|| format!("解压 entry 失败: {}", name))?;
            total_written = total_written
                .checked_add(written)
                .ok_or_else(|| anyhow!("解压总量溢出"))?;
            if total_written > MAX_ZIP_TOTAL_BYTES {
                log::error!(
                    "zip bomb 防护触发：总解压量 {} 超过 {}MB，已中止（已写出的文件未清理）",
                    total_written,
                    MAX_ZIP_TOTAL_BYTES / 1024 / 1024
                );
                return Err(anyhow!(
                    "zip 总解压量超过上限 {}MB",
                    MAX_ZIP_TOTAL_BYTES / 1024 / 1024
                ));
            }
        }

        Ok(())
    })
    .await
    .context("spawn_blocking 失败")??;

    Ok(())
}

async fn step_copy(step: &Step, ctx: &ExecutionContext) -> Result<RollbackAction> {
    let from = step.params.get("from").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("copy step 缺少 from"))?;
    let to = step.params.get("to").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("copy step 缺少 to"))?;

    let from = ctx.interpolate(from);
    let to = ctx.interpolate(to);

    let from_path = ensure_safe_path(&from, ctx)?;
    let to_path = ensure_safe_path(&to, ctx)?;

    if !from_path.exists() {
        return Err(anyhow!("源文件不存在: {}", from_path.display()));
    }

    // 记录回滚信息：目标原本的内容（不存在则为 None）
    let backup = if to_path.is_file() {
        let meta = std::fs::metadata(&to_path).context("读取复制目标元数据失败")?;
        if meta.len() <= MAX_BACKUP_BYTES {
            Some(std::fs::read(&to_path).context("读取回滚备份失败")?)
        } else {
            log::warn!("复制目标超过 {}MB，跳过回滚备份: {}", MAX_BACKUP_BYTES / 1024 / 1024, to_path.display());
            None
        }
    } else {
        None
    };

    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::copy(&from_path, &to_path).await.context("复制失败")?;
    Ok(RollbackAction::Copy { to: to_path, backup })
}

async fn step_move(step: &Step, ctx: &ExecutionContext) -> Result<RollbackAction> {
    let from = step.params.get("from").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("move step 缺少 from"))?;
    let to = step.params.get("to").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("move step 缺少 to"))?;

    let from = ctx.interpolate(from);
    let to = ctx.interpolate(to);

    let from_path = ensure_safe_path(&from, ctx)?;
    let to_path = ensure_safe_path(&to, ctx)?;

    if !from_path.exists() {
        return Err(anyhow!("源文件不存在: {}", from_path.display()));
    }
    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::rename(&from_path, &to_path).await.context("移动失败")?;
    Ok(RollbackAction::Move { from: from_path, to: to_path })
}

async fn step_delete(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    let path = step.params.get("path").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("delete step 缺少 path"))?;
    let path = ctx.interpolate(path);
    let path = ensure_safe_path(&path, ctx)?;

    if path.exists() {
        fs::remove_dir_all(&path).await.or_else(|_| {
            // 退化为删除文件
            std::fs::remove_file(&path).map_err(|e| anyhow!("删除失败: {}", e))
        })?;
    }
    Ok(())
}

async fn step_command(step: &Step, ctx: &ExecutionContext) -> Result<()> {
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

    // 1) 命令白名单（basename 匹配，防路径绕过）
    ensure_allowed_command(&cmd_str)?;

    // 2) 参数插值后逐个校验（长度 + shell 元字符）
    let args: Vec<String> = args
        .iter()
        .map(|a| {
            let interpolated = ctx.interpolate(a);
            validate_command_arg(&interpolated)?;
            Ok(interpolated)
        })
        .collect::<Result<Vec<_>>>()?;

    log::info!("执行命令: {} {:?}", cmd_str, args);

    // 3) 始终直接 exec，不经过 shell
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

async fn step_file_exists(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    let path = step.params.get("path").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("file-exists step 缺少 path"))?;
    let path = ctx.interpolate(path);
    let path = ensure_safe_path(&path, ctx)?;

    if !path.exists() {
        return Err(anyhow!("文件不存在: {}", path.display()));
    }
    Ok(())
}

async fn step_register_dll(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let path = step.params.get("path").and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("register-dll step 缺少 path"))?;
        let path = ctx.interpolate(path);
        let path = ensure_safe_path(&path, ctx)?;
        validate_command_arg(&path.to_string_lossy())?;

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
        let _ = step;
        let _ = ctx;
        return Err(anyhow!("register-dll 仅在 Windows 上支持"));
    }
    Ok(())
}

async fn step_pip_install(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    let packages: Vec<String> = step.params.get("packages")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .ok_or_else(|| anyhow!("pip-install step 缺少 packages"))?;

    // 包名白名单（插值后校验）
    let packages: Vec<String> = packages
        .iter()
        .map(|p| {
            let interpolated = ctx.interpolate(p);
            validate_package_name(&interpolated)?;
            Ok(interpolated)
        })
        .collect::<Result<Vec<_>>>()?;

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

async fn step_npm_install(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    let packages: Vec<String> = step.params.get("packages")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .ok_or_else(|| anyhow!("npm-install step 缺少 packages"))?;

    let packages: Vec<String> = packages
        .iter()
        .map(|p| {
            let interpolated = ctx.interpolate(p);
            validate_package_name(&interpolated)?;
            Ok(interpolated)
        })
        .collect::<Result<Vec<_>>>()?;

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

async fn step_open_path(step: &Step, ctx: &ExecutionContext) -> Result<()> {
    let path = step.params.get("path").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("open-path step 缺少 path"))?;
    let path = ctx.interpolate(path);
    let path = ensure_safe_path(&path, ctx)?;
    let path_str = path.to_string_lossy().to_string();
    validate_command_arg(&path_str)?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path_str)
        .spawn()
        .context("explorer 启动失败")?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path_str)
        .spawn()
        .context("open 启动失败")?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path_str)
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

// TODO: 以下两个占位函数尚未接线平台 API（Windows GetDiskFreeSpaceExW / Unix statvfs），
// 需要新增依赖才能在 Rust 侧拿到真实可用空间。preflight 已明确跳过检查并告警，
// 不再使用这里的返回值，避免伪造「检查通过」。保留函数体供后续接线。
#[allow(dead_code)]
#[cfg(target_os = "windows")]
fn available_disk_space_mb() -> Option<u64> {
    None
}

#[allow(dead_code)]
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

    fn test_ctx() -> ExecutionContext {
        let temp = std::env::temp_dir().join("skillhub-playbook-test");
        let software = std::env::temp_dir().join("skillhub-fake-software");
        let mut ctx = ExecutionContext::new(temp);
        ctx.vars.insert("software.path".to_string(), software.to_string_lossy().to_string());
        ctx
    }

    #[test]
    fn test_interpolate() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "foo".to_string());
        let mut ctx = ExecutionContext::new(PathBuf::from("/tmp"));
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
    fn test_ensure_safe_path() {
        let ctx = test_ctx();

        // 合法 temp 子路径通过
        let ok_temp = ctx.temp_dir.join("plugin").join("plugin.zip");
        assert!(ensure_safe_path(&ok_temp.to_string_lossy(), &ctx).is_ok());

        // 合法 software.path 子路径通过（内置剧本的 ${software.path}/Plug-ins/...）
        let sw = Path::new(ctx.vars.get("software.path").unwrap());
        let ok_sw = sw.join("Plug-ins").join("my.8bf");
        assert!(ensure_safe_path(&ok_sw.to_string_lossy(), &ctx).is_ok());

        // `../evil` 被拒绝（含反斜杠形式）
        assert!(ensure_safe_path(&ctx.temp_dir.join("../evil").to_string_lossy(), &ctx).is_err());
        assert!(ensure_safe_path(&ctx.temp_dir.join("a\\..\\evil").to_string_lossy(), &ctx).is_err());

        // 白名单外的绝对路径被拒绝
        let abs = std::env::temp_dir().join("totally-unrelated-evil").join("x");
        assert!(ensure_safe_path(&abs.to_string_lossy(), &ctx).is_err());

        // 相对路径被拒绝
        assert!(ensure_safe_path("relative/path", &ctx).is_err());
    }

    #[test]
    fn test_validate_zip_entry_name() {
        assert!(validate_zip_entry_name("plugin/file.py").is_ok());
        assert!(validate_zip_entry_name("a/b/c.txt").is_ok());
        assert!(validate_zip_entry_name("../evil").is_err());
        assert!(validate_zip_entry_name("a/../../evil").is_err());
        assert!(validate_zip_entry_name("a\\..\\evil").is_err());
        assert!(validate_zip_entry_name("/absolute/file").is_err());
        assert!(validate_zip_entry_name("C:\\evil\\x").is_err());
        assert!(validate_zip_entry_name("C:evil").is_err());
        assert!(validate_zip_entry_name("\\\\server\\share\\x").is_err());
    }

    #[test]
    fn test_command_allowlist() {
        assert!(ensure_allowed_command("python").is_ok());
        assert!(ensure_allowed_command("python3").is_ok());
        assert!(ensure_allowed_command("code.cmd").is_ok());
        assert!(ensure_allowed_command("reg.exe").is_ok());
        assert!(ensure_allowed_command("C:\\Python\\python.exe").is_ok());
        assert!(ensure_allowed_command("evil").is_err());
        assert!(ensure_allowed_command("C:\\Windows\\System32\\evil.exe").is_err());
    }

    #[test]
    fn test_command_arg_safety() {
        assert!(validate_command_arg("--install-extension").is_ok());
        assert!(validate_command_arg("a;rm -rf /").is_err());
        assert!(validate_command_arg("a|b").is_err());
        assert!(validate_command_arg("a&b").is_err());
        assert!(validate_command_arg("a`b").is_err());
        assert!(validate_command_arg("$HOME").is_err());
        assert!(validate_command_arg("a\nb").is_err());
        assert!(validate_command_arg("a>b").is_err());
        assert!(validate_command_arg(&"x".repeat(MAX_ARG_LEN + 1)).is_err());
    }

    #[test]
    fn test_package_name_validation() {
        assert!(validate_package_name("requests").is_ok());
        assert!(validate_package_name("@scope/pkg-name_2.0").is_ok());
        assert!(validate_package_name("pkg;evil").is_err());
        assert!(validate_package_name("").is_err());
        assert!(validate_package_name(&"x".repeat(121)).is_err());
    }

    #[test]
    fn test_download_url_validation() {
        assert!(validate_download_url("https://example.com/a.zip").is_ok());
        assert!(validate_download_url("http://localhost:8080/a").is_ok());
        assert!(validate_download_url("http://127.0.0.1/a").is_ok());
        assert!(validate_download_url("file:///etc/passwd").is_err());
        assert!(validate_download_url("ftp://example.com/a").is_err());
        assert!(validate_download_url("http://127.0.0.1.evil.com/a").is_err());
        assert!(validate_download_url("http://localhost.evil.com/a").is_err());
    }

    #[test]
    fn test_load_builtin_playbooks() {
        for name in &["photoshop-plugin", "vscode-extension", "blender-addon", "excel-automation", "powerpoint-template"] {
            let p = load_builtin(name).expect(&format!("load {} failed", name));
            assert!(!p.steps.is_empty(), "{} 没有 steps", name);
            assert!(p.success.message.len() > 0, "{} 没有 success.message", name);
            // 回归防护：内置剧本的历史无 tag preflight 写法必须能解析
            assert!(p.preflight.len() >= 2, "{} 的 preflight 条目不足", name);
            assert!(matches!(&p.preflight[0], PreflightStep::Detect { .. }), "{} 的 detect preflight 解析失败", name);
            assert!(matches!(&p.preflight[1], PreflightStep::EnsureDiskSpace { .. }), "{} 的 ensure-disk-space preflight 解析失败", name);
        }
    }
}
