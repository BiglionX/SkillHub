import { prisma } from '@/lib/prisma';

/**
 * SQL 查询返回的技能行（来自 $queryRawUnsafe）
 */
export interface SkillRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  category: string;
  subcategory: string | null;
  tags: string[];
  languages: string[];
  qualityScore: number | null;
  starCount: number | null;
  downloadCount: number | null;
  authorName: string | null;
  repositoryUrl: string | null;
  documentationUrl: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  query?: string;
  category?: string;
  subcategory?: string;
  language?: string;
  minQualityScore?: number;
  source?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'relevance' | 'quality' | 'updated' | 'stars' | 'downloads';
}

/**
 * 搜索结果
 */
export interface SearchResult {
  skills: SkillRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query?: string;
}

/**
 * 搜索建议
 */
export interface SearchSuggestion {
  text: string;
  type: 'skill' | 'category' | 'tag';
}

/**
 * 搜索服务
 * 
 * 提供 Skills 的全文搜索功能
 */
export class SearchService {
  /**
   * 执行全文搜索
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const {
      query,
      category,
      subcategory,
      language,
      minQualityScore,
      source,
      page = 1,
      pageSize = 20,
      sortBy = 'relevance',
    } = options;

    // 构建 WHERE 条件
    const whereConditions: string[] = [];
    const params: (string | number | string[])[] = [];
    let paramIndex = 1;

    // 全文搜索条件
    if (query) {
      // 使用 PostgreSQL 全文搜索
      whereConditions.push(`
        (
          name ILIKE $${paramIndex} OR
          description ILIKE $${paramIndex} OR
          "authorName" ILIKE $${paramIndex} OR
          EXISTS (
            SELECT 1 FROM unnest(tags) AS tag 
            WHERE tag ILIKE $${paramIndex}
          )
        )
      `);
      params.push(`%${query}%`);
      paramIndex++;
    }

    // 分类过滤
    if (category) {
      whereConditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    // 子分类过滤
    if (subcategory) {
      whereConditions.push(`subcategory = $${paramIndex}`);
      params.push(subcategory);
      paramIndex++;
    }

    // 语言过滤
    if (language) {
      whereConditions.push(`$${paramIndex} = ANY(languages)`);
      params.push(language);
      paramIndex++;
    }

    // 质量评分过滤
    if (minQualityScore !== undefined) {
      whereConditions.push(`"qualityScore" >= $${paramIndex}`);
      params.push(minQualityScore);
      paramIndex++;
    }

    // 数据源过滤
    if (source) {
      whereConditions.push(`source = $${paramIndex}`);
      params.push(source);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 构建 ORDER BY
    let orderBy = '';
    switch (sortBy) {
      case 'quality':
        orderBy = 'ORDER BY "qualityScore" DESC NULLS LAST';
        break;
      case 'stars':
        orderBy = 'ORDER BY "starCount" DESC NULLS LAST';
        break;
      case 'downloads':
        orderBy = 'ORDER BY "downloadCount" DESC';
        break;
      case 'updated':
        orderBy = 'ORDER BY "updatedAt" DESC';
        break;
      case 'relevance':
      default:
        // 如果有查询词，按相关性排序；否则按更新时间
        if (query) {
          orderBy = `ORDER BY 
            CASE 
              WHEN name ILIKE $1 THEN 1
              WHEN description ILIKE $1 THEN 2
              ELSE 3
            END,
            "qualityScore" DESC NULLS LAST
          `;
        } else {
          orderBy = 'ORDER BY "updatedAt" DESC';
        }
        break;
    }

    // 计算总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM skills
      ${whereClause}
    `;
    
    const countResult = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(countQuery, ...params);
    const total = Number((countResult as Array<{ total: bigint | number }>)[0].total);

    // 分页查询
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      SELECT 
        id, name, slug, description, version, category, subcategory,
        tags, languages, "qualityScore", "starCount", "downloadCount",
        "authorName", "repositoryUrl", "documentationUrl", source,
        "createdAt", "updatedAt"
      FROM skills
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const skills = await prisma.$queryRawUnsafe<SkillRow[]>(
      dataQuery,
      ...params,
      pageSize,
      offset
    );

    return {
      skills,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      query,
    };
  }

  /**
   * 获取搜索建议
   */
  async getSuggestions(query: string, limit = 5): Promise<SearchSuggestion[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const suggestions: SearchSuggestion[] = [];

    try {
      // 1. Skill 名称建议
      const skillNames = await prisma.$queryRaw`
        SELECT DISTINCT name
        FROM skills
        WHERE name ILIKE ${`%${query}%`}
        LIMIT ${limit}
      `;
      
      (skillNames as Array<{ name: string }>).forEach(row => {
        suggestions.push({
          text: row.name,
          type: 'skill',
        });
      });

      // 2. 分类建议
      if (suggestions.length < limit) {
        const categories = await prisma.$queryRaw`
          SELECT DISTINCT category
          FROM skills
          WHERE category ILIKE ${`%${query}%`}
          LIMIT ${limit - suggestions.length}
        `;
        
        (categories as Array<{ category: string }>).forEach(row => {
          suggestions.push({
            text: row.category,
            type: 'category',
          });
        });
      }

      // 3. 标签建议
      if (suggestions.length < limit) {
        const tags = await prisma.$queryRaw`
          SELECT DISTINCT unnest(tags) as tag
          FROM skills
          WHERE unnest(tags) ILIKE ${`%${query}%`}
          LIMIT ${limit - suggestions.length}
        `;
        
        (tags as Array<{ tag: string }>).forEach(row => {
          suggestions.push({
            text: row.tag,
            type: 'tag',
          });
        });
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
    }

    return suggestions.slice(0, limit);
  }

  /**
   * 获取热门搜索词
   */
  async getPopularSearches(limit = 10): Promise<string[]> {
    // 基于最近更新的 skills 提取热门关键词
    const recentSkills = await prisma.skill.findMany({
      take: 100,
      orderBy: { updatedAt: 'desc' },
      select: {
        name: true,
        tags: true,
        category: true,
      },
    });

    // 简单的词频统计
    const wordFreq: Record<string, number> = {};
    
    recentSkills.forEach(skill => {
      // 从名称中提取单词
      skill.name.toLowerCase().split(/[\s-_]+/).forEach(word => {
        if (word.length > 3) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });
      
      // 从标签中统计
      skill.tags.forEach(tag => {
        wordFreq[tag.toLowerCase()] = (wordFreq[tag.toLowerCase()] || 0) + 1;
      });
    });

    // 返回最高频的词
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => word);
  }

