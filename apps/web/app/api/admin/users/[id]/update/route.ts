import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// 验证 schema
const updateUserSchema = z.object({
  name: z.string().min(2, '姓名至少2个字符').max(50, '姓名不能超过50个字符').optional(),
  email: z.string().email('请输入有效的邮箱地址').optional(),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
  isDisabled: z.boolean().optional(),
});

/**
 * PATCH /api/admin/users/[id]
 * 更新用户信息
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

    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    if (!adminEmails.includes(session.user.email || '')) {
      return NextResponse.json(
        { error: '需要管理员权限' },
        { status: 403 }
      );
    }

    const userId = (await params).id;
    const body = await request.json();

    // 验证输入
    const validationResult = updateUserSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: '输入验证失败',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    // 验证用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 如果修改邮箱，检查是否已存在
    if (body.email && body.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (emailExists) {
        return NextResponse.json(
          { error: '该邮箱已被其他用户使用' },
          { status: 400 }
        );
      }
    }

    // 更新用户
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.email && { email: body.email }),
        ...(body.role && { role: body.role }),
        ...(body.isDisabled !== undefined && { isDisabled: body.isDisabled }),
      },
    });

    // 记录审计日志
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (body.name && body.name !== existingUser.name) {
      changes.name = { old: existingUser.name, new: body.name };
    }
    if (body.email && body.email !== existingUser.email) {
      changes.email = { old: existingUser.email, new: body.email };
    }
    // 使用类型断言访问 role 和 isDisabled 字段
    const userWithRole = existingUser as typeof existingUser & { role?: string; isDisabled?: boolean };
    if (body.role && body.role !== userWithRole.role) {
      changes.role = { old: userWithRole.role, new: body.role };
    }
    if (body.isDisabled !== undefined && body.isDisabled !== userWithRole.isDisabled) {
      changes.isDisabled = { old: userWithRole.isDisabled, new: body.isDisabled };
    }

    if (Object.keys(changes).length > 0) {
      await prisma.auditLog.create({
        data: {
          action: 'USER_UPDATED',
          resourceType: 'User',
          resourceId: userId,
          actorId: session.user.id || undefined,
          changes: changes as unknown as object,
          metadata: {
            userEmail: updatedUser.email,
            userName: updatedUser.name,
          },
        },
      });
    }

    // 返回更新后的用户信息（不包含敏感数据）
     
    const { password: _unusedPassword, ...userWithoutPassword } = updatedUser;
    
    return NextResponse.json({
      success: true,
      message: '用户信息更新成功',
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('更新用户失败:', error);
    return NextResponse.json(
      { error: '更新失败，请重试' },
      { status: 500 }
    );
  }
}
