//! SkillHub Helper — Tauri + Rust 后端
//!
//! M1：llm_proxy + Key 存储
//! M2：scanner + playbook + 协议注册

mod key_store;
mod llm_proxy;
mod provider;
mod scanner;
mod protocol;
mod playbook;
mod scan_cache;
/// M4：本地用量 SQLite 存储（向 llm_proxy / invoke 同时提供）
mod usage_store;

use std::collections::HashMap;
use std::sync::Arc;
use serde::Serialize;
use tauri::Manager;

pub use key_store::KeyStore;
pub use llm_proxy::{LlmProxyState, ProxyHandle};
pub use provider::ProviderConfig;
pub use usage_store::{UsageRecordInput, UsageStore};

/// A 轮 #B5：进程级 job registry（让 Web 端轮询助手看进度 / 结果）
pub mod jobs {
    use super::*;
    use std::sync::Mutex;
    use std::collections::HashMap as StdHashMap;

    #[derive(Default)]
    pub struct JobRegistry {
        pub inner: Mutex<StdHashMap<String, JobState>>,
    }

    #[derive(Clone, Debug, Serialize)]
    pub struct JobState {
        pub job_id: String,
        pub slug: String,
        pub name: String,
        pub software: String,
        pub status: String,
        pub step: u32,
        pub total_steps: u32,
        pub last_message: Option<String>,
        pub error: Option<String>,
        pub updated_at_ms: u128,
    }

    pub fn try_state<'a>(app: &'a tauri::AppHandle) -> Option<&'a JobRegistry> {
        app.try_state::<JobRegistry>().map(|s| s.inner())
    }

    pub fn upsert(app: &tauri::AppHandle, state: JobState) {
        let Some(reg) = try_state(app) else { return };
        // 显式提取 &Mutex 让编译器能正确推断 Mutex::<HashMap<_>> 上调用 lock
        let mutex: &Mutex<StdHashMap<String, JobState>> = &reg.inner;
        match mutex.lock() {
            Ok(mut g) => {
                g.insert(state.job_id.clone(), state);
            }
            Err(e) => {
                log::warn!("JobRegistry 锁获取失败（upsert）：{}", e);
            }
        }
    }

    pub fn set_status(app: &tauri::AppHandle, job_id: &str, status: &str, error: Option<String>) {
        let Some(reg) = try_state(app) else { return };
        let mutex: &Mutex<StdHashMap<String, JobState>> = &reg.inner;
        match mutex.lock() {
            Ok(mut g) => {
                if let Some(j) = g.get_mut(job_id) {
                    j.status = status.to_string();
                    if error.is_some() {
                        j.error = error;
                    }
                    j.updated_at_ms = now_ms();
                }
            }
            Err(e) => {
                log::warn!("JobRegistry 锁获取失败（set_status）：{}", e);
            }
        }
    }

    pub fn now_ms() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    }
}

/// A 轮 #B5：前端（以及未来的 Web 端）可调此命令查询 JobRegistry 中指定 jobId 的状态
#[tauri::command]
fn get_job_state(
    job_id: String,
    registry: tauri::State<'_, jobs::JobRegistry>,
) -> Result<Option<jobs::JobState>, String> {
    // 链式调用在某些 Rust 版本下会推断失败；分两步走
    let inner_registry: &jobs::JobRegistry = registry.inner();
    let mutex: &std::sync::Mutex<std::collections::HashMap<String, jobs::JobState>> =
        &inner_registry.inner;
    mutex
        .lock()
        .map_err(|e| e.to_string())
        .map(|g| g.get(&job_id).cloned())
}

/// A 轮 #B5：返回所有 JobRegistry 条目（用于调试 / 显示后台任务列表）
#[tauri::command]
fn list_jobs(
    registry: tauri::State<'_, jobs::JobRegistry>,
) -> Result<Vec<jobs::JobState>, String> {
    let inner_registry: &jobs::JobRegistry = registry.inner();
    let mutex: &std::sync::Mutex<std::collections::HashMap<String, jobs::JobState>> =
        &inner_registry.inner;
    mutex
        .lock()
        .map(|g| g.values().cloned().collect())
        .map_err(|e| e.to_string())
}

