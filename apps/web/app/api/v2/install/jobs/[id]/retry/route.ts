import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth-config';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

/**
 * POST /api/v2/install/jobs/[id]/retry
 *
 * 重试失败的安装任务。
 * 仅 FAILED / CANCELLED 状态可重试。
 * 重试策略 = 创建新 job 并把原 playbookId 拷贝过去（不修改老任务）
 *
 * 返回：新 job_id + deep_link（前端重新唤起）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: oldJobId } = await params;
  const session = await auth();

  const oldJob = await prisma.installJob.findUnique({
    where: { id: oldJobId },
    select: {
      id: true,
      userId: true,
      status: true,
      slug: true,
      version: true,
      playbookId: true,
      playbookSource: true,
    },
  });

  if (!oldJob) {
    return NextResponse.json({ error: '原任务不存在' }, { status: 404 });
  }

  // 权限校验
  if (oldJob.userId && session?.user?.id && oldJob.userId !== session.user.id) {
    return NextResponse.json({ error: '无权重试该任务' }, { status: 403 });
  }

  // 状态校验：只能重试 FAILED / CANCELLED
  if (!['FAILED', 'CANCELLED'].includes(oldJob.status)) {
    return NextResponse.json(
      { error: `当前状态 ${oldJob.status} 无法重试` },
      { status: 409 }
    );
  }

  // 校验剧本仍然存在
  const playbook = await prisma.playbookDefinition.findUnique({
    where: { id: oldJob.playbookId },
  });
  if (!playbook) {
    return NextResponse.json({ error: '原剧本已被删除，无法重试' }, { status: 410 });
  }

  // 创建新任务
  const newJobId = crypto.randomBytes(12).toString('hex');
  const newJob = await prisma.installJob.create({
    data: {
      id: newJobId,
      userId: oldJob.userId,
      slug: oldJob.slug,
      version: oldJob.version,
      playbookId: oldJob.playbookId,
      playbookSource: oldJob.playbookSource,
      status: 'PENDING',
    },
  });

  const deepLink = `skillhub://install/${oldJob.slug}?version=${encodeURIComponent(oldJob.version)}&job=${newJobId}`;

  return NextResponse.json(
    {
      ok: true,
      new_job_id: newJobId,
      retry_of: oldJobId,
      status: newJob.status,
      deep_link: deepLink,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
    { status: 201 }
  );
}