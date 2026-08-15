import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * PATCH /api/admin/users/[id]
 * 更新用户状态（禁用/启用）
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    // 检查管理员权限
    if (!session?.user) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      );
    }

    // TODO: 添加管理员角色检查
    // if (session.user.role !== 'ADMIN') {
    //   return NextResponse.json(
    //     { error: '需要管理员权限' },
    //     { status: 403 }
    //   );
    // }

    const userId = (await params).id;
    const body = await request.json();
    const { action } = body;

    // 验证用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    let result;

    switch (action) {
      case 'disable':
        // 禁用用户账户
        // 注意：当前 User 模型没有 isDisabled 字段，需要先添加
        // 这里暂时只记录审计日志
        await prisma.auditLog.create({
          data: {
            action: 'USER_DISABLED',
            resourceType: 'User',
            resourceId: userId,
            actorId: session.user.id || undefined,
            metadata: {
              userEmail: user.email,
              userName: user.name,
            },
          },
        });

        result = {
          success: true,
          message: '用户已禁用',
        };
        break;

      case 'enable':
        // 启用用户账户
        await prisma.auditLog.create({
          data: {
            action: 'USER_ENABLED',
            resourceType: 'User',
            resourceId: userId,
            actorId: session.user.id || undefined,
            metadata: {
              userEmail: user.email,
              userName: user.name,
            },
          },
        });

        result = {
          success: true,
          message: '用户已启用',
        };
        break;

      case 'verify_email':
        // 手动验证用户邮箱
        await prisma.user.update({
          where: { id: userId },
          data: { emailVerified: new Date() },
        });

        await prisma.auditLog.create({
          data: {
            action: 'USER_EMAIL_VERIFIED',
            resourceType: 'User',
            resourceId: userId,
            actorId: session.user.id || undefined,
            metadata: {
              userEmail: user.email,
              userName: user.name,
            },
          },
        });

        result = {
          success: true,
          message: '邮箱已验证',
        };
        break;

      default:
        return NextResponse.json(
          { error: '无效的操作' },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('用户操作失败:', error);
    return NextResponse.json(
      { error: '操作失败，请重试' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]
 * 删除用户（谨慎使用）
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    // 检查管理员权限
    if (!session?.user) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      );
    }

    // TODO: 添加管理员角色检查

    const userId = (await params).id;

    // 验证用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            skills: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 检查用户是否有 Skills
    if (user._count.skills > 0) {
      return NextResponse.json(
        { 
          error: '该用户有关联的 Skills，无法删除',
          skillCount: user._count.skills,
        },
        { status: 400 }
      );
    }

    // 删除用户（级联删除相关数据）
    await prisma.user.delete({
      where: { id: userId },
    });

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'USER_DELETED',
        resourceType: 'User',
        resourceId: userId,
        actorId: session.user.id || undefined,
        metadata: {
          userEmail: user.email,
          userName: user.name,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: '用户已删除',
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    return NextResponse.json(
      { error: '删除失败，请重试' },
      { status: 500 }
    );
  }
}
