/**
 * POST /api/a2a/tasks/[id]/cancel
 *
 * 取消正在进行的任务。
 * 终态任务（completed/failed/cancelled）返回 409。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTaskStore } from '@/lib/a2a/task-store';

export const dynamic = 'force-dynamic';

export async function POST(
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

    if (
      task.state === 'completed' ||
      task.state === 'failed' ||
      task.state === 'cancelled'
    ) {
      return NextResponse.json(
        {
          error: 'TASK_NOT_CANCELLABLE',
          message: `Task is already in terminal state: ${task.state}`,
        },
        { status: 409 },
      );
    }

    const cancelled = store.cancel(id);
    return NextResponse.json(cancelled);
  } catch (error) {
    console.error('[a2a/tasks/[id]/cancel POST] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to cancel task' },
      { status: 500 },
    );
  }
}
