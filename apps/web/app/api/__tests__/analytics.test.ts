/**
 * Analytics Overview API 测试
 *
 * 测试 /api/analytics/overview 端点
 * 注意：此路由是公开 API，不进行认证检查
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET } from '../analytics/overview/route';

// Access global Prisma mock
const prismaMock = (global as any).__mockPrisma;

describe('Analytics API - GET /api/analytics/overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应该返回分析概览数据', async () => {
    // Mock all Prisma calls
    prismaMock.skill.count.mockResolvedValue(100);
    prismaMock.skill.findMany
      // 1st call: download counts for totalDownloads
      .mockResolvedValueOnce([{ downloadCount: 3000 }, { downloadCount: 2000 }])
      // 2nd call: skills with ratings for averageRating
      .mockResolvedValueOnce([{ rating: 4.5 }, { rating: 4.0 }])
      // 3rd call: topSkills
      .mockResolvedValueOnce([
        { id: '1', name: 'Popular Skill', category: 'ai-agent', downloadCount: 500 },
      ]);
    prismaMock.user.count
      // 1st call: total users
      .mockResolvedValueOnce(200)
      // 2nd call: active users (last 30 days)
      .mockResolvedValueOnce(15);
    prismaMock.skill.groupBy.mockResolvedValue([
      { category: 'ai-agent', _count: 30 },
      { category: 'development', _count: 25 },
    ]);

    const request = new NextRequest('http://localhost:3000/api/analytics/overview');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toMatchObject({
      totalSkills: 100,
      totalDownloads: 5000,
      totalUsers: 200,
      activeUsers: 15,
      averageRating: 4.3, // (4.5 + 4.0) / 2 = 4.25 → parsed to 4.3
    });
    expect(data.data.skillsByCategory).toEqual(
      expect.arrayContaining([
        { category: 'ai-agent', count: 30 },
      ])
    );
    expect(data.data.topSkills).toHaveLength(1);
    expect(data.data.topSkills[0].name).toBe('Popular Skill');
  });

  it('应该处理空数据情况', async () => {
    prismaMock.skill.count.mockResolvedValue(0);
    prismaMock.skill.findMany
      .mockResolvedValueOnce([])  // download counts
      .mockResolvedValueOnce([])  // ratings
      .mockResolvedValueOnce([]); // top skills
    prismaMock.user.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prismaMock.skill.groupBy.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/analytics/overview');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.totalSkills).toBe(0);
    expect(data.data.totalDownloads).toBe(0);
    expect(data.data.totalUsers).toBe(0);
    expect(data.data.activeUsers).toBe(0);
    expect(data.data.averageRating).toBe(0);
    expect(data.data.skillsByCategory).toEqual([]);
    expect(data.data.topSkills).toEqual([]);
  });

  it('应该计算周增长率', async () => {
    prismaMock.skill.count
      .mockResolvedValueOnce(100)  // totalSkills
      .mockResolvedValueOnce(100)  // skills this week (weekGrowth calculation)
      .mockResolvedValueOnce(90);  // skills previous week
    prismaMock.skill.findMany
      .mockResolvedValueOnce([{ downloadCount: 5000 }])  // downloads
      .mockResolvedValueOnce([])   // ratings (0 avg)
      .mockResolvedValueOnce([]);  // top skills
    prismaMock.user.count
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(10);
    prismaMock.skill.groupBy.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/analytics/overview');
    const response = await GET(request);
    const data = await response.json();

    // weeklyGrowth = ((100 - 90) / 90) * 100 = 11
    expect(data.data.weeklyGrowth).toBe(11);
  });

  it('应该在周增长率为0时正确处理', async () => {
    prismaMock.skill.count
      .mockResolvedValueOnce(0)    // totalSkills
      .mockResolvedValueOnce(0)    // skills this week
      .mockResolvedValueOnce(0);   // skills previous week
    prismaMock.skill.findMany
      .mockResolvedValueOnce([])   // downloads
      .mockResolvedValueOnce([])   // ratings
      .mockResolvedValueOnce([]);  // top skills
    prismaMock.user.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prismaMock.skill.groupBy.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/analytics/overview');
    const response = await GET(request);
    const data = await response.json();

    expect(data.data.weeklyGrowth).toBe(0);
  });

  it('应该处理数据库错误', async () => {
    prismaMock.skill.count.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/analytics/overview');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
  });

  it('应该返回 skillsByCategory 格式正确', async () => {
    prismaMock.skill.count.mockResolvedValue(10);
    prismaMock.skill.findMany
      .mockResolvedValueOnce([{ downloadCount: 100 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.user.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1);
    prismaMock.skill.groupBy.mockResolvedValue([
      { category: 'ai-agent', _count: 5 },
      { category: 'data', _count: 3 },
    ]);

    const request = new NextRequest('http://localhost:3000/api/analytics/overview');
    const response = await GET(request);
    const data = await response.json();

    expect(data.data.skillsByCategory).toEqual([
      { category: 'ai-agent', count: 5 },
      { category: 'data', count: 3 },
    ]);
  });
});