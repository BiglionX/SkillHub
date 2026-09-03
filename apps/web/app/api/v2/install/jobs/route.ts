import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
// v2.0.7+：SkillHub 已从 NextAuth.js 迁移到 NvwaX OIDC，getServerSession 替换为 auth()。
// 两者签名等价（返回 Session | null），保留原 next-auth 风格调用。
import { auth } from '@/lib/auth-config';

const prisma = new PrismaClient();

/**
 * POST /api/v2/install/jobs
 * 创建安装任务（A 类 Skill 一键安装入口）
 *
 * 流程：
 *   1. 校验 Skill 存在 + deliveryCategory === 'ENVIRONMENT_DEPENDENT'
 *   2. 查找匹配的剧本（内置或发布者声明）
 *   3. 创建 InstallJob 记录
 *   4. 返回 deep_link = skillhub://install/{slug}?version={v}&job={jobId}
 *   5. Web 前端用 iframe.src 唤起助手
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const body = await req.json();
  const slug: string = body.slug;
  const version: string = body.version || '1.0.0';

  if (!slug) {
    return NextResponse.json({ error: 'slug 必填' }, { status: 400 });
  }

  // 1. 加载 Skill
  const skill = await prisma.skill.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      version: true,
      deliveryCategory: true,
      executionConfig: true,
      softwareTags: { select: { softwareTag: { select: { name: true } } } },
    },
  });

  if (!skill) {
    return NextResponse.json({ error: 'Skill 不存在' }, { status: 404 });
  }
  if (skill.deliveryCategory !== 'ENVIRONMENT_DEPENDENT') {
    return NextResponse.json(
      { error: '该 Skill 不是环境依赖型，请使用对应流程' },
      { status: 400 }
    );
  }

  // 2. 找匹配的剧本
  const softwareTagName = skill.softwareTags[0]?.softwareTag.name;
  const playbookId = `${softwareTagName}-plugin@v1`; // MVP 简化：固定规则

  const playbook = await prisma.playbookDefinition.findUnique({
    where: { id: playbookId },
  });

  if (!playbook) {
    return NextResponse.json(
      {
        error: '暂不支持该软件的自动安装',
        hint: '您可以手动安装，或选择降级流程图',
        software: softwareTagName,
      },
      { status: 404 }
    );
  }

  // 3. 创建任务
  const jobId = crypto.randomBytes(12).toString('hex');
  const job = await prisma.installJob.create({
    data: {
      id: jobId,
      userId: session?.user?.id,
      slug,
      version,
      playbookId: playbook.id,
      playbookSource: 'BUILTIN',
      status: 'PENDING',
    },
  });

  // 4. 构造 deep link
  const deepLink = `skillhub://install/${slug}?version=${encodeURIComponent(version)}&job=${jobId}`;

  return NextResponse.json(
    {
      job_id: jobId,
      status: job.status,
      deep_link: deepLink,
      playbook: {
        id: playbook.id,
        software: playbook.software,
        description: '内置剧本',
      },
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 分钟
    },
    { status: 201 }
  );
}

/**
 * GET /api/v2/install/jobs
 * 列出当前用户的安装任务
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const limit = parseInt(url.searchParams.get('limit') || '20');

  const jobs = await prisma.installJob.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status: status as 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });

  return NextResponse.json({ jobs });
}