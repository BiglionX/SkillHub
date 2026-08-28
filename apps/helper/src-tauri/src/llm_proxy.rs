//! 本机 HTTP 代理服务（llm_proxy.rs）
//!
//! 监听 `127.0.0.1:{random_port}`，提供：
//! - POST /llm/chat   转发 LLM 调用（拿用户本地 Key 调 Provider）
//! - GET  /llm/status 助手是否在线 + 是否配了 Key（前端探测用）
//! - POST /llm/keys/test 测试某个 Provider 的 Key
//!
//! Web 前端通过 `window.__SKILLHUB_HELPER_PORT__` 拿到端口。

use axum::{
    extract::State,
    http::{header::HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

use crate::key_store::KeyStore;
use crate::provider::{ChatMessage, ChatRequest, LlmProvider, ProviderConfig};

/// 全局状态，注入到 axum
pub struct LlmProxyState {
    pub key_store: Arc<KeyStore>,
}

/// 端口号，注入到 Tauri app state（前端用）
pub struct ProxyHandle(pub u16);

impl ProxyHandle {
    pub fn port(&self) -> u16 {
        self.0
    }
}

/// 启动本机 HTTP 服务，返回 ProxyHandle（含端口号）
pub fn spawn(state: Arc<LlmProxyState>) -> ProxyHandle {
    // 找一个空闲端口
    let port = portpicker::pick_unused_port()
    .expect("找不到可用端口");

    let app = build_router(state);

    // 后台 spawn tokio 任务
    tauri::async_runtime::spawn(async move {
        let addr = format!("127.0.0.1:{}", port);
        match TcpListener::bind(&addr).await {
            Ok(listener) => {
                log::info!("llm_proxy 启动于 {}", addr);
                if let Err(e) = axum::serve(listener, app).await {
                    log::error!("llm_proxy 异常退出: {}", e);
                }
            }
            Err(e) => {
                log::error!("llm_proxy 端口绑定失败: {}", e);
            }
        }
    });

    ProxyHandle(port)
}

fn build_router(state: Arc<LlmProxyState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap())
        .allow_origin("http://127.0.0.1:3000".parse::<HeaderValue>().unwrap())
        .allow_origin("https://skillhub.proclaw.cc".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([HeaderName::from_static("content-type")])
        .allow_credentials(true);

    Router::new()
        .route("/llm/chat", post(handle_chat))
        .route("/llm/status", get(handle_status))
        .route("/llm/discover", get(handle_discover))
        .route("/llm/keys/test", post(handle_test_key))
        .route("/health", get(|| async { "ok" }))
        .layer(cors)
        .with_state(state)
}

#[derive(Debug, Serialize)]
struct DiscoverResponse {
    name: &'static str,
    version: &'static str,
    installed_software: Vec<String>,
    protocol_registered: bool,
}

/// GET /llm/discover
/// Web 端无需事先知道端口时，可扫常见端口范围探测助手
async fn handle_discover(State(state): State<Arc<LlmProxyState>>) -> impl IntoResponse {
    let (provider, _) = state.key_store.get_active_key().ok().flatten();
    let has_key = provider.is_some();
    Json(serde_json::json!({
        "name": "SkillHub Helper",
        "version": env!("CARGO_PKG_VERSION"),
        "has_key": has_key,
        "active_provider": provider,
        "protocol_registered": protocol::is_registered(),
        "capabilities": ["llm_chat", "playbook_run", "software_scan"],
    }))
}

#[derive(Debug, Deserialize)]
struct ChatBody {
    system_prompt: String,
    user_message: String,
    #[serde(default)]
    detected_software: Vec<String>,
    #[serde(default)]
    json_mode: bool,
    #[serde(default = "default_temperature")]
    temperature: f32,
    #[serde(default = "default_max_tokens")]
    max_tokens: u32,
}

fn default_temperature() -> f32 {
    0.1
}
fn default_max_tokens() -> u32 {
    500
}

#[derive(Debug, Serialize)]
struct ChatOk {
    content: String,
    parsed: Option<serde_json::Value>,
    tokens_used: u32,
    duration_ms: u64,
}

#[derive(Debug, Serialize)]
struct ChatError {
    reason: &'static str,
    message: String,
}

async fn handle_chat(
    State(state): State<Arc<LlmProxyState>>,
    Json(body): Json<ChatBody>,
) -> impl IntoResponse {
    // 1. 取用户当前激活的 Key
    let (provider, api_key) = match state.key_store.get_active_key() {
        Ok(Some(k)) => k,
        Ok(None) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ChatError {
                    reason: "helper_no_key",
                    message: "助手未配置 LLM Key，请去设置页填入".to_string(),
                }),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ChatError {
                    reason: "key_store_error",
                    message: e.to_string(),
                }),
            );
        }
    };

    // 2. 构造 ProviderConfig + ChatRequest
    let config = ProviderConfig {
        provider: provider.clone(),
        api_key,
        base_url: None,
        model: String::new(), // mod.rs 内部会用 provider 默认
    };

    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: body.system_prompt.clone(),
    }];

    // 如果有已装软件，附加到 system 后面
    if !body.detected_software.is_empty() {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!(
                "用户本机已装软件：{}",
                body.detected_software.join(", ")
            ),
        });
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: body.user_message,
    });

    let req = ChatRequest {
        messages,
        temperature: Some(body.temperature),
        max_tokens: Some(body.max_tokens),
        json_mode: Some(body.json_mode),
    };

    // 3. 调 LLM
    match LlmProvider::chat(&config, &req).await {
        Ok(resp) => {
            let parsed = if body.json_mode {
                serde_json::from_str(&resp.content).ok()
            } else {
                None
            };
            (
                StatusCode::OK,
                Json(ChatOk {
                    content: resp.content,
                    parsed,
                    tokens_used: resp.tokens_used,
                    duration_ms: resp.duration_ms,
                }),
            )
        }
        Err(e) => {
            log::warn!("LLM 调用失败: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(ChatError {
                    reason: "provider_error",
                    message: e.to_string(),
                }),
            )
        }
    }
}

#[derive(Debug, Serialize)]
struct StatusResponse {
    online: bool,
    has_key: bool,
    provider: Option<String>,
    version: &'static str,
}

async fn handle_status(State(state): State<Arc<LlmProxyState>>) -> impl IntoResponse {
    let (provider, _) = state.key_store.get_active_key().ok().flatten();
    let has_key = provider.is_some();
    Json(StatusResponse {
        online: true,
        has_key,
        provider,
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(Debug, Deserialize)]
struct TestKeyBody {
    provider: String,
    api_key: String,
    base_url: Option<String>,
    model: Option<String>,
}

async fn handle_test_key(Json(body): Json<TestKeyBody>) -> impl IntoResponse {
    let config = ProviderConfig {
        provider: body.provider.clone(),
        api_key: body.api_key,
        base_url: body.base_url,
        model: body.model.unwrap_or_else(|| "deepseek-chat".to_string()),
    };

    match LlmProvider::test_connection(&config).await {
        Ok(models) => (StatusCode::OK, Json(serde_json::json!({"ok": true, "models": models}))).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": e.to_string()})),
        )
            .into_response(),
    }
}