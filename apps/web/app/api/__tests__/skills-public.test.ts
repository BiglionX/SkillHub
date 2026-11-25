import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET } from '../skills/public/route';
import { mockPrisma } from './mocks';

describe('GET /api/skills/public 错误分类', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('表结构缺失时返回 serviceError，而不是伪装成数据库连接错误', async () => {
    mockPrisma.skill.count.mockResolvedValue(1);
    mockPrisma.skill.groupBy.mockResolvedValue([]);
    mockPrisma.skill.findMany.mockRejectedValue(
      new Error('The column `skills.deliveryCategory` does not exist in the current database.')
    );

    const response = await GET(new NextRequest('http://localhost/api/skills/public'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.databaseError).toBe(false);
    expect(data.serviceError.code).toBe('DATABASE_SCHEMA_ERROR');
    expect(data.serviceError.message).toContain('数据库结构');
  });

  it('连接超时仍返回 databaseError，并探测数据库是否恢复', async () => {
    mockPrisma.skill.count.mockRejectedValue(new Error('connection timed out'));

    const response = await GET(new NextRequest('http://localhost/api/skills/public'));
    const data = await response.json();

    expect(data.databaseError).toBe(true);
    expect(data.recovered).toBe(true);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });
});
