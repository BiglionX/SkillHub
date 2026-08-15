/**
 * POST /api/v2/skills/import
 *
 * 导入符合 Agent Skills 开放标准的 SKILL.md 到 SkillHub
 * 由 CLI `skillhub skill import` 调用
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseSkillMd, SkillMdParseError } from '@/lib/skills/skill-md-parser';
import {
  authenticateV2Request,
  v2SuccessResponse,
  v2ErrorResponse,
  unauthorizedResponse,
} from '@/lib/services/V2ApiAuth';

interface ImportRequestBody {
  source?: string; // GitHub URL 或 owner/repo@skill-name
  skillMdContent: string;
  namespace?: string;
  autoPublish?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // 1. 认证（可选：未认证可导入到 personal namespace）
    const auth = await authenticateV2Request(request);

    // 2. 解析请求体
    let body: ImportRequestBody;
    try {
      body = await request.json();
    } catch {
      return v2ErrorResponse('Invalid JSON body', 400);
    }

    if (!body.skillMdContent || typeof body.skillMdContent !== 'string') {
      return v2ErrorResponse('skillMdContent is required', 400);
    }

    // 3. 解析 SKILL.md
    let parsed;
    try {
      parsed = parseSkillMd(body.skillMdContent);
    } catch (error) {
      if (error instanceof SkillMdParseError) {
        return v2ErrorResponse(
          `Invalid SKILL.md: ${error.message} (code: ${error.code})`,
          400,
        );
      }
      throw error;
    }

    // 4. 生成 slug
    const slug = generateSlug(parsed.frontmatter.name);

    // 5. 检查是否已存在
    const existing = await prisma.skill.findUnique({ where: { slug } });
    if (existing) {
      return v2ErrorResponse(
        `Skill with slug "${slug}" already exists`,
        409,
      );
    }

    // 6. 查找或创建 namespace
    const namespace = await resolveNamespace(body.namespace, auth?.userId);

    // 7. 创建 Skill
    const skill = await prisma.skill.create({
      data: {
        slug,
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        readme: parsed.body,
        version: '1.0.0',
        category: 'imported',
        tags: [],
        status: body.autoPublish ? 'APPROVED' : 'DRAFT',
        isPublic: false, // 默认为私有，需要审核后才能公开
        // authorId 必填：未认证时使用系统用户（与 CrawlerService 同模式）
        authorId: auth?.userId ?? (await getOrCreateSystemUser()),
        namespaceId: namespace?.id ?? null,
        // Agent Skills 标准字段
        skillMdContent: parsed.raw,
        skillMdFrontmatter: parsed.frontmatter as unknown as object,
        standardName: parsed.frontmatter.name,
        standardDescription: parsed.frontmatter.description,
        discoveryKeywords: parsed.keywords,
        agentSkillsVersion: parsed.agentSkillsVersion,
        lastAnalyzedAt: new Date(),
        // 来源信息
        source: body.source ? 'github-import' : 'manual-import',
        sourceUrl: body.source,
      },
    });

    return v2SuccessResponse({
      slug: skill.slug,
      name: skill.name,
      url: `/skills/${skill.slug}`,
      status: skill.status,
      agentSkillsVersion: skill.agentSkillsVersion,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return unauthorizedResponse();
    }
    console.error('[import] error:', error);
    return v2ErrorResponse('Failed to import SKILL.md', 500);
  }
}

/**
 * 生成 URL 友好的 slug
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * 获取或创建系统用户（与 CrawlerService/SkillsImportService 同模式）
 * 未认证导入时作为 Skill 作者
 */
async function getOrCreateSystemUser(): Promise<string> {
  const systemEmail = 'system@skillhub.io';

  let user = await prisma.user.findUnique({
    where: { email: systemEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: systemEmail,
        name: 'SkillHub System',
      },
    });
  }

  return user.id;
}

/**
 * 解析 namespace
 */
async function resolveNamespace(name: string | undefined, userId?: string) {
  if (!name) return null;

  // 查找已存在的 namespace
  const existing = await prisma.namespace.findFirst({
    where: { name, OR: userId ? [{ ownerId: userId }] : undefined },
  });
  if (existing) return existing;

  // 如果用户已认证，自动创建
  if (userId && (name === 'personal' || !name)) {
    return prisma.namespace.findFirst({
      where: { slug: 'personal', ownerId: userId },
    });
  }

  return null;
}