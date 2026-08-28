/**
 * Redis 客户端配置
 * 支持本地 Redis 和 Vercel + Upstash
 */

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL === '1';

 
interface RedisCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
 

let redisCache: RedisCache;

if (isVercel) {
  // Vercel 环境：使用 Upstash HTTP API（需要安装 @upstash/redis）
  console.log('🔧 Using Upstash Redis for Vercel');
  
  try {
    const { Redis } = require('@upstash/redis');
    
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!upstashUrl || !upstashToken) {
      console.warn('⚠️ Upstash Redis environment variables not set, using memory cache only');
      throw new Error('UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured');
    }
    
    // 验证 URL 格式
    if (!upstashUrl.startsWith('http://') && !upstashUrl.startsWith('https://')) {
      console.warn('⚠️ Invalid Upstash Redis URL format, using memory cache only');
      throw new Error('Invalid protocol in UPSTASH_REDIS_REST_URL');
    }
    
    const upstashRedis = new Redis({
      url: upstashUrl,
      token: upstashToken,
    });
    
    console.log('✅ Upstash Redis initialized successfully');
    
    // 包装方法以兼容现有代码
    redisCache = {
      async get(key: string) {
        return await upstashRedis.get(key);
      },
      async set(key: string, value: unknown, ttl?: number) {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttl) {
          await upstashRedis.setex(key, ttl, stringValue);
        } else {
          await upstashRedis.set(key, stringValue);
        }
      },
      async del(key: string) {
        await upstashRedis.del(key);
      },
      async connect() {
        // Upstash 不需要显式连接
        console.log('✅ Upstash Redis ready');
      },
      async disconnect() {
        // Upstash 不需要显式断开
      },
    };
  } catch (error) {
    console.error('❌ Failed to initialize Upstash Redis:', error instanceof Error ? error.message : 'Unknown error');
    console.warn('⚠️ Falling back to no-op cache (memory cache only)');
    
    // 提供降级方案：无操作缓存
    redisCache = {
      async get() {
        return null;
      },
      async set() {
        // No-op
      },
      async del() {
        // No-op
      },
      async connect() {
        console.log('⚠️ Using no-op cache (Redis not available)');
      },
      async disconnect() {
        // No-op
      },
    };
  }
} else {
  // 本地环境：使用传统 Redis
  console.log('🔧 Using local Redis');
  
  const { createClient } = require('redis');
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });
  
  client.on('error', (err: Error) => {
    console.error('❌ Redis Client Error:', err);
  });
  
  client.on('connect', () => {
    console.log('✅ Connected to Redis');
  });
  
  // 自动连接（不等待）
  client.connect().catch(console.error);
  
  redisCache = {
    async get(key: string) {
      const value = await client.get(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    async set(key: string, value: unknown, ttl?: number) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        await client.setEx(key, ttl, stringValue);
      } else {
        await client.set(key, stringValue);
      }
    },
    async del(key: string) {
      await client.del(key);
    },
    async connect() {
      if (!client.isOpen) {
        await client.connect();
      }
    },
    async disconnect() {
      if (client.isOpen) {
        await client.disconnect();
      }
    },
  };
}

export { redisCache };
