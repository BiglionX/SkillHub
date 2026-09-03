import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth-config';

const prisma = new PrismaClient();

interface IncomingRecord {
  client_record_id: string;       // 必填，幂等 key
  skill_slug?: string;
  provider: string;               // 必填
  model: string;                  // 必填
  tokens_in: number;              // 必填，>= 0
  tokens_out: number;             // 必填，>= 0
  duration_ms?: number;
  occurred_at?: string;           // ISO8601，缺省 = now()
  path?: string;                  // 'helper' | 'cache' | 'cloud' | 'heuristic'
}

interface IncomingBody {
  anonymous_id: string;           // 必填
  machine_fingerprint?: string;
  helper_version?: string;
  os_version?: string;
  records: IncomingRecord[];
}

/**
 * POST /api/v2/usage/sync
 *
 * 桌面助手批量上报 LLM 用量（M4 新增）
 *   - 匿名接口（用户未登录也接受；登录则把 userId 也写到 record）
 *   - 按 client_record_id 幂等去重（同一条记录重传不写入多行）
 *   - 自动按 ProviderPricing 回填 costCny
 *   - upsert GuestSession（首次注册 + 后续更新 lastSeenAt / helperVersion / osVersion）
 *
 * Body 形如：
 * {
 *   "anonymous_id": "uuid-v4",
 *   "machine_fingerprint": "sha256:...",
 *   "helper_version": "0.3.05",
 *   "os_version": "Windows 11 23H2",
 *   "records": [
 *     {
 *       "client_record_id": "uuid-v4",
 *       "skill_slug": "ps-skin-retouch",
 *       "provider": "deepseek",
 *       "model": "deepseek-chat",
 *       "tokens_in": 256, "tokens_out": 128,
 *       "duration_ms": 1234,
 *       "occurred_at": "2026-09-03T10:00:00Z",
 *       "path": "helper"
 *     }
 *   ]
 * }
 *
 * Response：
 * { ok: true, synced: number, deduped: number, total: number }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guestSessionDelegate = (prisma as any).guestSession as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const usageRecordDelegate = (prisma as any).usageRecord as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providerPricingDelegate = (prisma as any).providerPricing as any;

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // 1. 校验必填字段
  if (!body?.anonymous_id || typeof body.anonymous_id !== 'string') {
    return NextResponse.json({ error: 'anonymous_id 必填' }, { status: 400 });
  }
  if (!Array.isArray(body.records) || body.records.length === 0) {
    return NextResponse.json({ error: 'records 必须是非空数组' }, { status: 400 });
  }
  if (body.records.length > 1000) {
    return NextResponse.json({ error: 'records 单次最多 1000 条' }, { status: 413 });
  }

  // 2. upsert GuestSession
  const sessionRow = await guestSessionDelegate.upsert({
    where: { anonymousId: body.anonymous_id },
    create: {
      anonymousId: body.anonymous_id,
      machineFingerprint: body.machine_fingerprint ?? null,
      helperVersion: body.helper_version ?? null,
      osVersion: body.os_version ?? null,
      ...(userId ? { userId, bindAt: new Date() } : {}),
    },
    update: {
      lastSeenAt: new Date(),
      ...(body.machine_fingerprint ? { machineFingerprint: body.machine_fingerprint } : {}),
      ...(body.helper_version ? { helperVersion: body.helper_version } : {}),
      ...(body.os_version ? { osVersion: body.os_version } : {}),
      // 若已绑定的 user 再次上报，保持 userId 关联（不覆盖 bindAt）
      ...(userId ? { userId } : {}),
    },
  });

  // 3. 批量取现有 clientRecordId（一次性去重）
  const clientIds = body.records
    .map((r) => r.client_record_id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  const existingRows = clientIds.length > 0
    ? await usageRecordDelegate.findMany({
        where: { clientRecordId: { in: clientIds } },
        select: { clientRecordId: true },
      })
    : [];
  const existingIds = new Set<string>(existingRows.map((r: { clientRecordId: string }) => r.clientRecordId));

  // 4. 批量取 (provider, model) 最新单价（用于回填 costCny）
  const providerModelPairs = new Set<string>();
  for (const r of body.records) {
    providerModelPairs.add(`${r.provider}::${r.model}`);
  }
  const pricingMap = new Map<string, { inputPer1k: number; outputPer1k: number }>();
  if (providerModelPairs.size > 0) {
    const pricingRows = await providerPricingDelegate.findMany({
      where: {
        OR: Array.from(providerModelPairs).map((k) => {
          const [provider, model] = k.split('::');
          return { provider, model };
        }),
      },
      orderBy: { effectiveAt: 'desc' },
    });
    for (const p of pricingRows as Array<{ provider: string; model: string; inputPer1k: unknown; outputPer1k: unknown }>) {
      const k = `${p.provider}::${p.model}`;
      if (pricingMap.has(k)) continue; // 取最新一条
      pricingMap.set(k, {
        inputPer1k: Number(p.inputPer1k),
        outputPer1k: Number(p.outputPer1k),
      });
    }
  }

  // 5. 过滤 + 构造待插入数据
  const now = new Date();
  const dataToInsert: Array<{
    guestSessionId: string;
    userId: string | null;
    skillSlug: string | null;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number | null;
    costCny: number | null;
    clientRecordId: string;
    occurredAt: Date;
    path: string;
  }> = [];

  for (const r of body.records) {
    if (!r.client_record_id || !r.provider || !r.model) continue;
    if (existingIds.has(r.client_record_id)) continue;

    const priceKey = `${r.provider}::${r.model}`;
    const price = pricingMap.get(priceKey);
    let costCny: number | null = null;
    if (price) {
      costCny =
        (r.tokens_in / 1000) * price.inputPer1k +
        (r.tokens_out / 1000) * price.outputPer1k;
      costCny = Math.round(costCny * 1_000_000) / 1_000_000;
    }

    dataToInsert.push({
      guestSessionId: sessionRow.id,
      userId,
      skillSlug: r.skill_slug ?? null,
      provider: r.provider,
      model: r.model,
      tokensIn: r.tokens_in,
      tokensOut: r.tokens_out,
      durationMs: r.duration_ms ?? null,
      costCny,
      clientRecordId: r.client_record_id,
      occurredAt: r.occurred_at ? new Date(r.occurred_at) : now,
      path: r.path ?? 'helper',
    });
  }

  // 6. skipDuplicates 写入（双重保险：万一 clientRecordId 唯一索引冲突）
  if (dataToInsert.length > 0) {
    try {
      await usageRecordDelegate.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      });
    } catch (e) {
      // 单条冲突不影响整体，记录日志后继续
      console.error('[usage/sync] createMany 部分失败:', e);
    }
  }

  return NextResponse.json({
    ok: true,
    synced: dataToInsert.length,
    deduped: body.records.length - dataToInsert.length,
    total: body.records.length,
    session_id: sessionRow.id,
  });
}