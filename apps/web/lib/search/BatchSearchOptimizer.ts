import { prisma } from '@/lib/prisma';
import { PUBLIC_SKILL_SQL, PUBLIC_SKILL_WHERE } from '@/lib/governance/visibility';
import type { Skill } from '@prisma/client';

// 定义搜索结果的类型（包含相似度分数）
interface SearchResult extends Omit<Skill, 'embeddingVector' | 'embedding'> {
  embeddingVector?: number[] | null;
  embedding?: unknown;
  similarity?: number;
}

/**
 * 批量搜索优化服务
 * 
 * 提供高性能的批量查询和索引优化功能
 */
export class BatchSearchOptimizer {
  /**
   * 批量获取Skills（优化版）
   * 使用单次查询替代多次查询，减少数据库往返
   */
  async batchGetSkills(skillIds: string[]): Promise<Partial<Skill>[]> {
    if (skillIds.length === 0) {
      return [];
    }

    // 分批查询，避免单次查询过大
    const batchSize = 100;
    const allSkills: Partial<Skill>[] = [];

    for (let i = 0; i < skillIds.length; i += batchSize) {
      const batch = skillIds.slice(i, i + batchSize);
      
      const skills = await prisma.skill.findMany({
        where: {
          id: { in: batch },
          status: 'APPROVED',
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          category: true,
          subcategory: true,
          tags: true,
          languages: true,
          qualityScore: true,
          starCount: true,
          downloadCount: true,
          authorName: true,
          repositoryUrl: true,
          documentationUrl: true,
          source: true,
          updatedAt: true,
          embeddingVector: true, // 使用pgvector格式
          embedding: true, // 向后兼容
        },
      });

      allSkills.push(...skills);
    }

    return allSkills;
  }

