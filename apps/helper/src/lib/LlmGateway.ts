/**
 * LlmGateway — 桌面端助手内的 LLM 接入封装（M4）
 *
 * 与 apps/web/lib/services/LlmGateway.ts 同名但语义不同：
 * - Web 版：探测外部助手 → 转发 LLM 调用
 * - Helper 版：本机自调 — 我们就是助手，直接 fetch 本机 HTTP 端口
 *
 * 端口来源：invoke('get_helper_info') 拿 helper_port（启动时缓存到 module-level）
 * 鉴权：invoke('get_proxy_token') 拿本机代理 token，所有需要鉴权的端点带 Bearer 头
 *
 * M4 扩展（t12）：
 * - 增加 skillSlug / anonymousId / clientRecordId 三个可选字段
 * - 这些字段会透传到 /llm/chat 请求 body，Rust 端据此写 SQLite
 * - 客户端必须传 clientRecordId（crypto.randomUUID()），用于幂等去重
 *
 * v2.0.8+ 契约修正：
 * - session_id 只代表**已登录 userId**；anonymous_id 只代表**游客 ID**，两者不再混用
 * - 503/502/400 的错误文案脱敏：只回通用文案 + status code，不回显内部错误原文
 */

export interface LlmChatRequest {
  systemPrompt: string;
  userMessage: string;
  jsonMode?: boolean;
  detectedSoftware?: string[];
  temperature?: number;
  maxTokens?: number;
  /// M4：调用哪个 Skill（前端 NluSearchBox 命中某个 Skill 时填）
  skillSlug?: string;
  /// 已登录用户的 userId（来自 get_session_info）。有值时写 session_id。
  userId?: string;
  /// 游客 ID（来自 ensure_guest_session / localStorage）。只写 anonymous_id，不再当 session_id 用。
  anonymousId?: string;
  /// M4：客户端生成的幂等键（crypto.randomUUID()），重复提交只记 1 条
  clientRecordId?: string;
}

export interface LlmChatOk {
  ok: true;
  content?: string;
  parsed?: unknown;
  path: 'helper';
  tokensUsed?: number;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  /// M4：本地 SQLite 写入的 record_id（与 clientRecordId 同值），前端可校验去重
  recordId?: string;
}

