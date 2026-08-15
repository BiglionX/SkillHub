import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST } from '../namespaces/route';
import { mockPrisma } from './mocks';

// Auth mock is set up globally in jest.setup.ts (accessible via __mockAuth)
const mockAuth = (global as any).__mockAuth;

describe('Namespaces API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/namespaces', () => {
    it('应该返回命名空间列表（未登录用户只看到全局的）', async () => {
      mockAuth.mockResolvedValue(null);

      mockPrisma.namespace.count.mockResolvedValue(2);
      mockPrisma.namespace.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'Global Namespace',
          slug: 'global',
          description: 'A global namespace',
          type: 'GLOBAL',
          owner: { id: 'user1', name: 'Owner', image: null },
          _count: { skills: 5, members: 10 },
        },
      ]);

      const request = new NextRequest('http://localhost:3000/api/namespaces');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.namespaces).toHaveLength(1);
      expect(mockPrisma.namespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'GLOBAL',
          }),
        })
      );
    });

    it('应该支持搜索参数', async () => {
      mockAuth.mockResolvedValue(null);
      mockPrisma.namespace.count.mockResolvedValue(1);
      mockPrisma.namespace.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/namespaces?search=test');
      await GET(request);

      expect(mockPrisma.namespace.findMany).toHaveBeenCalledWith(
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

    it('应该支持按类型过滤', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });
      mockPrisma.namespace.count.mockResolvedValue(1);
      mockPrisma.namespace.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/namespaces?type=TEAM');
      await GET(request);

      expect(mockPrisma.namespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'TEAM',
          }),
        })
      );
    });

    it('应该支持分页参数', async () => {
      mockAuth.mockResolvedValue(null);
      mockPrisma.namespace.count.mockResolvedValue(30);
      mockPrisma.namespace.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/namespaces?page=2&limit=10');
      const response = await GET(request);
      const data = await response.json();

      expect(mockPrisma.namespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
      expect(data.data.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 30,
        totalPages: 3,
      });
    });

    it('应该处理错误情况', async () => {
      mockAuth.mockResolvedValue(null);
      mockPrisma.namespace.count.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/namespaces');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/namespaces', () => {
    it('应该拒绝未认证的请求', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/namespaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', slug: 'test', type: 'TEAM' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('应该创建新命名空间', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      mockPrisma.namespace.findUnique.mockResolvedValue(null); // slug 不存在
      mockPrisma.namespace.create.mockResolvedValue({
        id: '1',
        name: 'Test Team',
        slug: 'test-team',
        description: '',
        type: 'TEAM',
        ownerId: 'user1',
        owner: { id: 'user1', name: 'Test User', image: null },
      });
      mockPrisma.namespaceMember.create.mockResolvedValue({
        id: 'member1',
        namespaceId: '1',
        userId: 'user1',
        role: 'OWNER',
      });

      const request = new NextRequest('http://localhost:3000/api/namespaces', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Team',
          slug: 'test-team',
          type: 'TEAM',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Team');
      expect(mockPrisma.namespace.create).toHaveBeenCalled();
      expect(mockPrisma.namespaceMember.create).toHaveBeenCalled();
    });

    it('应该拒绝重复的 slug', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      mockPrisma.namespace.findUnique.mockResolvedValue({
        id: 'existing',
        slug: 'test-slug',
      });

      const request = new NextRequest('http://localhost:3000/api/namespaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', slug: 'test-slug', type: 'TEAM' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('应该验证必填字段', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      const request = new NextRequest('http://localhost:3000/api/namespaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }), // 缺少 slug 和 type
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('应该拒绝无效的命名空间类型', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      const request = new NextRequest('http://localhost:3000/api/namespaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', slug: 'test', type: 'INVALID' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('应该拒绝创建全局命名空间', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      // Slug must not exist for the route to reach the GLOBAL type check
      mockPrisma.namespace.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/namespaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Global', slug: 'global', type: 'GLOBAL' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });
  });
});