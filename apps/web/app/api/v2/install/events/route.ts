import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/v2/install/events
 * 助手上报安装进度（M2）
 *
 * 助手调用此接口写入 InstallEvent 记录，
 * Web 端通过 SSE 订阅 jobs/[id]/events 拿到推送。
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job_id, events } = body as {
    job_id: string;
    events: Array<{
      event_type: string;
      step_id?: string;
      step_type?: string;
      payload?: Record<string, unknown>;
      occurred_at?: string;
    }>;
  };

  if (!job_id || !Array.isArray(events)) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  // 验证任务存在
  const job = await prisma.installJob.findUnique({
    where: { id: job_id },
    select: { id: true },
  });

  if (!job) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  // 批量写入
  const created = await prisma.installEvent.createMany({
    data: events.map((e) => ({
      jobId: job_id,
      stepId: e.step_id,
      stepType: e.step_type,
      eventType: e.event_type,
      payload: e.payload || null,
      occurredAt: e.occurred_at ? new Date(e.occurred_at) : new Date(),
    })),
  });

  // 更新任务状态（如果事件包含终结事件）
  const finalEvent = events.find((e) =>
    ['succeeded', 'failed', 'cancelled'].includes(e.event_type)
  );
  if (finalEvent) {
    const statusMap: Record<string, 'SUCCEEDED' | 'FAILED' | 'CANCELLED'> = {
      succeeded: 'SUCCEEDED',
      failed: 'FAILED',
      cancelled: 'CANCELLED',
    };
    await prisma.installJob.update({
      where: { id: job_id },
      data: {
        status: statusMap[finalEvent.event_type],
        finishedAt: new Date(),
        errorCode: finalEvent.payload?.error_code,
        errorMessage: finalEvent.payload?.error_message,
      },
    });
  }

  return NextResponse.json({ ok: true, count: created.count });
}