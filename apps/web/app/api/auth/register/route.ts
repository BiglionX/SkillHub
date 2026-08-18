/**
 * POST /api/auth/register
 *
 * 本地用户注册 API（在 NvwaX OIDC 之外提供本地账号注册能力）
 *
 * 注册流程：
 * 1. 验证邮箱格式与密码强度
 * 2. 检查邮箱是否已被注册
 * 3. bcrypt 哈希密码后创建 User 记录
 * 4. 记录审计日志
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { validateEmail, validatePassword } from '@/lib/form-validation';

const registerSchema = z.object({
  name: z.string().min(2, '姓名至少2个字符').max(50, '姓名不能超过50个字符'),
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码长度至少为8个字符'),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. 验证输入格式
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: '输入验证失败', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { name, email, password } = validationResult.data;

    // 2. 验证邮箱格式
    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    // 3. 验证密码强度
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // 4. 检查邮箱是否已被注册
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: '该邮箱已被注册，请直接登录或使用其他邮箱' },
        { status: 409 }
      );
    }

    // 5. 哈希密码并创建用户
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'USER',
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    // 6. 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'USER_REGISTERED',
        resourceType: 'User',
        resourceId: user.id,
        changes: { name, email: user.email },
        status: 'success',
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: '注册成功',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Register API] Error:', error);
    return NextResponse.json(
      { error: '注册失败，请重试' },
      { status: 500 }
    );
  }
}
