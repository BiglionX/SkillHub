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
use tauri::{Manager, SystemTrayEvent};

pub use key_store::KeyStore;
pub use llm_proxy::{LlmProxyState, ProxyHandle};
pub use provider::ProviderConfig;

/// 入口：启动 Tauri + llm_proxy 本机 HTTP 服务
pub fn run() {
    env_logger::init();

    let key_store = Arc::new(KeyStore::open().expect("KeyStore 初始化失败"));

    // 启动 llm_proxy 本机 HTTP 服务（端口自动选择）
    let proxy_state = Arc::new(LlmProxyState::new(key_store.clone()));
    let proxy_handle = llm_proxy::spawn(proxy_state.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 单实例：第二次启动时聚焦已有窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.show();
            }
        }))
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
                    if let SystemTrayEvent::DoubleClick { .. } = event {
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
            test_provider_key,
            scan_installed_software,
            register_protocol,
            unregister_protocol,
            run_playbook,
            get_helper_full_info,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败");
}

/// 给前端用的命令：返回助手基本信息（含端口号）
#[tauri::command]
fn get_helper_info() -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "SkillHub Helper",
    })
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
    let mut pb = playbook::load_builtin(&playbook_name).map_err(|e| e.to_string())?;

    // 2. 创建执行上下文
    let temp_dir = std::env::temp_dir().join(format!("skillhub-{}", job_id));
    let mut ctx = playbook::Context::new(temp_dir);
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
        let interval = std::env::var("SKILLHUB_HEARTBEAT_INTERVAL_SEC")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            || 60;
        tokio::time::sleep(Duration::from_secs(interval)).await;
    }
}