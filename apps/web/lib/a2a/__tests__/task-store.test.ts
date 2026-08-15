/**
 * A2A Task Store 单元测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TaskStore } from '../task-store';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore();
  });

  const sampleMessage = {
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'Hello' }],
  };

  it('创建任务返回有效 ID 和初始状态', () => {
    const task = store.create({
      skillSlug: 'pdf',
      initialMessage: sampleMessage,
    });

    expect(task.id).toBeTruthy();
    expect(task.state).toBe('pending');
    expect(task.skillSlug).toBe('pdf');
    expect(task.messages).toHaveLength(1);
    expect(task.artifacts).toEqual([]);
    expect(task.createdAt).toBeTruthy();
    expect(task.updatedAt).toBeTruthy();
  });

  it('根据 ID 获取任务', () => {
    const created = store.create({ skillSlug: 'pdf', initialMessage: sampleMessage });
    const retrieved = store.get(created.id);
    expect(retrieved?.id).toBe(created.id);
  });

  it('未找到的任务返回 undefined', () => {
    expect(store.get('non-existent')).toBeUndefined();
  });

  it('列出所有任务', () => {
    store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    store.create({ skillSlug: 'b', initialMessage: sampleMessage });
    expect(store.list()).toHaveLength(2);
  });

  it('按状态过滤', () => {
    const t1 = store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    store.updateState(t1.id, 'completed');
    store.create({ skillSlug: 'b', initialMessage: sampleMessage });
    expect(store.list({ state: 'pending' })).toHaveLength(1);
    expect(store.list({ state: 'completed' })).toHaveLength(1);
  });

  it('按 skillSlug 过滤', () => {
    store.create({ skillSlug: 'pdf', initialMessage: sampleMessage });
    store.create({ skillSlug: 'docx', initialMessage: sampleMessage });
    expect(store.list({ skillSlug: 'pdf' })).toHaveLength(1);
  });

  it('limit 限制返回数量', () => {
    for (let i = 0; i < 5; i++) {
      store.create({ skillSlug: `s${i}`, initialMessage: sampleMessage });
    }
    expect(store.list({ limit: 3 })).toHaveLength(3);
  });

  it('更新任务状态', async () => {
    const t = store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    // 确保时间戳不同（create 和 update 在同一个毫秒内可能产生相同时间戳）
    await new Promise((r) => setTimeout(r, 5));
    const updated = store.updateState(t.id, 'running');
    expect(updated?.state).toBe('running');
    expect(updated?.updatedAt).not.toBe(t.updatedAt);
  });

  it('添加 artifact 追加到列表', () => {
    const t = store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    const updated = store.addArtifact(t.id, {
      name: 'result',
      parts: [{ type: 'text', text: 'OK' }],
    });
    expect(updated?.artifacts).toHaveLength(1);
    expect(updated?.artifacts[0]?.name).toBe('result');
  });

  it('取消 running 任务', () => {
    const t = store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    store.updateState(t.id, 'running');
    const cancelled = store.cancel(t.id);
    expect(cancelled?.state).toBe('cancelled');
  });

  it('不能取消已完成的任务', () => {
    const t = store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    store.updateState(t.id, 'completed');
    const result = store.cancel(t.id);
    expect(result?.state).toBe('completed');
  });

  it('删除任务', () => {
    const t = store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    expect(store.delete(t.id)).toBe(true);
    expect(store.get(t.id)).toBeUndefined();
  });

  it('size 返回任务总数', () => {
    expect(store.size()).toBe(0);
    store.create({ skillSlug: 'a', initialMessage: sampleMessage });
    store.create({ skillSlug: 'b', initialMessage: sampleMessage });
    expect(store.size()).toBe(2);
  });

  it('cleanup 删除旧的已完成任务', async () => {
    for (let i = 0; i < 5; i++) {
      const t = store.create({ skillSlug: `s${i}`, initialMessage: sampleMessage });
      store.updateState(t.id, 'completed');
      // 时间间隔确保 updatedAt 不同
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(store.cleanup(2)).toBe(3);
    expect(store.size()).toBe(2);
  });
});