/// 入口：启动 Tauri + llm_proxy 本机 HTTP 服务
pub fn run() {
    env_logger::init();

    // A 轮修复 #E2：原 `KeyStore::open().expect(...)` 会 panic 整进程。
    // 改为 `open_or_fallback()`，保证助手在数据目录不可写也能启动。
    let key_store = Arc::new(KeyStore::open_or_fallback());

    // M4：创建本地用量 SQLite 存储（与 KeyStore 同样走 open_or_fallback）
    let usage_store = Arc::new(UsageStore::open_or_fallback());

    // 启动 llm_proxy 本机 HTTP 服务（端口自动选择）
    // 修复 Tauri state not managed bug：
    // 原 `let proxy_state = Arc::new(LlmProxyState { ... });` + `app.manage(proxy_state)` 会让
    // Tauri 内部再次包装为 `Arc<Arc<LlmProxyState>>`，与命令签名 `State<'_, LlmProxyState>`
    // 期望的 `Arc<LlmProxyState>` 类型不匹配，触发 "state not managed" 错误。
    // 修正：llm_proxy::spawn 需要 Arc 自己包；app.manage 传入 LlmProxyState 值让 Tauri 自动包装。
    let proxy_handle = llm_proxy::spawn(Arc::new(LlmProxyState {
        key_store: key_store.clone(),
        usage_store: usage_store.clone(),
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A 轮 #P1-21：second-instance argv 中可能含 skillhub:// URL，先解析再 emit 事件。
            // 给 AppHandle 类型的本地变量，避免闭包内捕获 &AppHandle 造成 lifetime 问题。
            for arg in argv.iter().skip(1) {
                if arg.starts_with("skillhub://") {
                    handle_protocol_url(app, arg);
                }
            }
            // 单实例：第二次启动时聚焦已有窗口
            // v2.0.5：补 unminimize + 临时置顶抢焦点
            // 旧版 set_focus() 对最小化窗口无效，唤起时窗口只在任务栏闪一下
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
                // 临时置顶 300ms 抢焦点，避免被其他应用抢走
                let _ = window.set_always_on_top(true);
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    let _ = window_clone.set_always_on_top(false);
                });
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // A 轮 #P1-21：cold-start argv 中可能含 skillhub:// URL，从 std::env::args 取。
            // 适用于 helper 未运行就被协议唤起的场景。
            for arg in std::env::args().skip(1) {
                if arg.starts_with("skillhub://") {
                    handle_protocol_url(&app.handle(), &arg);
                }
            }
            // 把 llm_proxy 端口号注入前端（设置页要展示）
            let port = proxy_handle.port();
            app.manage(LlmProxyState {
                key_store: key_store.clone(),
                usage_store: usage_store.clone(),
            });
            app.manage(ProxyHandle(port));
            // M4：同时把 UsageStore 独立注入，供新 invoke 命令直接使用（不走 llm_proxy state）
            app.manage(usage_store.clone());
            // 投产修复：启动时自动执行 90 天滚动清理（此前只有 Settings 手动 invoke 触发）
            match usage_store.prune_older_than(90) {
                Ok(n) => log::info!("启动清理完成：删除 {} 条超过 90 天的用量记录", n),
                Err(e) => log::warn!("启动清理失败（不影响启动）：{}", e),
            }
            // A 轮 #B5：注册 JobRegistry，让 install_skill 能写入让 Web 轮询
            app.manage(jobs::JobRegistry::default());

            // 注册系统托盘
            let _tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("SkillHub")
                .on_tray_icon_event(|_tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        // 双击托盘打开主窗口
                    }
                })
                .build(app)?;

            // 后台心跳上报（M2 增强：定时把已装软件 + 端口推到云端）
            let port_clone = port;
            let key_store_for_heartbeat = key_store.clone();
            let usage_store_for_heartbeat = usage_store.clone();
            tauri::async_runtime::spawn(async move {
                heartbeat_loop(port_clone, key_store_for_heartbeat, usage_store_for_heartbeat).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_helper_info,
            get_helper_full_info,
            save_provider_key,
            set_active_provider,
            get_provider_keys_status,
            delete_provider_key,
            save_provider_base_url,
            delete_provider_base_url,
            get_all_provider_base_urls,
            save_session_token,
            get_session_info,
            clear_session_token,
            trigger_software_scan,
            fetch_recommended_skills,
            install_skill,
            uninstall_skill,
            test_provider_key,
            scan_installed_software,
            register_protocol,
            unregister_protocol,
            ensure_protocol_registered,
            run_playbook,
            get_job_state,
            list_jobs,
            // M4：用量与游客会话
            record_usage,
            get_local_usage_summary,
            export_usage_csv,
            prune_local_usage,
            ensure_guest_session,
            get_recommended_for_local_software,
            update_usage_cost,
            usage_sync_to_cloud,
            // 投产修复：前端契约补全 + 本地代理鉴权
            get_proxy_token,
            get_installed_skills,
            pick_export_path,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败");
}

/// 给前端用的命令：返回助手基本信息（含本机 HTTP 端口号，方便 Web 端发现）
/// A 轮修复 #A1：携带 `key_store_fallback` 状态，前台在数据目录不可写 / fallback 时给警示。
/// 验收 UX-P0-A：同时携带 `protocol_registered`，前端 Settings Section 4 + App.tsx 顶栏 banner 据此决定是否提示「未注册」
/// 之前只走 `get_helper_full_info` 拿，前端两处都从 `get_helper_info` 拿，字段缺失导致协议状态永远显示「未注册」。
#[tauri::command]
fn get_helper_info(
    handle: tauri::State<'_, ProxyHandle>,
    state: tauri::State<'_, LlmProxyState>,
    usage_store: tauri::State<'_, Arc<UsageStore>>,
) -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "SkillHub",
        "helper_port": handle.port(),
        "key_store_fallback": state.key_store.is_fallback(),
        "key_store_fallback_reason": state.key_store.fallback_reason(),
        "usage_store_fallback": usage_store.is_fallback(),
        "usage_store_fallback_reason": usage_store.fallback_reason(),
        "protocol_registered": protocol::is_registered(),
    })
}

/// 保存某个 Provider 的 API Key（AES 加密写入 %APPDATA%\skillhub-helper\.data\llm-keys.json）
#[tauri::command]
async fn save_provider_key(
    state: tauri::State<'_, LlmProxyState>,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    state
        .key_store
        .save_key(&provider, &api_key)
        .map_err(|e| e.to_string())
}

/// 设置当前激活的 Provider（供 llm_proxy 的 /llm/chat 选用）
#[tauri::command]
async fn set_active_provider(
    state: tauri::State<'_, LlmProxyState>,
    provider: String,
) -> Result<(), String> {
    state
        .key_store
        .update(|keys| keys.active_provider = provider)
        .map_err(|e| e.to_string())
}

/// 返回每个 Provider 是否已配 Key（不返回明文 Key），以及当前激活的 Provider
/// 用于设置页恢复现场 + 顶栏状态徽章
#[tauri::command]
async fn get_provider_keys_status(
    state: tauri::State<'_, LlmProxyState>,
) -> Result<serde_json::Value, String> {
    let keys = state.key_store.load().map_err(|e| e.to_string())?;
    let mut providers = serde_json::Map::new();
    for p in ["deepseek", "openai", "glm", "custom"] {
        let has = keys.keys.contains_key(p);
        providers.insert(p.to_string(), serde_json::json!(has));
    }
    Ok(serde_json::json!({
        "active": keys.active_provider,
        "providers": providers,
    }))
}

/// 删除某个 Provider 的 Key
#[tauri::command]
async fn delete_provider_key(
    state: tauri::State<'_, LlmProxyState>,
    provider: String,
) -> Result<(), String> {
    state
        .key_store
        .update(|keys| {
            keys.keys.remove(&provider);
        })
        .map_err(|e| e.to_string())
}

/// 扫描本机已装软件（M2：手动触发，由前端“重新扫描”按钮调用）
/// 返回 `scanner::ScannedSoftware` 列表的 JSON 数组
/// v2.0.7+：接收 AppHandle，传给 scanner::scan_all，让它 emit `scan-progress` 事件供前端展示动态扫描过程。
#[tauri::command]
async fn trigger_software_scan(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let results = scanner::scan_all(Some(&app)).await;
    Ok(results
        .into_iter()
        .map(|s| serde_json::to_value(&s).unwrap_or(serde_json::json!({})))
        .collect())
}

