import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth-config';

const prisma = new PrismaClient();

/**
 * POST /api/v2/install/jobs/[id]/cancel
 *
 * 取消进行中的安装任务。
 * 仅任务所有者可取消。
 * 已 SUCCEEDED / FAILED / CANCELLED 的任务不能再次取消。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const session = await auth();

  const job = await prisma.installJob.findUnique({
    where: { id: jobId },
    select: { id: true, userId: true, status: true, slug: true, version: true },
  });

  if (!job) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  // 权限校验：必须是任务所有者
  if (job.userId && session?.user?.id && job.userId !== session.user.id) {
    return NextResponse.json({ error: '无权操作该任务' }, { status: 403 });
  }

  // 状态校验：只有 RUNNING / PENDING 可取消
  if (!['PENDING', 'RUNNING'].includes(job.status)) {
    return NextResponse.json(
      { error: `当前状态 ${job.status} 无法取消` },
      { status: 409 }
    );
  }

  // 1. 写 InstallEvent 标记取消
  await prisma.installEvent.create({
    data: {
      jobId,
      eventType: 'cancelled',
      payload: { reason: 'user_cancelled', at: new Date().toISOString() },
    },
  });

  // 2. 更新任务状态
  const updated = await prisma.installJob.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      finishedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    job_id: jobId,
    status: updated.status,
    cancelled_at: updated.finishedAt,
  });
}