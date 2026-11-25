/**
 * GET /api/v2/skills - 获取技能列表（支持过滤、搜索、分页）
 * POST /api/v2/skills - 创建新技能
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PUBLIC_SKILL_WHERE } from '@/lib/governance/visibility';
import { authenticateV2Request, v2SuccessResponse, v2ErrorResponse, unauthorizedResponse } from '@/lib/services/V2ApiAuth';

/**
 * GET /api/v2/skills
 * Query params: type, industry_tags[], q, page, limit, plugin_compatible
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type');
    const industryTags = searchParams.getAll('industry_tags[]');
    const q = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const pluginCompatible = searchParams.get('plugin_compatible');

    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: Record<string, unknown> = {};

    // 按类型过滤
    if (type) {
      where.type = type.toUpperCase();
    }

    // 按行业标签过滤
    if (industryTags.length > 0) {
      where.industryTags = { hasSome: industryTags };
    }

    // 关键词搜索
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    // 插件兼容过滤
    if (pluginCompatible === 'true') {
      where.pluginCompatible = true;
    } else if (pluginCompatible === 'false') {
      where.pluginCompatible = false;
    }

    // 默认只返回已审核公开的技能
    Object.assign(where, PUBLIC_SKILL_WHERE);

    // 查询
    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          author: { select: { id: true, name: true } },
          knowledgeFragment: {
            select: { id: true, version: true, contentType: true, vectorized: true, chunkCount: true },
          },
          _count: { select: { versions: true } },
        },
      }),
      prisma.skill.count({ where }),
    ]);

    const data = skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      type: skill.type,
      version: skill.version,
      industry_tags: skill.industryTags,
      plugin_compatible: skill.pluginCompatible,
      plugin_ids: skill.pluginIds,
      category_path: skill.categoryPath,
      locale: skill.locale,
      input_schema: skill.inputSchema,
      output_schema: skill.outputSchema,
      author: skill.author,
      knowledge: skill.knowledgeFragment || undefined,
      version_count: skill._count.versions,
      created_at: skill.createdAt.toISOString(),
      updated_at: skill.updatedAt.toISOString(),
    }));

    return v2SuccessResponse({
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('GET /api/v2/skills 失败:', error);
    return v2ErrorResponse('获取技能列表失败', 500);
  }
}

/**
 * POST /api/v2/skills
 * 创建新技能（v2 版本支持新增字段）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateV2Request(request);
    if (!auth.authenticated) {
      return unauthorizedResponse(auth.error || '认证失败');
    }

    const body = await request.json();
    const {
      name, slug, description, type,
      industry_tags, plugin_compatible, plugin_ids,
      input_schema, output_schema, category_path, locale,
    } = body;

    if (!name || !slug) {
      return v2ErrorResponse('名称和 Slug 为必填项', 400);
    }

    // 检查 slug 唯一性
    const existing = await prisma.skill.findUnique({ where: { slug } });
    if (existing) {
      return v2ErrorResponse('Slug 已存在', 400);
    }

    const skillType = (type || 'PROMPT').toUpperCase();
    const validTypes = ['PROMPT', 'KNOWLEDGE', 'RULE', 'SKILL_PACK'];
    if (!validTypes.includes(skillType)) {
      return v2ErrorResponse(`无效的技能类型「${type}」，支持的类型：${validTypes.join(', ')}`, 400);
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        slug,
        description: description || '',
        type: skillType as 'PROMPT' | 'KNOWLEDGE' | 'RULE' | 'SKILL_PACK',
        authorId: auth.userId ?? '',
        industryTags: industry_tags || [],
        pluginCompatible: plugin_compatible || false,
        pluginIds: plugin_ids || [],
        inputSchema: input_schema || undefined,
        outputSchema: output_schema || undefined,
        categoryPath: category_path || null,
        locale: locale || 'zh-CN',
        status: 'DRAFT',
        version: '1.0.0',
        category: 'other',
      },
    });

    return v2SuccessResponse({ data: { id: skill.id, slug: skill.slug, name: skill.name, type: skill.type } }, 201);
  } catch (error) {
    console.error('POST /api/v2/skills 失败:', error);
    return v2ErrorResponse('创建技能失败', 500);
  }
}
