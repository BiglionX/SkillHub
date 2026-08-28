/**
 * GET  /api/a2a/tasks        - 列出任务
 * POST /api/a2a/tasks        - 创建新任务
 *
 * A2A 任务管理入口：
 * - 创建任务：指定 skillSlug + 初始 message
 * - 列出任务：可按状态 / Skill 过滤
 *
 * 参考：https://a2a-protocol.org/latest/#/documentation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTaskStore } from '@/lib/a2a/task-store';
import { CreateTaskRequestSchema } from '@/lib/a2a/schemas';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state');
    const skillSlug = searchParams.get('skillSlug');
    const limit = parseInt(searchParams.get('limit') || '50');

    const store = getTaskStore();
    const tasks = store.list({
      state: state === null ? undefined : (state as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'input-required'),
      skillSlug: skillSlug || undefined,
      limit: Math.min(Math.max(1, limit), 200),
    });

    return NextResponse.json({
      count: tasks.length,
      total: store.size(),
      tasks,
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[a2a/tasks GET] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to list tasks' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateTaskRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Task request validation failed',
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const { skillSlug, messages, metadata, webhookUrl } = parsed.data;

    // 验证 Skill 存在
    const skill = await prisma.skill.findUnique({
      where: { slug: skillSlug },
      select: { id: true, slug: true, isPublic: true, status: true },
    });

    if (!skill || !skill.isPublic) {
      return NextResponse.json(
        {
          error: 'SKILL_NOT_FOUND',
          message: `Skill not found or not public: ${skillSlug}`,
        },
        { status: 404 },
      );
    }

    // 创建任务
    const store = getTaskStore();
    const initialMessage = messages[0];
    if (!initialMessage) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'messages array must contain at least one message',
        },
        { status: 400 },
      );
    }
    const task = store.create({
      skillSlug,
      initialMessage,
      metadata: {
        ...(metadata ?? {}),
        webhookUrl: webhookUrl ?? undefined,
        requestedAt: new Date().toISOString(),
      },
    });

    // 异步执行任务（立即转入 running 状态）
    // 注意：这是简化实现，生产环境应该使用 BullMQ 等队列
    setImmediate(() => {
      executeTaskAsync(task.id, skillSlug, messages).catch((err) => {
        console.error(`[a2a/tasks ${task.id}] execution failed:`, err);
      });
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('[a2a/tasks POST] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to create task' },
      { status: 500 },
    );
  }
}

/**
 * 异步执行任务（占位实现）
 *
 * 实际生产环境应该：
 * 1. 提交到 BullMQ 队列
 * 2. Worker 调用对应 Skill 的执行逻辑
 * 3. 完成后通过 webhook 通知
 */
async function executeTaskAsync(
  taskId: string,
  _skillSlug: string,
  _messages: unknown[],
): Promise<void> {
  const store = getTaskStore();
  store.updateState(taskId, 'running');

  // 模拟任务执行（实际应调用 Skill 执行器）
  await new Promise((resolve) => setTimeout(resolve, 100));

  store.updateState(taskId, 'completed', {
    artifact: {
      name: 'result',
      mimeType: 'application/json',
      parts: [
        {
          type: 'text',
          text: `Task ${taskId} executed (placeholder). Real execution pending Worker integration.`,
        },
      ],
    },
  });

  // TODO: 调用 webhook 通知
  const task = store.get(taskId);
  const webhookUrl = task?.metadata?.webhookUrl as string | undefined;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'task.completed', taskId }),
      });
    } catch (err) {
      console.warn(`[a2a/tasks ${taskId}] webhook failed:`, err);
    }
  }
}
