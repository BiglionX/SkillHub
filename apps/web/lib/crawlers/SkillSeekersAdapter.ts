import axios from 'axios';
import * as path from 'path';
import grayMatter from 'gray-matter';

/**
 * Skill Seekers 配置
 */
export interface SkillSeekersConfig {
  githubToken?: string;
  timeout?: number;
  maxConcurrent?: number;
  tempDir?: string;
}

/**
 * 爬取的 Skill 原始数据
 */
export interface CrawledSkill {
  name: string;
  description: string;
  version: string;
  author: string;
  repositoryUrl: string;
  documentationUrl: string;
  category?: string;
  tags: string[];
  languages: string[];
  stars: number;
  lastUpdated: string;
  readme?: string;
  skillContent?: string; // SKILL.md 内容
  permissions?: Record<string, unknown>;
  dependencies?: Record<string, string>;
}

/**
 * 仓库元数据类型
 */
interface RepoMetadata {
  description?: string;
  topics: string[];
  languages: string[];
  stars: number;
  lastUpdated: string;
}

/**
 * Skill Seekers 适配器
 * 
 * 封装 Skill Seekers 爬虫功能，适配 SkillHub 数据模型
 */
export class SkillSeekersAdapter {
  private config: SkillSeekersConfig;
  private tempDir: string;

  constructor(config: SkillSeekersConfig = {}) {
    this.config = {
      githubToken: config.githubToken || process.env.GITHUB_TOKEN,
      timeout: config.timeout || 30000,
      maxConcurrent: config.maxConcurrent || 5,
      tempDir: config.tempDir || path.join(process.cwd(), 'temp', 'skill-seekers'),
    };

    this.tempDir = this.config.tempDir || path.join(process.cwd(), 'temp', 'skill-seekers');
  }

  /**
   * 爬取单个仓库（仅获取元数据，不克隆仓库）
   * @param repoUrl GitHub 仓库 URL 或 owner/repo 格式
   * @returns 爬取的 Skill 数据
   */
  async crawl(repoUrl: string): Promise<CrawledSkill> {
    console.log(`🕷️  Crawling repository metadata: ${repoUrl}`);

    try {
      // 标准化仓库 URL
      const normalizedUrl = this.normalizeRepoUrl(repoUrl);
      
      // 提取 owner 和 repo
      const { owner, repo } = this.parseRepoUrl(normalizedUrl);

      // 获取仓库元数据
      const metadata = await this.fetchRepoMetadata(owner, repo);

      // 尝试通过 GitHub Contents API 获取 SKILL.md 内容（无需克隆）
      const skillContent = await this.fetchSkillMdViaApi(owner, repo);

      // 构建结果
      const result: CrawledSkill = {
        name: skillContent?.name || repo,
        description: skillContent?.description || metadata.description || '',
        version: skillContent?.version || '1.0.0',
        author: owner,
        repositoryUrl: normalizedUrl,
        documentationUrl: `${normalizedUrl}/blob/main/SKILL.md`,
        category: skillContent?.category || this.inferCategory(skillContent?.description || metadata.description || ''),
        tags: skillContent?.tags || metadata.topics || [],
        languages: metadata.languages || [],
        stars: metadata.stars || 0,
        lastUpdated: metadata.lastUpdated || new Date().toISOString(),
        readme: skillContent?.readme,
        skillContent: skillContent?.rawContent,
        permissions: skillContent?.permissions,
        dependencies: skillContent?.dependencies,
      };

      console.log(`✅ Successfully crawled metadata: ${result.name}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to crawl ${repoUrl}:`, errorMessage);
      throw new Error(`Crawl failed for ${repoUrl}: ${errorMessage}`);
    }
  }

