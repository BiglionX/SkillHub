import axios, { AxiosInstance, AxiosError } from 'axios';
import NodeCache from 'node-cache';

/**
 * SkillsMP API 配置接口
 */
export interface SkillsMPConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  cacheTTL?: number; // 缓存时间（秒）
}

/**
 * SkillsMP 搜索参数
 */
export interface FetchParams {
  query?: string;
  page?: number;
  limit?: number;
  category?: string;
  language?: string;
  sort?: 'relevance' | 'stars' | 'updated';
}

/**
 * SkillsMP Skill 数据结构
 */
export interface SkillsMPSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  languages: string[];
  stars: number;
  downloads: number;
  updated_at: string;
  repository_url: string;
  documentation_url: string;
  tags?: string[];
  permissions?: Record<string, unknown>;
  dependencies?: Record<string, string>;
}

/**
 * SkillsMP API 响应结构
 */
interface SkillsMPResponse<T> {
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

/**
 * SkillsMP API 连接器
 * 
 * 负责与 SkillsMP API 进行通信，获取 Skills 数据
 */
export class SkillsMPConnector {
  private client: AxiosInstance;
  private cache: NodeCache;
  private apiKey: string;
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly RATE_LIMIT_DELAY = 600; // 100 requests/minute = 600ms delay

  constructor(config: SkillsMPConfig) {
    this.apiKey = config.apiKey;
    this.cache = new NodeCache({ 
      stdTTL: config.cacheTTL || 3600 // 默认缓存1小时
    });

    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.skillsmp.com/v1',
      timeout: config.timeout || 30000,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'SkillHub-Crawler/2.0',
      },
    });

    // 请求拦截器 - 速率限制
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      return config;
    });

    // 响应拦截器 - 错误处理
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 429) {
          console.warn('⚠️  Rate limit exceeded, waiting before retry...');
          return this.handleRateLimit(error);
        }
        
        if (error.response?.status === 401) {
          throw new Error('SkillsMP API authentication failed. Please check your API key.');
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * 强制执行速率限制
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      const waitTime = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * 处理速率限制错误（指数退避重试）
   */
  private async handleRateLimit(error: AxiosError): Promise<unknown> {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 2000; // 指数退避：2s, 4s, 8s
      console.log(`Retry ${retryCount + 1}/${maxRetries} after ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        if (error.config) {
          return await this.client.request(error.config);
        }
        throw new Error('No request config available for retry');
      } catch {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw new Error(`Rate limit retry failed after ${maxRetries} attempts`);
        }
      }
    }
  }

  /**
   * 搜索 Skills
   * @param params 搜索参数
   * @returns Skills 列表
   */
  async searchSkills(params: FetchParams): Promise<SkillsMPSkill[]> {
    const cacheKey = `search:${JSON.stringify(params)}`;
    const cached = this.cache.get<SkillsMPSkill[]>(cacheKey);
    
    if (cached) {
      console.log('📦 Cache hit for search:', params.query);
      return cached;
    }

    try {
      console.log('🔍 Searching SkillsMP:', params.query);
      const response = await this.client.get<SkillsMPResponse<SkillsMPSkill[]>>('/skills/search', { 
        params 
      });
      
      const skills = response.data.data;
      
      // 缓存搜索结果（5分钟）
      this.cache.set(cacheKey, skills, 300);
      
      console.log(`✅ Found ${skills.length} skills`);
      return skills;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to search skills:', errorMessage);
      throw new Error(`SkillsMP search failed: ${errorMessage}`);
    }
  }

  /**
   * 获取 Skill 详情
   * @param id Skill ID
   * @returns Skill 详细信息
   */
  async getSkillDetail(id: string): Promise<SkillsMPSkill> {
    const cacheKey = `skill:${id}`;
    const cached = this.cache.get<SkillsMPSkill>(cacheKey);
    
    if (cached) {
      console.log('📦 Cache hit for skill:', id);
      return cached;
    }

    try {
      console.log('📄 Fetching skill detail:', id);
      const response = await this.client.get<SkillsMPResponse<SkillsMPSkill>>(`/skills/${id}`);
      const skill = response.data.data;
      
      // 缓存详情（1小时）
      this.cache.set(cacheKey, skill, 3600);
      
      console.log('✅ Fetched skill detail');
      return skill;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to fetch skill detail:', errorMessage);
      throw new Error(`SkillsMP detail fetch failed: ${errorMessage}`);
    }
  }

  /**
   * 获取 trending skills
   * @param limit 数量限制
   * @returns Trending Skills 列表
   */
  async getTrendingSkills(limit = 20): Promise<SkillsMPSkill[]> {
    const cacheKey = `trending:${limit}`;
    const cached = this.cache.get<SkillsMPSkill[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      console.log('🔥 Fetching trending skills');
      const response = await this.client.get<SkillsMPResponse<SkillsMPSkill[]>>('/skills/trending', {
        params: { limit }
      });
      
      const skills = response.data.data;
      this.cache.set(cacheKey, skills, 600); // 缓存10分钟
      
      console.log(`✅ Fetched ${skills.length} trending skills`);
      return skills;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to fetch trending skills:', errorMessage);
      throw new Error(`SkillsMP trending fetch failed: ${errorMessage}`);
    }
  }

  /**
   * 同步所有 Skills（分页获取）
   * @param onProgress 进度回调
   * @returns 所有 Skills 列表
   */
  async syncAllSkills(onProgress?: (progress: number, total: number) => void): Promise<SkillsMPSkill[]> {
    const allSkills: SkillsMPSkill[] = [];
    let page = 1;
    const limit = 100; // 每页最大数量
    let hasMore = true;
    let totalPages = 1;

    console.log('🔄 Starting full sync from SkillsMP...');

    while (hasMore) {
      try {
        const response = await this.client.get<SkillsMPResponse<SkillsMPSkill[]>>('/skills/search', {
          params: { page, limit, sort: 'updated' }
        });

        const skills = response.data.data;
        const pagination = response.data.pagination;

        if (pagination) {
          totalPages = pagination.total_pages;
          console.log(`📊 Page ${page}/${totalPages} (${pagination.total} total)`);
          
          if (onProgress) {
            onProgress(allSkills.length + skills.length, pagination.total);
          }
        }

        allSkills.push(...skills);
        
        // 检查是否还有更多页面
        hasMore = pagination ? page < pagination.total_pages : false;
        page++;

        // 避免速率限制
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to sync page ${page}:`, errorMessage);
        throw new Error(`SkillsMP sync failed at page ${page}: ${errorMessage}`);
      }
    }

    console.log(`✅ Full sync completed: ${allSkills.length} skills`);
    return allSkills;
  }

  /**
   * 获取分类列表
   * @returns 分类列表
   */
  async getCategories(): Promise<string[]> {
    const cacheKey = 'categories';
    const cached = this.cache.get<string[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      console.log('📂 Fetching categories');
      const response = await this.client.get<SkillsMPResponse<string[]>>('/categories');
      const categories = response.data.data;
      
      this.cache.set(cacheKey, categories, 86400); // 缓存24小时
      
      console.log(`✅ Fetched ${categories.length} categories`);
      return categories;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to fetch categories:', errorMessage);
      // 返回默认分类而不是抛出错误
      return ['development', 'business', 'productivity', 'communication', 'entertainment'];
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.flushAll();
    console.log('🗑️  SkillsMP cache cleared');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { keys: number; hits: number; misses: number } {
    const stats = this.cache.getStats();
    return {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
    };
  }
}
