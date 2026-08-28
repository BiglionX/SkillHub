/**
 * NvwaX OIDC RP 客户端（Public Client 改造版）
 *
 * 封装与 NvwaX OIDC IdP 的全部通信。
 * 所有端点不再硬编码，全部从 oidc-discovery 动态获取。
 *
 * ⚠️ Public Client 契约（NvwaX Sprint 1 冻结）：
 * - client_id = 'skillhub-web'（env 可覆盖以兼容 dev/staging）
 * - token_endpoint_auth_method = 'none'（禁止传 client_secret）
 * - PKCE S256 强制
 *
 * 对接端点（全部从 discovery 拉取）：
 * - {issuer}/oauth/authorize
 * - {issuer}/oauth/token
 * - {issuer}/oauth/userinfo
 * - {issuer}/oauth/logout
 * - {issuer}/.well-known/jwks.json
 */

import { jwtVerify, createRemoteJWKSet, base64url } from 'jose';
import type { JWTPayload } from 'jose';
import { getDiscovery, resetDiscoveryCache } from './oidc-discovery';

// ============================================================
// 类型定义
// ============================================================

/** OIDC Token 端点响应 */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/** UserInfo 端点响应 */
export interface UserInfoResponse {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  is_admin?: boolean;
  [key: string]: unknown;
}

/** 验证后的 Access Token 内容 */
export interface VerifiedToken extends JWTPayload {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  is_admin?: boolean;
  scope?: string;
}

/** PKCE pair */
export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

/** OIDC 错误码（Sprint 1 冻结契约） */
export type OidcErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_scope'
  | 'unsupported_grant_type'
  | 'server_error';

/** OIDC 错误 */
export class OidcError extends Error {
  constructor(
    public code: OidcErrorCode,
    message: string,
    public status?: number,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'OidcError';
  }
}

// ============================================================
// 客户端配置（静态常量，运行时端点全部从 discovery 获取）
// ============================================================

/** 契约默认 client_id（NvwaX 分配） */
export const DEFAULT_CLIENT_ID = 'skillhub-web';

export const OIDC_CONFIG = {
  /** 公共 clientId，硬编码默认 'skillhub-web'，env 可覆盖 */
  get clientId(): string {
    return process.env.SKILLHUB_OIDC_CLIENT_ID || DEFAULT_CLIENT_ID;
  },
  /**
   * redirect_uri 必须与 NvwaX 端注册一致
   * 默认生产：https://skillhub.proclaw.cc/oauth/callback
   * dev 环境：NEXT_PUBLIC_APP_URL=http://localhost:3000 时为 http://localhost:3000/oauth/callback
   */
  get redirectUri(): string {
    return `${process.env.NEXT_PUBLIC_APP_URL || 'https://skillhub.proclaw.cc'}/oauth/callback`;
  },
} as const;

// ============================================================
// PKCE
// ============================================================

/**
 * 生成 PKCE S256 code_verifier 和 code_challenge
 *
 * code_verifier: 64 字节随机数 → base64url，约 86 字符（合规 RFC 7636 §4.1）
 * code_challenge: SHA-256(verifier) → base64url = 43 字符，无 padding
 */
export async function generatePKCE(): Promise<PKCEPair> {
  const randomBytes = new Uint8Array(64);
  crypto.getRandomValues(randomBytes);
  const codeVerifier = base64url.encode(randomBytes);

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
  const codeChallenge = base64url.encode(new Uint8Array(hashBuffer));

  return { codeVerifier, codeChallenge };
}

// ============================================================
// Authorization URL
// ============================================================

/**
 * 生成 OIDC authorize URL（动态从 discovery 拉取端点）
 *
 * @param state CSRF state（应存入 cookie 用于回调验证）
 * @param codeChallenge PKCE code_challenge
 * @param scope OAuth scope，默认为 openid profile email
 * @returns 完整的 authorize URL
 */
export async function getAuthorizationUrl(
  state: string,
  codeChallenge: string,
  scope = 'openid profile email',
): Promise<string> {
  const discovery = await getDiscovery();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OIDC_CONFIG.clientId,
    redirect_uri: OIDC_CONFIG.redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope,
    state,
  });

  return `${discovery.authorizationEndpoint}?${params.toString()}`;
}

// ============================================================
// Token Operations（Public Client：禁止传 client_secret）
// ============================================================

/**
 * 标准 Token 端点请求
 *
 * Public Client：不在 body 中传 client_secret、不使用 Basic Auth，
 * 完全依赖 PKCE code_verifier 证明 client 身份。
 */
