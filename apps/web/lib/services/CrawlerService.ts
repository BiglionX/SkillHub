import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { inspectQualitySignals, collectInspectableText } from '../governance/quality-signals';
import { SkillSeekersAdapter, CrawledSkill } from '../crawlers/SkillSeekersAdapter';
import { SkillsMPTransformer } from '../transformers/SkillsMPTransformer';
import { SmartClassifier } from '../utils/SmartClassifier';

/**
 * 爬虫任务类型
 */
export type CrawlerTaskType = 'full_sync' | 'incremental' | 'single_repo' | 'batch_repos';

/**
 * 爬虫服务配置
 */
export interface CrawlerServiceConfig {
  githubToken?: string;
  maxConcurrent?: number;
  batchSize?: number;
}

/**
 * 爬虫服务
 * 
 * 管理 GitHub 仓库的爬取任务，包括：
 * - 单仓库爬取
 * - 批量爬取
 * - 定时全量同步
 * - 增量更新
 */
export class CrawlerService {
  private adapter: SkillSeekersAdapter;
  private transformer: SkillsMPTransformer;
  private classifier: SmartClassifier;
  private config: CrawlerServiceConfig;

  constructor(config: CrawlerServiceConfig = {}) {
    this.config = {
      githubToken: config.githubToken || process.env.GITHUB_TOKEN,
      maxConcurrent: config.maxConcurrent || 5,
      batchSize: config.batchSize || 20,
    };

    this.adapter = new SkillSeekersAdapter({
      githubToken: this.config.githubToken,
      maxConcurrent: this.config.maxConcurrent,
    });

    this.transformer = new SkillsMPTransformer();
    this.classifier = new SmartClassifier();
  }

  /**
   * 爬取单个仓库并保存到数据库
   * @param repoUrl 仓库 URL
   * @returns 是否成功
   */
  async crawlAndSave(repoUrl: string): Promise<boolean> {
    console.log(`🕷️  Crawling and saving: ${repoUrl}`);

    try {
      // 创建任务记录
      const task = await prisma.crawlerTask.create({
        data: {
          taskType: 'single_repo',
          target: repoUrl,
          status: 'processing',
        },
      });

      try {
        // 执行爬取
        const crawledData = await this.adapter.crawl(repoUrl);

        // 转换为 SkillHub 格式
        const skillData = this.transformCrawledToSkillHub(crawledData);

        // 验证数据
        const validation = this.transformer.validate(skillData);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        // 质量/安全门禁：
        // - 新技能命中高危信号 → 不自动公开，转人工审核
        // - 既有技能同步出高危内容 → 强制下架（REJECTED + 私有）
        // - 安全内容不写 status/isPublic，避免覆盖人工审核决定
        const qualityReport = inspectQualitySignals(
          collectInspectableText({
            name: skillData.name,
            description: skillData.description,
            tags: skillData.tags,
          }),
        );

        // 保存到数据库
        await prisma.skill.upsert({
          where: {
            slug: skillData.slug,
          },
          update: {
            // 已公开技能同步出高危内容时自动下架；安全内容不触碰人工审核状态
            status: qualityReport.safe ? undefined : 'REJECTED',
            isPublic: qualityReport.safe ? undefined : false,
            name: skillData.name,
            description: skillData.description,
            version: skillData.version,
            source: skillData.source,
            sourceId: skillData.sourceId,
            sourceUrl: skillData.sourceUrl,
            authorName: skillData.authorName,
            authorUrl: skillData.authorUrl,
            category: skillData.category,
            subcategory: skillData.subcategory,
            confidence: skillData.confidence,
            tags: skillData.tags,
            languages: skillData.languages,
            qualityScore: skillData.qualityScore,
            downloadCount: skillData.downloadCount,
            starCount: skillData.starCount,
            repositoryUrl: skillData.repositoryUrl,
            documentationUrl: skillData.documentationUrl,
            packageUrl: skillData.packageUrl,
            permissions: skillData.permissions as Prisma.InputJsonValue,
            dependencies: skillData.dependencies as Prisma.InputJsonValue,
            lastSyncedAt: new Date(),
            syncStatus: 'synced',
            updatedAt: skillData.updatedAt,
          },
          create: {
            name: skillData.name,
            slug: skillData.slug,
            description: skillData.description,
            version: skillData.version,
            source: skillData.source,
            sourceId: skillData.sourceId,
            sourceUrl: skillData.sourceUrl,
            authorName: skillData.authorName,
            authorUrl: skillData.authorUrl,
            category: skillData.category,
            subcategory: skillData.subcategory,
            confidence: skillData.confidence,
            tags: skillData.tags,
            languages: skillData.languages,
            qualityScore: skillData.qualityScore,
            downloadCount: skillData.downloadCount,
            starCount: skillData.starCount,
            repositoryUrl: skillData.repositoryUrl,
            documentationUrl: skillData.documentationUrl,
            packageUrl: skillData.packageUrl,
            permissions: skillData.permissions as Prisma.InputJsonValue,
            dependencies: skillData.dependencies as Prisma.InputJsonValue,
            authorId: await this.getOrCreateSystemUser(),
            status: qualityReport.safe ? 'APPROVED' : 'PENDING_REVIEW',
            isPublic: qualityReport.safe,
            lastSyncedAt: new Date(),
            syncStatus: 'synced',
            updatedAt: skillData.updatedAt,
          },
        });

        // 更新任务状态
        await prisma.crawlerTask.update({
          where: { id: task.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            result: { skillName: skillData.name },
          },
        });

        console.log(`✅ Successfully crawled and saved: ${skillData.name}`);
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // 更新任务为失败状态
        await prisma.crawlerTask.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: errorMessage,
            retryCount: { increment: 1 },
          },
        });