  /**
   * 批量爬取多个仓库
   * @param repoUrls 仓库 URL 列表
   * @param concurrency 并发数
   * @returns 爬取结果
   */
  async crawlBatch(
    repoUrls: string[],
    concurrency: number = this.config.maxConcurrent || 5
  ): Promise<{ success: CrawledSkill[]; failed: { url: string; error: string }[] }> {
    const success: CrawledSkill[] = [];
    const failed: { url: string; error: string }[] = [];

    console.log(`🕷️  Starting batch crawl: ${repoUrls.length} repositories`);

    // 分批处理
    const batches = this.chunk(repoUrls, concurrency);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} repos)`);

      const results = await Promise.allSettled(
        batch.map(url => this.crawl(url))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          success.push(result.value);
        } else {
          failed.push({
            url: batch[index],
            error: result.reason.message,
          });
        }
      });

      // 批次间短暂暂停
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Batch crawl completed: ${success.length} success, ${failed.length} failed`);
    return { success, failed };
  }

  /**
   * 搜索 GitHub 仓库（通过 GitHub API）
   * @param query 搜索查询
   * @param filters 过滤条件
   * @returns 匹配的仓库列表
   */
  async searchRepositories(
    query: string,
    filters: {
      language?: string;
      stars?: number;
      updated?: string;
      limit?: number;
    } = {}
  ): Promise<Array<{ url: string; name: string; description: string; stars: number }>> {
    // 构建搜索查询 - 使用主题和描述搜索，不限制文件名
    const searchQuery = query;
    
    const params: Record<string, string | number> = {
      q: searchQuery,
      sort: 'stars',
      order: 'desc',
      per_page: filters.limit || 30,
    };

    if (filters.language) {
      params.q += ` language:${filters.language}`;
    }

    if (filters.stars) {
      params.q += ` stars:>=${filters.stars}`;
    }

    if (filters.updated) {
      params.q += ` pushed:>${filters.updated}`;
    }

    try {
      const response = await axios.get('https://api.github.com/search/repositories', {
        headers: {
          Authorization: this.config.githubToken ? `token ${this.config.githubToken}` : undefined,
          Accept: 'application/vnd.github.v3+json',
        },
        params,
      });

      return response.data.items.map((repo: Record<string, unknown>) => ({
        url: repo.html_url as string,
        name: repo.full_name as string,
        description: (repo.description as string) || '',
        stars: repo.stargazers_count as number,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to search repositories:', errorMessage);
      throw new Error(`GitHub search failed: ${errorMessage}`);
    }
  }

  /**
   * 标准化仓库 URL
   */
  private normalizeRepoUrl(url: string): string {
    // 如果是 owner/repo 格式，转换为完整 URL
    if (!url.startsWith('http')) {
      return `https://github.com/${url}`;
    }
    return url;
  }

  /**
   * 解析仓库 URL
   */
  private parseRepoUrl(url: string): { owner: string; repo: string } {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
    return {
      owner: match[1],
      repo: match[2].replace('.git', ''),
    };
  }

  /**
   * 获取仓库元数据
   */
  private async fetchRepoMetadata(owner: string, repo: string): Promise<RepoMetadata> {
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: this.config.githubToken ? `token ${this.config.githubToken}` : undefined,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      return {
        description: response.data.description,
        topics: response.data.topics || [],
        languages: response.data.language ? [response.data.language] : [],
        stars: response.data.stargazers_count,
        lastUpdated: response.data.updated_at,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Failed to fetch metadata for ${owner}/${repo}:`, errorMessage);
      return {
        topics: [],
        languages: [],
        stars: 0,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * 通过 GitHub Contents API 获取 SKILL.md 文件内容（无需克隆）
   */
  private async fetchSkillMdViaApi(owner: string, repo: string): Promise<{
    name?: string;
    description?: string;
    version?: string;
    category?: string;
    tags?: string[];
    permissions?: Record<string, unknown>;
    dependencies?: Record<string, string>;
    readme?: string;
    rawContent?: string;
  } | null> {
    try {
      // 尝试从 main 分支获取 SKILL.md
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/SKILL.md`,
        {
          headers: {
            Authorization: this.config.githubToken ? `token ${this.config.githubToken}` : undefined,
            Accept: 'application/vnd.github.v3+json',
          },
          params: {
            ref: 'main', // 默认使用 main 分支
          },
        }
      );

      // GitHub API 返回的内容是 base64 编码的
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      
      // 解析 frontmatter
      const matter = grayMatter(content);
      
      return {
        name: matter.data.name,
        description: matter.data.description,
        version: matter.data.version,
        category: matter.data.category,
        tags: matter.data.tags,
        permissions: matter.data.permissions,
        dependencies: matter.data.dependencies,
        readme: matter.content,
        rawContent: content,
      };
    } catch {
      // 如果 main 分支失败，尝试 master 分支
      try {
        const response = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/contents/SKILL.md`,
          {
            headers: {
              Authorization: this.config.githubToken ? `token ${this.config.githubToken}` : undefined,
              Accept: 'application/vnd.github.v3+json',
            },
            params: {
              ref: 'master',
            },
          }
        );

        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        const matter = grayMatter(content);
        
        return {
          name: matter.data.name,
          description: matter.data.description,
          version: matter.data.version,
          category: matter.data.category,
          tags: matter.data.tags,
          permissions: matter.data.permissions,
          dependencies: matter.data.dependencies,
          readme: matter.content,
          rawContent: content,
        };
      } catch {
        // SKILL.md 不存在或无法访问
        console.warn(`No valid SKILL.md found in ${owner}/${repo} via API`);
        return null;
      }
    }
  }

  /**
   * 推断分类
   */
  private inferCategory(description: string): string {
    const lowerDesc = description.toLowerCase();
    
    const categories: Record<string, string[]> = {
      'development': ['code', 'programming', 'developer', 'debug'],
      'business': ['business', 'finance', 'accounting', 'invoice'],
      'productivity': ['productivity', 'task', 'workflow', 'automation'],
      'communication': ['email', 'chat', 'message', 'communication'],
      'data': ['data', 'analytics', 'database', 'analysis'],
      'ai': ['ai', 'machine learning', 'llm', 'gpt'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }



  /**
   * 将数组分块
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
