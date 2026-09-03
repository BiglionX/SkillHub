import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth-config';

const prisma = new PrismaClient();

/**
 * GET /api/v2/user/usage
 *
 * 登录用户用量聚合（M4 新增）
 *   - 必登录
 *   - 默认时间范围 30 天，可通过 ?range=7d | 30d | 90d 调整
 *   - 聚合维度：total / by_day / by_provider / by_skill
 *   - 包含 bind 前的匿名会话用量（已合并到 userId）
 *
 * Query:
 *   - range: '7d' | '30d' | '90d'（默认 30d）
 *
 * Response:
 * {
 *   range: '30d',
 *   totals: { calls, tokensIn, tokensOut, costCny, distinct_skills, distinct_providers },
 *   by_day:      [{ date: '2026-09-01', calls, tokensIn, tokensOut, costCny }, ...],
 *   by_provider: [{ provider, calls, tokensIn, tokensOut, costCny, sharePct }, ...],
 *   by_skill:    [{ skillSlug, calls, tokensIn, tokensOut, costCny }, ...]
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const usageRecordDelegate = (prisma as any).usageRecord as any;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const userId = session.user.id;

  const rangeParam = req.nextUrl.searchParams.get('range') ?? '30d';
  const days = rangeParam === '7d' ? 7 : rangeParam === '90d' ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // 1. 总计
  const totals = await usageRecordDelegate.aggregate({
    where: { userId, occurredAt: { gte: since } },
    _sum: { tokensIn: true, tokensOut: true, costCny: true },
    _count: { _all: true },
  });

  // 2. 按天（Prisma 暂不直接支持 date_trunc；用原生 SQL 简化）
  const byDayRaw = await prisma.$queryRaw<
    Array<{ day: Date; calls: bigint; tokens_in: bigint; tokens_out: bigint; cost_cny: number | null }>
  >`
    SELECT
      DATE_TRUNC('day', "occurredAt") AS day,
      COUNT(*)::bigint                 AS calls,
      COALESCE(SUM("tokensIn"), 0)::bigint  AS tokens_in,
      COALESCE(SUM("tokensOut"), 0)::bigint AS tokens_out,
      SUM("costCny")                       AS cost_cny
    FROM "usage_records"
    WHERE "userId" = ${userId}::text
      AND "occurredAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  const byDay = byDayRaw.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    calls: Number(row.calls),
    tokensIn: Number(row.tokens_in),
    tokensOut: Number(row.tokens_out),
    costCny: row.cost_cny == null ? 0 : Number(row.cost_cny),
  }));

  // 3. 按 Provider
  const byProviderRaw: Array<{
    provider: string;
    _count: { _all: number };
    _sum: { tokensIn: number | null; tokensOut: number | null; costCny: number | null };
  }> = await usageRecordDelegate.groupBy({
    by: ['provider'],
    where: { userId, occurredAt: { gte: since } },
    _sum: { tokensIn: true, tokensOut: true, costCny: true },
    _count: { _all: true },
  });
  const totalCalls = totals._count._all || 0;
  const byProvider = byProviderRaw
    .map((r) => ({
      provider: r.provider,
      calls: r._count._all,
      tokensIn: r._sum.tokensIn ?? 0,
      tokensOut: r._sum.tokensOut ?? 0,
      costCny: r._sum.costCny == null ? 0 : Number(r._sum.costCny),
      sharePct: totalCalls > 0 ? Math.round((r._count._all / totalCalls) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  // 4. 按 Skill（限 Top 10；skillSlug = null 归到 "未关联"）
  const bySkillRaw: Array<{
    skillSlug: string | null;
    _count: { _all: number };
    _sum: { tokensIn: number | null; tokensOut: number | null; costCny: number | null };
  }> = await usageRecordDelegate.groupBy({
    by: ['skillSlug'],
    where: { userId, occurredAt: { gte: since } },
    _sum: { tokensIn: true, tokensOut: true, costCny: true },
    _count: { _all: true },
  });
  const bySkill = bySkillRaw
    .map((r) => ({
      skillSlug: r.skillSlug ?? '(未关联)',
      calls: r._count._all,
      tokensIn: r._sum.tokensIn ?? 0,
      tokensOut: r._sum.tokensOut ?? 0,
      costCny: r._sum.costCny == null ? 0 : Number(r._sum.costCny),
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);

  // 5. 去重维度
  const distinctProviders = new Set(byProviderRaw.map((r) => r.provider)).size;
  const distinctSkills = new Set(
    bySkillRaw.map((r) => r.skillSlug).filter((s): s is string => !!s)
  ).size;

  return NextResponse.json({
    range: rangeParam,
    since: since.toISOString(),
    totals: {
      calls: totalCalls,
      tokensIn: totals._sum.tokensIn ?? 0,
      tokensOut: totals._sum.tokensOut ?? 0,
      costCny: totals._sum.costCny == null ? 0 : Number(totals._sum.costCny),
      distinct_skills: distinctSkills,
      distinct_providers: distinctProviders,
    },
    by_day: byDay,
    by_provider: byProvider,
    by_skill: bySkill,
  });
}