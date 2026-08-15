import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse, forbiddenResponse } from '@/lib/api-response';

/**
 * DELETE /api/namespaces/[slug]/members/[userId]
 * 移除命名空间成员
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return unauthorizedResponse();
    }

    const { slug, userId } = await params;

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

    // 权限检查：只有 OWNER 或 ADMIN 可以移除成员
    const currentUserMember = namespace.members.find(
      (m: { userId: string; role: string }) => m.userId === session.user?.id
    );

    if (!currentUserMember || !['OWNER', 'ADMIN'].includes(currentUserMember.role)) {
      return forbiddenResponse('您没有权限管理此命名空间的成员');
    }

    // 不能移除 OWNER
    const targetMember = namespace.members.find((m: { userId: string; role: string }) => m.userId === userId);
    if (!targetMember) {
      return notFoundResponse('该用户不是命名空间成员');
    }

    if (targetMember.role === 'OWNER') {
      return forbiddenResponse('不能移除所有者');
    }

    // 如果是 ADMIN 尝试移除其他 ADMIN 或 OWNER，需要是 OWNER 才行
    if (
      currentUserMember.role === 'ADMIN' &&
      ['OWNER', 'ADMIN'].includes(targetMember.role)
    ) {
      return forbiddenResponse('只有所有者可以移除管理员');
    }

    // 移除成员
    await prisma.namespaceMember.delete({
      where: {
        namespaceId_userId: {
          namespaceId: namespace.id,
          userId,
        },
      },
    });

    // 更新成员数量
    await prisma.namespace.update({
      where: { id: namespace.id },
      data: {
        memberCount: {
          decrement: 1,
        },
      },
    });

    return successResponse({ message: '成员已移除' });
  } catch (error) {
    console.error('移除命名空间成员失败:', error);
    return errorResponse('移除命名空间成员失败', 500);
  }
}