        console.error(`❌ Failed to crawl and save ${repoUrl}:`, errorMessage);
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Task creation failed for ${repoUrl}:`, errorMessage);
      return false;
    }
  }

  /**
   * 批量爬取仓库
   * @param repoUrls 仓库 URL 列表
   * @returns 爬取结果统计
   */
  async crawlBatchAndSave(repoUrls: string[]): Promise<{
    success: number;
    failed: number;
    results: Array<{ url: string; success: boolean; error?: string }>;
  }> {
    console.log(`🕷️  Starting batch crawl: ${repoUrls.length} repositories`);

    // 创建批量任务
    const task = await prisma.crawlerTask.create({
      data: {
        taskType: 'batch_repos',
        target: JSON.stringify(repoUrls),
        status: 'processing',
      },
    });

    const results: Array<{ url: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    // 分批处理
    const batches = this.chunk(repoUrls, this.config.batchSize || 20);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length}`);

      const batchResults = await Promise.allSettled(
        batch.map(url => this.crawlAndSave(url))
      );

      batch.forEach((url, index) => {
        const result = batchResults[index];
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
          results.push({ url, success: true });
        } else {
          failedCount++;
          results.push({
            url,
            success: false,
            error: result.status === 'rejected' ? result.reason.message : 'Unknown error',
          });
        }
      });

      // 批次间暂停
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 更新任务状态
    await prisma.crawlerTask.update({
      where: { id: task.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        result: { success: successCount, failed: failedCount },
      },
    });

    console.log(`✅ Batch crawl completed: ${successCount} success, ${failedCount} failed`);

    return {
      success: successCount,
      failed: failedCount,
      results,
    };
  }

  /**
   * 搜索并爬取匹配的仓库
   * @param query 搜索查询
   * @param filters 过滤条件
   * @param timeout 超时时间（毫秒），默认15秒
   * @returns 爬取结果
   */
  async searchAndCrawl(
    query: string,
    filters: {
      language?: string;
      minStars?: number;
      updatedAfter?: string;
      limit?: number;
    } = {},
    timeout = 15000 // 15秒超时
  ): Promise<{ discovered: number; crawled: number; failed: number }> {
    console.log(`🔍 Searching for repositories: "${query}"`);

    // 添加超时保护
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Crawl timeout')), timeout);
    });

    try {
      const result = await Promise.race([
        this._doSearchAndCrawl(query, filters),
        timeoutPromise,
      ]);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Search and crawl failed or timed out:', errorMessage);
      return { discovered: 0, crawled: 0, failed: 0 };
    }
  }

  /**
   * 实际执行搜索和爬取的内部方法
   */
  private async _doSearchAndCrawl(
    query: string,
    filters: {
      language?: string;
      minStars?: number;
      updatedAfter?: string;
      limit?: number;
    } = {}
  ): Promise<{ discovered: number; crawled: number; failed: number }> {
    // 搜索仓库
    const repos = await this.adapter.searchRepositories(query, {
      language: filters.language,
      stars: filters.minStars,
      updated: filters.updatedAfter,
      limit: filters.limit || 30,
    });

    console.log(`Found ${repos.length} matching repositories`);

    if (repos.length === 0) {
      return { discovered: 0, crawled: 0, failed: 0 };
    }

    // 提取 URL 列表
    const repoUrls = repos.map(repo => repo.url);

    // 批量爬取
    const result = await this.crawlBatchAndSave(repoUrls);

    return {
      discovered: repos.length,
      crawled: result.success,
      failed: result.failed,
    };
  }

  /**
   * 执行全量同步（从种子仓库开始）
   */
  async performFullSync(): Promise<{
    total: number;
    success: number;
    failed: number;
  }> {
    console.log('🔄 Starting full sync...');

    // 创建同步任务
    const task = await prisma.crawlerTask.create({
      data: {
        taskType: 'full_sync',
        target: 'automated_full_sync',
        status: 'processing',
      },
    });

    try {
      // 定义种子仓库列表（知名的 AI Agent Skills 仓库）
      const seedRepos = [
        'microsoft/autogen',
        'langchain-ai/langchain',
        'run-llama/llama_index',
        'crewAIInc/crewAI',
        'danny-avila/LibreChat',
      ];

      // 爬取种子仓库
      const seedResult = await this.crawlBatchAndSave(seedRepos);

      // 基于种子仓库的相关仓库进行扩展搜索
      const searchQueries = [
        'AI agent skill',
        'LLM tool',
        'autonomous agent',
        'AI assistant',
      ];

      let totalDiscovered = 0;
      let totalCrawled = 0;
      let totalFailed = 0;

      for (const query of searchQueries) {
        const result = await this.searchAndCrawl(query, {
          minStars: 50,
          limit: 20,
        });

        totalDiscovered += result.discovered;
        totalCrawled += result.crawled;
        totalFailed += result.failed;
      }

      // 更新任务状态
      await prisma.crawlerTask.update({
        where: { id: task.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          result: {
            seedCrawled: seedResult.success,
            discovered: totalDiscovered,
            crawled: totalCrawled,
            failed: totalFailed,
          },
        },
      });

      console.log(`✅ Full sync completed`);
      console.log(`   Seed repos: ${seedResult.success}/${seedRepos.length}`);
      console.log(`   Discovered: ${totalDiscovered}`);
      console.log(`   Crawled: ${totalCrawled}`);
      console.log(`   Failed: ${totalFailed}`);

      return {
        total: totalDiscovered,
        success: totalCrawled,
        failed: totalFailed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await prisma.crawlerTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: errorMessage,
        },
      });

      throw error;
    }
  }

  /**
   * 获取待重试的失败任务
   */
  async retryFailedTasks(maxRetries = 3): Promise<number> {
    const failedTasks = await prisma.crawlerTask.findMany({
      where: {
        status: 'failed',
        retryCount: { lt: maxRetries },
      },
      take: 50,
    });

    console.log(`Retrying ${failedTasks.length} failed tasks`);

    let retryCount = 0;
    for (const task of failedTasks) {
      if (task.taskType === 'single_repo') {
        const success = await this.crawlAndSave(task.target);
        if (success) retryCount++;
      }
    }

    console.log(`Retry completed: ${retryCount}/${failedTasks.length} succeeded`);
    return retryCount;
  }

  /**
   * 将爬取的数据转换为 SkillHub 格式
   */
  private transformCrawledToSkillHub(crawled: CrawledSkill) {
    // 使用智能分类器进行分类
    const classification = this.classifier.classify({
      name: crawled.name,
      description: crawled.description,
      tags: crawled.tags,
      languages: crawled.languages,
    });
    
    return {
      name: crawled.name,
      slug: this.generateSlug(crawled.name),
      description: crawled.description,
      version: crawled.version,
      
      source: 'github',
      sourceId: crawled.repositoryUrl,
      sourceUrl: crawled.documentationUrl,
      
      authorName: crawled.author,
      authorUrl: `https://github.com/${crawled.author}`,
      
      category: classification.category, // 主分类
      subcategory: classification.subcategory, // 子分类
      confidence: classification.confidence, // 置信度
      tags: crawled.tags,
      languages: crawled.languages,
      
      qualityScore: this.calculateQualityScore(crawled),
      downloadCount: 0,
      starCount: crawled.stars,
      
      repositoryUrl: crawled.repositoryUrl,
      documentationUrl: crawled.documentationUrl,
      packageUrl: crawled.repositoryUrl,
      
      permissions: crawled.permissions,
      dependencies: crawled.dependencies,
      
      updatedAt: new Date(crawled.lastUpdated),
    };
  }

  /**
   * 计算质量评分
   */
  private calculateQualityScore(crawled: CrawledSkill): number {
    let score = 0;

    // Stars (0-40分)
    score += Math.min(crawled.stars / 100, 1) * 40;

    // 有 SKILL.md 文件 (20分)
    if (crawled.skillContent) {
      score += 20;
    }

    // 描述完整性 (20分)
    if (crawled.description && crawled.description.length > 50) {
      score += 20;
    }

    // 标签数量 (10分)
    score += Math.min(crawled.tags.length / 5, 1) * 10;

    // 依赖声明 (10分)
    if (crawled.dependencies) {
      score += 10;
    }

    return Math.round(score);
  }

  /**
   * 生成 slug
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 255);
  }

  /**
   * 获取或创建系统用户
   */
  private async getOrCreateSystemUser(): Promise<string> {
    const systemEmail = 'system@skillhub.io';
    
    let user = await prisma.user.findUnique({
      where: { email: systemEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: systemEmail,
          name: 'SkillHub System',
        },
      });
    }

    return user.id;
  }

  /**
   * 数组分块
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