/// 拉取适用本机软件的 Skill 推荐（M2）
/// 调 Web API `/api/v2/skills?software=ps,vscode&category=A&limit=N`，
/// 返回 Skill 数组。`installed` 为本机已扫描到的 software_tag 列表。
#[tauri::command]
async fn fetch_recommended_skills(
    installed: Vec<String>,
    limit: Option<u32>,
) -> Result<Vec<serde_json::Value>, String> {
    use std::time::Duration;

    if installed.is_empty() {
        return Ok(vec![]);
    }

    let api_base = std::env::var("SKILLHUB_API_BASE")
        .unwrap_or_else(|_| "https://skillhub.proclaw.cc".to_string());
    let limit = limit.unwrap_or(20).min(100);
    // 投产修复：URL 参数编码，避免 installed 含 & / # 等字符时注入查询参数
    let software_query = installed
        .iter()
        .map(|s| {
            s.bytes()
                .map(|b| match b {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
                    _ => format!("%{:02X}", b),
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join(",");
    let url = format!(
        "{}/api/v2/skills?software={}&category=A&limit={}",
        api_base.trim_end_matches('/'), software_query, limit
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Web API 返回 {}", resp.status()));
    }
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let skills = data
        .get("skills")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(skills)
}

/// 一键安装某个 Skill（M2 · D3 主路径）
/// slug → playbook 映射 → scan → 启动 run_playbook（进度走 `install-progress` SSE）
#[tauri::command]
async fn install_skill(
    app: tauri::AppHandle,
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    slug: String,
    skill: serde_json::Value,
) -> Result<String, String> {
    // 投产修复：slug 格式校验（只允许字母数字/-/_/.，防命令/路径注入）
    if slug.is_empty()
        || slug.len() > 100
        || !slug
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
    {
        return Err("Skill slug 含非法字符".to_string());
    }
    // slug → playbook_name 映射（与 scanner-rules.yml software_tag 对齐）
    let playbook_name = match slug.as_str() {
        s if s.starts_with("photoshop") => "photoshop-plugin",
        s if s.starts_with("vscode") => "vscode-extension",
        s if s.starts_with("blender") => "blender-addon",
        s if s.starts_with("excel") => "excel-automation",
        s if s.starts_with("powerpoint") => "powerpoint-template",
        _ => return Err(format!("暂不支持的 Skill: {}", slug)),
    };

    // 调 run_playbook 内部逻辑（复用 lib.rs 中已有的逻辑）
    let job_id = format!("job-{}", chrono_like_now());

    // 1. 加载剧本
    let pb = playbook::load_builtin(&playbook_name).map_err(|e| e.to_string())?;

    // A 轮 #B5：立即写入 JobRegistry running 状态（含 step total + 初始 last_message），
    // 让前端 / 未来的 Web 端可轮询此 job 的进度与结果（替代 / 补充 install-progress 事件）。
    // 此处仅在注册表里写"运行中"占位；终态由下方 tokio::spawn 闭包里的 jobs::set_status 写入。
    let skill_name = skill
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(slug.as_str())
        .to_string();
    let skill_software = skill
        .get("software")
        .and_then(|v| v.as_str())
        .unwrap_or(playbook_to_software_tag(&playbook_name))
        .to_string();
    let total_steps = pb.steps.len() as u32;
    let skill_name_for_record = skill_name.clone();
    let skill_software_for_record = skill_software.clone();
    jobs::upsert(
        &app,
        jobs::JobState {
            job_id: job_id.clone(),
            slug: slug.clone(),
            name: skill_name,
            software: skill_software,
            status: "running".to_string(),
            step: 0,
            total_steps,
            last_message: Some("正在准备安装…".to_string()),
            error: None,
            updated_at_ms: jobs::now_ms(),
        },
    );

    // 2. 扫描找到软件路径（install_skill 不需要 UI 进度，传 None）
    let installed = scanner::scan_all(None).await;
    let sw = installed
        .iter()
        .find(|s| s.software_tag == playbook_to_software_tag(&playbook_name))
        .ok_or_else(|| {
            format!(
                "未检测到对应软件（{}），请先安装该软件后重试",
                playbook_to_software_tag(&playbook_name)
            )
        })?;

    // 3. 创建执行上下文
    let temp_dir = std::env::temp_dir().join(format!("skillhub-{}", job_id));
    let mut ctx = playbook::ExecutionContext::new(temp_dir);
    ctx.vars.insert("software.path".to_string(), sw.path.clone());
    ctx.vars.insert("software.name".to_string(), sw.display_name.clone());
    // 投产修复：excel-automation 的注册表路径需要 ${software.version}
    if let Some(version) = &sw.version {
        ctx.vars.insert("software.version".to_string(), version.clone());
    }

    inject_skill_metadata_safe(&mut ctx, &skill)?;

    // 4. 异步执行
    let app_clone = app.clone();
    let pb_clone = pb.clone();
    let job_id_clone = job_id.clone();
    let slug_clone = slug.clone();
    let usage_store_clone = usage_store.inner().clone();
    tokio::spawn(async move {
        use std::time::Instant;
        use tauri::Emitter;
        let started = Instant::now();
        let mut step_count = 0;
        let total_steps = pb_clone.steps.len();

        let result = playbook::execute(&pb_clone, &mut ctx, |event| {
            let payload = serde_json::json!({
                "job_id": job_id_clone,
                "elapsed_ms": started.elapsed().as_millis(),
                "step": step_count,
                "total_steps": total_steps,
                "event": event,
            });
            let _ = app_clone.emit("install-progress", payload);
            step_count += 1;
        })
        .await;

        let succeeded = result.is_ok();
        let err_msg = result.err().map(|e| e.to_string());

        // 投产修复：安装成功后写入本机已装 Skill 表（供 get_installed_skills 返回）
        if succeeded {
            let rec = crate::usage_store::InstalledSkill {
                slug: slug_clone.clone(),
                name: skill_name_for_record.clone(),
                software: skill_software_for_record.clone(),
                installed_at_ms: crate::usage_store::chrono_like_now_ms(),
            };
            if let Err(e) = usage_store_clone.record_installed_skill(&rec) {
                log::warn!("记录已装 Skill 失败（不影响安装结果）：{}", e);
            }
        }

        // A 轮 #B5：更新 JobRegistry 终态。失败时把错误消息一并写进 registry，
        // 让 Web 端 / 前端能从 get_job_state 或 list_jobs 拿到结构化失败原因，
        // 而不是只能通过 install-complete event 的一次性监听。
        jobs::set_status(
            &app_clone,
            &job_id_clone,
            if succeeded { "succeeded" } else { "failed" },
            err_msg.clone(),
        );

        let message = if succeeded { pb_clone.success.message.clone() } else { String::new() };
        let cta = if succeeded { pb_clone.success.cta.clone() } else { None };
        let final_payload = serde_json::json!({
            "job_id": job_id_clone,
            "elapsed_ms": started.elapsed().as_millis(),
            "result": if succeeded { "success" } else { "failed" },
            "error": err_msg,
            "message": message,
            "cta": cta,
        });
        let _ = app_clone.emit("install-complete", final_payload);
    });

    Ok(job_id)
}

/// 投产修复：Skill 元数据注入白名单。
/// 内置剧本只用到 download_url / checksum / entry / name / slug / vsix_id 六个字段；
/// 之前把 skill 对象的所有字符串字段无差别注入 ctx.vars，导致 Web 端篡改的 skill
/// 元数据可覆盖任意变量（含 software.path）→ 任意路径写 / 命令参数注入。
/// 这里只放行白名单字段，并对取值做格式校验。
fn inject_skill_metadata_safe(
    ctx: &mut playbook::ExecutionContext,
    skill: &serde_json::Value,
) -> Result<(), String> {
    const ALLOWED: &[&str] = &["download_url", "checksum", "entry", "name", "slug", "vsix_id"];
    let Some(obj) = skill.as_object() else {
        return Ok(());
    };
    for key in ALLOWED {
        let Some(value) = obj.get(*key).and_then(|v| v.as_str()) else {
            continue;
        };
        if value.len() > 512 {
            return Err(format!("Skill 元数据 {} 超长（≤512 字符）", key));
        }
        match *key {
            "download_url" => {
                if !value.starts_with("https://")
                    && !(value.starts_with("http://localhost")
                        || value.starts_with("http://127.0.0.1"))
                {
                    return Err("Skill 下载链接必须是 HTTPS（或本机回环地址）".to_string());
                }
            }
            "checksum" => {
                if !value.is_empty()
                    && (value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()))
                {
                    return Err("Skill checksum 必须是 64 位 SHA-256 十六进制串".to_string());
                }
            }
            "entry" => {
                if value.contains("..") || value.starts_with('/') || value.contains('\\') {
                    return Err("Skill entry 不能包含路径穿越字符".to_string());
                }
            }
            "name" | "slug" | "vsix_id" => {
                if !value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
                {
                    return Err(format!("Skill {} 含非法字符（仅允许字母数字/-/_/.）", key));
                }
            }
            _ => {}
        }
        ctx.vars.insert(format!("skill.{}", key), value.to_string());
    }
    Ok(())
}

/// playbook_name → scanner software_tag 映射
fn playbook_to_software_tag(playbook_name: &str) -> &str {
    match playbook_name {
        "photoshop-plugin" => "photoshop",
        "vscode-extension" => "vscode",
        "blender-addon" => "blender",
        "excel-automation" => "excel",
        "powerpoint-template" => "powerpoint",
        _ => "",
    }
}

/// A 轮 #PR-4：保存某 Provider 的 Base URL（主要给 custom 自托管用）
#[tauri::command]
async fn save_provider_base_url(
    state: tauri::State<'_, LlmProxyState>,
    provider: String,
    base_url: String,
) -> Result<(), String> {
    state
        .key_store
        .save_base_url(&provider, &base_url)
        .map_err(|e| e.to_string())
}

/// A 轮 #PR-4：删除某 Provider 的 Base URL
#[tauri::command]
async fn delete_provider_base_url(
    state: tauri::State<'_, LlmProxyState>,
    provider: String,
) -> Result<(), String> {
    state
        .key_store
        .delete_base_url(&provider)
        .map_err(|e| e.to_string())
}

/// A 轮 #PR-4：获取全部 Provider 的 Base URL（前端拉回填）
#[tauri::command]
async fn get_all_provider_base_urls(
    state: tauri::State<'_, LlmProxyState>,
) -> Result<HashMap<String, String>, String> {
    state
        .key_store
        .get_all_base_urls()
        .map_err(|e| e.to_string())
}

/// A 轮 #P1-22：保存 Web 端 OIDC session identity（主要是 JWT / cookie）。
/// 由 Web 端 / Developer 通过 window.__skillhubHelper.bindSession({ token, userId, email }) 调。
/// 持久化到 KeyStore 的 session_* 字段，心跳时会读取 token 作为 Authorization Bearer。
#[tauri::command]
async fn save_session_token(
    state: tauri::State<'_, LlmProxyState>,
    token: String,
    user_id: String,
    user_email: String,
) -> Result<(), String> {
    state
        .key_store
        .save_session(token, user_id, user_email)
        .map_err(|e| e.to_string())
}

/// A 轮 #P1-22：读取 session 快照（不返回明文 token），让前端顶栏展示绑定状态。
#[tauri::command]
async fn get_session_info(
    state: tauri::State<'_, LlmProxyState>,
) -> Result<KeyStoreSessionInfo, String> {
    let snap = state.key_store.get_session().map_err(|e| e.to_string())?;
    Ok(KeyStoreSessionInfo {
        has_token: snap.has_token,
        user_id: snap.user_id,
        user_email: snap.user_email,
        bound_at: snap.bound_at,
    })
}

/// A 轮 #P1-22：解绑 session（用户主动退出或 Web 端 session 失效时调）。
#[tauri::command]
async fn clear_session_token(
    state: tauri::State<'_, LlmProxyState>,
) -> Result<(), String> {
    state.key_store.clear_session().map_err(|e| e.to_string())
}

/// 公开给 lib.rs 外的快照（serde Serialize 转发）
#[derive(Debug, Clone, serde::Serialize)]
pub struct KeyStoreSessionInfo {
    pub has_token: bool,
    pub user_id: Option<String>,
    pub user_email: Option<String>,
    pub bound_at: Option<u64>,
}

/// A 轮 #B3：卸载 Skill（protocol.rs 已支持 `skillhub://uninstall/<slug>`，这里提供 Tauri invoke 接口）。
/// MVP：当前 v2.0.5 剧本里没抽象 uninstall，所以只走「软卸载」：
///   1. 标记 installedSkills 中已卸载（前端持久化层处理）
///   2. 返回 uninstall 所需做的事（手势用户，告知“手动卸载”命令）。
/// 后续 v3 + F8 会接入「反安装剧本」（类似 install 流程）。
#[tauri::command]
async fn uninstall_skill(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    slug: String,
    skill: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    log::info!("卸载 Skill: {:?}", skill);
    // 投产修复：同步从本机已装表移除，避免 MySkills 页面残留
    if let Err(e) = usage_store.remove_installed_skill(&slug) {
        log::warn!("移除已装 Skill 记录失败：{}", e);
    }
    Ok(serde_json::json!({
        "slug": slug,
        "kind": "soft",  // MVP 软卸载
        "message": format!("已从已装列表移除 {}（如需从目标软件移除插件，请到该软件内手动卸载）。MVP 阶段未走完整卸载剧本。", slug),
        "manual_steps": serde_json::json!([
            format!("打开{}并查找插件/扩展管理页", slug),
            "在列表中找到 SkillHub 相关条目并卸载",
            "如需完全清除配置，删除 ~/.skillhub-helper/.data 目录",
        ]),
    }))
}

/// 给前端用的命令：返回完整助手信息（M2 升级版）
/// 包含端口号 + 已注册协议 + 扫描到的本机软件
/// A 轮 #E1 + #B6：返回注册状态三态（registered / auto_registered / not_registered / unsupported）
#[tauri::command]
async fn get_helper_full_info(
    handle: tauri::State<'_, ProxyHandle>,
) -> Result<serde_json::Value, String> {
    let port = handle.port();
    let protocol_status = protocol::registration_status();
    let protocol_status_str = match protocol_status {
        protocol::RegistrationStatus::Registered => "registered",
        protocol::RegistrationStatus::AutoRegistered => "auto_registered",
        protocol::RegistrationStatus::NotRegistered => "not_registered",
        protocol::RegistrationStatus::Unsupported => "unsupported",
    };

    // 扫描本机软件（get_helper_info 不需要 UI 进度，传 None）
    let installed = scanner::scan_all(None).await;
    let installed_software: Vec<String> = installed.into_iter().map(|s| s.software_tag).collect();

    Ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "SkillHub",
        "helper_port": port,
        "protocol_registered": protocol::is_registered(),
        "protocol_status": protocol_status_str,
        "installed_software": installed_software,
        "scan_count": installed_software.len(),
        "scan_at": chrono_like_now(),
    }))
}

