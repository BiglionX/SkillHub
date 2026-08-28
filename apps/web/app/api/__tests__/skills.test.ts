import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST } from '../skills/route';
import { mockPrisma } from './mocks';

// Auth mock is set up globally in jest.setup.ts (accessible via __mockAuth)
const mockAuth = global.__mockAuth;

describe('Skills API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/skills', () => {
    it('应该返回技能列表（未登录用户只看到已批准的）', async () => {
      // Mock auth 返回 null（未登录）
      mockAuth.mockResolvedValue(null);

      // Mock prisma 返回值
      mockPrisma.skill.count.mockResolvedValue(2);
      mockPrisma.skill.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'Test Skill',
          slug: 'test-skill',
          description: 'A test skill',
          status: 'APPROVED',
          downloadCount: 10,
          author: { id: 'user1', name: 'Author', image: null },
          namespace: { id: 'ns1', slug: 'test-ns', name: 'Test NS' },
          _count: { versions: 1 },
        },
      ]);

      const request = new NextRequest('http://localhost:3000/api/skills');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.skills).toHaveLength(1);
      expect(mockPrisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APPROVED',
          }),
        })
      );
    });

    it('应该支持搜索参数', async () => {
      mockAuth.mockResolvedValue(null);
      mockPrisma.skill.count.mockResolvedValue(1);
      mockPrisma.skill.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/skills?search=test');
      await GET(request);

      expect(mockPrisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                name: expect.objectContaining({ contains: 'test' }),
              }),
            ]),
          }),
        })
      );
    });

    it('应该支持分页参数', async () => {
      mockAuth.mockResolvedValue(null);
      mockPrisma.skill.count.mockResolvedValue(50);
      mockPrisma.skill.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/skills?page=2&limit=10');
      const response = await GET(request);
      const data = await response.json();

      expect(mockPrisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
      expect(data.data.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 50,
        totalPages: 5,
      });
    });

    it('应该处理错误情况', async () => {
      mockAuth.mockResolvedValue(null);
      mockPrisma.skill.count.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/skills');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/skills', () => {
    it('应该拒绝未认证的请求', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', slug: 'test' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('应该创建新技能', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      mockPrisma.skill.findUnique.mockResolvedValue(null); // slug 不存在
      mockPrisma.skill.create.mockResolvedValue({
        id: '1',
        name: 'Test Skill',
        slug: 'test-skill',
        description: '',
        repositoryUrl: '',
        category: 'other',
        tags: [],
        authorId: 'user1',
        namespaceId: null,
        status: 'DRAFT',
        author: { id: 'user1', name: 'Test User', image: null },
        namespace: null,
      });

      const request = new NextRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Skill',
          slug: 'test-skill',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Skill');
      expect(mockPrisma.skill.create).toHaveBeenCalled();
    });

    it('应该拒绝重复的 slug', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      mockPrisma.skill.findUnique.mockResolvedValue({
        id: 'existing',
        slug: 'test-skill',
      });

      const request = new NextRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', slug: 'test-skill' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('应该验证必填字段', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      const request = new NextRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        body: JSON.stringify({ name: '' }), // 缺少 slug
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });
});