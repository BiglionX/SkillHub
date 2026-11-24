/**
 * LlmGateway 单测 — v2.0.8+ 契约：
 * 1. /llm/chat 与 /llm/usage/summary 都带 Bearer 代理 token
 * 2. session_id（已登录 userId）与 anonymous_id（游客 ID）严格分离
 * 3. 服务端 400 invalid_input（超 20000 字符）映射到专用 reason
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LlmGateway,
  setHelperPort,
  setProxyToken,
  setUserId,
  setAnonymousId,
} from './LlmGateway';

type FetchCall = [string, RequestInit];

describe('LlmGateway — 代理鉴权与用户身份字段分离', () => {
  const realFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setHelperPort(14420);
    setProxyToken('proxy-token-abc');
    setUserId(null);
    setAnonymousId(null);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
    setProxyToken(null);
    setUserId(null);
    setAnonymousId(null);
  });

  it('游客：带 Bearer token，session_id 不传，anonymous_id 传游客 ID', async () => {
    setAnonymousId('guest-123');
    const res = await new LlmGateway().chat({ systemPrompt: 'sys', userMessage: 'hi' });
    expect(res.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as FetchCall;
    expect(url).toBe('http://127.0.0.1:14420/llm/chat');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer proxy-token-abc');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.session_id).toBeUndefined();
    expect(body.anonymous_id).toBe('guest-123');
  });

  it('已登录：session_id 传 userId，anonymous_id 不传', async () => {
    setUserId('user-456');
    const res = await new LlmGateway().chat({
      systemPrompt: 'sys',
      userMessage: 'hi',
      userId: 'user-456',
    });
    expect(res.ok).toBe(true);

    const [, init] = fetchMock.mock.calls[0] as FetchCall;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.session_id).toBe('user-456');
    expect(body.anonymous_id).toBeUndefined();
  });

  it('400 invalid_input 映射专用 reason；用量汇总同样带 Bearer', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ reason: 'invalid_input' }),
    });
    const res = await new LlmGateway().chat({
      systemPrompt: 'sys',
      userMessage: 'x'.repeat(20001),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('invalid_input');
      expect(res.message).toContain('20000');
    }

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ by_skill: [] }),
    });
    await new LlmGateway().getLocalUsageSummary('today');
    const [url, init] = fetchMock.mock.calls[1] as FetchCall;
    expect(url).toBe('http://127.0.0.1:14420/llm/usage/summary?range=today');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer proxy-token-abc');
  });
});
