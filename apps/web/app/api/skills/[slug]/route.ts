import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse, forbiddenResponse } from '@/lib/api-response';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/skills/[slug]
 * 通过 slug 或 id 获取技能详情
 */
export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { slug } = await params;

    // 支持通过 id 或 slug 查询
    const where = slug.startsWith('skill_') || slug.length === 36
      ? { id: slug }
      : { slug };

    const skill = await prisma.skill.findUnique({
      where,
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
        versions: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
        _count: {
          select: {
            versions: true,
          },
        },
      },
    });

    if (!skill) {
      return notFoundResponse('技能不存在');
    }

    // 公开详情只允许访问已审核公开的技能；作者本人可访问自己的未公开技能。
    // 用显式布尔判断而非类型守卫，避免在此分支中把 skill 收窄为 never。
    const publiclyVisible = skill.status === 'APPROVED' && skill.isPublic === true;
    if (!publiclyVisible) {
      const session = await auth();
      if (!session?.user?.id || skill.authorId !== session.user.id) {
        return notFoundResponse('技能不存在');
      }
    }

    return successResponse(skill);
  } catch (error) {
    console.error('获取技能详情失败:', error);
    return errorResponse('获取技能详情失败', 500);
  }
}

/**
 * PUT /api/skills/[slug]
 * 通过 slug 或 id 更新技能
 */
export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return unauthorizedResponse();
    }

    const { slug } = await params;
    const body = await request.json();

    // 支持通过 id 或 slug 查询
    const where = slug.startsWith('skill_') || slug.length === 36
      ? { id: slug }
      : { slug };

    // 查找技能
    const skill = await prisma.skill.findUnique({
      where,
    });

    if (!skill) {
      return notFoundResponse('技能不存在');
    }

    // 检查权限（只有作者或管理员可以更新）
    if (skill.authorId !== session.user.id) {
      // TODO: 添加管理员检查
      return forbiddenResponse('没有权限更新此技能');
    }

    // 如果更新 slug，检查是否已存在
    if (body.slug && body.slug !== skill.slug) {
      const existingSkill = await prisma.skill.findUnique({
        where: { slug: body.slug },
      });

      if (existingSkill) {
        return errorResponse('Slug 已存在', 400);
      }
    }

    // 构建更新数据
    const updateData: {
      name?: string;
      slug?: string;
      description?: string;
      repositoryUrl?: string;
      category?: string;
      tags?: string[];
      namespaceId?: string;
    } = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.repositoryUrl !== undefined) updateData.repositoryUrl = body.repositoryUrl;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.namespaceId !== undefined) updateData.namespaceId = body.namespaceId;

    // 更新技能
    const updatedSkill = await prisma.skill.update({
      where: { id: skill.id },
      data: updateData,
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

    return successResponse(updatedSkill);
  } catch (error) {
    console.error('更新技能失败:', error);
    return errorResponse('更新技能失败', 500);
  }
}

/**
 * DELETE /api/skills/[slug]
 * 通过 slug 或 id 删除(归档)技能
 */
export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return unauthorizedResponse();
    }

    const { slug } = await params;

    // 支持通过 id 或 slug 查询
    const where = slug.startsWith('skill_') || slug.length === 36
      ? { id: slug }
      : { slug };

    // 查找技能
    const skill = await prisma.skill.findUnique({
      where,
    });

    if (!skill) {
      return notFoundResponse('技能不存在');
    }

    // 检查权限（只有作者或管理员可以删除）
    if (skill.authorId !== session.user.id) {
      // TODO: 添加管理员检查
      return forbiddenResponse('没有权限删除此技能');
    }

    // 归档技能（软删除）
    const archivedSkill = await prisma.skill.update({
      where: { id: skill.id },
      data: {
        status: 'ARCHIVED',
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

    return successResponse(archivedSkill);
  } catch (error) {
    console.error('删除技能失败:', error);
    return errorResponse('删除技能失败', 500);
  }
}
