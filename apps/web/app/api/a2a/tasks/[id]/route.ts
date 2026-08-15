/**
 * GET   /api/a2a/tasks/[id]   - 获取任务详情
 * PATCH /api/a2a/tasks/[id]   - 发送消息 / 更新任务
 *
 * 任务状态机：
 *   pending → running → (completed | failed | cancelled)
 *                  ↓
 *            input-required → running
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTaskStore } from '@/lib/a2a/task-store';
import { SendMessageRequestSchema } from '@/lib/a2a/schemas';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const store = getTaskStore();
    const task = store.get(id);

    if (!task) {
      return NextResponse.json(
        { error: 'TASK_NOT_FOUND', message: `Task not found: ${id}` },
        { status: 404 },
      );
    }

    return NextResponse.json(task, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[a2a/tasks/[id] GET] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to get task' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = SendMessageRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Send message validation failed',
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const store = getTaskStore();
    const task = store.get(id);

    if (!task) {
      return NextResponse.json(
        { error: 'TASK_NOT_FOUND', message: `Task not found: ${id}` },
        { status: 404 },
      );
    }

    if (task.state === 'completed' || task.state === 'failed' || task.state === 'cancelled') {
      return NextResponse.json(
        {
          error: 'TASK_NOT_MODIFIABLE',
          message: `Task is in terminal state: ${task.state}`,
        },
        { status: 409 },
      );
    }

    // 追加用户消息
    store.updateState(id, task.state, { message: parsed.data.message });

    // 模拟 agent 回复
    store.updateState(id, 'running');
    const updated = store.updateState(id, 'completed', {
      artifact: {
        name: 'response',
        mimeType: 'text/plain',
        parts: [
          {
            type: 'text',
            text: `Acknowledged: ${parsed.data.message.parts.map((p) => p.text).join(' ')}`,
          },
        ],
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[a2a/tasks/[id] PATCH] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to update task' },
      { status: 500 },
    );
  }
}
