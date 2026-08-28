import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST } from '../reviews/route';
import { mockPrisma } from './mocks';

// Auth mock is set up globally in jest.setup.ts (accessible via __mockAuth)
const mockAuth = global.__mockAuth;

describe('Reviews API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/reviews', () => {
    it('应该拒绝未认证的请求', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/reviews');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('应该返回审核列表', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin1', email: 'admin@example.com' },
      });

      mockPrisma.review.findMany.mockResolvedValue([
        {
          id: '1',
          skillId: 'skill1',
          version: '1.0.0',
          status: 'PENDING_REVIEW',
          skill: {
            id: 'skill1',
            name: 'Test Skill',
            slug: 'test-skill',
            author: { id: 'user1', name: 'Author', image: null },
          },
          reviewer: null,
        },
      ]);
      mockPrisma.review.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/reviews');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.reviews).toHaveLength(1);
      expect(mockPrisma.review.findMany).toHaveBeenCalled();
    });

    it('应该支持按状态过滤', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin1', email: 'admin@example.com' },
      });

      mockPrisma.review.findMany.mockResolvedValue([]);
      mockPrisma.review.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/reviews?status=APPROVED');
      await GET(request);

      expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APPROVED',
          }),
        })
      );
    });

    it('应该支持分页参数', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin1', email: 'admin@example.com' },
      });

      mockPrisma.review.findMany.mockResolvedValue([]);
      mockPrisma.review.count.mockResolvedValue(25);

      const request = new NextRequest('http://localhost:3000/api/reviews?page=2&limit=10');
      const response = await GET(request);
      const data = await response.json();

      expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
      expect(data.data.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('应该处理错误情况', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin1', email: 'admin@example.com' },
      });

      mockPrisma.review.findMany.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/reviews');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/reviews', () => {
    it('应该拒绝未认证的请求', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ skillId: '1', version: '1.0.0' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('应该验证必填字段', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      const request = new NextRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ skillId: '1' }), // 缺少 version
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('应该拒绝不存在的技能', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      mockPrisma.skill.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ skillId: 'nonexistent', version: '1.0.0' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
    });

    it('应该拒绝已有待审核记录的技能', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      mockPrisma.skill.findUnique.mockResolvedValue({
        id: 'skill1',
        name: 'Test Skill',
      });

      mockPrisma.review.findFirst.mockResolvedValue({
        id: 'review1',
        skillId: 'skill1',
        status: 'PENDING_REVIEW',
      });

      const request = new NextRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ skillId: 'skill1', version: '1.0.0' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('应该创建新的审核记录', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user1', email: 'test@example.com' },
      });

      mockPrisma.skill.findUnique.mockResolvedValue({
        id: 'skill1',
        name: 'Test Skill',
      });

      mockPrisma.review.findFirst.mockResolvedValue(null); // 没有待审核记录

      mockPrisma.review.create.mockResolvedValue({
        id: 'review1',
        skillId: 'skill1',
        version: '1.0.0',
        status: 'PENDING_REVIEW',
        skill: {
          id: 'skill1',
          name: 'Test Skill',
          slug: 'test-skill',
        },
      });

      mockPrisma.skill.update.mockResolvedValue({
        id: 'skill1',
        status: 'PENDING_REVIEW',
      });

      const request = new NextRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ skillId: 'skill1', version: '1.0.0' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('PENDING_REVIEW');
      expect(mockPrisma.review.create).toHaveBeenCalled();
      expect(mockPrisma.skill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PENDING_REVIEW' },
        })
      );
    });
  });
});