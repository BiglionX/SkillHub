/**
 * GET /api/v2/discovery
 *
 * Agent Skills 开放标准的轻量级发现端点
 *
 * 依据 https://agentskills.io：Agent 启动时仅加载 name + description
 * 本端点返回所有兼容 Agent Skills 标准的 Skill 的元数据
 *
 * 响应格式：
 * {
 *   version: "1.0",
 *   generatedAt: "2026-06-24T...",
 *   total: 1234,
 *   skills: [
 *     { slug, name, description, type, industryTags, agentSkillsVersion },
 *     ...
 *   ]
 * }
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
// 5 分钟缓存（CDN/Edge 友好）
export const revalidate = 300;

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT));
    const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);
    const cursor = searchParams.get('cursor'); // 翻页用
    const type = searchParams.get('type');
    const locale = searchParams.get('locale');

    // 查询：仅包含兼容 Agent Skills 标准的 Skill
    const where: Record<string, unknown> = {
      isPublic: true,
      standardName: { not: null },
    };

    if (type) {
      where.type = type.toUpperCase();
    }
    if (locale) {
      where.locale = locale;
    }

    const skills = await prisma.skill.findMany({
      where,
      select: {
        slug: true,
        standardName: true,
        standardDescription: true,
        discoveryKeywords: true,
        type: true,
        industryTags: true,
        agentSkillsVersion: true,
        locale: true,
        starCount: true,
        downloadCount: true,
        qualityScore: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1, // 多取一个判断是否还有下一页
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = skills.length > limit;
    const items = skills.slice(0, limit);

    return new Response(
      JSON.stringify({
        version: '1.0',
        generatedAt: new Date().toISOString(),
        total: items.length,
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.slug : null,
        skills: items.map((s) => ({
          slug: s.slug,
          name: s.standardName,
          description: s.standardDescription,
          keywords: s.discoveryKeywords,
          type: s.type,
          industryTags: s.industryTags,
          agentSkillsVersion: s.agentSkillsVersion,
          locale: s.locale,
          stats: {
            stars: s.starCount,
            downloads: s.downloadCount,
            qualityScore: s.qualityScore,
          },
          updatedAt: s.updatedAt,
        })),
      }),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      },
    );
  } catch (error) {
    console.error('[discovery] error:', error);
    return new Response(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        message: 'Failed to load discovery data',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}