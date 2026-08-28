/**
 * Redis 客户端封装（v3 转型路线专用）
 *
 * 支持两种模式：
 *   1. Upstash REST（推荐用于 Vercel/Serverless）
 *   2. 标准 Redis（用于自建或 Docker 部署）
 *
 * 关键约束：
 *   - 不可用时静默降级（返回 null），不阻塞主链路
 *   - 所有方法都是 async，不会抛错到调用方
 */

interface RedisLike {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<void>;
}

class MemoryRedis implements RedisLike {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  }
}

class UpstashRedis implements RedisLike {
  constructor(
    private url: string,
    private token: string
  ) {}

  private async cmd(command: string[]): Promise<unknown> {
    const res = await fetch(`${this.url}/${command.join('/')}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    return res.json();
  }

  async get(key: string): Promise<string | null> {
    try {
      const result = (await this.cmd(['get', key])) as { result?: string | null };
      return result.result ?? null;
    } catch {
      return null;
    }
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    try {
      await this.cmd(['set', key, value, 'EX', String(ttl)]);
    } catch {
      // 静默
    }
  }
}

function buildClient(): RedisLike {
  // 优先 Upstash REST
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new UpstashRedis(url, token);
  }

  // 标准 Redis URL（用于自建）
  const stdUrl = process.env.REDIS_URL;
  if (stdUrl && process.env.NODE_ENV === 'production') {
    // 标准 Redis 需要 ioredis 等额外依赖，此处暂时回退到内存
    // TODO: 接 ioredis
  }

  // 兜底：内存实现（开发环境 + 缺失配置时）
  return new MemoryRedis();
}

export const redis = buildClient();