/**
 * API v2 集成测试（Agent Skills 标准兼容�?
 *
 * 测试覆盖�?
 * - /api/v2/discovery
 * - /api/v2/skills/[slug]/skill.md
 * - /api/v2/skills/[slug]/files/[...path]
 * - /api/v2/skills/import
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET as discoveryGET } from '@/app/api/v2/discovery/route';
import { GET as skillMdGET } from '@/app/api/v2/skills/[slug]/skill.md/route';
import { GET as filesGET } from '@/app/api/v2/skills/[slug]/files/[...path]/route';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createMockFn = () => jest.fn<() => Promise<any>>();
// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    skill: {
      findUnique: createMockFn(),
      findMany: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
    },
    namespace: {
      findFirst: createMockFn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

describe('GET /api/v2/discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回标准化�?Skills 列表', async () => {
    (prisma.skill.findMany as any).mockResolvedValue([
      {
        slug: 'pdf-gen',
        standardName: 'pdf-generation',
        standardDescription: 'Generate PDF from markdown',
        discoveryKeywords: ['pdf', 'markdown'],
        type: 'PROMPT',
        industryTags: ['docs'],
        agentSkillsVersion: '1.0',
        locale: 'zh-CN',
        starCount: 100,
        downloadCount: 1000,
        qualityScore: 85.5,
        updatedAt: new Date('2026-06-24'),
      },
    ]);

    const request = new NextRequest('http://localhost/api/v2/discovery');
    const response = await discoveryGET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.version).toBe('1.0');
    expect(data.total).toBe(1);
    expect(data.skills).toHaveLength(1);
    expect(data.skills[0]).toMatchObject({
      slug: 'pdf-gen',
      name: 'pdf-generation',
      type: 'PROMPT',
      agentSkillsVersion: '1.0',
    });
    expect(data.skills[0].stats).toEqual({
      stars: 100,
      downloads: 1000,
      qualityScore: 85.5,
    });
  });

  it('应支�?type 过滤', async () => {
    (prisma.skill.findMany as any).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost/api/v2/discovery?type=KNOWLEDGE',
    );
    await discoveryGET(request);

    expect(prisma.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'KNOWLEDGE' }),
      }),
    );
  });

  it('应支�?cursor 翻页', async () => {
    (prisma.skill.findMany as any).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost/api/v2/discovery?cursor=last-slug&limit=10',
    );
    await discoveryGET(request);

    expect(prisma.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
      }),
    );
  });

  it('应限制 limit 最大值', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.skill.findMany as any).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost/api/v2/discovery?limit=99999',
    );
    await discoveryGET(request);

    expect(prisma.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5001 }), // MAX_LIMIT + 1
    );
  });
});

describe('GET /api/v2/skills/[slug]/skill.md', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回标准化�?SKILL.md', async () => {
    const skillMdContent = `---
name: pdf-generation
description: Generate PDF from markdown
---

# PDF Generation`;

    (prisma.skill.findUnique as any).mockResolvedValue({
      slug: 'pdf-gen',
      skillMdContent,
      standardName: 'pdf-generation',
      standardDescription: 'Generate PDF from markdown',
      agentSkillsVersion: '1.0',
      isPublic: true,
    });

    const request = new NextRequest(
      'http://localhost/api/v2/skills/pdf-gen/skill.md',
    );
    const response = await skillMdGET(request, {
      params: { slug: 'pdf-gen' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/markdown');
    expect(response.headers.get('X-Agent-Skills-Version')).toBe('1.0');
    const text = await response.text();
    expect(text).toContain('name: pdf-generation');
  });

  it('无 SKILL.md 时应从 metadata 动态生成', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.skill.findUnique as any).mockResolvedValue({
      slug: 'pdf-gen',
      skillMdContent: null,
      standardName: 'pdf-generation',
      standardDescription: 'Generate PDF from markdown',
      agentSkillsVersion: '1.0',
      isPublic: true,
    });

    const request = new NextRequest(
      'http://localhost/api/v2/skills/pdf-gen/skill.md',
    );
    const response = await skillMdGET(request, {
      params: { slug: 'pdf-gen' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Skill-Source')).toBe('generated');
  });

  it('私有 Skill 应返�?404', async () => {
    (prisma.skill.findUnique as any).mockResolvedValue({
      slug: 'private-skill',
      isPublic: false,
    });

    const request = new NextRequest(
      'http://localhost/api/v2/skills/private-skill/skill.md',
    );
    const response = await skillMdGET(request, {
      params: { slug: 'private-skill' },
    });

    expect(response.status).toBe(404);
  });

  it('不存在的 Skill 应返�?404', async () => {
    (prisma.skill.findUnique as any).mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost/api/v2/skills/not-exist/skill.md',
    );
    const response = await skillMdGET(request, {
      params: { slug: 'not-exist' },
    });

    expect(response.status).toBe(404);
  });
});

describe('GET /api/v2/skills/[slug]/files/[...path]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应拒绝路径遍历攻击', async () => {
    const request = new NextRequest(
      'http://localhost/api/v2/skills/foo/files/..%2F..%2Fetc%2Fpasswd',
    );
    const response = await filesGET(request, {
      params: { slug: 'foo', path: ['..', '..', 'etc', 'passwd'] },
    });

    expect(response.status).toBe(403);
  });

  it('不存在的资源应返回 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.skill.findUnique as any).mockResolvedValue({
      id: 'skill-id',
      isPublic: true,
      resources: [],
    });

    const request = new NextRequest(
      'http://localhost/api/v2/skills/foo/files/scripts/missing.sh',
    );
    const response = await filesGET(request, {
      params: { slug: 'foo', path: ['scripts', 'missing.sh'] },
    });

    expect(response.status).toBe(404);
  });

  it('应返回资源元数据', async () => {
    (prisma.skill.findUnique as any).mockResolvedValue({
      id: 'skill-id',
      isPublic: true,
      resources: [
        {
          path: 'scripts/check.sh',
          type: 'script',
          sizeBytes: 1024,
          mimeType: 'text/x-shellscript',
          checksum: 'abc123',
          storageKey: 'skills/foo/resources/scripts/check.sh',
        },
      ],
    });

    const request = new NextRequest(
      'http://localhost/api/v2/skills/foo/files/scripts/check.sh',
    );
    const response = await filesGET(request, {
      params: { slug: 'foo', path: ['scripts', 'check.sh'] },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      slug: 'foo',
      path: 'scripts/check.sh',
      type: 'script',
      sizeBytes: 1024,
      mimeType: 'text/x-shellscript',
      checksum: 'abc123',
    });
    expect(data.downloadUrl).toContain('/download');
  });

  it('超大文件应返�?413', async () => {
    (prisma.skill.findUnique as any).mockResolvedValue({
      id: 'skill-id',
      isPublic: true,
      resources: [
        {
          path: 'big.bin',
          type: 'asset',
          sizeBytes: 20 * 1024 * 1024, // 20MB
          mimeType: 'application/octet-stream',
          storageKey: 'big',
        },
      ],
    });

    const request = new NextRequest(
      'http://localhost/api/v2/skills/foo/files/big.bin',
    );
    const response = await filesGET(request, {
      params: { slug: 'foo', path: ['big.bin'] },
    });

    expect(response.status).toBe(413);
  });
});
