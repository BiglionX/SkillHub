/**
 * A2A Task Store
 *
 * 内存任务存储（生产环境建议替换为 Redis 或 PostgreSQL）。
 *
 * 任务生命周期：
 *   pending → running → (completed | failed | cancelled)
 *                  ↓
 *            input-required → running
 *
 * 注意：这是简化实现，适用于单机部署。
 * 多实例部署时需替换为共享存储。
 */

import { randomUUID } from 'crypto';
import type { Task, TaskState, Message, Artifact } from './schemas';

class TaskStore {
  private tasks: Map<string, Task> = new Map();

  /**
   * 创建新任务
   */
  create(params: {
    skillSlug: string;
    initialMessage: Message;
    metadata?: Record<string, unknown>;
  }): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      skillSlug: params.skillSlug,
      state: 'pending',
      messages: [params.initialMessage],
      artifacts: [],
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * 根据 ID 获取任务
   */
  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * 列出任务（可选按状态过滤）
   */
  list(filter?: { state?: TaskState; skillSlug?: string; limit?: number }): Task[] {
    let results = Array.from(this.tasks.values());
    if (filter?.state) {
      results = results.filter((t) => t.state === filter.state);
    }
    if (filter?.skillSlug) {
      results = results.filter((t) => t.skillSlug === filter.skillSlug);
    }
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }
    return results;
  }

  /**
   * 更新任务状态
   */
  updateState(
    id: string,
    state: TaskState,
    options?: { error?: string; artifact?: Artifact; message?: Message },
  ): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const now = new Date().toISOString();
    const updated: Task = {
      ...task,
      state,
      updatedAt: now,
    };
    if (options?.error !== undefined) updated.error = options.error;
    if (options?.artifact) updated.artifacts = [...task.artifacts, options.artifact];
    if (options?.message) updated.messages = [...task.messages, options.message];

    this.tasks.set(id, updated);
    return updated;
  }

  /**
   * 添加 artifact
   */
  addArtifact(id: string, artifact: Artifact): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    return this.updateState(id, task.state, { artifact });
  }

  /**
   * 取消任务
   */
  cancel(id: string): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    if (task.state === 'completed' || task.state === 'failed' || task.state === 'cancelled') {
      return task;
    }
    return this.updateState(id, 'cancelled');
  }

  /**
   * 删除任务（清理）
   */
  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  /**
   * 获取任务总数
   */
  size(): number {
    return this.tasks.size;
  }

  /**
   * 清理已完成/失败/取消的任务（保留最近 N 条）
   */
  cleanup(keepCount = 1000): number {
    const all = Array.from(this.tasks.values());
    const finished = all.filter(
      (t) =>
        t.state === 'completed' ||
        t.state === 'failed' ||
        t.state === 'cancelled',
    );
    if (finished.length <= keepCount) return 0;
    finished.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const toDelete = finished.slice(0, finished.length - keepCount);
    toDelete.forEach((t) => this.tasks.delete(t.id));
    return toDelete.length;
  }
}

// 单例
let storeInstance: TaskStore | null = null;
export function getTaskStore(): TaskStore {
  if (!storeInstance) {
    storeInstance = new TaskStore();
  }
  return storeInstance;
}

export { TaskStore };
