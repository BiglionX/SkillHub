import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseConnection } from '@/lib/db-health';

// 强制动态渲染，因为使用了 request.url
export const dynamic = 'force-dynamic';

interface SkillWithRelations {
  id: string;
  name: string;
  slug: string;
  description: string;
  downloadCount: number;
  starCount: number;
  rating: number;
  source?: string | null;
  tags?: string[] | null;
  category?: string;
  subcategory?: string | null;
  confidence?: number | null;
  author?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  namespace?: {
    id: string;
    slug: string;
    name: string;
  } | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const query = searchParams.get('q');
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const language = searchParams.get('language');
    const source = searchParams.get('source');
    const license = searchParams.get('license');
    const minQualityParam = searchParams.get('minQuality');
    const minStarsParam = searchParams.get('minStars');
    const maxStarsParam = searchParams.get('maxStars');
    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    const sortBy = searchParams.get('sortBy') || 'relevance';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const skip = (page - 1) * limit;

    const minQuality = minQualityParam ? parseInt(minQualityParam) : undefined;
    const minStars = minStarsParam ? parseInt(minStarsParam) : undefined;
    const maxStars = maxStarsParam ? parseInt(maxStarsParam) : undefined;
    const dateFrom = dateFromParam ? new Date(dateFromParam) : undefined;
    const dateTo = dateToParam ? new Date(dateToParam) : undefined;

    // Build query conditions
    const where: Record<string, unknown> = {
      status: 'APPROVED',
      isPublic: true,
    };

    if (category) {
      where.category = category;
    }

    if (subcategory) {
      where.subcategory = subcategory;
    }

    if (language) {
      where.languages = { has: language };
    }

    if (source) {
      where.source = source;
    }

    if (license) {
      where.license = license;
    }

    if (minQuality) {
      where.qualityScore = { gte: minQuality };
    }

    if (minStars !== undefined || maxStars !== undefined) {
      const starCountCondition: Record<string, number> = {};
      if (minStars !== undefined) {
        starCountCondition.gte = minStars;
      }
      if (maxStars !== undefined) {
        starCountCondition.lte = maxStars;
      }
      where.starCount = starCountCondition;
    }

    if (dateFrom || dateTo) {
      const updatedAtCondition: Record<string, Date> = {};
      if (dateFrom) {
        updatedAtCondition.gte = dateFrom;
      }
      if (dateTo) {
        updatedAtCondition.lte = dateTo;
      }
      where.updatedAt = updatedAtCondition;
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: [query] } },
      ];
    }

    // Determine sort order
    type OrderByField = {
      downloadCount?: 'asc' | 'desc';
      qualityScore?: 'asc' | 'desc';
      updatedAt?: 'asc' | 'desc';
      starCount?: 'asc' | 'desc';
    };

    let orderBy: OrderByField = { downloadCount: 'desc' };
    switch (sortBy) {
      case 'quality':
        orderBy = { qualityScore: 'desc' };
        break;
      case 'updated':
        orderBy = { updatedAt: 'desc' };
        break;
      case 'stars':
        orderBy = { starCount: 'desc' };
        break;
      case 'downloads':
        orderBy = { downloadCount: 'desc' };
        break;
      default:
        orderBy = { downloadCount: 'desc' };
    }

    // Run queries in parallel
    const [total, skills, categoryStats] = await Promise.all([
      prisma.skill.count({ where }),
      prisma.skill.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          namespace: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
      }) as Promise<SkillWithRelations[]>,
      (prisma.skill.groupBy as unknown as (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>)({
        by: ['category'],
        _count: true,
        where: {
          status: 'APPROVED',
          isPublic: true,
        },
      }),
    ]);

    return Response.json({
      skills,
      total,
      categoryStats,
      databaseError: false,
    });
  } catch (error) {
    console.error('Failed to fetch skills data:', error);

    // Neon serverless 空闲后会休眠，连接类错误说明可能正在唤醒。
    // 用一次轻量 SELECT 1 探测是否已恢复：成功则前端可跳过倒计时立即重试，
    // 失败则前端展示倒计时等待唤醒。
    // 注意：首个查询的 connect_timeout 可能已耗时 8s，这里用 2s 硬上限封顶探测，
    // 避免叠加成 16s 触发 Vercel 的 10s 函数超时。
    const message = error instanceof Error ? error.message : String(error);
    const isConnectionError =
      message.includes('connection timed out') ||
      message.includes('terminating connection') ||
      message.includes('Connection terminated unexpectedly') ||
      message.includes('connection') ||
      message.includes('timeout');

    let recovered = false;
    if (isConnectionError) {
      try {
        recovered = await Promise.race([
          ensureDatabaseConnection(1, 0),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000)),
        ]);
      } catch {
        // 非连接类错误：ensureDatabaseConnection 会 throw，此处保持 recovered=false
      }
    }

    return Response.json({
      skills: [],
      total: 0,
      categoryStats: [],
      databaseError: true,
      recovered,
    });
  }
}
