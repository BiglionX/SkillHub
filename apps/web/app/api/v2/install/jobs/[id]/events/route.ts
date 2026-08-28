import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/v2/install/jobs/[id]/events
 *
 * SSE 流式返回安装进度事件。
 *
 * 决策路径（M2）：
 *   - 助手 → 上报 progress（POST /api/v2/install/events，前端事件转发）
 *   - Web 订阅此 SSE → 实时显示进度
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  // 验证任务存在
  const job = await prisma.installJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true },
  });

  if (!job) {
    return new Response(JSON.stringify({ error: '任务不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // ignore
        }
      };

      // 1. 推送当前已存在的事件（断线重连补齐）
      const existing = await prisma.installEvent.findMany({
        where: { jobId },
        orderBy: { occurredAt: 'asc' },
        take: 200,
      });
      for (const evt of existing) {
        send({
          type: 'historical',
          event_type: evt.eventType,
          step_id: evt.stepId,
          step_type: evt.stepType,
          payload: evt.payload,
          occurred_at: evt.occurredAt.toISOString(),
        });
      }

      // 2. 如果任务已完成，直接结束
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.status)) {
        send({ type: 'closed', status: job.status });
        controller.close();
        return;
      }

      // 3. 轮询新事件（M2 简化：每 1 秒查 DB）
      let lastEventTime = existing.length > 0 ? existing[existing.length - 1].occurredAt : new Date(0);
      const startTime = Date.now();

      const pollInterval = setInterval(async () => {
        try {
          const newEvents = await prisma.installEvent.findMany({
            where: {
              jobId,
              occurredAt: { gt: lastEventTime },
            },
            orderBy: { occurredAt: 'asc' },
            take: 50,
          });

          for (const evt of newEvents) {
            send({
              type: 'live',
              event_type: evt.eventType,
              step_id: evt.stepId,
              step_type: evt.stepType,
              payload: evt.payload,
              occurred_at: evt.occurredAt.toISOString(),
            });
            lastEventTime = evt.occurredAt;
          }

          // 检查任务是否结束
          const current = await prisma.installJob.findUnique({
            where: { id: jobId },
            select: { status: true },
          });
          if (current && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(current.status)) {
            send({ type: 'closed', status: current.status });
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          // 30 分钟超时
          if (Date.now() - startTime > 30 * 60 * 1000) {
            send({ type: 'closed', status: 'TIMEOUT' });
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          // 心跳
          send({ type: 'heartbeat', ts: Date.now() });
        } catch (err) {
          send({ type: 'error', message: String(err) });
        }
      }, 1000);

      // 客户端断开
      req.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          // ignore: controller 可能已经关闭
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}