async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const discovery = await getDiscovery();
  const response = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorCode = (data.error || 'server_error') as OidcErrorCode;
    const errorDesc = data.error_description || response.statusText;
    throw new OidcError(errorCode, errorDesc, response.status);
  }

  return data as TokenResponse;
}

/**
 * 用 authorization_code 换取 token（PKCE 模式，public client）
 *
 * body 中包含：grant_type, code, redirect_uri, client_id, code_verifier
 * body 中**不包含** client_secret（这是 public client 与 confidential client 的根本区别）
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: OIDC_CONFIG.redirectUri,
    client_id: OIDC_CONFIG.clientId,
    code_verifier: codeVerifier,
  });

  return tokenRequest(body);
}

/**
 * 用 refresh_token 换取新的 access_token（链式轮换）
 *
 * NvwaX 行为：每次 refresh 后旧 refresh_token 立即作废，
 * 必须用响应中返回的新 refresh_token。
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OIDC_CONFIG.clientId,
  });

  return tokenRequest(body);
}

// ============================================================
// UserInfo
// ============================================================

/**
 * 用 access_token 获取用户信息
 *
 * 返回的 UserInfoResponse 可能包含 NvwaX 扩展 claim（如 is_admin）。
 * 优先使用 userinfo 而非 id_token claims（更稳定，便于撤销扩展 claim）。
 */
export async function getUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const discovery = await getDiscovery();
  const response = await fetch(discovery.userinfoEndpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const errorCode = (data.error || 'server_error') as OidcErrorCode;
    throw new OidcError(errorCode, data.error_description || 'Failed to fetch userinfo', response.status);
  }

  return (await response.json()) as UserInfoResponse;
}

// ============================================================
// Logout（Public Client：JSON body，不传 client_secret）
// ============================================================

/**
 * 在 IdP 端撤销 refresh_token
 *
 * Public Client 使用 JSON body：{ "refresh_token": "..." }
 * 不再附加 client_id / client_secret（IdP 端根据 refresh_token 自身识别）。
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    const discovery = await getDiscovery();
    const response = await fetch(discovery.logoutEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const code = (data.error || 'server_error') as OidcErrorCode;
       
      console.warn(`[OIDC] Logout warning: ${code}`, data.error_description);
    }
  } catch (err) {
    // 登出是尽力而为的操作，不抛出错误
     
    console.warn('[OIDC] Logout network error (non-fatal):', err);
  }
}

// ============================================================
// JWT Verification
// ============================================================

/** JWKS 客户端缓存（基于 discovery jwks_uri） */
let jwksClient: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheTimestamp = 0;
/** JWKS 缓存 TTL：1 小时（与 discovery 一致） */
const JWKS_CACHE_TTL = 60 * 60 * 1000;

/**
 * 获取或创建缓存的 JWKS 客户端
 */
async function getJwksClient() {
  const now = Date.now();
  if (!jwksClient || now - jwksCacheTimestamp > JWKS_CACHE_TTL) {
    const discovery = await getDiscovery();
    jwksClient = createRemoteJWKSet(new URL(discovery.jwksUri));
    jwksCacheTimestamp = now;
  }
  return jwksClient;
}

/**
 * 重置 JWKS 缓存（用于测试）
 */
export function resetJwksCache(): void {
  jwksClient = null;
  jwksCacheTimestamp = 0;
}

/**
 * 同时重置 JWKS + Discovery 缓存（测试便捷方法）
 */
export function resetAllCaches(): void {
  resetJwksCache();
  resetDiscoveryCache();
}

/**
 * 验证 access_token 的 RS256 签名并解码 claims
 *
 * @param accessToken access_token（JWT）
 * @returns 解码后的 token claims
 * @throws OidcError 如果 token 无效或签名验证失败
 */
export async function verifyAccessToken(accessToken: string): Promise<VerifiedToken> {
  try {
    const client = await getJwksClient();
    const discovery = await getDiscovery();
    const { payload } = await jwtVerify(accessToken, client, {
      issuer: discovery.issuer,
      audience: OIDC_CONFIG.clientId,
      algorithms: ['RS256'],
    });

    return payload as VerifiedToken;
  } catch (err) {
    if (err instanceof OidcError) throw err;

    const message = err instanceof Error ? err.message : 'Unknown verification error';
    if (message.includes('exp') || message.includes('expired')) {
      throw new OidcError('invalid_grant', 'Access token expired', 401);
    }
    throw new OidcError('server_error', message, 401);
  }
}