/// A 轮 #B6：主动重新注册协议（用户可触发）
#[tauri::command]
async fn ensure_protocol_registered() -> Result<serde_json::Value, String> {
    let current = protocol::registration_status();
    if matches!(
        current,
        protocol::RegistrationStatus::Registered | protocol::RegistrationStatus::AutoRegistered
    ) {
        return Ok(serde_json::json!({
            "ok": true,
            "status": "registered",
            "message": "协议已注册",
        }));
    }
    protocol::register().map_err(|e| e.to_string())?;
    let new_status = protocol::registration_status();
    let new_status_str = match new_status {
        protocol::RegistrationStatus::Registered => "registered",
        protocol::RegistrationStatus::AutoRegistered => "auto_registered",
        protocol::RegistrationStatus::NotRegistered => "not_registered",
        protocol::RegistrationStatus::Unsupported => "unsupported",
    };
    Ok(serde_json::json!({
        "ok": true,
        "status": new_status_str,
        "message": "协议注册成功",
    }))
}

/// A 轮 #P1-21：解析 skillhub:// URL 并向前端 emit 对应事件。
/// 供 single-instance 回调与 setup cold-start 共同调用，避免重复实现。
/// 事件 payload schema：
///   - install-from-url: { slug: string, version?: string|null, jobId?: string|null, source: 'protocol' }
///   - uninstall-from-url: { slug: string, source: 'protocol' }
fn handle_protocol_url<R: tauri::Runtime>(app: &tauri::AppHandle<R>, url: &str) {
    use tauri::Emitter;

    let Some(action) = protocol::parse_url(url) else {
        log::warn!("无法解析协议 URL：{}", url);
        return;
    };

    match action {
        protocol::ProtocolAction::Install { slug, version, job_id } => {
            let payload = serde_json::json!({
                "slug": slug,
                "version": version,
                "jobId": job_id,
                "source": "protocol",
            });
            log::info!(
                "协议唤起安装：slug={} version={:?} jobId={:?}",
                slug,
                version,
                job_id
            );
            if let Err(e) = app.emit("install-from-url", payload) {
                log::warn!("install-from-url emit 失败：{}", e);
            }
        }
        protocol::ProtocolAction::Uninstall { slug } => {
            let payload = serde_json::json!({
                "slug": slug,
                "source": "protocol",
            });
            log::info!("协议唤起卸载：slug={}", slug);
            if let Err(e) = app.emit("uninstall-from-url", payload) {
                log::warn!("uninstall-from-url emit 失败：{}", e);
            }
        }
        protocol::ProtocolAction::OpenHelper => {
            // 唤起只是把窗口前置，无需通知前端
            log::info!("协议唤起 helper://（仅前置窗口）");
        }
    }
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}Z", now)
}

