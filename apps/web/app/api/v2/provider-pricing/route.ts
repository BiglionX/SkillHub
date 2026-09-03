import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { redis } from '@/lib/redis';

const prisma = new PrismaClient();

/**
 * GET /api/v2/provider-pricing
 *
 * 云端权威 Provider 单价列表（M4 新增）
 *   - 公开接口（无需登录）
 *   - 每个 (provider, model) 返回当前生效的一条（effectiveAt 最新）
 *   - Redis 缓存 1 小时，键 provider-pricing:latest
 *   - 桌面端 LlmGateway 在第一次 /llm/chat 时拉取，本地内存再缓存 1 小时
 *
 * Response:
 *   {
 *     pricing: [
 *       { provider, model, inputPer1k, outputPer1k, currency, effectiveAt },
 *       ...
 *     ],
 *     updated_at: "2026-09-03T...",
 *     cached: boolean
 *   }
 */
export async function GET() {
  const cacheKey = 'provider-pricing:latest';
  const cacheTtlSec = 3600; // 1 小时

  // 1. Redis 缓存读取
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return NextResponse.json({ ...parsed, cached: true });
    }
  } catch {
    // Redis 不可用时静默降级到 DB
  }

  // 2. DB 查询：取每对 (provider, model) 中 effectiveAt 最新的一条
  //  - 使用 windowFunction 模拟 DISTINCT ON（Prisma 5 暂不支持原生 DISTINCT ON）
  const all = await prisma.providerPricing.findMany({
    orderBy: [{ provider: 'asc' }, { model: 'asc' }, { effectiveAt: 'desc' }],
  });
  const seen = new Set<string>();
  const latest: Array<{
    provider: string;
    model: string;
    inputPer1k: number;
    outputPer1k: number;
    currency: string;
    effectiveAt: string;
  }> = [];
  for (const p of all) {
    const key = `${p.provider}::${p.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({
      provider: p.provider,
      model: p.model,
      inputPer1k: Number(p.inputPer1k),
      outputPer1k: Number(p.outputPer1k),
      currency: p.currency,
      effectiveAt: p.effectiveAt.toISOString(),
    });
  }

  const payload = {
    pricing: latest,
    updated_at: new Date().toISOString(),
  };

  // 3. 写 Redis 缓存
  try {
    await redis.setex(cacheKey, cacheTtlSec, JSON.stringify(payload));
  } catch {
    // 缓存失败不影响响应
  }

  return NextResponse.json({ ...payload, cached: false });
}