  /**
   * 高级搜索（支持多条件组合）
   */
  async advancedSearch(filters: {
    query?: string;
    categories?: string[];
    languages?: string[];
    sources?: string[];
    minStars?: number;
    minQualityScore?: number;
    dateRange?: { from?: Date; to?: Date };
    page?: number;
    pageSize?: number;
  }): Promise<SearchResult> {
    const {
      query,
      categories,
      languages,
      sources,
      minStars,
      minQualityScore,
      dateRange,
      page = 1,
      pageSize = 20,
    } = filters;

    const whereConditions: string[] = [];
    const params: (string | number | Date | string[])[] = [];
    let paramIndex = 1;

    // 全文搜索
    if (query) {
      whereConditions.push(`
        (
          name ILIKE $${paramIndex} OR
          description ILIKE $${paramIndex}
        )
      `);
      params.push(`%${query}%`);
      paramIndex++;
    }

    // 多分类
    if (categories && categories.length > 0) {
      whereConditions.push(`category IN (${categories.map(() => `$${paramIndex++}`).join(', ')})`);
      params.push(...categories);
    }

    // 多语言
    if (languages && languages.length > 0) {
      const languageConditions = languages.map(() => `$${paramIndex++} = ANY(languages)`).join(' OR ');
      whereConditions.push(`(${languageConditions})`);
      params.push(...languages);
    }

    // 多数据源
    if (sources && sources.length > 0) {
      whereConditions.push(`source IN (${sources.map(() => `$${paramIndex++}`).join(', ')})`);
      params.push(...sources);
    }

    // 最小 Stars
    if (minStars !== undefined) {
      whereConditions.push(`"starCount" >= $${paramIndex}`);
      params.push(minStars);
      paramIndex++;
    }

    // 最小质量评分
    if (minQualityScore !== undefined) {
      whereConditions.push(`"qualityScore" >= $${paramIndex}`);
      params.push(minQualityScore);
      paramIndex++;
    }

    // 日期范围
    if (dateRange?.from) {
      whereConditions.push(`"updatedAt" >= $${paramIndex}`);
      params.push(dateRange.from);
      paramIndex++;
    }
    if (dateRange?.to) {
      whereConditions.push(`"updatedAt" <= $${paramIndex}`);
      params.push(dateRange.to);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 计算总数
    const countQuery = `SELECT COUNT(*) as total FROM skills ${whereClause}`;
    const countResult = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(countQuery, ...params);
    const total = Number((countResult as Array<{ total: bigint | number }>)[0].total);

    // 分页查询
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      SELECT 
        id, name, slug, description, category, subcategory,
        tags, languages, "qualityScore", "starCount", "downloadCount",
        source, "updatedAt"
      FROM skills
      ${whereClause}
      ORDER BY "qualityScore" DESC NULLS LAST, "updatedAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const skills = await prisma.$queryRawUnsafe<SkillRow[]>(
      dataQuery,
      ...params,
      pageSize,
      offset
    );

    return {
      skills,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      query,
    };
  }
}
