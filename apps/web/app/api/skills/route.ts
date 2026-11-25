import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PUBLIC_SKILL_WHERE } from '@/lib/governance/visibility';
import { auth } from '@/lib/auth-config';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api-response';

/**
 * GET /api/skills
 * 获取技能列表（支持分页、搜索、过滤）
 * Query params:
 * - page: 页码 (default: 1)
 * - limit: 每页数量 (default: 20)
 * - search: 搜索关键词
 * - status: 状态过滤 (APPROVED/DRAFT/PENDING_REVIEW等，支持多个，用逗号分隔)
 * - namespaceId: 命名空间ID
 * - authorId: 作者ID（用于获取用户的Skills）
 * - sortBy: 排序字段 (default: createdAt)
 * - sortOrder: 排序方向 (asc/desc, default: desc)
 * - draft: 是否为草稿箱模式 (true/false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 查询参数
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const statusParam = searchParams.get('status');
    const namespaceId = searchParams.get('namespaceId');
    const authorId = searchParams.get('authorId');
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const isDraft = searchParams.get('draft') === 'true';

    // 计算偏移量
    const skip = (page - 1) * limit;

    // 构建查询条件（可见性在鉴权后统一兜底）
    const where: Record<string, unknown> = {};

    // 搜索条件
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 会话与授权判定：管理员可查看任意状态；普通用户仅限自己的技能。
    const session = await auth();
    const isAdmin = session?.user?.is_admin === true;
    const viewerId = session?.user?.id;

    // 是否允许放宽公开约束：管理员，或明确查询自己的技能（authorId == 自己 / 草稿箱）。
    // 关键：查询"他人作者"永远不能放宽，否则会越权枚举他人草稿/被拒技能。
    const isOwnQuery = Boolean(viewerId) && (authorId === viewerId || isDraft);
    const mayRelax = isAdmin || isOwnQuery;

    // 状态过滤（支持多个状态，用逗号分隔）
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim());
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    // 草稿箱模式：只显示DRAFT状态
    if (isDraft) {
      where.status = 'DRAFT';
    }

    // 命名空间过滤
    if (namespaceId) {
      where.namespaceId = namespaceId;
    }

    // 作者过滤
    if (authorId) {
      where.authorId = authorId;
    }

    // 可见性兜底：只有管理员或查询自己的技能时才允许非公开状态/私有技能。
    // 其余情况强制 PUBLIC_SKILL_WHERE，覆盖上面任何放宽参数。
    if (!mayRelax) {
      Object.assign(where, PUBLIC_SKILL_WHERE);
    }

    // 查询总数
    const total = await prisma.skill.count({ where });

    // 查询数据
    const skills = await prisma.skill.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
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
        _count: {
          select: {
            versions: true,
          },
        },
      },
    });

    return successResponse({
      skills,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('获取技能列表失败:', error);
    return errorResponse('获取技能列表失败', 500);
  }
}

/**
 * POST /api/skills
 * 创建新技能
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { name, slug, description, category, tags, namespaceId, type, industry_tags, plugin_compatible, plugin_ids, input_schema, output_schema, category_path, locale } = body;

    // 验证必填字段
    if (!name || !slug) {
      return errorResponse('名称和 Slug 为必填项', 400);
    }

    // 验证技能类型
    const skillType = (type || 'PROMPT').toUpperCase();
    const validTypes = ['PROMPT', 'KNOWLEDGE', 'RULE', 'SKILL_PACK'];
    if (!validTypes.includes(skillType)) {
      return errorResponse(`无效的技能类型「${type}」，支持的类型：${validTypes.join(', ')}`, 400);
    }

    // 检查 slug 是否已存在
    const existingSkill = await prisma.skill.findUnique({
      where: { slug },
    });

    if (existingSkill) {
      return errorResponse('Slug 已存在', 400);
    }

    // 如果指定了命名空间，检查权限
    if (namespaceId) {
      const namespace = await prisma.namespace.findUnique({
        where: { id: namespaceId },
        include: { members: true },
      });

      if (!namespace) {
        return notFoundResponse('命名空间不存在');
      }

      // 检查用户是否是命名空间成员或所有者
      const isMember = namespace.members.some(
        (member: { userId: string }) => member.userId === session.user?.id
      );
      const isOwner = namespace.ownerId === session.user?.id;

      if (!isMember && !isOwner) {
        return errorResponse('没有权限在此命名空间中创建技能', 403);
      }
    }

    // 创建技能
    const skill = await prisma.skill.create({
      data: {
        name,
        slug,
        description: description || '',
        category: category || 'other',
        tags: tags || [],
        authorId: session.user.id,
        namespaceId: namespaceId || null,
        status: 'DRAFT',
        version: '1.0.0',
        type: skillType as 'PROMPT' | 'KNOWLEDGE' | 'RULE' | 'SKILL_PACK',
        industryTags: industry_tags || [],
        pluginCompatible: plugin_compatible || false,
        pluginIds: plugin_ids || [],
        inputSchema: input_schema || undefined,
        outputSchema: output_schema || undefined,
        categoryPath: category_path || null,
        locale: locale || 'zh-CN',
      },
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
    });

    return successResponse(skill, 201);
  } catch (error) {
    console.error('创建技能失败:', error);
    return errorResponse('创建技能失败', 500);
  }
}

/**
 * PATCH /api/skills/batch
 * 批量操作Skills（发布、归档、删除等）
 * Body:
 * - skillIds: string[] - Skills ID列表
 * - action: 'publish' | 'archive' | 'delete' | 'draft' - 操作类型
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { skillIds, action } = body;

    // 验证参数
    if (!skillIds || !Array.isArray(skillIds) || skillIds.length === 0) {
      return errorResponse('请提供有效的Skills ID列表', 400);
    }

    if (!action || !['publish', 'archive', 'delete', 'draft'].includes(action)) {
      return errorResponse('无效的操作类型', 400);
    }

    const userId = session.user.id;

    // 验证用户是否有权限操作这些Skills
    const skills = await prisma.skill.findMany({
      where: {
        id: { in: skillIds },
        authorId: userId, // 只能操作自己的Skills
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (skills.length !== skillIds.length) {
      return errorResponse('部分Skills不存在或没有权限操作', 403);
    }

    let result;

    // 执行批量操作
    switch (action) {
      case 'publish':
        // 批量发布
        result = await prisma.skill.updateMany({
          where: {
            id: { in: skillIds },
            authorId: userId,
          },
          data: {
            status: 'PENDING_REVIEW', // 发布后进入审核状态
            updatedAt: new Date(),
          },
        });
        break;

      case 'archive':
        // 批量归档
        result = await prisma.skill.updateMany({
          where: {
            id: { in: skillIds },
            authorId: userId,
          },
          data: {
            status: 'ARCHIVED',
            updatedAt: new Date(),
          },
        });
        break;

      case 'draft':
        // 批量转为草稿
        result = await prisma.skill.updateMany({
          where: {
            id: { in: skillIds },
            authorId: userId,
          },
          data: {
            status: 'DRAFT',
            updatedAt: new Date(),
          },
        });
        break;

      case 'delete':
        // 批量删除
        result = await prisma.skill.deleteMany({
          where: {
            id: { in: skillIds },
            authorId: userId,
          },
        });
        break;

      default:
        return errorResponse('不支持的操作类型', 400);
    }

    // 记录审计日志
    await prisma.auditLog.createMany({
      data: skillIds.map(skillId => ({
        action: `SKILL_BATCH_${action.toUpperCase()}`,
        resourceType: 'Skill',
        resourceId: skillId,
        actorId: userId,
        metadata: {
          action,
          skillIds,
        },
      })),
    });

    return successResponse({
      message: `成功${getActionMessage(action)} ${result.count} 个Skills`,
      count: result.count,
      action,
    });
  } catch (error) {
    console.error('批量操作失败:', error);
    return errorResponse('批量操作失败', 500);
  }
}

/**
 * 获取操作的中文描述
 */
function getActionMessage(action: string): string {
  const messages: Record<string, string> = {
    publish: '发布',
    archive: '归档',
    delete: '删除',
    draft: '转为草稿',
  };
  return messages[action] || '操作';
}
