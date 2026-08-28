/**
 * oidc-discovery.test.ts
 *
 * NvwaX OIDC Discovery 客户端测试
 * 覆盖：成功拉取与缓存、契约校验（issuer / auth_methods / 端点）、
 * 失败时不静默回退、reset 行为、并发请求合并
 */

import { jest } from '@jest/globals';

const VALID_DISCOVERY = {
  issuer: 'https://account.proclaw.cc',
  authorization_endpoint: 'https://account.proclaw.cc/oauth/authorize',
  token_endpoint: 'https://account.proclaw.cc/oauth/token',
  userinfo_endpoint: 'https://account.proclaw.cc/oauth/userinfo',
  end_session_endpoint: 'https://account.proclaw.cc/oauth/logout',
  jwks_uri: 'https://account.proclaw.cc/.well-known/jwks.json',
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
};

const mockFetch = jest.fn() as jest.MockedFunction<typeof global.fetch>;
global.fetch = mockFetch;

describe('oidc-discovery', () => {
  let oidcDiscovery: typeof import('@/lib/oidc-discovery');

  beforeEach(async () => {
    jest.clearAllMocks();
    oidcDiscovery = await import('@/lib/oidc-discovery');
    oidcDiscovery.resetDiscoveryCache();
    // 默认 URL 指向官方 IdP
    process.env.SKILLHUB_OIDC_DISCOVERY_URL = 'https://account.proclaw.cc/.well-known/openid-configuration';
  });

  // ==========================================
  // 成功路径
  // ==========================================
  describe('getDiscovery - 成功路径', () => {
    test('应从 discovery URL 拉取并归一化端点', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_DISCOVERY,
      } as Response);

      const result = await oidcDiscovery.getDiscovery();
      expect(result.issuer).toBe('https://account.proclaw.cc');
      expect(result.authorizationEndpoint).toBe('https://account.proclaw.cc/oauth/authorize');
      expect(result.tokenEndpoint).toBe('https://account.proclaw.cc/oauth/token');
      expect(result.userinfoEndpoint).toBe('https://account.proclaw.cc/oauth/userinfo');
      expect(result.logoutEndpoint).toBe('https://account.proclaw.cc/oauth/logout');
      expect(result.jwksUri).toBe('https://account.proclaw.cc/.well-known/jwks.json');
    });

    test('第二次调用应命中缓存（不再发请求）', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_DISCOVERY,
      } as Response);

      await oidcDiscovery.getDiscovery();
      const fetchCountAfterFirst = mockFetch.mock.calls.length;

      // 再次调用
      await oidcDiscovery.getDiscovery();
      const fetchCountAfterSecond = mockFetch.mock.calls.length;

      expect(fetchCountAfterSecond).toBe(fetchCountAfterFirst);
    });

    test('resetDiscoveryCache 后应重新拉取', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_DISCOVERY,
      } as Response);
      await oidcDiscovery.getDiscovery();
      oidcDiscovery.resetDiscoveryCache();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_DISCOVERY,
      } as Response);
      await oidcDiscovery.getDiscovery();

      expect(mockFetch.mock.calls.length).toBe(2);
    });

    test('并发请求应合并（in-flight 共享 Promise）', async () => {
      const resolver: { current: ((v: unknown) => void) | null } = { current: null };
      const pending = new Promise<unknown>((r) => {
        resolver.current = r;
      });
      mockFetch.mockReturnValueOnce(pending as unknown as Promise<Response>);

      const p1 = oidcDiscovery.getDiscovery();
      const p2 = oidcDiscovery.getDiscovery();
      const p3 = oidcDiscovery.getDiscovery();

      // 此时 fetch 应只被调用一次
      expect(mockFetch.mock.calls.length).toBe(1);

      // 触发 discovery 响应
      if (resolver.current) {
        resolver.current({
          ok: true,
          json: async () => VALID_DISCOVERY,
        });
      }

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });
  });

  // ==========================================
  // 契约校验
  // ==========================================
  describe('契约校验', () => {
    test('issuer 不匹配应抛 DiscoveryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...VALID_DISCOVERY, issuer: 'https://evil.example.com' }),
      } as Response);

      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/Unexpected issuer/);
    });

    test('token_endpoint_auth_methods 不含 "none" 应抛 DiscoveryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...VALID_DISCOVERY,
          token_endpoint_auth_methods_supported: ['client_secret_post'],
        }),
      } as Response);

      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/public client/);
    });

    test('缺少 token_endpoint 应抛 DiscoveryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          const doc = { ...VALID_DISCOVERY } as Record<string, unknown>;
          delete doc.token_endpoint;
          return doc;
        },
      } as Response);

      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/tokenEndpoint/);
    });

    test('缺少 end_session_endpoint 应抛 DiscoveryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          const doc = { ...VALID_DISCOVERY } as Record<string, unknown>;
          delete doc.end_session_endpoint;
          return doc;
        },
      } as Response);

      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/logoutEndpoint/);
    });

    test('缺少 jwks_uri 应抛 DiscoveryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          const doc = { ...VALID_DISCOVERY } as Record<string, unknown>;
          delete doc.jwks_uri;
          return doc;
        },
      } as Response);

      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/jwksUri/);
    });
  });

  // ==========================================
  // 失败路径（不静默回退）
  // ==========================================
  describe('失败路径', () => {
    test('HTTP 500 应抛 DiscoveryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/HTTP 500/);
    });

    test('网络错误应抛 DiscoveryError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/Network error/);
    });

    test('JSON 解析失败应抛 DiscoveryError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      } as unknown as Response);
      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow(/not valid JSON/);
    });

    test('失败后应允许重试（不写缓存）', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(oidcDiscovery.getDiscovery()).rejects.toThrow();

      // 第二次应重新发起请求
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_DISCOVERY,
      } as Response);
      const result = await oidcDiscovery.getDiscovery();
      expect(result.issuer).toBe('https://account.proclaw.cc');
      expect(mockFetch.mock.calls.length).toBe(2);
    });
  });

  // ==========================================
  // 预热
  // ==========================================
  describe('warmDiscoveryCache', () => {
    test('成功时静默预热', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_DISCOVERY,
      } as Response);

      await expect(oidcDiscovery.warmDiscoveryCache()).resolves.not.toThrow();
    });

    test('失败时仅 warn，不抛出', async () => {
      // 抑制 console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(oidcDiscovery.warmDiscoveryCache()).resolves.not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // ==========================================
  // 配置常量
  // ==========================================
  describe('配置常量', () => {
    test('OIDC_DISCOVERY_URL 默认指向 NvwaX 官方', () => {
      expect(oidcDiscovery.OIDC_DISCOVERY_URL).toMatch(
        /^https:\/\/account\.proclaw\.cc\/.well-known\/openid-configuration$/,
      );
    });

    test('EXPECTED_ISSUER 固定为 account.proclaw.cc', () => {
      expect(oidcDiscovery.EXPECTED_ISSUER).toBe('https://account.proclaw.cc');
    });
  });
});
