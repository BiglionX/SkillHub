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
            tauri::async_runtime::spawn(async move {
                heartbeat_loop(port_clone, key_store_for_heartbeat).await;
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
) -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "SkillHub",
        "helper_port": handle.port(),
        "key_store_fallback": state.key_store.is_fallback(),
        "key_store_fallback_reason": state.key_store.fallback_reason(),
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
    let mut keys = state.key_store.load().map_err(|e| e.to_string())?;
    keys.active_provider = provider;
    state.key_store.save(&keys).map_err(|e| e.to_string())
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
    let mut keys = state.key_store.load().map_err(|e| e.to_string())?;
    keys.keys.remove(&provider);
    state.key_store.save(&keys).map_err(|e| e.to_string())
}

/// 扫描本机已装软件（M2：手动触发，由前端“重新扫描”按钮调用）
/// 返回 `scanner::ScannedSoftware` 列表的 JSON 数组
#[tauri::command]
async fn trigger_software_scan() -> Result<Vec<serde_json::Value>, String> {
    let results = scanner::scan_all().await;
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
    let limit = limit.unwrap_or(20);
    let software_query = installed.join(",");
    let url = format!(
        "{}/api/v2/skills?software={}&category=A&limit={}",
        api_base, software_query, limit
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
    slug: String,
    skill: serde_json::Value,
) -> Result<String, String> {
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

    // 2. 扫描找到软件路径
    let installed = scanner::scan_all().await;
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

    if let Some(obj) = skill.as_object() {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                ctx.vars.insert(format!("skill.{}", k), s.to_string());
            }
        }
    }

    // 4. 异步执行
    let app_clone = app.clone();
    let pb_clone = pb.clone();
    let job_id_clone = job_id.clone();
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
    slug: String,
    skill: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    log::info!("卸载 Skill: {:?}", skill);
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

    // 扫描本机软件
    let installed = scanner::scan_all().await;
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

    let config = ProviderConfig {
        provider: provider.clone(),
        api_key,
        base_url,
        model: String::new(),
    };

    match LlmProvider::test_connection(&config).await {
        Ok(info) => Ok(serde_json::json!({
            "ok": true,
            "provider": provider,
            "models": info,
        })),
        Err(e) => Err(e),
    }
}

/// 扫描本机已装软件（M2）
#[tauri::command]
async fn scan_installed_software() -> Result<Vec<serde_json::Value>, String> {
    let results = scanner::scan_all().await;
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

    // 3. 注入 Skill 元数据到变量
    if let Some(obj) = skill.as_object() {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                ctx.vars.insert(format!("skill.{}", k), s.to_string());
            }
        }
    }

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

/// 心跳循环（M2 增强 + A 轮 #P1-22 user identity）
///
/// 每 60 秒扫描一次本机软件 + 上报到云端 /api/v2/helper/heartbeat。
/// 用于反向推送：新 Skill 发布时，已装该软件的用户可收到推送。
/// P1-22：若已绑定 Web OIDC session，附 Authorization Bearer header，云端可解析为 userId。
async fn heartbeat_loop(helper_port: u16, key_store: Arc<KeyStore>) {
    use std::time::Duration;
    let api_base = std::env::var("SKILLHUB_API_BASE")
        .unwrap_or_else(|_| "https://skillhub.proclaw.cc".to_string());

    // 首次启动延迟 5 秒（让 Tauri 窗口先出来）
    tokio::time::sleep(Duration::from_secs(5)).await;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    loop {
        // 1. 扫描本机软件
        let installed = scanner::scan_all().await;
        let software_tags: Vec<String> = installed.into_iter().map(|s| s.software_tag).collect();
        let protocol_registered = protocol::is_registered();

        // 2. 拼 payload + 附带 session（Bearer）让云端能解码出 userId。
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
        });

        let mut req = client
            .post(format!("{}/api/v2/helper/heartbeat", api_base))
            .json(&payload);
        if let Some(t) = token_header.as_deref() {
            req = req.bearer_auth(t);
        }
        match req.send().await
        {
            Ok(res) if res.status().is_success() => {
                log::debug!("心跳上报成功");
            }
            Ok(res) => {
                log::warn!("心跳上报失败: {}", res.status());
            }
            Err(e) => {
                log::warn!("心跳上报异常: {}", e);
            }
        }

        // 3. 等 60 秒再上报（生产环境）；开发环境可以缩短
        let interval: u64 = std::env::var("SKILLHUB_HEARTBEAT_INTERVAL_SEC")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(60);
        tokio::time::sleep(Duration::from_secs(interval)).await;
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

/// M4：首次启动时前端调一次，拿 anonymousId 写 localStorage。
/// M4 决策：游客不限次，所以本函数仅返回标识，不强制引导注册。
/// bind-guest 路由在 Web 端另设，详见 `apps/web/app/api/v2/auth/bind-guest/`。
#[tauri::command]
async fn ensure_guest_session() -> Result<serde_json::Value, String> {
    let anonymous_id = uuid::Uuid::new_v4().to_string();
    let machine_fingerprint = machine_uid::get()
        .unwrap_or_else(|_| "unknown-machine".to_string());
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