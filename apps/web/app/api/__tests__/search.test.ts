/**
 * Search API 测试
 * 
 * 测试 /api/search 端点的GET和POST方法
 * 使用 Prisma mock 替代 SearchService mock 以兼容 next/jest 模块解析
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Import the route handlers
import { GET, POST } from '../search/route';

// Access global Prisma mock
const prismaMock = global.__mockPrisma;

describe('Search API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/search', () => {
    it('应该返回搜索结果 - 基本关键词搜索', async () => {
      // Mock count query
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          { id: '1', name: 'Test Skill', slug: 'test-skill' },
        ]);

      const request = new NextRequest('http://localhost:3000/api/search?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it('应该支持分类过滤', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search?category=ai'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    });

    it('应该支持多条件组合搜索', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search?q=agent&category=ai&language=python&minQuality=80'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('应该支持分页参数', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce(
          Array.from({ length: 10 }, (_, i) => ({ id: `${i + 1}`, name: `Skill ${i + 1}` }))
        );

      const request = new NextRequest(
        'http://localhost:3000/api/search?q=test&page=2&pageSize=10'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.page).toBe(2);
      expect(data.pageSize).toBe(10);
      expect(data.totalPages).toBe(10);
    });

    it('应该限制最大pageSize为100', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search?q=test&pageSize=200'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pageSize).toBe(100);
    });

    it('应该支持不同的排序方式', async () => {
      const sortOptions = ['relevance', 'quality', 'stars', 'downloads', 'updated'];

      for (const sortBy of sortOptions) {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([{ total: 0 }])
          .mockResolvedValueOnce([]);

        const request = new NextRequest(
          `http://localhost:3000/api/search?q=test&sortBy=${sortBy}`
        );
        const response = await GET(request);

        expect(response.status).toBe(200);
      }
    });

    it('应该在没有任何搜索条件时返回400错误', async () => {
      const request = new NextRequest('http://localhost:3000/api/search');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('至少提供一个搜索条件');
      expect(data.hint).toBeDefined();
    });

    it('应该处理数据库错误', async () => {
      prismaMock.$queryRawUnsafe.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/search?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('搜索失败');
    });

    it('应该支持子分类过滤', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search?subcategory=llm'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('应该支持数据源过滤', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search?source=github'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/search', () => {
    it('应该执行高级搜索', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const requestBody = {
        query: 'agent',
        categories: ['ai', 'ml'],
        languages: ['python'],
        minStars: 100,
        minQualityScore: 80,
      };

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skills).toBeDefined();
      expect(data.total).toBe(0);
    });

    it('应该支持数据源过滤', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const requestBody = {
        sources: ['github', 'npm'],
      };

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      await POST(request);

      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('应该支持日期范围过滤', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const requestBody = {
        query: 'test',
        dateRange: {
          from: '2024-01-01',
          to: '2024-12-31',
        },
      };

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('应该在没有搜索条件时返回400错误', async () => {
      const requestBody = {};

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('至少提供一个搜索条件');
    });

    it('应该限制POST请求的pageSize', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const requestBody = {
        query: 'test',
        pageSize: 200,
      };

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pageSize).toBe(100);
    });

    it('应该处理高级搜索错误', async () => {
      prismaMock.$queryRawUnsafe.mockRejectedValue(
        new Error('Search index corrupted')
      );

      const requestBody = {
        query: 'test',
      };

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('高级搜索失败');
    });

    it('应该使用默认的分页参数', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const requestBody = {
        query: 'test',
      };

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(20);
    });
  });

  describe('参数验证', () => {
    it('GET请求应该正确处理空查询字符串', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=');
      const response = await GET(request);

      // 空字符串被视为falsy，应该返回400
      expect(response.status).toBe(400);
    });

    it('GET请求应该接受只有category的情况', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search?category=ai'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('POST请求应该接受只有categories数组的情况', async () => {
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]);

      const requestBody = {
        categories: ['ai'],
      };

      const request = new NextRequest('http://localhost:3000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });
});