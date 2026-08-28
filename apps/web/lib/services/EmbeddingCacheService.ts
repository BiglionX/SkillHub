import { createClient } from 'redis';
import NodeCache from 'node-cache';

// Upstash Redis 类型定义（延迟加载）
 
type UpstashRedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { ex?: number }) => Promise<void>;
  del: (key: string) => Promise<void>;
};
 

/**
 * Embeddings缓存服务
 * 
 * 提供多层缓存策略：
 * 1. 内存缓存（L1）- 快速访问，TTL短
 * 2. Redis缓存（L2）- 分布式缓存，TTL中等
 * 3. 数据库（L3）- 持久化存储
 */
export class EmbeddingCacheService {
  private memoryCache: NodeCache;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private upstashClient: UpstashRedisClient | null = null;
  private redisEnabled = false;
  
  // 缓存键前缀
  private readonly CACHE_KEY_PREFIX = 'embedding:';
  private readonly SEARCH_RESULT_PREFIX = 'search_result:';
  
  // TTL配置（秒）
  private readonly MEMORY_CACHE_TTL = 300;      // 5分钟
  private readonly REDIS_CACHE_TTL = 3600;      // 1小时
  private readonly SEARCH_RESULT_TTL = 1800;    // 30分钟
  
  constructor() {
    // 初始化内存缓存
    this.memoryCache = new NodeCache({
      stdTTL: this.MEMORY_CACHE_TTL,
      checkperiod: 60,
      maxKeys: 10000,
    });
    
    // 初始化Redis客户端
    this.initRedis();
    
    console.log('🔧 EmbeddingCacheService 初始化完成');
  }
  
  /**
   * 初始化Redis连接
   */
  private async initRedis() {
    try {
      // 在 Vercel 环境中使用 Upstash Redis
      const isVercel = process.env.VERCEL === '1';
      
      if (isVercel) {
        // 使用 Upstash Redis (HTTP API)
        const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
        const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
        
        if (!upstashUrl || !upstashToken) {
          console.warn('⚠️ Upstash Redis 环境变量未配置，将仅使用内存缓存');
          this.redisEnabled = false;
          return;
        }
        
        // 验证 URL 格式
        if (!upstashUrl.startsWith('http://') && !upstashUrl.startsWith('https://')) {
          console.warn('⚠️ Upstash Redis URL 格式无效，将仅使用内存缓存');
          this.redisEnabled = false;
          return;
        }
        
        console.log('🔧 Using Upstash Redis for Vercel');
        
        // 动态导入 @upstash/redis
        const { Redis } = require('@upstash/redis');
        this.upstashClient = new Redis({
          url: upstashUrl,
          token: upstashToken,
        });
        
        this.redisEnabled = true;
        console.log('✅ Upstash Redis 初始化成功');
      } else {
        // 本地开发使用传统 Redis
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        this.redisClient = createClient({
          url: redisUrl,
        });
        
        this.redisClient.on('error', (err) => {
          console.error('❌ Redis连接错误:', err.message);
          this.redisEnabled = false;
        });
        
        this.redisClient.on('connect', () => {
          console.log('✅ Redis连接成功');
          this.redisEnabled = true;
        });
        
        await this.redisClient.connect();
      }
    } catch (error) {
      console.warn('⚠️ Redis连接失败，将仅使用内存缓存:', error instanceof Error ? error.message : 'Unknown error');
      this.redisEnabled = false;
    }
  }
  
  /**
   * 统一的 Redis GET 方法（支持传统 Redis 和 Upstash）
   */
  private async redisGet(key: string): Promise<string | null> {
    if (this.upstashClient) {
      return await this.upstashClient.get(key);
    } else if (this.redisClient) {
      return await this.redisClient.get(key);
    }
    return null;
  }
  
  /**
   * 统一的 Redis SET 方法（支持传统 Redis 和 Upstash）
   */
  private async redisSet(key: string, value: string, ttl?: number): Promise<void> {
    if (this.upstashClient) {
      if (ttl) {
        await this.upstashClient.set(key, value, { ex: ttl });
      } else {
        await this.upstashClient.set(key, value);
      }
    } else if (this.redisClient) {
      if (ttl) {
        await this.redisClient.setEx(key, ttl, value);
      } else {
        await this.redisClient.set(key, value);
      }
    }
  }
  
  /**
   * 统一的 Redis DEL 方法（支持传统 Redis 和 Upstash）
   */
  private async redisDel(key: string): Promise<void> {
    if (this.upstashClient) {
      await this.upstashClient.del(key);
    } else if (this.redisClient) {
      await this.redisClient.del(key);
    }
  }
  
  /**
   * 生成缓存键
   */
  private getEmbeddingCacheKey(text: string): string {
    // 使用简单的hash避免键过长
    const hash = this.simpleHash(text);
    return `${this.CACHE_KEY_PREFIX}${hash}`;
  }
  
  private getSearchResultCacheKey(query: string, filters: string): string {
    const hash = this.simpleHash(`${query}:${filters}`);
    return `${this.SEARCH_RESULT_PREFIX}${hash}`;
  }
  
  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * 获取embedding（从缓存）
   * @param text - 原始文本
   * @returns embedding向量或null
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    const cacheKey = this.getEmbeddingCacheKey(text);
    
    // 1. 尝试从内存缓存获取
    const memoryResult = this.memoryCache.get<number[]>(cacheKey);
    if (memoryResult) {
      console.log('💾 [L1] 内存缓存命中');
      return memoryResult;
    }
    
