/**
 * Suggestions API 测试
 * 
 * 测试 /api/search/suggestions 端点
 * 使用 Prisma mock 替代 SearchService mock 以兼容 next/jest 模块解析
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Import the route handler
import { GET } from '../search/suggestions/route';

// Access global Prisma mock
const prismaMock = global.__mockPrisma;

describe('Suggestions API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/search/suggestions', () => {
    it('应该返回搜索建议', async () => {
      // Mock $queryRaw to return skill names matching the query
      prismaMock.$queryRaw.mockResolvedValue([
        { name: 'AI Agent Framework' },
        { name: 'AI Chatbot Builder' },
        { name: 'AI Assistant Toolkit' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=ai'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.suggestions).toBeInstanceOf(Array);
      expect(data.suggestions.length).toBeGreaterThan(0);
      expect(data.suggestions[0].text).toBe('AI Agent Framework');
    });

    it('应该支持自定义limit参数', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { name: 'Python Programming' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=python&limit=3'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.suggestions).toBeInstanceOf(Array);
    });

    it('应该限制最大limit为10', async () => {
      const mockResults = Array.from({ length: 15 }, (_, i) => ({
        name: `Test Skill ${i}`,
      }));
      prismaMock.$queryRaw.mockResolvedValue(mockResults);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=test&limit=20'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Service slices to limit=10
      expect(data.suggestions.length).toBeLessThanOrEqual(10);
    });

    it('应该在查询为空时返回400错误', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('搜索关键词至少需要2个字符');
      expect(data.suggestions).toEqual([]);
    });

    it('应该在查询长度小于2时返回400错误', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=a'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('搜索关键词至少需要2个字符');
    });

    it('应该在数据库错误时返回空建议（内部错误被SearchService捕获）', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=test'
      );
      const response = await GET(request);
      const data = await response.json();

      // SearchService.getSuggestions 内部捕获数据库错误，返回空数组
      expect(response.status).toBe(200);
      expect(data.suggestions).toEqual([]);
    });

    it('应该使用默认limit值5', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { name: 'Test Skill 1' },
        { name: 'Test Skill 2' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=test'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.suggestions.length).toBeLessThanOrEqual(5);
    });

    it('应该接受最小长度2的查询', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { name: 'AI Platforms' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=ai'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('应该返回空数组当没有匹配建议时', async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=xyz123'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.suggestions).toEqual([]);
    });

    it('应该正确处理特殊字符查询', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { name: 'React-Native Development' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=react-'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('应该正确处理中文查询', async () => {
      // getSuggestions 会调用 $queryRaw 3 次（skills, categories, tags）
      // 第一次返回结果后，后续调用如果返回空则不会添加更多建议
      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          { name: '人工智能平台' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=人工'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(data.suggestions[0].text).toBe('人工智能平台');
    });
  });

  describe('边界情况', () => {
    it('应该处理limit为0的情况', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { name: 'Test' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=test&limit=0'
      );
      const response = await GET(request);

      // limit=0 means Math.min(0, 10)=0, so suggestions should be empty
      expect(response.status).toBe(200);
    });

    it('应该处理limit为负数的情况', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { name: 'Test' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=test&limit=-5'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('应该处理未知错误类型（内部被SearchService捕获）', async () => {
      prismaMock.$queryRaw.mockRejectedValue('String error');

      const request = new NextRequest(
        'http://localhost:3000/api/search/suggestions?q=test'
      );
      const response = await GET(request);
      const data = await response.json();

      // SearchService 内部捕获错误，返回空建议而非500
      expect(response.status).toBe(200);
      expect(data.suggestions).toEqual([]);
    });
  });
});