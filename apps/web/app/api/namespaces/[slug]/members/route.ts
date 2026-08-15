import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse, forbiddenResponse } from '@/lib/api-response';

/**
 * GET /api/namespaces/[slug]/members
 * 获取命名空间成员列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // 查找命名空间
    const namespace = await prisma.namespace.findUnique({
      where: { slug },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: {
            joinedAt: 'desc',
          },
        },
      },
    });

    if (!namespace) {
      return notFoundResponse('命名空间不存在');
    }

    return successResponse({
      namespace: {
        id: namespace.id,
        name: namespace.name,
        slug: namespace.slug,
      },
      members: namespace.members.map((member: { userId: string; role: string; joinedAt: Date; invitedBy: string | null; user: { id: string; name: string | null; email: string | null; image: string | null } }) => ({
        userId: member.userId,
        role: member.role,
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy,
        user: member.user,
      })),
    });
  } catch (error) {
    console.error('获取命名空间成员失败:', error);
    return errorResponse('获取命名空间成员失败', 500);
  }
}

/**
 * POST /api/namespaces/[slug]/members
 * 邀请新成员
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return unauthorizedResponse();
    }

    const { slug } = await params;
    const body = await request.json();
    const { userId, role } = body;

    // 验证必填字段
    if (!userId || !role) {
      return errorResponse('用户ID和角色为必填项', 400);
    }

    // 验证角色
    if (!['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
      return errorResponse('无效的角色', 400);
    }

    // 查找命名空间
    const namespace = await prisma.namespace.findUnique({
      where: { slug },
      include: {
        members: true,
      },
    });

    if (!namespace) {
      return notFoundResponse('命名空间不存在');
    }

    // 权限检查：只有 OWNER 或 ADMIN 可以添加成员
    const currentUserMember = namespace.members.find(
      (m: { userId: string; role: string }) => m.userId === session.user?.id
    );

    if (!currentUserMember || !['OWNER', 'ADMIN'].includes(currentUserMember.role)) {
      return forbiddenResponse('您没有权限管理此命名空间的成员');
    }

    // 检查用户是否已是成员
    const existingMember = namespace.members.find((m: { userId: string }) => m.userId === userId);
    if (existingMember) {
      return errorResponse('该用户已是命名空间成员', 400);
    }

    // 检查被邀请的用户是否存在
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return notFoundResponse('用户不存在');
    }

    // 添加成员
    const member = await prisma.namespaceMember.create({
      data: {
        namespaceId: namespace.id,
        userId,
        role: role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
        invitedBy: session.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // 更新成员数量
    await prisma.namespace.update({
      where: { id: namespace.id },
      data: {
        memberCount: {
          increment: 1,
        },
      },
    });

    return successResponse(
      {
        userId: member.userId,
        role: member.role,
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy,
        user: member.user,
      },
      201
    );
  } catch (error) {
    console.error('添加命名空间成员失败:', error);
    return errorResponse('添加命名空间成员失败', 500);
  }
}
