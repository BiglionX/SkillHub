/**
 * API 响应缓存工具
 *
 * 基于 Next.js unstable_cache（用于服务端数据缓存）
 * + 自定义 Redis 缓存（用于 CDN 之外的边缘缓存）
 *
 * 使用场景：
 * - Skills 列表 API（高频读，低频写）
 * - Discovery 端点（Agent Skills 标准要求）
 * - 搜索结果
 * - 单个 Skill 详情
 */

import { unstable_cache } from 'next/cache';
import { cacheGet, cacheSet, cacheKey } from './redis-cache';

// ============================================================
// Next.js unstable_cache 包装（边缘缓存）
// ============================================================

export interface UnstableCacheOptions {
  /** 重新验证时间（秒） */
  revalidate?: number;
  /** 缓存标签（用于精确失效） */
  tags?: string[];
}

/**
 * 使用 Next.js unstable_cache 包装异步函数
 *
 * @param fn - 要缓存的异步函数
 * @param keyParts - 缓存键组成部分
 * @param options - 缓存选项
 */
export function cachedFetch<T extends (...args: any[]) => Promise<unknown>>(
  fn: T,
  keyParts: string[],
  options: UnstableCacheOptions = {},
): T {
  return unstable_cache(fn, keyParts, {
    revalidate: options.revalidate ?? 300,
    tags: options.tags ?? [],
  }) as unknown as T;
}

// ============================================================
// 自定义边缘缓存（跨实例）
// ============================================================

export interface EdgeCacheOptions {
  /** 缓存时间（秒） */
  ttlSeconds?: number;
  /** 缓存键前缀 */
  prefix?: string;
  /** 是否启用（可临时禁用） */
  enabled?: boolean;
}

/**
 * 使用边缘缓存包装异步函数
 *
 * 流程：
 * 1. 先查 Redis（如有）
 * 2. 缓存未命中则执行函数
 * 3. 结果存入 Redis
 *
 * @param key - 缓存键（不含前缀）
 * @param fn - 要缓存的异步函数
 * @param options - 缓存选项
 */
export async function edgeCached<T>(
  key: string,
  fn: () => Promise<T>,
  options: EdgeCacheOptions = {},
): Promise<T> {
  const enabled = options.enabled ?? true;
  if (!enabled) return fn();

  const fullKey = cacheKey(options.prefix ?? 'edge', key);
  const ttl = options.ttlSeconds ?? 300;

  const cached = await cacheGet<T>(fullKey);
  if (cached !== null) return cached;

  const value = await fn();
  await cacheSet(fullKey, value, { ttlSeconds: ttl });
  return value;
}

// ============================================================
// 通用 API 缓存
// ============================================================

/**
 * API 响应缓存助手
 *
 * 同时利用 unstable_cache（边缘 CDN）和 Redis 缓存
 */
export async function cachedApiResponse<T>(
  cacheKeyParts: string[],
  fetcher: () => Promise<T>,
  options: {
    /** unstable_cache revalidate */
    revalidate?: number;
    /** Redis TTL */
    edgeTtl?: number;
    /** 缓存标签 */
    tags?: string[];
  } = {},
): Promise<T> {
  // 第一层：Redis（跨实例）
  const edgeKey = cacheKeyParts.join(':');
  const edgeCached = await cacheGet<T>(edgeKey);
  if (edgeCached !== null) return edgeCached;

  // 第二层：unstable_cache（边缘 CDN）
  const cached = unstable_cache(
    async () => fetcher(),
    cacheKeyParts,
    {
      revalidate: options.revalidate ?? 300,
      tags: options.tags ?? [],
    },
  );

  const value = await cached();
  await cacheSet(edgeKey, value, { ttlSeconds: options.edgeTtl ?? options.revalidate ?? 300 });
  return value;
}

// ============================================================
// 缓存失效辅助函数
// ============================================================

/**
 * 失效指定标签的所有缓存
 *
 * 注意：Next.js 的 unstable_cache 标签失效需要通过 revalidateTag
 */
export { revalidateTag } from 'next/cache';