/// 给前端用的命令：测试某个 Provider 的 Key 是否有效
/// A 轮修复 #E3：删 model: "deepseek-chat".to_string() hardcode。
/// 旧实现不传 model=空字符串，让 provider::mod.rs 内部走 default_model 逻辑。
#[tauri::command]
async fn test_provider_key(
    provider: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<serde_json::Value, String> {
    use provider::LlmProvider;

    if api_key.len() > 500 {
        return Err("API Key 超长（≤500 字符）".to_string());
    }
    // 投产修复：内置 Provider 不接受前端传入 base_url（防 SSRF）；
    // custom 允许回环地址自托管，但必须通过 provider 层的白名单校验。
    let safe_base_url = match provider.as_str() {
        "deepseek" | "openai" | "glm" => None,
        "custom" => {
            let url = base_url.ok_or_else(|| "自定义 Provider 必须填写 Base URL".to_string())?;
            if url.len() > 500 {
                return Err("Base URL 超长（≤500 字符）".to_string());
            }
            provider::validate_base_url(&url, true).map_err(|e| e.to_string())?;
            Some(url)
        }
        other => return Err(format!("未知 Provider: {}", other)),
    };

    let config = ProviderConfig {
        provider: provider.clone(),
        api_key,
        base_url: safe_base_url,
        model: String::new(),
    };

    match LlmProvider::test_connection(&config).await {
        Ok(info) => Ok(serde_json::json!({
            "ok": true,
            "provider": provider,
            "models": info,
        })),
        // 投产修复：上游错误不原文回显（可能含 Key / 内网路径），细节只写日志
        Err(e) => {
            log::warn!("test_provider_key 失败（{}）: {}", provider, e);
            Err("Key 测试失败：请确认 Key、模型名与 Base URL 正确，详情见本地日志".to_string())
        }
    }
}

/// 扫描本机已装软件（M2）
#[tauri::command]
async fn scan_installed_software() -> Result<Vec<serde_json::Value>, String> {
    // v2.0.7+：此命令被 Home Tab 启动期调用、用户不期望看详细扫描进度。传 None 静默扫描。
    let results = scanner::scan_all(None).await;
    Ok(results
        .into_iter()
        .map(|s| serde_json::to_value(&s).unwrap_or(serde_json::json!({})))
        .collect())
}

/// 注册 skillhub:// 协议（M2）
#[tauri::command]
async fn register_protocol() -> Result<bool, String> {
    protocol::register().map_err(|e| e.to_string())?;
    Ok(protocol::is_registered())
}

/// 取消注册 skillhub:// 协议（M2）
#[tauri::command]
async fn unregister_protocol() -> Result<(), String> {
    protocol::unregister().map_err(|e| e.to_string())
}

/// 运行内置剧本（M2）
///
/// 参数：playbook_name + 软件路径 + Skill 元数据
/// 返回：进度事件流（SSE 风格，前端订阅）
#[tauri::command]
async fn run_playbook(
    app: tauri::AppHandle,
    playbook_name: String,
    software_path: String,
    software_name: String,
    skill: serde_json::Value,
    job_id: String,
    software_version: Option<String>,
) -> Result<String, String> {
    use std::path::PathBuf;
    use std::time::{Instant};
    use tauri::Emitter;

    // 1. 加载剧本
    let pb = playbook::load_builtin(&playbook_name).map_err(|e| e.to_string())?;

    // 2. 创建执行上下文
    let temp_dir = std::env::temp_dir().join(format!("skillhub-{}", job_id));
    let mut ctx = playbook::ExecutionContext::new(temp_dir);
    ctx.vars.insert(
        "software.path".to_string(),
        software_path.clone(),
    );
    ctx.vars.insert("software.name".to_string(), software_name.clone());
    // 遗留 run_playbook 入口：可选版本参数，未传时注入空串避免 ${software.version} 残留
    // 被命令参数校验拒绝。主路径 install_skill 会从扫描结果填入真实版本。
    ctx.vars.insert(
        "software.version".to_string(),
        software_version.unwrap_or_default(),
    );

    // 3. 注入 Skill 元数据到变量（白名单校验，防止恶意 skill 元数据写入任意路径/命令参数）
    inject_skill_metadata_safe(&mut ctx, &skill)?;

    // 4. 异步执行（避免阻塞 Tauri 主线程）
    let app_clone = app.clone();
    let pb_clone = pb.clone();
    tokio::spawn(async move {
        let started = Instant::now();
        let mut step_count = 0;
        let total_steps = pb_clone.steps.len();

        let result = playbook::execute(&pb_clone, &mut ctx, |event| {
            // 上报进度到前端
            let payload = serde_json::json!({
                "job_id": job_id,
                "elapsed_ms": started.elapsed().as_millis(),
                "step": step_count,
                "total_steps": total_steps,
                "event": event,
            });
            let _ = app_clone.emit("install-progress", payload);
            step_count += 1;
        })
        .await;

        // 最终上报
        let final_payload = serde_json::json!({
            "job_id": job_id,
            "elapsed_ms": started.elapsed().as_millis(),
            "result": if result.is_ok() { "success" } else { "failed" },
            "error": result.err().map(|e| e.to_string()),
        });
        let _ = app_clone.emit("install-complete", final_payload);
    });

    Ok(format!("剧本已启动：{}", playbook_name))
}

/// 心跳/扫描后台循环入口（M7 解耦版）
///
/// 拆成两个独立 tokio task：
/// - `scan_loop`：每 5 分钟跑一次并发扫描，写入 `SoftwareCache`（不再每次心跳都 scan）
/// - `http_loop`：每 60 秒从 cache 读快照，POST 心跳；失败指数退避（30/60/120/240）
///
/// 优点：
/// 1. scan 一次耗时 ~250ms，从每次心跳（60s×N）省下大量串行等待
/// 2. HTTP 失败不阻塞下次心跳（错误退避仅影响自身）
/// 3. scan_cache 启动时立即可读（空 Vec），http_loop 启动延迟从 5s 降到 1s
/// 4. 用户手动触发扫描（Settings "重新扫描"）不阻塞心跳
async fn heartbeat_loop(
    helper_port: u16,
    key_store: Arc<KeyStore>,
    usage_store: Arc<UsageStore>,
) {
    // M8：构造 SoftwareCache 时绑定 UsageStore，hydrate 一次性读上次扫描结果
    // 回填内存 cache。hydrate 失败 / 无持久化数据 → 行为等同 M7（空 cache）。
    let cache = std::sync::Arc::new(crate::scan_cache::SoftwareCache::with_db(usage_store));
    cache.hydrate_from_db();

    // 启动延迟 1 秒（让 Tauri 窗口先出来 + llm_proxy 端口就绪）。
    // 原版 5s 偏长，对 dev loop 反馈慢；M7 减到 1s。
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    // 首次启动立刻 scan 一次（不等 5 分钟），让首次心跳就带 installed_software
    let initial_cache = cache.clone();
    let initial_key_store = key_store.clone();
    let initial_scan_handle = tokio::spawn(async move {
        scan_loop_task(initial_cache, initial_key_store, 0).await;
    });

    let http_handle = tokio::spawn(async move {
        http_loop_task(helper_port, key_store, cache).await;
    });

    // 任一 task panic 不影响另一个；这里 tokio runtime 会自动处理
    let _ = tokio::try_join!(initial_scan_handle, http_handle);
}

/// scan_loop 任务体：每 5 分钟并发扫描一次本机软件，写入 SoftwareCache。
async fn scan_loop_task(
    cache: std::sync::Arc<crate::scan_cache::SoftwareCache>,
    _key_store: Arc<KeyStore>,
    initial_skip_ms: u64,
) {
    use std::time::Duration;

    // 首次 scan 几乎立即（initial_skip_ms = 0 表示立即；HTTP loop 自己 sleep 1s）
    let mut interval_ms = initial_skip_ms.max(1);
    loop {
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
        let started = std::time::Instant::now();
        let installed = scanner::scan_all(None).await;
        let elapsed_ms = started.elapsed().as_millis() as u64;
        log::info!("scan_loop 完成：发现 {} 个软件，用时 {}ms", installed.len(), elapsed_ms);
        cache.replace(installed, elapsed_ms);

        // 5 分钟间隔（生产）/ SKILLHUB_SCAN_INTERVAL_SEC 环境变量可调
        interval_ms = std::env::var("SKILLHUB_SCAN_INTERVAL_SEC")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(300)
            * 1000;
    }
}

/// http_loop 任务体：每 60s 上报一次心跳，失败指数退避（30/60/120/240）。
///
/// 启动期：cache 还没数据时也能立即发心跳（installed_software=[] 即可）。
/// 第一次 scan_loop 跑完会写入 cache，下一次心跳自然就有数据。
async fn http_loop_task(
    helper_port: u16,
    key_store: Arc<KeyStore>,
    cache: std::sync::Arc<crate::scan_cache::SoftwareCache>,
) {
    use std::time::Duration;

    let api_base = std::env::var("SKILLHUB_API_BASE")
        .unwrap_or_else(|_| "https://skillhub.proclaw.cc".to_string());

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    // 退避等级（连续失败次数 → 下次重试秒数）。成功一次就重置为 0。
    const BACKOFF_LEVELS: &[u64] = &[30, 60, 120, 240];
    let mut consecutive_failures: usize = 0;
    let mut next_interval_secs: u64 = 30; // 启动期不立刻发（1s 启动延迟已给 HTTP 启动空间）

    loop {
        tokio::time::sleep(Duration::from_secs(next_interval_secs)).await;

        // 从 cache 读快照（即使空 Vec 也合法——首次循环 cache 还没数据）
        let installed = cache.snapshot();
        let software_tags: Vec<String> =
            installed.into_iter().map(|s| s.software_tag).collect();
        let protocol_registered = protocol::is_registered();

        // A 轮 #P1-22：若已绑定 session，附加 Authorization header；否则只发匿名上报。
        let snapshot = key_store.get_session().ok();
        let (token_header, user_id_field, user_email_field) = match &snapshot {
            Some(snap) if snap.has_token => {
                let t = key_store.peek_token_for_heartbeat().ok().flatten();
                (t, snap.user_id.clone(), snap.user_email.clone())
            }
            _ => (None, None, None),
        };
        let payload = serde_json::json!({
            "alive": true,
            "version": env!("CARGO_PKG_VERSION"),
            "installed_software": software_tags,
            "helper_port": helper_port,
            "protocol_registered": protocol_registered,
            "user_id": user_id_field,
            "user_email": user_email_field,
            // M7：上报 cache 元数据，方便云端判定 helper 在线但首次还没扫完
            "scan_age_ms": cache.last_scan_age_ms(),
            "scan_elapsed_ms": cache.last_scan_elapsed_ms(),
        });

        let mut req = client
            .post(format!("{}/api/v2/helper/heartbeat", api_base))
            .json(&payload);
        if let Some(t) = token_header.as_deref() {
            req = req.bearer_auth(t);
        }

        let success = match req.send().await {
            Ok(res) if res.status().is_success() => {
                log::debug!("心跳上报成功");
                true
            }
            Ok(res) => {
                log::warn!("心跳上报失败: {}", res.status());
                false
            }
            Err(e) => {
                log::warn!("心跳上报异常: {}", e);
                false
            }
        };

        // 退避计算
        if success {
            consecutive_failures = 0;
            next_interval_secs = std::env::var("SKILLHUB_HEARTBEAT_INTERVAL_SEC")
                .ok()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(60);
        } else {
            consecutive_failures = consecutive_failures.saturating_add(1).min(BACKOFF_LEVELS.len());
            next_interval_secs = BACKOFF_LEVELS[consecutive_failures - 1];
        }
    }
}

// =============================================================================
// M4：6 条新 invoke 命令实现（t05）
// - record_usage / get_local_usage_summary / export_usage_csv /
//   prune_local_usage / ensure_guest_session /
//   get_recommended_for_local_software（fetch_recommended_skills 的语义化别名）
// =============================================================================

/// M4：手动记账。前端 NluSearchBox 在 LLM 调用成功后再写一条（防 /llm/chat
/// 失败重试造成重复：调用方传 `client_record_id = crypto.randomUUID()`）
#[tauri::command]
async fn record_usage(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    rec: UsageRecordInput,
) -> Result<bool, String> {
    usage_store
        .record(rec)
        .map_err(|e| format!("record_usage 失败：{}", e))
}

/// M4：返回本地汇总。Usage Tab 在登录态也可直接读本机数据，无须走云端聚合。
#[tauri::command]
async fn get_local_usage_summary(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    range: Option<String>,
) -> Result<crate::usage_store::UsageSummary, String> {
    let r = range.unwrap_or_else(|| "7d".to_string());
    usage_store
        .summarize(&r)
        .map_err(|e| format!("summarize({}) 失败：{}", r, e))
}

/// M4：导出 CSV（含 UTF-8 BOM，Excel 直接打开）。Settings 页"导出"按钮调。
#[tauri::command]
async fn export_usage_csv(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    path: String,
) -> Result<u64, String> {
    let p = std::path::PathBuf::from(path);
    usage_store
        .export_csv(&p)
        .map_err(|e| format!("export_csv 失败：{}", e))
}

/// M4：手动清理 N 天前的本地记录。启动钩子默认 90 天；Settings 页可手动调。
#[tauri::command]
async fn prune_local_usage(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    days: Option<u32>,
) -> Result<u64, String> {
    let d = days.unwrap_or(90);
    usage_store
        .prune_older_than(d)
        .map_err(|e| format!("prune({}d) 失败：{}", d, e))
}

/// F22 修复：前端按 ProviderPricing 单价算完 cost 后，回传更新。
/// Rust 端只负责写 SQLite，不做 HTTP 拉单价（避免循环依赖 + 启动期网络）。
#[tauri::command]
async fn update_usage_cost(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    client_record_id: String,
    cost: f64,
) -> Result<u64, String> {
    usage_store
        .update_cost(&client_record_id, cost)
        .map_err(|e| format!("update_cost 失败：{}", e))
}

/// M5 §7.3：批量上报本机 SQLite 用量到云端 `/api/v2/usage/sync`。
///
/// 流程：
/// 1. 调 `list_unsynced(since=now-7d, limit=1000)` 拿未同步记录
/// 2. 构造 POST body（含 anonymous_id + machine_fingerprint + helper_version + os_version + records）
/// 3. POST 到云端；成功 200 解析响应（synced/deduped/total/session_id）
/// 4. 把云端确认写入的 client_record_ids 标 `synced_at_ms`
///
/// 失败（网络 / 4xx / 5xx）返回 Err；前端按钮显示错误，不动本地记录（下次重试）。
#[derive(serde::Serialize)]
struct UsageSyncResponse {
    ok: bool,
    synced: u64,
    deduped: u64,
    total: u64,
    session_id: String,
    retry_after_seconds: Option<u64>,
    message: String,
}

#[tauri::command]
async fn usage_sync_to_cloud(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
    anonymous_id: String,
    since_ms: Option<i64>,
) -> Result<UsageSyncResponse, String> {
    use std::time::Duration;

    // 1. 取本机未同步记录（默认拉 7 天内，limit 1000 防 413）
    let since = since_ms.unwrap_or_else(|| crate::usage_store::chrono_like_now_ms() - 7 * 86_400_000);
    let records = usage_store
        .list_unsynced(Some(since), 1000)
        .map_err(|e| format!("list_unsynced 失败：{}", e))?;

    if records.is_empty() {
        return Ok(UsageSyncResponse {
            ok: true,
            synced: 0,
            deduped: 0,
            total: 0,
            session_id: String::new(),
            retry_after_seconds: None,
            message: "无未同步记录".to_string(),
        });
    }

    // 2. 构造 records 数组（云端 schema 见 apps/web/app/api/v2/usage/sync/route.ts）
    let records_json: Vec<serde_json::Value> = records
        .iter()
        .map(|r| {
            serde_json::json!({
                "client_record_id": r.client_record_id,
                "skill_slug": r.skill_slug,
                "provider": r.provider_id,
                "model": r.model,
                "tokens_in": r.tokens_in,
                "tokens_out": r.tokens_out,
                "duration_ms": r.duration_ms,
                "occurred_at": ms_to_iso(r.created_at_ms),
                "path": "helper",
            })
        })
        .collect();

    // 投产修复（隐私）：上传不可逆哈希而非原始硬件 ID（MachineGuid / IOPlatformUUID）。
    // 云端只需稳定标识做幂等去重，不需要明文机器标识。
    let raw_machine = machine_uid::get().unwrap_or_else(|_| "unknown-machine".to_string());
    let machine_fingerprint = {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(b"skillhub-helper-machine-fingerprint-v1");
        h.update(raw_machine.as_bytes());
        format!("{:x}", h.finalize())
    };
    let body = serde_json::json!({
        "anonymous_id": anonymous_id,
        "machine_fingerprint": machine_fingerprint,
        "helper_version": env!("CARGO_PKG_VERSION"),
        "os_version": std::env::consts::OS,
        "records": records_json,
    });

    // 3. HTTP POST
    let api_base = std::env::var("SKILLHUB_API_BASE")
        .unwrap_or_else(|_| "https://skillhub.proclaw.cc".to_string());
    let url = format!("{}/api/v2/usage/sync", api_base);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("reqwest 构造失败：{}", e))?;

    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求云端失败：{}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        // 429：解析 Retry-After（云端 RateLimiter 可能透出 X-RateLimit-Reset）
        let retry_after = None; // 暂不解析 header，保持响应结构对称
        return Ok(UsageSyncResponse {
            ok: false,
            synced: 0,
            deduped: 0,
            total: records.len() as u64,
            session_id: String::new(),
            retry_after_seconds: retry_after,
            message: format!("云端限流（429）：{}", text),
        });
    }

    if !status.is_success() {
        return Ok(UsageSyncResponse {
            ok: false,
            synced: 0,
            deduped: 0,
            total: records.len() as u64,
            session_id: String::new(),
            retry_after_seconds: None,
            message: format!("云端返回 {}：{}", status.as_u16(), text),
        });
    }

    // 4. 解析成功响应
    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("解析云端响应失败：{}", e))?;

    let synced = parsed["synced"].as_u64().unwrap_or(0);
    let deduped = parsed["deduped"].as_u64().unwrap_or(0);
    let session_id = parsed["session_id"].as_str().unwrap_or("").to_string();
    let total = parsed["total"].as_u64().unwrap_or(records.len() as u64);

    // 5. 把本机所有尝试上传的记录（无论 synced 还是 deduped）都标 synced_at_ms。
    // 云端 deduped = 云端已有 client_record_id（幂等去重），本机也无需再尝试。
    let ids: Vec<String> = records.iter().map(|r| r.client_record_id.clone()).collect();
    let marked = usage_store
        .mark_synced(&ids)
        .map_err(|e| format!("mark_synced 失败：{}", e))?;

    Ok(UsageSyncResponse {
        ok: true,
        synced,
        deduped,
        total,
        session_id,
        retry_after_seconds: None,
        message: format!(
            "已同步 {} 条（云端去重 {} 条，本地标 {} 条）",
            synced, deduped, marked
        ),
    })
}

