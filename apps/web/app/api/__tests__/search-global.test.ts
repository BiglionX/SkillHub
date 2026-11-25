/**
 * /api/search/global 安全测试
 * 公开搜索端点必须只读，不得触发爬虫写库
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const createMockFn = () => jest.fn<() => Promise<unknown>>();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    skill: {
      findMany: createMockFn(),
      count: createMockFn(),
      groupBy: createMockFn(),
    },
    $queryRawUnsafe: createMockFn(),
  },
}));

// 关键：mock CrawlerService，若 GET 触发爬虫写库，测试会失败
const mockSearchAndCrawl = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/services/CrawlerService', () => ({
  CrawlerService: jest.fn().mockImplementation(() => ({
    searchAndCrawl: mockSearchAndCrawl,
  })),
}));

import { GET } from '@/app/api/search/global/route';

/** 为两次 search 调用准备 count/data 的返回值 */
function mockEmptySearchResults() {
  (require('@/lib/prisma').prisma.$queryRawUnsafe as jest.Mock)
    .mockResolvedValueOnce([{ total: 0 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ total: 0 }])
    .mockResolvedValueOnce([]);
}

describe('GET /api/search/global', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('缺少 q 参数返回 400', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search/global'));
    expect(response.status).toBe(400);
  });

  it('绝不触发爬虫写库（匿名公开端点只读）', async () => {
    mockEmptySearchResults();
    const response = await GET(
      new NextRequest('http://localhost/api/search/global?q=test'),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('local');
    expect(data).toHaveProperty('global');
    expect(mockSearchAndCrawl).not.toHaveBeenCalled();
  });

  it('local 与 global 结果都来自只读查询', async () => {
    mockEmptySearchResults();
    const response = await GET(
      new NextRequest('http://localhost/api/search/global?q=test'),
    );
    const data = await response.json();

    // SearchService.search 两次调用（本地一次、github source 一次）
    // 每次 count + findMany
    expect(data.local.skills).toEqual([]);
    expect(data.global.skills).toEqual([]);
    expect(mockSearchAndCrawl).not.toHaveBeenCalled();
  });
});
