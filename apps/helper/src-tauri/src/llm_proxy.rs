//! 本机 HTTP 代理服务（llm_proxy.rs）
//!
//! 监听 `127.0.0.1:{random_port}`，提供：
//! - POST /llm/chat   转发 LLM 调用（拿用户本地 Key 调 Provider）【需 Bearer】
//! - GET  /llm/status 助手是否在线 + 是否配了 Key（前端探测用）【免鉴权】
//! - GET  /llm/discover 端口探测【免鉴权，不泄露 Key 配置】
//! - POST /llm/keys/test 测试某个 Provider 的 Key【需 Bearer】
//! - GET  /llm/usage/summary / POST /llm/usage/sync【均需 Bearer】
//!
//! Web 前端通过 `window.__SKILLHUB_HELPER_PORT__` 拿到端口。

use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

use crate::key_store::KeyStore;
use crate::protocol;
use crate::provider::{validate_base_url, ChatMessage, ChatRequest, LlmProvider, ProviderConfig};
use crate::usage_store::{UsageRecordInput, UsageStore};

/// M5 §6.2：游客每天 LLM 调用上限。超过直接 503。
/// 调小这个常量只影响本地 SQLite 计数（不涉及云端），修改后需 cargo test。
const GUEST_DAILY_LIMIT: i64 = 50;

/// 会消费用户 Key 或写入本地数据的路由，必须带 Bearer token
const PROTECTED_PATHS: &[&str] = &[
    "/llm/chat",
    "/llm/keys/test",
    "/llm/usage/sync",
    "/llm/usage/summary",
];

/// 允许访问本机代理的 Origin（浏览器开发服务器 + 线上站 + Tauri WebView）
const ALLOWED_ORIGINS: &[&str] = &[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://skillhub.proclaw.cc",
    "tauri://localhost",
    "http://tauri.localhost",
];

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

/// 纯函数：是否需要按游客限流。
/// 只有未登录（session_id 为 None）才算游客；session_id 语义为登录用户 userId。
fn should_enforce_guest_limit(session_id: &Option<String>) -> bool {
    session_id.is_none()
}

/// 校验 `Authorization: Bearer <proxy_token>`。
/// token 来自 `KeyStore::proxy_token()`（每次启动轮换），不落盘。
fn check_bearer(state: &LlmProxyState, headers: &HeaderMap) -> Result<(), Response> {
    let expected = state.key_store.proxy_token();
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // scheme 大小写不敏感；用 split_once 避免按字节切片触发 UTF-8 panic
    let provided = auth
        .split_once(' ')
        .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("Bearer"))
        .map(|(_, token)| token)
        .unwrap_or("");
    if provided.is_empty() || provided.len() != expected.len() || provided != expected {
        return Err((StatusCode::UNAUTHORIZED, "Unauthorized").into_response());
    }
    Ok(())
}

/// 全局安全中间件：
/// 1) 所有带 Origin 的请求必须在白名单内（无 Origin 的非浏览器请求只校验 token）；
/// 2) 受保护路由校验 Bearer token。
async fn security_middleware(
    State(state): State<Arc<LlmProxyState>>,
    req: Request,
    next: Next,
) -> Response {
    if let Some(origin) = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        if !ALLOWED_ORIGINS.contains(&origin) {
            log::warn!("拒绝非法 Origin: {}", origin);
            return (StatusCode::FORBIDDEN, "Forbidden: disallowed Origin").into_response();
        }
    }

    if PROTECTED_PATHS.contains(&req.uri().path()) {
        if let Err(resp) = check_bearer(&state, req.headers()) {
            return resp;
        }
    }

    next.run(req).await
}