/// M5 §7.3：MS to ISO（lib.rs 这里只是为 `usage_sync_to_cloud` 构造 occurred_at；
/// 实现本身在 usage_store.rs，与 export_csv 共用）。
fn ms_to_iso(ms: i64) -> String {
    crate::usage_store::ms_to_iso_public(ms)
}

/// M4：首次启动时前端调一次，拿 anonymousId 写 localStorage。
/// M4 决策：游客不限次，所以本函数仅返回标识，不强制引导注册。
/// bind-guest 路由在 Web 端另设，详见 `apps/web/app/api/v2/auth/bind-guest/`。
#[tauri::command]
async fn ensure_guest_session() -> Result<serde_json::Value, String> {
    use sha2::{Digest, Sha256};
    // 投产修复：anonymous_id 必须与机器绑定且稳定（同一机器每次启动相同），
    // 否则前端可每次启动生成新 UUID 绕过 50 次/天限流。
    // 用机器指纹 + 固定 salt 派生 UUID v5 风格的稳定 ID，不可逆推原始机器标识。
    let raw_machine = machine_uid::get().unwrap_or_else(|_| "unknown-machine".to_string());
    let mut hasher = Sha256::new();
    hasher.update(b"skillhub-helper-anonymous-id-v1");
    hasher.update(raw_machine.as_bytes());
    let digest = hasher.finalize();
    let anonymous_id = format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        digest[0], digest[1], digest[2], digest[3],
        digest[4], digest[5], digest[6], digest[7],
        digest[8], digest[9], digest[10], digest[11],
        digest[12], digest[13], digest[14], digest[15]
    );

    // 上传给云端的指纹同样用哈希（不可逆），与 usage_sync_to_cloud 保持一致。
    let mut fp_hasher = Sha256::new();
    fp_hasher.update(b"skillhub-helper-machine-fingerprint-v1");
    fp_hasher.update(raw_machine.as_bytes());
    let machine_fingerprint = format!("{:x}", fp_hasher.finalize());

    Ok(serde_json::json!({
        "anonymous_id": anonymous_id,
        "machine_fingerprint": machine_fingerprint,
    }))
}

