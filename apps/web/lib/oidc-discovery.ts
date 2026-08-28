/**
 * NvwaX OIDC Discovery 客户端
 *
 * 从 `/.well-known/openid-configuration` 动态拉取 IdP 元数据并缓存。
 * 所有 RP 端点（authorize / token / userinfo / logout / jwks）都从本模块获取，
 * 严禁在业务代码中硬编码 IdP URL。
 *
 * 契约（NvwaX Sprint 1 冻结）：
 * - issuer 必须是 https://account.proclaw.cc
 * - token_endpoint_auth_methods_supported 必须包含 'none'（public client）
 * - PKCE S256 强制
 *
 * 缓存策略：
 * - 进程内单例，TTL 1 小时（与 NvwaX 端 Cache-Control: public, max-age=3600 对齐）
 * - 失败时不静默回退：抛出 DiscoveryError 让调用方决定如何处理
 * - 提供 resetDiscoveryCache() 用于测试
 *
 * 注意：Discovery 模块不依赖 ./oidc-rp，避免循环引用。
 * 错误体系（OidcError）保留在 oidc-rp.ts 中。
 */

// ============================================================
// 类型
// ============================================================

/** OIDC Discovery 文档（仅声明 SkillHub 实际用到的字段） */
export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint: string;
  jwks_uri: string;
  /** Discovery 文档原始字段，按需透出 */
  token_endpoint_auth_methods_supported?: string[];
  [key: string]: unknown;
}

/** 归一化后的端点集合（业务层使用） */
export interface OidcEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  logoutEndpoint: string;
  jwksUri: string;
}

// ============================================================
// 配置
// ============================================================

/** 契约期望的 issuer（用于运行时校验） */
export const EXPECTED_ISSUER = 'https://account.proclaw.cc';

/** Discovery 文档 URL（env 覆盖用于测试 / 灾备） */
export const OIDC_DISCOVERY_URL: string =
  process.env.SKILLHUB_OIDC_DISCOVERY_URL ||
  `${EXPECTED_ISSUER}/.well-known/openid-configuration`;

/** 缓存 TTL：1 小时 */
const DISCOVERY_CACHE_TTL = 60 * 60 * 1000;

// ============================================================
// Discovery 错误
// ============================================================

export class DiscoveryError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(`[OIDC Discovery] ${message}`);
    this.name = 'DiscoveryError';
  }
}

// ============================================================
// 缓存状态（模块级单例）
// ============================================================

let cachedDiscovery: OidcEndpoints | null = null;
let cachedAt = 0;
/** in-flight Promise：避免并发首次加载重复请求 */
let inflight: Promise<OidcEndpoints> | null = null;

// ============================================================
// 核心 API
// ============================================================

/**
 * 归一化 Discovery 文档，去掉字段名中的下划线、提取端点
 */
function normalizeDiscovery(doc: OidcDiscovery): OidcEndpoints {
  // 运行时契约校验
  if (doc.issuer !== EXPECTED_ISSUER) {
    throw new DiscoveryError(
      `Unexpected issuer: got "${doc.issuer}", expected "${EXPECTED_ISSUER}"`,
    );
  }

  const authMethods = doc.token_endpoint_auth_methods_supported ?? [];
  if (!authMethods.includes('none')) {
    throw new DiscoveryError(
      `IdP does not support public client (token_endpoint_auth_methods_supported missing "none"): got ${JSON.stringify(authMethods)}`,
    );
  }

  const required = {
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    userinfoEndpoint: doc.userinfo_endpoint,
    logoutEndpoint: doc.end_session_endpoint,
    jwksUri: doc.jwks_uri,
  } as const;

  for (const [key, value] of Object.entries(required)) {
    if (!value || typeof value !== 'string') {
      throw new DiscoveryError(`Missing required endpoint in discovery: ${key}`);
    }
  }

  return {
    issuer: doc.issuer,
    ...required,
  };
}

/**
 * 从 IdP 拉取 Discovery 文档
 */
async function fetchDiscoveryDocument(url: string): Promise<OidcDiscovery> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Next.js fetch 默认不缓存
      cache: 'no-store',
    });
  } catch (err) {
    throw new DiscoveryError(`Network error fetching discovery: ${(err as Error).message}`, err);
  }

  if (!response.ok) {
    throw new DiscoveryError(
      `Discovery HTTP ${response.status}: ${response.statusText}`,
    );
  }

  let doc: OidcDiscovery;
  try {
    doc = (await response.json()) as OidcDiscovery;
  } catch (err) {
    throw new DiscoveryError('Discovery response is not valid JSON', err);
  }

  return doc;
}

/**
 * 获取 IdP 端点（带缓存）
 *
 * 第一次调用会从 OIDC_DISCOVERY_URL 拉取，后续调用命中缓存。
 * TTL 到期或显式 reset 后会重新拉取。
 * 失败时抛出 DiscoveryError，不静默回退。
 */
export async function getDiscovery(): Promise<OidcEndpoints> {
  const now = Date.now();

  // 命中缓存
  if (cachedDiscovery && now - cachedAt < DISCOVERY_CACHE_TTL) {
    return cachedDiscovery;
  }

  // 合并并发请求
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const doc = await fetchDiscoveryDocument(OIDC_DISCOVERY_URL);
      const endpoints = normalizeDiscovery(doc);
      cachedDiscovery = endpoints;
      cachedAt = Date.now();
      return endpoints;
    } catch (err) {
      // 失败时不写缓存，允许下次重试
      if (err instanceof DiscoveryError) throw err;
      throw new DiscoveryError(
        err instanceof Error ? err.message : 'Unknown discovery error',
        err,
      );
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * 重置 Discovery 缓存（仅供测试使用）
 */
export function resetDiscoveryCache(): void {
  cachedDiscovery = null;
  cachedAt = 0;
  inflight = null;
}

/**
 * 预热 Discovery 缓存（应用启动时调用，减少首次登录延迟）
 *
 * 失败时仅 warn，不阻塞启动（登录时再重试一次）
 */
export async function warmDiscoveryCache(): Promise<void> {
  try {
    await getDiscovery();
  } catch (err) {
     
    console.warn(
      '[OIDC] Discovery warm-up failed (will retry on first login):',
      err instanceof Error ? err.message : err,
    );
  }
}

// Re-export OidcError is intentionally avoided to prevent circular dependency.
// Callers needing OidcError should import it from './oidc-rp' directly.