fn build_router(state: Arc<LlmProxyState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap())
        .allow_origin("http://127.0.0.1:3000".parse::<HeaderValue>().unwrap())
        .allow_origin("https://skillhub.proclaw.cc".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST])
        // 浏览器携带 Authorization 时预检必须放行该 header
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("authorization"),
        ])
        .allow_credentials(true);

    Router::new()
        .route("/llm/chat", post(handle_chat))
        .route("/llm/status", get(handle_status))
        .route("/llm/discover", get(handle_discover))
        .route("/llm/keys/test", post(handle_test_key))
        .route("/llm/usage/summary", get(handle_usage_summary))
        .route("/llm/usage/sync", post(handle_usage_sync))
        .route("/health", get(|| async { "ok" }))
        // 注意 layer 顺序：先加 security 再加 cors，cors 在最外层先处理 OPTIONS 预检，
        // 否则预检请求会被 Bearer 校验拦截。
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security_middleware,
        ))
        .layer(cors)
        .with_state(state)
}

/// GET /llm/discover
/// Web 端无需事先知道端口时可扫常见端口范围探测助手。
/// 免鉴权但不得暴露 has_key / active_provider，避免泄露用户 Key 配置。
async fn handle_discover() -> impl IntoResponse {
    Json(serde_json::json!({
        "name": "SkillHub",
        "version": env!("CARGO_PKG_VERSION"),
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
    /// M4：仅登录用户的 userId。为 None 表示游客（触发限流）
    #[serde(default)]
    session_id: Option<String>,
    /// 游客匿名标识（前端本地生成），仅游客路径使用；session_kind 仍记为 guest
    #[serde(default)]
    pub anonymous_id: Option<String>,
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

/// 请求体长度校验，超限返回 400 + reason="invalid_input"
fn validate_chat_input(body: &ChatBody) -> Option<ChatError> {
    let invalid = |field: &'static str| ChatError {
        reason: "invalid_input",
        message: format!("参数 {} 超出允许长度", field),
    };
    if body.system_prompt.chars().count() > 20_000 {
        return Some(invalid("system_prompt"));
    }
    if body.user_message.chars().count() > 20_000 {
        return Some(invalid("user_message"));
    }
    if body.detected_software.len() > 30 {
        return Some(invalid("detected_software"));
    }
    if let Some(slug) = body.skill_slug.as_ref() {
        if slug.chars().count() > 100 {
            return Some(invalid("skill_slug"));
        }
    }
    None
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
    // 0. 输入长度校验
    if let Some(err) = validate_chat_input(&body) {
        return (StatusCode::BAD_REQUEST, Json(err)).into_response();
    }

    // M5 §6.2：游客 50 次/天前置检查。
    // 真正游客 = session_id 为 None（session_id 现在只表示登录用户 userId）。
    // 注意：try_reserve_guest 在 LLM 调用之前执行，因此即使后续 LLM 调用失败也会占用额度
    //（这是期望行为，防止攻击者用必然失败的请求绕过限流）；并发安全由 SQLite 事务保证。
    if should_enforce_guest_limit(&body.session_id) {
        let anon = body.anonymous_id.as_deref().unwrap_or("unknown");
        match state
            .usage_store
            .try_reserve_guest(anon, GUEST_DAILY_LIMIT)
        {
            Ok(true) => {}
            Ok(false) => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(ChatError {
                        reason: "guest_over_limit",
                        message: format!(
                            "游客每天最多 {} 次 LLM 调用，今日额度已用完。绑定 Web 账号或配置 API Key 解锁",
                            GUEST_DAILY_LIMIT
                        ),
                    }),
                )
                    .into_response();
            }
            Err(e) => {
                log::warn!("游客额度预占失败: {}", e);
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(ChatError {
                        reason: "guest_over_limit",
                        message: "本地用量存储异常，请查看日志".to_string(),
                    }),
                )
                    .into_response();
            }
        }
    }

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
            log::warn!("读取本地 Key 失败: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ChatError {
                    reason: "key_store_error",
                    message: "本地密钥存储异常，请查看日志".to_string(),
                }),
            )
                .into_response();
        }
    };

    // 2. 构造 ProviderConfig + ChatRequest
    // A 轮 #PR-4：从 KeyStore 读已保存的 base_url（custom 自托管用），不再传 None。
    // 若保存的 URL 被篡改（SSRF 防护），直接 400 而不是带着用户 Key 发请求。
    let saved_urls = state.key_store.get_all_base_urls().unwrap_or_default();
    let base_url = saved_urls.get(&provider).cloned();
    if let Some(ref u) = base_url {
        if let Err(e) = validate_base_url(u, true) {
            log::warn!("已保存的 base_url 非法（provider={}）: {}", provider, e);
            return (
                StatusCode::BAD_REQUEST,
                Json(ChatError {
                    reason: "invalid_input",
                    message: "已保存的 Base URL 非法，请在设置页重新填写".to_string(),
                }),
            )
                .into_response();
        }
    }

    let config = ProviderConfig {
        provider: provider.clone(),
        api_key,
        base_url,
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
            // session_kind 仍按登录与否判定；session_id 字段游客写 anonymous_id，
            // 这样 count_today_guest 能按 session_kind='guest' 统计到游客调用。
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
                skill_slug: body
                    .skill_slug
                    .clone()
                    .unwrap_or_else(|| "general".to_string()),
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
                session_id: body.session_id.clone().or(body.anonymous_id.clone()),
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
            // 详细错误（可能含上游 body / URL）只写本地日志，不回传前端
            log::warn!("LLM 调用失败（provider={}）: {}", provider, e);
            (
                StatusCode::BAD_GATEWAY,
                Json(ChatError {
                    reason: "provider_error",
                    message: "LLM 服务调用失败，请检查网络或 Key 是否有效（详情已写入本地日志）"
                        .to_string(),
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
    // 输入长度校验
    if body.api_key.chars().count() > 500 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false, "reason": "invalid_input", "error": "api_key 过长"
            })),
        )
            .into_response();
    }
    if let Some(ref u) = body.base_url {
        if u.chars().count() > 500 {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false, "reason": "invalid_input", "error": "base_url 过长"
                })),
            )
                .into_response();
        }
        // 允许 localhost（用户可能测试本地 vLLM），但仍走 SSRF 白名单
        if let Err(e) = validate_base_url(u, true) {
            log::warn!("Key 测试传入非法 base_url: {}", e);
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false, "reason": "invalid_input", "error": "Base URL 非法或不被允许"
                })),
            )
                .into_response();
        }
    }

    let config = ProviderConfig {
        provider: body.provider.clone(),
        api_key: body.api_key,
        base_url: body.base_url,
        model: body.model.unwrap_or_else(|| "deepseek-chat".to_string()),
    };

    match LlmProvider::test_connection(&config).await {
        Ok(models) => (
            StatusCode::OK,
            Json(serde_json::json!({"ok": true, "models": models})),
        )
            .into_response(),
        Err(e) => {
            // 脱敏：上游错误可能含 Key / 上游 body / URL，只写日志
            log::warn!("Key 测试失败: {}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "Key 测试失败：请确认 Key、模型名与 Base URL 正确"
                })),
            )
                .into_response()
        }
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
        Ok(s) => (
            StatusCode::OK,
            Json(serde_json::json!({"ok": true, "summary": s})),
        )
            .into_response(),
        Err(e) => {
            log::warn!("读取本地用量汇总失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "ok": false, "error": "本地用量数据读取失败"
                })),
            )
                .into_response()
        }
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
    match state.usage_store.summarize("30d") {
        Ok(summary) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "ok": true,
                "inserted": inserted,
                "duplicates": duplicates,
                "summary": summary,
            })),
        )
            .into_response(),
        Err(e) => {
            log::warn!("sync 后读取用量汇总失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "ok": false, "error": "本地用量数据读取失败"
                })),
            )
                .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guest_limit_enforced_only_for_anonymous_session() {
        // 真正游客（未登录）才限流
        assert!(should_enforce_guest_limit(&None));
        // 有 userId 的登录用户不限流
        assert!(!should_enforce_guest_limit(&Some("user-123".to_string())));
    }
}