/// M4：原 `fetch_recommended_skills` 的语义化别名（PRD §14.4 表 14-7）
/// 内部直接转发，旧命令保留以兼容现存调用方。
#[tauri::command]
async fn get_recommended_for_local_software(
    installed: Vec<String>,
    limit: Option<u32>,
) -> Result<Vec<serde_json::Value>, String> {
    fetch_recommended_skills(installed, limit).await
}

// =============================================================================
// 投产修复：前端契约补全 + 本地代理鉴权
// =============================================================================

/// 返回本机 HTTP 代理的 Bearer token（每次启动轮换，不落盘）。
/// 前端启动时拉一次注入 LlmGateway；无 token 时 /llm/chat 会 401。
#[tauri::command]
async fn get_proxy_token(state: tauri::State<'_, LlmProxyState>) -> Result<String, String> {
    Ok(state.key_store.proxy_token().to_string())
}

/// 返回本机已安装的 Skill 列表（从 SQLite 读，安装成功后由 install_skill 写入）。
#[tauri::command]
async fn get_installed_skills(
    usage_store: tauri::State<'_, Arc<UsageStore>>,
) -> Result<Vec<crate::usage_store::InstalledSkill>, String> {
    usage_store
        .list_installed_skills()
        .map_err(|e| format!("读取已装 Skill 失败：{}", e))
}

/// 生成一个平台下载目录下的 CSV 绝对路径（不引入 dialog 插件，保持包体约束）。
#[tauri::command]
async fn pick_export_path() -> Result<String, String> {
    let base = dirs::download_dir()
        .or_else(dirs::desktop_dir)
        .or_else(dirs::home_dir)
        .ok_or_else(|| "无法确定下载目录，请在设置中指定导出路径".to_string())?;
    let file = format!("skillhub-usage-{}.csv", crate::usage_store::chrono_like_now_ms());
    let path = base.join(file);
    Ok(path.to_string_lossy().to_string())
}