    // 2. 尝试从 Redis 获取
    if (this.redisEnabled) {
      try {
        const redisResult = await this.redisGet(cacheKey);
        if (redisResult) {
          const embedding = JSON.parse(redisResult);
          console.log('💾 [L2] Redis缓存命中');
              
          // 回填到内存缓存
          this.memoryCache.set(cacheKey, embedding);
              
          return embedding;
        }
      } catch (error) {
        console.error('❌ Redis读取失败:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    console.log('❌ 缓存未命中');
    return null;
  }
  
  /**
   * 设置embedding缓存
   * @param text - 原始文本
   * @param embedding - embedding向量
   */
  async setEmbedding(text: string, embedding: number[]): Promise<void> {
    const cacheKey = this.getEmbeddingCacheKey(text);
    
    // 1. 设置内存缓存
    this.memoryCache.set(cacheKey, embedding);
    
    // 2. 设置 Redis 缓存
    if (this.redisEnabled) {
      try {
        await this.redisSet(
          cacheKey,
          JSON.stringify(embedding),
          this.REDIS_CACHE_TTL
        );
      } catch (error) {
        console.error('❌ Redis写入失败:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }
  
  /**
   * 获取搜索结果缓存
   * @param query - 搜索查询
   * @param filters - 过滤条件JSON字符串
   * @returns 缓存的搜索结果或null
   */
  async getSearchResult(query: string, filters: string): Promise<unknown | null> {
    const cacheKey = this.getSearchResultCacheKey(query, filters);
    
    // 1. 尝试从内存缓存获取
    const memoryResult = this.memoryCache.get(cacheKey);
    if (memoryResult) {
      console.log('💾 [L1] 搜索结果内存缓存命中');
      return memoryResult;
    }
    
    // 2. 尝试从 Redis 获取
    if (this.redisEnabled) {
      try {
        const redisResult = await this.redisGet(cacheKey);
        if (redisResult) {
          const result = JSON.parse(redisResult);
          console.log('💾 [L2] 搜索结果 Redis 缓存命中');
              
          // 回填到内存缓存
          this.memoryCache.set(cacheKey, result);
              
          return result;
        }
      } catch (error) {
        console.error('❌ Redis读取失败:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    return null;
  }
  
  /**
   * 设置搜索结果缓存
   * @param query - 搜索查询
   * @param filters - 过滤条件
   * @param result - 搜索结果
   */
  async setSearchResult(query: string, filters: string, result: unknown): Promise<void> {
    const cacheKey = this.getSearchResultCacheKey(query, filters);
    
    // 1. 设置内存缓存
    this.memoryCache.set(cacheKey, result);
    
    // 2. 设置 Redis 缓存
    if (this.redisEnabled) {
      try {
        await this.redisSet(
          cacheKey,
          JSON.stringify(result),
          this.SEARCH_RESULT_TTL
        );
      } catch (error) {
        console.error('❌ Redis写入失败:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }
  
  /**
   * 批量获取embeddings
   * @param texts - 文本数组
   * @returns Map<text, embedding>
   */
  async batchGetEmbeddings(texts: string[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();
    const misses: string[] = [];
    
    // 尝试从缓存获取
    for (const text of texts) {
      const embedding = await this.getEmbedding(text);
      if (embedding) {
        results.set(text, embedding);
      } else {
        misses.push(text);
      }
    }
    
    console.log(`💾 批量缓存: ${results.size}/${texts.length} 命中`);
    
    return results;
  }
  
  /**
   * 批量设置embeddings
   * @param embeddingsMap - Map<text, embedding>
   */
  async batchSetEmbeddings(embeddingsMap: Map<string, number[]>): Promise<void> {
    for (const [text, embedding] of embeddingsMap.entries()) {
      await this.setEmbedding(text, embedding);
    }
    console.log(`💾 批量缓存设置: ${embeddingsMap.size} 个embeddings`);
  }
  
  /**
   * 清除特定缓存
   * @param text - 文本（可选，不指定则清除所有）
   */
  async invalidateCache(text?: string): Promise<void> {
    if (text) {
      const cacheKey = this.getEmbeddingCacheKey(text);
      this.memoryCache.del(cacheKey);
      
      if (this.redisEnabled) {
        await this.redisDel(cacheKey);
      }
    } else {
      // 清除所有 embedding 缓存
      this.memoryCache.flushAll();
      
      // 注意：Upstash 不支持 keys 命令，这里只清除内存缓存
      if (this.redisEnabled && this.redisClient) {
        const keys = await this.redisClient.keys(`${this.CACHE_KEY_PREFIX}*`);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      }
    }
  }
  
  /**
   * 清除搜索结果缓存
   */
  async invalidateSearchCache(): Promise<void> {
    this.memoryCache.flushAll();
    
    // 注意：Upstash 不支持 keys 命令，这里只清除内存缓存
    if (this.redisEnabled && this.redisClient) {
      const keys = await this.redisClient.keys(`${this.SEARCH_RESULT_PREFIX}*`);
      if (keys.length > 0) {
        await this.redisClient.del(keys);
      }
    }
  }
  
  /**
   * 获取缓存统计信息
   */
  getStats() {
    const stats = this.memoryCache.getStats();
    return {
      memoryCache: {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits / (stats.hits + stats.misses) || 0,
      },
      redisEnabled: this.redisEnabled,
    };
  }
  
  /**
   * 关闭连接
   */
  async shutdown() {
    this.memoryCache.flushAll();
    
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    // Upstash 不需要显式关闭
  }
}

// 导出单例实例
export const embeddingCacheService = new EmbeddingCacheService();
