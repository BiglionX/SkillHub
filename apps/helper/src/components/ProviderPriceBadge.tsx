/**
 * ProviderPriceBadge — 单价标签（M4 · t09）
 *
 * 设计：
 * - 拉云端 /api/v2/provider-pricing（M4 · t13），缓存 1 小时
 * - 渲染 "{provider} · ¥{input}/{output} per 1M tokens"
 * - hover 显示详细 note
 *
 * 用法：
 *   <ProviderPriceBadge providerId="deepseek" model="deepseek-chat" />
 */

import { useEffect, useState } from 'react';

interface PricingEntry {
  providerId: string;
  model: string;
  inputPrice: number; // per 1M tokens, CNY
  outputPrice: number;
  currency: string;
  note?: string;
}

interface PricingPayload {
  version: number;
  prices: Record<string, PricingEntry>; // key = "{provider}:{model}"
}

let cached: { payload: PricingPayload; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

const API_BASE =
  (typeof window !== 'undefined' &&
    (window as unknown as { __SKILLHUB_API_BASE__?: string }).__SKILLHUB_API_BASE__) ||
  'https://skillhub.proclaw.cc';

export interface ProviderPriceBadgeProps {
  providerId: string;
  model: string;
}

export default function ProviderPriceBadge({
  providerId,
  model,
}: ProviderPriceBadgeProps) {
  const [entry, setEntry] = useState<PricingEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const key = `${providerId}:${model}`;
    const fresh =
      cached != null && Date.now() - cached.fetchedAt < CACHE_TTL_MS
        ? cached.payload.prices[key]
        : undefined;
    if (cached && fresh) {
      setEntry(fresh);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/v2/provider-pricing`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as PricingPayload;
        if (cancelled) return;
        cached = { payload: data, fetchedAt: Date.now() };
        setEntry(data.prices[key] ?? null);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId, model]);

  if (err) {
    return (
      <span className="glass-pill glass-pill-neutral text-[10px]" title={err}>
        单价未知
      </span>
    );
  }
  if (!entry) {
    return (
      <span className="glass-pill glass-pill-neutral text-[10px]">加载单价…</span>
    );
  }
  return (
    <span
      className="glass-pill glass-pill-cyan text-[10px]"
      title={entry.note ?? `${providerId}/${model}`}
    >
      ¥{entry.inputPrice.toFixed(2)} / ¥{entry.outputPrice.toFixed(2)} 每 1M
    </span>
  );
}
