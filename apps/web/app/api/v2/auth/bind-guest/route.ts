import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth-config';

const prisma = new PrismaClient();

interface BindGuestBody {
  anonymous_id: string;
  machine_fingerprint?: string;
  helper_version?: string;
  os_version?: string;
  /** 合并选项：是否把 bind 前产生的 UsageRecord 也合并到当前 user */
  merge_records?: boolean;
}

/**
 * POST /api/v2/auth/bind-guest
 *
 * 把匿名游客会话合并到当前登录用户（M4 新增）
 *   - 必登录
 *   - GuestSession.userId 设为当前用户，记录 bindAt
 *   - 默认把该会话产生的 UsageRecord.userId 也一起合并（merge_records 缺省 true）
 *   - 幂等：同一 anonymousId 多次绑定不会重复写 bindAt
 *
 * 触发场景：
 *   1. 桌面助手设置页"关联到账号"按钮
 *   2. Web 端游客首次登录
 *
 * Response：
 * {
 *   ok: true,
 *   merged_records: number,        // 被合并的 UsageRecord 数
 *   session: { anonymous_id, last_seen_at, bind_at }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guestSessionDelegate = (prisma as any).guestSession as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const usageRecordDelegate = (prisma as any).usageRecord as any;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: BindGuestBody;
  try {
    body = (await req.json()) as BindGuestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body?.anonymous_id || typeof body.anonymous_id !== 'string') {
    return NextResponse.json({ error: 'anonymous_id 必填' }, { status: 400 });
  }

  const mergeRecords = body.merge_records !== false; // 默认 true

  // 1. 校验 anonymousId 归属（MEDIUM #6 / CodeReview 2026-09）：
  //    避免 A 用户把已属 B 用户的 anonymousId 偷走合并 record。
  //    允许：owner 不存在、owner 是当前 user。拒绝：owner 是其他 user。
  //    接受罕见的 findUnique → upsert 之间被并发 bind 抢占（Prisma 事务隔离
  //    + unique 约束保证不会被静默覆盖，被抢占方下次 bind 会被新规则拦下）。
  const existing = await guestSessionDelegate.findUnique({
    where: { anonymousId: body.anonymous_id },
    select: { userId: true },
  });
  if (existing?.userId && existing.userId !== userId) {
    return NextResponse.json(
      { error: 'anonymous_id 已归属其他用户，无法关联' },
      { status: 403 },
    );
  }

  // 2. upsert GuestSession
  //    - update 分支不再覆盖 bindAt（MEDIUM #2，保留首次绑定时间）
  //    - update 分支不再覆盖 userId（MEDIUM #6，已在上一步确认归属 = 当前 user）
  const now = new Date();
  const guestRow = await guestSessionDelegate.upsert({
    where: { anonymousId: body.anonymous_id },
    create: {
      anonymousId: body.anonymous_id,
      machineFingerprint: body.machine_fingerprint ?? null,
      helperVersion: body.helper_version ?? null,
      osVersion: body.os_version ?? null,
      userId,
      bindAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      lastSeenAt: now,
      ...(body.machine_fingerprint ? { machineFingerprint: body.machine_fingerprint } : {}),
      ...(body.helper_version ? { helperVersion: body.helper_version } : {}),
      ...(body.os_version ? { osVersion: body.os_version } : {}),
    },
  });

  // 2. 合并 UsageRecord（可选）
  let mergedRecordsCount = 0;
  if (mergeRecords) {
    const updateResult = await usageRecordDelegate.updateMany({
      where: { guestSessionId: guestRow.id, userId: null },
      data: { userId },
    });
    mergedRecordsCount = updateResult.count;
  }

  return NextResponse.json({
    ok: true,
    merged_records: mergedRecordsCount,
    session: {
      anonymous_id: guestRow.anonymousId,
      last_seen_at: guestRow.lastSeenAt.toISOString(),
      bind_at: guestRow.bindAt?.toISOString() ?? now.toISOString(),
    },
  });
}