import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { SkillsMPConnector } from '../crawlers/SkillsMPConnector';
import { SkillsMPTransformer, SkillHubSkillData } from '../transformers/SkillsMPTransformer';
import { inspectQualitySignals, collectInspectableText } from '../governance/quality-signals';

/**
 * Skills 导入服务
 * 
 * 负责从 SkillsMP 导入数据到 SkillHub 数据库
 */
export class SkillsImportService {
  private connector: SkillsMPConnector;
  private transformer: SkillsMPTransformer;

  constructor() {
    const apiKey = process.env.SKILLSMP_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️  SKILLSMP_API_KEY not found in environment variables');
      // 使用占位符以便开发测试
      this.connector = new SkillsMPConnector({
        apiKey: 'test-key',
        baseUrl: 'https://api.skillsmp.com/v1',
        cacheTTL: 3600,
      });
    } else {
      this.connector = new SkillsMPConnector({
        apiKey,
        baseUrl: process.env.SKILLSMP_BASE_URL || 'https://api.skillsmp.com/v1',
        cacheTTL: 3600,
      });
    }
    
    this.transformer = new SkillsMPTransformer();
  }

  /**
   * 执行全量导入
   * @returns 导入结果统计
   */
  async importAllSkills(): Promise<{
    success: number;
    failed: number;
    skipped: number;
    errors: string[];
  }> {
    const result = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    let syncLogId: string | null = null;

    try {
      // 记录同步开始
      const syncLog = await prisma.syncLog.create({
        data: {
          source: 'skillsmp',
          status: 'running',
        },
      });
      syncLogId = syncLog.id;

      console.log('📥 Starting full import from SkillsMP...');

      // 从 SkillsMP 获取所有 skills
      const skillsMPData = await this.connector.syncAllSkills(
        (progress, total) => {
          console.log(`📊 Progress: ${progress}/${total} (${Math.round((progress / total) * 100)}%)`);
        }
      );

      console.log(`✅ Fetched ${skillsMPData.length} skills from SkillsMP`);

      // 转换数据
      const transformedSkills = this.transformer.transformBatch(skillsMPData);

      // 验证数据
      const validation = this.transformer.validateBatch(transformedSkills);
      
      console.log(`✓ Validated: ${validation.valid.length} valid, ${validation.invalid.length} invalid`);

      // 批量插入数据库
      const batchSize = 50;
      for (let i = 0; i < validation.valid.length; i += batchSize) {
        const batch = validation.valid.slice(i, i + batchSize);
        
        for (const skillData of batch) {
          try {
            await this.upsertSkill(skillData);
            result.success++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            result.failed++;
            result.errors.push(`Failed to import skill ${skillData.name}: ${errorMessage}`);
            console.error(`❌ Failed to import ${skillData.name}:`, errorMessage);
          }
        }

        // 每批处理后短暂暂停，避免数据库压力
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 记录失败的验证
      for (const invalid of validation.invalid) {
        result.skipped++;
        result.errors.push(`Validation failed for ${invalid.data.name}: ${invalid.errors.join(', ')}`);
      }

      // 更新同步日志
      if (syncLogId) {
        await prisma.syncLog.update({
          where: { id: syncLogId },
          data: {
            completedAt: new Date(),
            totalCount: skillsMPData.length,
            successCount: result.success,
            failedCount: result.failed,
            status: result.failed > 0 ? 'completed_with_errors' : 'completed',
            errorMessage: result.errors.length > 0 ? result.errors.slice(0, 10).join('\n') : null,
            metadata: {
              skipped: result.skipped,
              validationErrors: validation.invalid.length,
            },
          },
        });
      }

      console.log(`\n🎉 Import completed:`);
      console.log(`   ✓ Success: ${result.success}`);
      console.log(`   ✗ Failed: ${result.failed}`);
      console.log(`   ⊘ Skipped: ${result.skipped}`);
      console.log(`   Total: ${skillsMPData.length}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Import failed:', error);
      result.errors.push(`Import failed: ${errorMessage}`);

      // 更新同步日志为失败状态
      if (syncLogId) {
        await prisma.syncLog.update({
          where: { id: syncLogId },
          data: {
            completedAt: new Date(),
            status: 'failed',
            errorMessage: errorMessage,
          },
        });
      }
    }

    return result;
  }

  /**
   * 增量更新（只更新最近变化的 skills）
   * @param since 从此时间之后更新的 skills
   * @returns 更新的 skills 数量
   */
  async incrementalUpdate(since: Date): Promise<number> {
    console.log(`🔄 Starting incremental update since ${since.toISOString()}...`);

    // TODO: 实现 SkillsMP 的增量查询 API
    // 目前 SkillsMP API 可能不支持按时间过滤，需要全量拉取后本地过滤
    
    const allSkills = await this.connector.syncAllSkills();
    
    // 过滤出最近更新的 skills
    const updatedSkills = allSkills.filter(skill => {
      const updatedAt = new Date(skill.updated_at);
      return updatedAt > since;
    });

    console.log(`Found ${updatedSkills.length} updated skills`);

    let updateCount = 0;
    for (const skill of updatedSkills) {
      try {
        const transformed = this.transformer.transform(skill);
        await this.upsertSkill(transformed);
        updateCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to update skill ${skill.name}:`, errorMessage);
      }
    }

    console.log(`✅ Incremental update completed: ${updateCount} skills updated`);
    return updateCount;
  }

  /**
   * 导入单个 Skill
   * @param skillId SkillsMP Skill ID
   * @returns 是否成功
   */
  async importSingleSkill(skillId: string): Promise<boolean> {
    try {
      console.log(`📥 Importing skill: ${skillId}`);
      
      const skillData = await this.connector.getSkillDetail(skillId);
      const transformed = this.transformer.transform(skillData);
      
      await this.upsertSkill(transformed);
      
      console.log(`✅ Successfully imported: ${skillData.name}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to import skill ${skillId}:`, errorMessage);
      return false;
    }
  }

  /**
   * Upsert Skill（存在则更新，不存在则创建）
   */
  private async upsertSkill(skillData: SkillHubSkillData): Promise<void> {
    // 提取分类信息（支持字符串或 ClassificationResult 对象）
    const categoryValue = typeof skillData.category === 'string' 
      ? skillData.category 
      : skillData.category.category;
    const subcategoryValue = typeof skillData.category === 'object' && skillData.category !== null
      ? skillData.category.subcategory
      : undefined;
    const confidenceValue = typeof skillData.category === 'object' && skillData.category !== null
      ? skillData.category.confidence
      : undefined;

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

    await prisma.skill.upsert({
      where: {
        slug: skillData.slug,
      },
      update: {
        // 已公开技能同步出高危内容时自动下架；安全内容不触碰人工审核状态
        status: qualityReport.safe ? undefined : 'REJECTED',
        isPublic: qualityReport.safe ? undefined : false,
        name: skillData.name,
        description: skillData.description || '',
        version: skillData.version || '1.0.0',
        category: categoryValue || 'uncategorized',
        subcategory: subcategoryValue,
        confidence: confidenceValue,
        tags: skillData.tags || [],
        slug: skillData.slug,
        
        // v2.0 字段
        sourceUrl: skillData.sourceUrl,
        authorName: skillData.authorName,
        authorUrl: skillData.authorUrl,
        languages: skillData.languages || [],
        qualityScore: skillData.qualityScore || 0,
        downloadCount: skillData.downloadCount || 0,
        starCount: skillData.starCount || 0,
        repositoryUrl: skillData.repositoryUrl,
        documentationUrl: skillData.documentationUrl,
        packageUrl: skillData.packageUrl,
        permissions: skillData.permissions as Prisma.InputJsonValue,
        dependencies: skillData.dependencies as Prisma.InputJsonValue,
        compatibility: skillData.compatibility as Prisma.InputJsonValue,
        
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
        updatedAt: skillData.updatedAt || new Date(),
      },
      create: {
        name: skillData.name,
        description: skillData.description || '',
        version: skillData.version || '1.0.0',
        category: categoryValue || 'uncategorized',
        subcategory: subcategoryValue,
        confidence: confidenceValue,
        tags: skillData.tags || [],
        slug: skillData.slug,
        status: qualityReport.safe ? 'APPROVED' : 'PENDING_REVIEW',
        isPublic: qualityReport.safe,
        
        // 作者（需要一个默认用户或系统用户）
        authorId: await this.getOrCreateSystemUser(),
        
        // v2.0 字段
        source: skillData.source,
        sourceId: skillData.sourceId,
        sourceUrl: skillData.sourceUrl,
        authorName: skillData.authorName,
        authorUrl: skillData.authorUrl,
        languages: skillData.languages || [],
        qualityScore: skillData.qualityScore || 0,
        downloadCount: skillData.downloadCount || 0,
        starCount: skillData.starCount || 0,
        repositoryUrl: skillData.repositoryUrl,
        documentationUrl: skillData.documentationUrl,
        packageUrl: skillData.packageUrl,
        permissions: skillData.permissions as Prisma.InputJsonValue,
        dependencies: skillData.dependencies as Prisma.InputJsonValue,
        compatibility: skillData.compatibility as Prisma.InputJsonValue,
        
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
      },
    });
  }

  /**
   * 获取或创建系统用户（用于外部导入的 skills）
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
          image: '/images/system-avatar.png',
        },
      });
      console.log('Created system user for external skills');
    }

    return user.id;
  }

  /**
   * 获取同步统计信息
   */
  async getSyncStats(): Promise<{
    totalSkills: number;
    bySource: Record<string, number>;
    recentSyncs: Array<{
      id: string;
      source: string;
      startedAt: Date;
      completedAt: Date | null;
      totalCount: number;
      successCount: number;
      failedCount: number;
      status: string;
      errorMessage: string | null;
    }>;
  }> {
    const totalSkills = await prisma.skill.count();
    
    const bySource = await prisma.skill.groupBy({
      by: ['source'],
      _count: true,
      where: {
        source: { not: null },
      },
    });

    const recentSyncs = await prisma.syncLog.findMany({
      take: 10,
      orderBy: { startedAt: 'desc' },
    });

    return {
      totalSkills,
      bySource: bySource.reduce((acc, item) => {
        acc[item.source || 'unknown'] = item._count;
        return acc;
      }, {} as Record<string, number>),
      recentSyncs,
    };
  }
}
