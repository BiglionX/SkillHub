/**
 * Popular Searches API 测试
 * 
 * 测试 /api/search/popular 端点
 * 使用 Prisma mock 替代 SearchService mock 以兼容 next/jest 模块解析
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Import the route handler
import { GET } from '../search/popular/route';

// Access global Prisma mock to set return values
const prismaMock = global.__mockPrisma;

describe('Popular Searches API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/search/popular', () => {
    it('应该返回热门搜索词列表', async () => {
      // Mock skill data for the popular search analysis
      prismaMock.skill.findMany.mockResolvedValue([
        { name: 'AI Agent Development', tags: ['ai', 'agent'], category: 'ai' },
        { name: 'Python Automation', tags: ['python', 'automation'], category: 'devops' },
        { name: 'React Component Library', tags: ['react', 'ui'], category: 'frontend' },
        { name: 'AI Chatbot Builder', tags: ['ai', 'chatbot'], category: 'ai' },
        { name: 'Python Data Analysis', tags: ['python', 'data'], category: 'data' },
        { name: 'React Native App', tags: ['react', 'mobile'], category: 'mobile' },
        { name: 'AI Training Platform', tags: ['ai', 'training'], category: 'ai' },
        { name: 'Python Web Framework', tags: ['python', 'web'], category: 'backend' },
        { name: 'AI Image Generator', tags: ['ai', 'image'], category: 'ai' },
        { name: 'React State Management', tags: ['react', 'state'], category: 'frontend' },
        { name: 'Development Tools', tags: ['tools'], category: 'devops' },
        { name: 'Testing Framework', tags: ['test'], category: 'devops' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches).toBeInstanceOf(Array);
      expect(data.popularSearches.length).toBeGreaterThan(0);
      // "python" 出现3次（名称）+ 1次（标签）= 4次，最热门
      expect(data.popularSearches[0]).toBe('python');
    });

    it('应该支持自定义limit参数', async () => {
      const skills = Array.from({ length: 50 }, (_, i) => ({
        name: `Skill Word${i} Development`,
        tags: ['tag1', 'tag2'],
        category: 'general',
      }));
      prismaMock.skill.findMany.mockResolvedValue(skills);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=3'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches.length).toBeLessThanOrEqual(3);
    });

    it('应该限制最大limit为20', async () => {
      const skills = Array.from({ length: 100 }, (_, i) => ({
        name: `UniqueWord${i} Technology`,
        tags: [`tag${i}`],
        category: 'general',
      }));
      prismaMock.skill.findMany.mockResolvedValue(skills);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=50'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches.length).toBeLessThanOrEqual(20);
    });

    it('应该使用默认limit值10', async () => {
      const skills = Array.from({ length: 50 }, (_, i) => ({
        name: `Word${i} Tool`,
        tags: [`tool${i}`],
        category: 'general',
      }));
      prismaMock.skill.findMany.mockResolvedValue(skills);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches.length).toBeLessThanOrEqual(10);
    });

    it('应该处理Prisma错误', async () => {
      prismaMock.skill.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('获取热门搜索失败');
    });

    it('应该返回空数组当没有技能数据时', async () => {
      prismaMock.skill.findMany.mockResolvedValue([]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches).toEqual([]);
    });

    it('应该正确处理limit为1的情况', async () => {
      prismaMock.skill.findMany.mockResolvedValue([
        { name: 'Top Skill', tags: ['top'], category: 'general' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=1'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches.length).toBeLessThanOrEqual(1);
    });
  });

  describe('边界情况', () => {
    it('应该处理limit为0的情况返回空数组', async () => {
      prismaMock.skill.findMany.mockResolvedValue([
        { name: 'Test Skill', tags: ['test'], category: 'general' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=0'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches).toEqual([]);
    });

    it('应该处理limit为负数的情况', async () => {
      prismaMock.skill.findMany.mockResolvedValue([
        { name: 'Test Skill', tags: ['test'], category: 'general' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=-10'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches).toEqual([]);
    });

    it('应该处理无效的limit参数', async () => {
      prismaMock.skill.findMany.mockResolvedValue([
        { name: 'Test Skill', tags: ['test'], category: 'general' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=xyz'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches).toBeInstanceOf(Array);
    });

    it('应该在数据库超时时返回错误', async () => {
      prismaMock.skill.findMany.mockRejectedValue(
        new Error('Connection timeout after 5000ms')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('获取热门搜索失败');
    });
  });

  describe('性能相关', () => {
    it('应该快速响应小limit请求', async () => {
      prismaMock.skill.findMany.mockResolvedValue([
        { name: 'Fast Response', tags: ['fast'], category: 'general' },
      ]);

      const startTime = Date.now();
      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=1'
      );
      await GET(request);
      const endTime = Date.now();

      // Mock 情况下应该非常快
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('应该能处理大量技能数据', async () => {
      const largeSkills = Array.from({ length: 100 }, (_, i) => ({
        name: `Skill ${i} Technology`,
        tags: ['test', 'benchmark'],
        category: 'general',
      }));
      prismaMock.skill.findMany.mockResolvedValue(largeSkills);

      const request = new NextRequest(
        'http://localhost:3000/api/search/popular?limit=20'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.popularSearches).toBeInstanceOf(Array);
    });
  });
});