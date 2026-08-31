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

use std::sync::Arc;
use tauri::Manager;

pub use key_store::KeyStore;
pub use llm_proxy::{LlmProxyState, ProxyHandle};
pub use provider::ProviderConfig;

/// 入口：启动 Tauri + llm_proxy 本机 HTTP 服务
pub fn run() {
    env_logger::init();

    let key_store = Arc::new(KeyStore::open().expect("KeyStore 初始化失败"));

    // 启动 llm_proxy 本机 HTTP 服务（端口自动选择）
    let proxy_state = Arc::new(LlmProxyState { key_store: key_store.clone() });
    let proxy_handle = llm_proxy::spawn(proxy_state.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 单实例：第二次启动时聚焦已有窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.show();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // 把 llm_proxy 端口号注入前端（设置页要展示）
            let port = proxy_handle.port();
            app.manage(proxy_state);
            app.manage(ProxyHandle(port));

            // 注册系统托盘
            let _tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("SkillHub Helper")
                .on_tray_icon_event(|_tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        // 双击托盘打开主窗口
                    }
                })
                .build(app)?;

            // 后台心跳上报（M2 增强：定时把已装软件 + 端口推到云端）
            let port_clone = port;
            tauri::async_runtime::spawn(async move {
                heartbeat_loop(port_clone).await;
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
            trigger_software_scan,
            fetch_recommended_skills,
            install_skill,
            test_provider_key,
            scan_installed_software,
            register_protocol,
            unregister_protocol,
            run_playbook,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败");
}

/// 给前端用的命令：返回助手基本信息（含本机 HTTP 端口号，方便 Web 端发现）
#[tauri::command]
fn get_helper_info(handle: tauri::State<'_, ProxyHandle>) -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "SkillHub Helper",
        "helper_port": handle.port(),
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

        let message = if result.is_ok() { pb_clone.success.message.clone() } else { String::new() };
        let cta = if result.is_ok() { pb_clone.success.cta.clone() } else { None };
        let final_payload = serde_json::json!({
            "job_id": job_id_clone,
            "elapsed_ms": started.elapsed().as_millis(),
            "result": if result.is_ok() { "success" } else { "failed" },
            "error": result.err().map(|e| e.to_string()),
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

/// 给前端用的命令：返回完整助手信息（M2 升级版）
/// 包含端口号 + 已注册协议 + 扫描到的本机软件
#[tauri::command]
async fn get_helper_full_info(
    handle: tauri::State<'_, ProxyHandle>,
) -> Result<serde_json::Value, String> {
    let port = handle.port();
    let protocol_registered = protocol::is_registered();

    // 扫描本机软件
    let installed = scanner::scan_all().await;
    let installed_software: Vec<String> = installed.into_iter().map(|s| s.software_tag).collect();

    Ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "SkillHub Helper",
        "helper_port": port,
        "protocol_registered": protocol_registered,
        "installed_software": installed_software,
        "scan_count": installed_software.len(),
        "scan_at": chrono_like_now(),
    }))
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}Z", now)
}

/// 给前端用的命令：测试某个 Provider 的 Key 是否有效
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
        model: "deepseek-chat".to_string(),
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

/// 心跳循环（M2 增强）
///
/// 每 60 秒扫描一次本机软件 + 上报到云端 /api/v2/helper/heartbeat
/// 用于反向推送：新 Skill 发布时，已装该软件的用户可收到推送
async fn heartbeat_loop(helper_port: u16) {
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

        // 2. 上报到云端
        let payload = serde_json::json!({
            "alive": true,
            "version": env!("CARGO_PKG_VERSION"),
            "installed_software": software_tags,
            "helper_port": helper_port,
            "protocol_registered": protocol_registered,
        });

        match client.post(format!("{}/api/v2/helper/heartbeat", api_base))
            .json(&payload)
            .send()
            .await
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