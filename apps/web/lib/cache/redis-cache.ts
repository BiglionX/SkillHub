/**
 * Redis 缓存封装
 *
 * 用于：
 * - API 响应缓存（CDN 之外的边缘缓存）
 * - 数据库查询结果缓存
 * - 限流计数器
 *
 * 优先使用 Upstash Redis（已在 package.json 中）。
 * 如果未配置 Redis，回退到进程内 LRU 缓存。
 */

import { Redis } from '@upstash/redis';

// ============================================================
// Redis 客户端（可选）
// ============================================================

let redisInstance: Redis | null = null;

function getRedis(): Redis | null {
  if (redisInstance) return redisInstance;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return redisInstance;
  } catch (err) {
    console.warn('[redis-cache] Failed to initialize:', err);
    return null;
  }
}

// ============================================================
// 进程内 LRU 降级实现
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize = 1000;

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (this.store.size >= this.maxSize) {
      // 简单的 FIFO 淘汰
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

const memoryCache = new MemoryCache();

// ============================================================
// 公共 API
// ============================================================

/**
 * 从缓存获取值
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const value = await redis.get<T>(key);
      return value;
    } catch (err) {
      console.warn('[redis-cache] GET failed, falling back to memory:', err);
    }
  }
  return memoryCache.get<T>(key);
}

/**
 * 设置缓存值
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  options: { ttlSeconds?: number } = {},
): Promise<void> {
  const ttl = options.ttlSeconds ?? 300; // 默认 5 分钟
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttl });
      return;
    } catch (err) {
      console.warn('[redis-cache] SET failed, falling back to memory:', err);
    }
  }
  memoryCache.set(key, value, ttl);
}

/**
 * 删除缓存
 */
export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn('[redis-cache] DEL failed:', err);
    }
  }
  memoryCache.delete(key);
}

/**
 * 批量删除（按前缀）
 */
export async function cacheDeleteByPrefix(prefix: string): Promise<number> {
  let count = 0;
  const redis = getRedis();
  if (redis) {
    try {
      // Upstash Redis 支持 SCAN
      let cursor = '0';
      do {
        const result = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
        cursor = String(result[0]);
        const keys = result[1] as string[];
        if (keys.length > 0) {
          await redis.del(...keys);
          count += keys.length;
        }
      } while (cursor !== '0');
    } catch (err) {
      console.warn('[redis-cache] SCAN/DEL failed:', err);
    }
  }
  // 内存缓存：清理匹配前缀
  for (const key of (memoryCache as unknown as { store: Map<string, unknown> }).store.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * 包装异步函数，自动应用缓存
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  options: { ttlSeconds?: number } = {},
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const value = await fn();
  await cacheSet(key, value, options);
  return value;
}

// ============================================================
// 缓存键生成器
// ============================================================

/**
 * 生成稳定的缓存键
 *
 * 示例：
 * - cacheKey('skills', { page: 1, limit: 20 }) -> 'skills:p=1:l=20'
 * - cacheKey('skill', 'pdf-tools') -> 'skill:pdf-tools'
 */
export function cacheKey(prefix: string, ...parts: Array<string | number | Record<string, unknown>>): string {
  const segments: string[] = [prefix];
  for (const part of parts) {
    if (typeof part === 'string' || typeof part === 'number') {
      segments.push(String(part));
    } else if (part && typeof part === 'object') {
      // 按 key 排序以确保稳定性
      const sortedKeys = Object.keys(part).sort();
      for (const k of sortedKeys) {
        segments.push(`${k}=${String(part[k])}`);
      }
    }
  }
  return segments.join(':');
}