  /**
   * 使用pgvector进行高效的向量相似度搜索
   * 利用PostgreSQL的pgvector扩展和HNSW索引
   */
  async vectorSearch(
    queryEmbedding: number[],
    options: {
      limit?: number;
      minSimilarity?: number;
      category?: string;
      language?: string;
      source?: string;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 20,
      minSimilarity = 0.3,
      category,
      language,
      source,
    } = options;

    try {
      // 构建WHERE条件（统一公开可见性约束，不含占位符，参数索引从 1 开始）
      const whereConditions: string[] = [PUBLIC_SKILL_SQL, '"embeddingVector" IS NOT NULL'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any[] = [];
      let paramIndex = 1;

      if (category) {
        whereConditions.push(`category = $${paramIndex}`);
        params.push(category);
        paramIndex++;
      }

      if (language) {
        whereConditions.push(`$${paramIndex} = ANY(languages)`);
        params.push(language);
        paramIndex++;
      }

      if (source) {
        whereConditions.push(`source = $${paramIndex}`);
        params.push(source);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');

      // 使用pgvector的余弦相似度操作符 (<=>)
      // 注意：pgvector返回的是距离（0-2），需要转换为相似度（1 - distance/2）
      const query = `
        SELECT 
          id, name, slug, description, category, subcategory,
          tags, languages, "qualityScore", "starCount", "downloadCount",
          "authorName", "repositoryUrl", "documentationUrl", source,
          "updatedAt",
          (1 - ("embeddingVector" <=> $${paramIndex}::vector) / 2) as similarity
        FROM skills
        WHERE ${whereClause}
          AND (1 - ("embeddingVector" <=> $${paramIndex}::vector) / 2) >= $${paramIndex + 1}
        ORDER BY "embeddingVector" <=> $${paramIndex}::vector
        LIMIT $${paramIndex + 2}
      `;

      params.push(
        `[${queryEmbedding.join(',')}]`, // 转换为vector格式
        minSimilarity,
        limit
      );

      const results = await prisma.$queryRawUnsafe(query, ...params) as SearchResult[];
      
      console.log(`🚀 [pgvector] 向量搜索完成，返回 ${results.length} 个结果`);
      
      return results;
    } catch (error) {
      console.error('❌ pgvector搜索失败，回退到应用层计算:', error);
      // 如果pgvector不可用，回退到应用层计算
      return this.fallbackVectorSearch(queryEmbedding, options);
    }
  }

  /**
   * 回退方案：应用层向量相似度计算
   * 当pgvector不可用时使用
   */
  private async fallbackVectorSearch(
    queryEmbedding: number[],
    options: {
      limit?: number;
      minSimilarity?: number;
      category?: string;
      language?: string;
      source?: string;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 20,
      minSimilarity = 0.3,
      category,
      language,
      source,
    } = options;

    // 构建查询条件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      ...PUBLIC_SKILL_WHERE,
      // 优先使用 embeddingVector，如果为空则使用 embedding
      OR: [
        { embeddingVector: { not: { equals: [] } } },
        { embedding: { not: null } }
      ]
    };

    if (category) where.category = category;
    if (language) where.languages = { has: language };
    if (source) where.source = source;

    // 获取所有候选Skills
    const candidates = await prisma.skill.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        category: true,
        subcategory: true,
        tags: true,
        languages: true,
        qualityScore: true,
        starCount: true,
        downloadCount: true,
        authorName: true,
        repositoryUrl: true,
        documentationUrl: true,
        source: true,
        updatedAt: true,
        embeddingVector: true,
        embedding: true, // Include JSON embedding for fallback
      },
    });

    // 在应用层计算相似度
    const results = candidates
      .map(skill => {
        // Support both embeddingVector and JSON embedding
        let vector: number[] | null = skill.embeddingVector as unknown as number[];
        if (!vector || (Array.isArray(vector) && vector.length === 0)) {
          vector = skill.embedding as unknown as number[];
        }
        
        if (!vector || !Array.isArray(vector)) return null;

        const similarity = this.calculateCosineSimilarity(
          queryEmbedding,
          vector
        );

        if (similarity < minSimilarity) return null;

        return {
          ...skill,
          similarity,
        } as SearchResult;
      })
      .filter((result): result is NonNullable<typeof result> => result !== null)
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);

    console.log(`🔄 [Fallback] 应用层向量搜索完成，返回 ${results.length} 个结果`);
    
    return results;
  }

  /**
   * 计算余弦相似度
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * 预加载热门Skills的embeddings到内存
   * 用于加速常见搜索
   */
  async preloadPopularSkillsEmbeddings(limit = 1000): Promise<void> {
    console.log(`📦 预加载前 ${limit} 个热门Skills的embeddings...`);

    // TODO: 修复 Prisma embeddingVector 字段类型问题
    /*
    const popularSkills = await prisma.skill.findMany({
      where: {
        status: 'APPROVED',
      },
      orderBy: [
        { downloadCount: 'desc' },
        { qualityScore: 'desc' },
      ],
      take: limit,
      select: {
        id: true,
        name: true,
        embeddingVector: true,
      },
    });

    console.log(`✅ 已预加载 ${popularSkills.length} 个Skills的embeddings`);
    
    // 这里可以将embeddings存储到全局缓存或Redis
    // 实际实现取决于缓存策略
    */
    console.log('⚠️ 预加载功能暂时禁用，待修复');
  }

  /**
   * 获取搜索性能统计
   */
  async getPerformanceStats(): Promise<{
    totalSkills: number;
    skillsWithEmbeddings: number;
    averageQualityScore: number;
    topCategories: Array<{ category: string; count: number }>;
  }> {
    const totalSkills = await prisma.skill.count({
      where: { ...PUBLIC_SKILL_WHERE },
    });

    const skillsWithEmbeddings = await prisma.skill.count({
      where: {
        ...PUBLIC_SKILL_WHERE,
        // TODO: 添加 embeddingVector 过滤条件
      },
    });

    const avgQuality = await prisma.skill.aggregate({
      where: { ...PUBLIC_SKILL_WHERE },
      _avg: { qualityScore: true },
    });

    const categoryStats = await prisma.skill.groupBy({
      by: ['category'],
      where: { ...PUBLIC_SKILL_WHERE },
      _count: true,
      orderBy: {
        _count: { category: 'desc' },
      },
      take: 10,
    });

    return {
      totalSkills,
      skillsWithEmbeddings,
      averageQualityScore: avgQuality._avg.qualityScore || 0,
      topCategories: categoryStats.map(stat => ({
        category: stat.category,
        count: stat._count,
      })),
    };
  }
}

// 导出单例实例
export const batchSearchOptimizer = new BatchSearchOptimizer();
