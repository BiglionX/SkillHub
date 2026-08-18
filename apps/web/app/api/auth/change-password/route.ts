/**
 * POST /api/auth/change-password
 *
 * 修改当前登录用户的密码
 *
 * 流程：
 * 1. 验证当前密码（通过 bcrypt 比对）
 * 2. 验证新密码强度
 * 3. 检查新密码与当前密码不同
 * 4. 更新密码哈希
 * 5. 记录审计日志
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { validatePassword } from '@/lib/form-validation';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码为必填项'),
  newPassword: z.string()
    .min(10, '新密码长度至少为10个字符')
    .regex(/^(?=.*[a-zA-Z])(?=.*\d).+$/, '新密码必须包含字母和数字'),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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
    const validationResult = changePasswordSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: '输入验证失败', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validationResult.data;

    // 3. 获取用户并验证当前密码
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, password: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 如果用户没有设置本地密码（通过 OIDC 注册的用户），则不允许本地密码修改
    if (!user.password) {
      return NextResponse.json(
        { error: '您的账户通过第三方登录创建，暂不支持本地密码修改。请前往账户设置绑定本地密码或联系管理员。' },
        { status: 400 }
      );
    }

    // 4. 验证当前密码
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: '当前密码错误' },
        { status: 400 }
      );
    }

    // 5. 验证新密码强度
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // 6. 检查新密码与当前密码不同
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        { error: '新密码不能与当前密码相同' },
        { status: 400 }
      );
    }

    // 7. 更新密码
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    // 8. 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'PASSWORD_CHANGED',
        resourceType: 'User',
        resourceId: user.id,
        status: 'success',
        metadata: {
          userEmail: user.email,
          userName: user.name,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    console.error('[Change Password API] Error:', error);
    return NextResponse.json(
      { error: '密码修改失败，请重试' },
      { status: 500 }
    );
  }
}
