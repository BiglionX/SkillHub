/**
 * @/skillhub/scripts/seed-m4-pricing.ts
 *
 * v3 M4：覆盖 ProviderPricing 默认单价（基于 2026-09 各 Provider 官网报价）
 *
 *   - 给同一 (provider, model) 写入新的快照行（effectiveAt = now）
 *   - 历史快照保留，便于审计 + 回溯
 *   - 桌面端 1 小时缓存后会自动拉到最新单价
 *
 * 用法（根目录）：
 *   pnpm --filter @skillhub/web exec tsx scripts/seed-m4-pricing.ts
 *   pnpm --filter @skillhub/web exec tsx scripts/seed-m4-pricing.ts --dry-run
 *
 * 数据来源（2026-09 实际报价折算为人民币，1 USD ≈ 7.2 CNY，1 CNY 实时换算自官网）：
 *   - DeepSeek:    https://platform.deepseek.com/api-docs/quick_start/pricing
 *   - OpenAI:      https://openai.com/api/pricing/
 *   - 智谱 GLM:    https://open.bigmodel.cn/pricing
 *   - Anthropic:   https://www.anthropic.com/pricing
 *   - Moonshot:    https://platform.moonshot.cn/docs/pricing/chat
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PricingEntry {
  provider: string;
  model: string;
  /** 人民币 / 1k input tokens */
  inputPer1k: number;
  /** 人民币 / 1k output tokens */
  outputPer1k: number;
  currency: 'CNY';
}

const PRICING_2026_09: PricingEntry[] = [
  // DeepSeek（2026-09 维持低价）
  { provider: 'deepseek', model: 'deepseek-chat',     inputPer1k: 0.001, outputPer1k: 0.002, currency: 'CNY' },
  { provider: 'deepseek', model: 'deepseek-reasoner', inputPer1k: 0.004, outputPer1k: 0.016, currency: 'CNY' },

  // OpenAI（gpt-4o 系列）
  { provider: 'openai',   model: 'gpt-4o-mini',       inputPer1k: 0.0015, outputPer1k: 0.006, currency: 'CNY' },
  { provider: 'openai',   model: 'gpt-4o',            inputPer1k: 0.025, outputPer1k: 0.075, currency: 'CNY' },
  { provider: 'openai',   model: 'gpt-4-turbo',       inputPer1k: 0.072, outputPer1k: 0.216, currency: 'CNY' },

  // 智谱 GLM
  { provider: 'zhipu',    model: 'glm-4-flash',       inputPer1k: 0.0001, outputPer1k: 0.0001, currency: 'CNY' },
  { provider: 'zhipu',    model: 'glm-4-plus',        inputPer1k: 0.007, outputPer1k: 0.007, currency: 'CNY' },
  { provider: 'zhipu',    model: 'glm-4-air',         inputPer1k: 0.001, outputPer1k: 0.001, currency: 'CNY' },

  // Anthropic Claude（人民币换算）
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', inputPer1k: 0.216, outputPer1k: 1.080, currency: 'CNY' },
  { provider: 'anthropic', model: 'claude-3-haiku-20240307',    inputPer1k: 0.018, outputPer1k: 0.072, currency: 'CNY' },

  // Moonshot Kimi
  { provider: 'moonshot', model: 'moonshot-v1-8k',     inputPer1k: 0.012, outputPer1k: 0.012, currency: 'CNY' },
  { provider: 'moonshot', model: 'moonshot-v1-32k',    inputPer1k: 0.024, outputPer1k: 0.024, currency: 'CNY' },
  { provider: 'moonshot', model: 'moonshot-v1-128k',   inputPer1k: 0.060, outputPer1k: 0.060, currency: 'CNY' },
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const now = new Date();

  console.log(`\n[M4 seed] ${PRICING_2026_09.length} entries, effectiveAt = ${now.toISOString()}`);
  if (isDryRun) console.log('[M4 seed] DRY RUN - nothing will be written\n');

  let createdCount = 0;
  let skippedCount = 0;

  for (const entry of PRICING_2026_09) {
    const { provider, model, inputPer1k, outputPer1k, currency } = entry;

    if (isDryRun) {
      console.log(`  would insert: ${provider}/${model}  in=${inputPer1k}  out=${outputPer1k} ${currency}`);
      continue;
    }

    // 同 (provider, model) 已存在更新单价？查最近一条
    const existing = await prisma.providerPricing.findFirst({
      where: { provider, model },
      orderBy: { effectiveAt: 'desc' },
    });

    if (
      existing &&
      Number(existing.inputPer1k) === inputPer1k &&
      Number(existing.outputPer1k) === outputPer1k
    ) {
      skippedCount++;
      console.log(`  skip (same price): ${provider}/${model}`);
      continue;
    }

    await prisma.providerPricing.create({
      data: {
        provider,
        model,
        inputPer1k,
        outputPer1k,
        currency,
        effectiveAt: now,
      },
    });
    createdCount++;
    console.log(`  + insert: ${provider}/${model}  in=${inputPer1k}  out=${outputPer1k} ${currency}`);
  }

  if (!isDryRun) {
    console.log(`\n[M4 seed] done. inserted=${createdCount}  skipped=${skippedCount}`);
  } else {
    console.log(`\n[M4 seed] DRY RUN done. would insert=${PRICING_2026_09.length} entries`);
  }
}

main()
  .catch((err) => {
    console.error('[M4 seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });