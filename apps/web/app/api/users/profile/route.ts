/**
 * PUT /api/users/profile
 *
 * 更新当前登录用户的个人资料
 *
 * 可更新字段：name, bio, image
 * 邮箱不可更改（通过 OIDC 绑定）
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

const updateProfileSchema = z.object({
  name: z.string().min(2, '姓名至少2个字符').max(50, '姓名不能超过50个字符').optional(),
  bio: z.string().max(500, '简介不能超过500个字符').optional().nullable(),
  image: z.string().url('请输入有效的头像 URL').optional().nullable(),
});

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  try {
    // 1. 检查登录状态
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 2. 验证输入格式
    const validationResult = updateProfileSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: '输入验证失败', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { name, bio, image } = validationResult.data;

    // 3. 获取当前用户
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 4. 构建更新数据
    const updateData: { name?: string; image?: string | null; bio?: string | null } = {};
    if (name !== undefined) updateData.name = name;
    if (image !== undefined) updateData.image = image;
    if (bio !== undefined) updateData.bio = bio;

    // 5. 更新用户资料
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 6. 记录审计日志（仅当有实际变更时）
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (name && name !== currentUser.name) {
      changes.name = { old: currentUser.name, new: name };
    }
    if (image !== undefined && image !== currentUser.image) {
      changes.image = { old: currentUser.image, new: image };
    }
    if (bio !== undefined && bio !== currentUser.bio) {
      changes.bio = { old: currentUser.bio, new: bio };
    }

    if (Object.keys(changes).length > 0) {
      await prisma.auditLog.create({
        data: {
          action: 'PROFILE_UPDATED',
          resourceType: 'User',
          resourceId: currentUser.id,
          changes: changes as unknown as object,
          status: 'success',
          metadata: {
            userEmail: updatedUser.email,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: '个人资料更新成功',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        image: updatedUser.image,
      },
    });
  } catch (error) {
    console.error('[Profile Update API] Error:', error);
    return NextResponse.json(
      { error: '个人资料更新失败，请重试' },
      { status: 500 }
    );
  }
}
