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
use crate::protocol;
use crate::provider::{ChatMessage, ChatRequest, LlmProvider, ProviderConfig};
use crate::usage_store::{UsageRecordInput, UsageStore};

/// 全局状态，注入到 axum
pub struct LlmProxyState {
    pub key_store: Arc<KeyStore>,
    /// M4：本地用量 SQLite 存储（启动时由 lib.rs::run 注入）
    pub usage_store: Arc<UsageStore>,
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
        .route("/llm/usage/summary", get(handle_usage_summary))
        .route("/llm/usage/sync", post(handle_usage_sync))
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
    let active = state.key_store.get_active_key().ok().flatten();
    let provider = active.as_ref().map(|(p, _)| p.clone());
    let has_key = active.is_some();
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
    /// M4：客户端生成的幂等键（前端用 crypto.randomUUID() 生成），重复提交同 key 只记 1 条
    #[serde(default)]
    client_record_id: Option<String>,
    /// M4：游客 anonymous_id 或登录 userId，用于把用量记录关联到会话
    #[serde(default)]
    session_id: Option<String>,
    /// M4：调用哪个 Skill 的 slug（例如 "photoshop-retouch"），用于按 Skill 拆分汇总
    #[serde(default)]
    skill_slug: Option<String>,
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
    /// M4：输入 token 数（与 tokens_used 二选一调用方可用）
    #[serde(skip_serializing_if = "Option::is_none")]
    tokens_in: Option<u32>,
    /// M4：输出 token 数
    #[serde(skip_serializing_if = "Option::is_none")]
    tokens_out: Option<u32>,
    duration_ms: u64,
    /// M4：本地 SQLite 写入的 record_id（client_record_id），前端可用于后续去重校验
    #[serde(skip_serializing_if = "Option::is_none")]
    record_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct ChatError {
    reason: &'static str,
    message: String,
}

async fn handle_chat(
    State(state): State<Arc<LlmProxyState>>,
    Json(body): Json<ChatBody>,
) -> axum::response::Response {
    use axum::response::IntoResponse;

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
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ChatError {
                    reason: "key_store_error",
                    message: e.to_string(),
                }),
            )
                .into_response();
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

            // M4：记账（用 client_record_id 幂等；前端传空则服务端生成 UUIDv4）
            let record_id = body
                .client_record_id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let session_kind = if body.session_id.is_some() {
                "user"
            } else {
                "guest"
            };
            let usage_input = UsageRecordInput {
                client_record_id: record_id.clone(),
                created_at_ms: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0),
                skill_slug: body.skill_slug.clone().unwrap_or_else(|| "general".to_string()),
                provider_id: provider.clone(),
                // CRITICAL #2 复盘：必须用 resp.model（请求体里的 model），不能拿
                // tokens_used（数字）的 to_string 填进来，否则 SQLite model 列
                // 全是数字串，CSV 导出与按 model 聚合全部失效。
                model: resp.model.clone(),
                tokens_in: resp.tokens_in,
                tokens_out: resp.tokens_out,
                duration_ms: resp.duration_ms,
                cost_estimate: None, // 前端按 ProviderPricing 算好后回传 / 留空
                source: "LOCAL_DESKTOP".to_string(),
                session_kind: session_kind.to_string(),
                session_id: body.session_id.clone(),
            };
            if let Err(e) = state.usage_store.record(usage_input) {
                log::warn!("用量记账失败（不影响主流程）：{}", e);
            }

            (
                StatusCode::OK,
                Json(ChatOk {
                    content: resp.content,
                    parsed,
                    tokens_used: resp.tokens_used,
                    tokens_in: Some(resp.tokens_in),
                    tokens_out: Some(resp.tokens_out),
                    duration_ms: resp.duration_ms,
                    record_id: Some(record_id),
                }),
            )
                .into_response()
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
                .into_response()
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
    let active = state.key_store.get_active_key().ok().flatten();
    let provider = active.as_ref().map(|(p, _)| p.clone());
    let has_key = active.is_some();
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

// =============================================================================
// M4：用量本机端点
// =============================================================================

#[derive(Debug, Deserialize)]
struct UsageQuery {
    #[serde(default = "default_usage_range")]
    range: String, // "today" | "7d" | "30d"
}

fn default_usage_range() -> String {
    "7d".to_string()
}

/// GET /llm/usage/summary?range=today|7d|30d
/// 前端 Usage Tab 直接拉本机汇总，无需登录
async fn handle_usage_summary(
    State(state): State<Arc<LlmProxyState>>,
    axum::extract::Query(q): axum::extract::Query<UsageQuery>,
) -> impl IntoResponse {
    match state.usage_store.summarize(&q.range) {
        Ok(s) => (StatusCode::OK, Json(serde_json::json!({"ok": true, "summary": s}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"ok": false, "error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct UsageSyncBody {
    records: Vec<crate::usage_store::UsageRecordInput>,
}

/// POST /llm/usage/sync
/// Web 端（已登录用户）批量上报桌面端用量到云端 Prisma 的前置检查端点；
/// 本端点只做幂等校验并返回 summary（前端拿到后再调 /api/v2/usage/sync 推到云端）
async fn handle_usage_sync(
    State(state): State<Arc<LlmProxyState>>,
    Json(body): Json<UsageSyncBody>,
) -> impl IntoResponse {
    let mut inserted = 0u64;
    let mut duplicates = 0u64;
    for rec in body.records {
        match state.usage_store.record(rec) {
            Ok(true) => inserted += 1,
            Ok(false) => duplicates += 1,
            Err(e) => {
                log::warn!("sync 记录失败：{}", e);
            }
        }
    }
    let summary = state.usage_store.summarize("30d").ok();
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ok": true,
            "inserted": inserted,
            "duplicates": duplicates,
            "summary": summary,
        })),
    )
        .into_response()
}