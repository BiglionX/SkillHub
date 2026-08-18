/**
 * POST /api/auth/register
 *
 * 统一用户注册 API
 *
 * 流程：
 * 1. 验证邮箱格式与密码强度
 * 2. 调用 NvwaX /api/portal/register 在 NvwaX 创建用户（统一身份）
 * 3. 在 SkillHub 本地创建用户记录（用于业务数据关联）
 * 4. 记录审计日志
 *
 * 注意：用户注册后需要通过邮箱激活 NvwaX 账户，
 *       然后可以通过 OIDC 登录 SkillHub。
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { validateEmail, validatePassword } from '@/lib/form-validation';

// NvwaX account portal 的 API 地址
const NVWAX_PORTAL_API = process.env.NVWAX_PORTAL_API || 'https://account.proclaw.cc/api';

const registerSchema = z.object({
  name: z.string().min(2, '姓名至少2个字符').max(50, '姓名不能超过50个字符'),
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(10, '密码长度至少为10个字符').regex(
    /^(?=.*[a-zA-Z])(?=.*\d).+$/,
    '密码必须包含字母和数字'
  ),
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
    const normalizedEmail = email.toLowerCase();

    // 2. 验证邮箱格式
    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    // 3. 验证密码强度（与 NvwaX 同步）
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // 4. 检查 SkillHub 本地是否已注册
    const existingLocalUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingLocalUser) {
      return NextResponse.json(
        { error: '该邮箱已在 SkillHub 注册，请直接登录' },
        { status: 409 }
      );
    }

    // 5. 调用 NvwaX API 在统一身份平台注册
    let nvwaResponse: Response;
    try {
      nvwaResponse = await fetch(`${NVWAX_PORTAL_API}/portal/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          locale: 'zh-CN',
        }),
      });
    } catch (networkError) {
      console.error('[Register API] NvwaX API network error:', networkError);
      return NextResponse.json(
        { error: '无法连接到统一身份服务，请稍后重试' },
        { status: 503 }
      );
    }

    const nvwaResult = await nvwaResponse.json().catch(() => ({}));

    if (!nvwaResponse.ok) {
      // NvwaX 返回错误
      if (nvwaResult.code === 'email_taken') {
        return NextResponse.json(
          { error: '该邮箱已被注册，请直接登录或使用其他邮箱' },
          { status: 409 }
        );
      }
      if (nvwaResult.code === 'weak_password') {
        return NextResponse.json(
          { error: '密码强度不足，密码至少10个字符且必须包含字母和数字' },
          { status: 400 }
        );
      }
      console.error('[Register API] NvwaX API error:', nvwaResult);
      return NextResponse.json(
        { error: nvwaResult.message || '统一身份服务注册失败' },
        { status: nvwaResponse.status }
      );
    }

    // 6. NvwaX 注册成功，在 SkillHub 本地创建用户记录
    // 注意：用户处于未激活状态，需要邮箱激活后才能通过 OIDC 登录
    const localUser = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        role: 'USER',
        // password 字段不设置，因为认证完全由 NvwaX 负责
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    // 7. 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'USER_REGISTERED',
        resourceType: 'User',
        resourceId: localUser.id,
        changes: { name, email: localUser.email, source: 'nvwaX_unified' },
        status: 'success',
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: '注册成功！请查收邮箱中的激活链接来完成账户激活，激活后即可通过统一登录访问 SkillHub。',
        user: {
          id: localUser.id,
          name: localUser.name,
          email: localUser.email,
        },
        activationRequired: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Register API] Error:', error);
    return NextResponse.json(
      { error: '注册失败，请稍后重试' },
      { status: 500 }
    );
  }
}