export interface LlmChatErr {
  ok: false;
  reason:
    | 'helper_no_port'
    | 'helper_no_key'
    | 'helper_timeout'
    | 'helper_unreachable'
    | 'provider_error'
    | 'guest_over_limit'
    | 'invalid_input'
    | 'unknown';
  message: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/// 启动时由 App.tsx 注入；未注入则 fallback 到 window.__SKILLHUB_HELPER_PORT__
let cachedPort: number | null = null;
/// 启动时由 App.tsx invoke('get_proxy_token') 注入，供所有需鉴权端点使用
let cachedProxyToken: string | null = null;
/// 启动时由 App.tsx invoke('get_session_info') 注入（仅已登录时有值）
let cachedUserId: string | null = null;
/// 游客 ID（ensure_guest_session / localStorage），仅写 anonymous_id
let cachedAnonymousId: string | null = null;

export function setHelperPort(port: number | null): void {
  cachedPort = port;
}

export function setProxyToken(token: string | null): void {
  cachedProxyToken = token;
}

/**
 * 注入当前登录用户 ID。未登录传 null —— 此时请求只带 anonymous_id，不带 session_id。
 * NluSearchBox 等调用点未显式传 userId，因此由 App 在启动时统一注入。
 */
export function setUserId(id: string | null): void {
  cachedUserId = id;
}

export function setAnonymousId(id: string | null): void {
  cachedAnonymousId = id;
}

function bearerHeaders(): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${cachedProxyToken ?? ''}` };
}

function resolvePort(): number | null {
  if (cachedPort != null) return cachedPort;
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __SKILLHUB_HELPER_PORT__?: number };
    if (typeof w.__SKILLHUB_HELPER_PORT__ === 'number') {
      return w.__SKILLHUB_HELPER_PORT__;
    }
  }
  return null;
}

function newClientRecordId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // fallback：低概率碰撞但足够本地使用
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class LlmGateway {
  /// 单次 chat 默认超时（30s）；Provider 慢时可调高
  timeoutMs: number;

  constructor(opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async chat(req: LlmChatRequest): Promise<LlmChatOk | LlmChatErr> {
    const port = resolvePort();
    if (port == null) {
      return {
        ok: false,
        reason: 'helper_no_port',
        message: '未拿到助手端口号，请确认桌面助手已启动',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`http://127.0.0.1:${port}/llm/chat`, {
        method: 'POST',
        headers: bearerHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          system_prompt: req.systemPrompt,
          user_message: req.userMessage,
          json_mode: req.jsonMode,
          detected_software: req.detectedSoftware,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          // M4 扩展字段
          skill_slug: req.skillSlug,
          // 契约：session_id = 已登录 userId；anonymous_id = 游客 ID。二者互斥展示。
          session_id: req.userId ?? cachedUserId ?? undefined,
          anonymous_id: req.anonymousId ?? cachedAnonymousId ?? undefined,
          client_record_id: req.clientRecordId ?? newClientRecordId(),
        }),
      });
      clearTimeout(timer);

      if (resp.status === 400) {
        // 服务端对 system_prompt / user_message 有 20000 字符限制，超限 reason='invalid_input'
        const data = (await resp.json().catch(() => ({}))) as { reason?: string };
        return {
          ok: false,
          reason: data.reason === 'invalid_input' ? 'invalid_input' : 'unknown',
          message: '输入内容无效或超出 20000 字符限制，请精简后再试（HTTP 400）',
        };
      }
      if (resp.status === 503) {
        const data = (await resp.json().catch(() => ({}))) as { reason?: string };
        const raw = data.reason;
        const reason = (
          raw === 'guest_over_limit' || raw === 'invalid_input' || raw === 'helper_no_key'
            ? raw
            : 'unknown'
        ) as 'guest_over_limit' | 'invalid_input' | 'helper_no_key' | 'unknown';
        // 脱敏：不回显服务端 message 原文，只给通用文案
        const messages: Record<typeof reason, string> = {
          helper_no_key: '助手尚未配置 LLM Key，请在设置页配置',
          guest_over_limit: '今日游客调用次数已用完（50 次/天），请绑定 Web 账号或配置 API Key',
          invalid_input: '输入内容超出 20000 字符限制，请精简后再试',
          unknown: '助手暂时不可用（HTTP 503）',
        };
        return { ok: false, reason, message: messages[reason] };
      }
      if (resp.status === 502) {
        return {
          ok: false,
          reason: 'provider_error',
          message: 'LLM 服务调用失败，请稍后重试（HTTP 502）',
        };
      }
      if (!resp.ok) {
        // 脱敏：只带 status code，不回显 body 内容
        return {
          ok: false,
          reason: 'unknown',
          message: `请求失败（HTTP ${resp.status}）`,
        };
      }

      const data = (await resp.json()) as {
        content?: string;
        parsed?: unknown;
        tokens_used?: number;
        tokens_in?: number;
        tokens_out?: number;
        duration_ms?: number;
        record_id?: string;
      };
      return {
        ok: true,
        content: data.content,
        parsed: data.parsed,
        path: 'helper',
        tokensUsed: data.tokens_used,
        tokensIn: data.tokens_in,
        tokensOut: data.tokens_out,
        durationMs: data.duration_ms,
        recordId: data.record_id,
      };
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('AbortError') || msg.includes('aborted')) {
        return {
          ok: false,
          reason: 'helper_timeout',
          message: `LLM 调用超过 ${this.timeoutMs}ms 未响应`,
        };
      }
      // fetch reject（连接拒绝 / 助手未启动）—— 脱敏，不暴露底层错误原文
      return {
        ok: false,
        reason: 'helper_unreachable',
        message: '助手本机 HTTP 服务不可达，请确认助手正在运行',
      };
    }
  }

  /**
   * 拉本地用量汇总（不走云端）。Usage Tab 直接读本机 SQLite。
   * /llm/usage/summary 需要 Bearer token。
   */
  async getLocalUsageSummary(range: 'today' | '7d' | '30d' = '7d'): Promise<unknown> {
    const port = resolvePort();
    if (port == null) throw new Error('未拿到助手端口号');
    const resp = await fetch(
      `http://127.0.0.1:${port}/llm/usage/summary?range=${range}`,
      { headers: { authorization: `Bearer ${cachedProxyToken ?? ''}` } },
    );
    // 脱敏：只带 status code
    if (!resp.ok) throw new Error(`用量汇总请求失败（HTTP ${resp.status}）`);
    return resp.json();
  }
}

// 单例
export const llmGateway = new LlmGateway();
