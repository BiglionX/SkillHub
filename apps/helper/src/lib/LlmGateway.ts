/**
 * LlmGateway — 桌面端助手内的 LLM 接入封装（M4）
 *
 * 与 apps/web/lib/services/LlmGateway.ts 同名但语义不同：
 * - Web 版：探测外部助手 → 转发 LLM 调用
 * - Helper 版：本机自调 — 我们就是助手，直接 fetch 本机 HTTP 端口
 *
 * 端口来源：invoke('get_helper_info') 拿 helper_port（启动时缓存到 module-level）
 *
 * M4 扩展（t12）：
 * - 增加 skillSlug / anonymousId / clientRecordId 三个可选字段
 * - 这些字段会透传到 /llm/chat 请求 body，Rust 端据此写 SQLite
 * - 客户端必须传 clientRecordId（crypto.randomUUID()），用于幂等去重
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
  /// M4：游客 anonymous_id 或登录 userId（来自 ensure_guest_session / get_session_info）
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
    | 'unknown';
  message: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/// 启动时由 App.tsx 注入；未注入则 fallback 到 window.__SKILLHUB_HELPER_PORT__
let cachedPort: number | null = null;
let cachedAnonymousId: string | null = null;

export function setHelperPort(port: number | null): void {
  cachedPort = port;
}

export function setAnonymousId(id: string | null): void {
  cachedAnonymousId = id;
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
        headers: { 'content-type': 'application/json' },
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
          session_id: req.anonymousId ?? cachedAnonymousId,
          client_record_id: req.clientRecordId ?? newClientRecordId(),
        }),
      });
      clearTimeout(timer);

      if (resp.status === 503) {
        const data = (await resp.json().catch(() => ({}))) as {
          reason?: string;
          message?: string;
        };
        return {
          ok: false,
          reason: 'helper_no_key',
          message: data.message ?? '助手未配置 LLM Key',
        };
      }
      if (resp.status === 502) {
        const data = (await resp.json().catch(() => ({}))) as {
          reason?: string;
          message?: string;
        };
        return {
          ok: false,
          reason: 'provider_error',
          message: data.message ?? 'LLM Provider 调用失败',
        };
      }
      if (!resp.ok) {
        return {
          ok: false,
          reason: 'unknown',
          message: `HTTP ${resp.status}`,
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
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('AbortError') || msg.includes('aborted')) {
        return {
          ok: false,
          reason: 'helper_timeout',
          message: `LLM 调用超过 ${this.timeoutMs}ms 未响应`,
        };
      }
      // fetch reject（连接拒绝 / 助手未启动）
      return {
        ok: false,
        reason: 'helper_unreachable',
        message: `助手本机 HTTP 不可达：${msg}`,
      };
    }
  }

  /**
   * 拉本地用量汇总（不走云端）。Usage Tab 直接读本机 SQLite。
   */
  async getLocalUsageSummary(range: 'today' | '7d' | '30d' = '7d'): Promise<unknown> {
    const port = resolvePort();
    if (port == null) throw new Error('未拿到助手端口号');
    const resp = await fetch(
      `http://127.0.0.1:${port}/llm/usage/summary?range=${range}`,
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }
}

// 单例
export const llmGateway = new LlmGateway();
