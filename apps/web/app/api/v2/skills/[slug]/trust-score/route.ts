/**
 * GET /api/v2/skills/[slug]/trust-score
 *
 * 返回指定 Skill 的 Trust Score 详情
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTrustScore, VERIFIED_THRESHOLD, type TrustScoreResult } from '@/lib/services/TrustScoreService';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1 小时缓存

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const skill = await prisma.skill.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        starCount: true,
        downloadCount: true,
        updatedAt: true,
        isPublic: true,
        // 用户评分在 SkillComment.rating（Review 是审核记录，无 rating）
        comments: {
          select: {
            rating: true,
            createdAt: true,
          },
          take: 100,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!skill || !skill.isPublic) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Skill not found: ${slug}` },
        { status: 404 },
      );
    }

    // 计算维度
    const ratedComments = skill.comments.filter((c) => c.rating != null);
    const averageRating = ratedComments.length > 0
      ? ratedComments.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedComments.length
      : 0;
    const downloadsLast30Days = Math.round(skill.downloadCount * 0.3);
    const daysSinceUpdate = Math.floor(
      (Date.now() - skill.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const result: TrustScoreResult = calculateTrustScore({
      starCount: skill.starCount,
      downloadsLast30Days,
      averageRating,
      ratingCount: ratedComments.length,
      daysSinceUpdate,
    });

    return NextResponse.json(
      {
        slug: skill.slug,
        name: skill.name,
        ...result,
        verifiedThreshold: VERIFIED_THRESHOLD,
        inputs: {
          starCount: skill.starCount,
          downloadsLast30Days,
          averageRating: Math.round(averageRating * 100) / 100,
          ratingCount: ratedComments.length,
          daysSinceUpdate,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (error) {
    console.error('[trust-score] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to compute trust score' },
      { status: 500 },
    );
  }
}
