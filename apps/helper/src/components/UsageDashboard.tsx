/**
 * UsageDashboard — 用量可视化组件（M4 · t10）
 *
 * 设计：
 * - 4 个指标卡：今日 / 7 日 / 30 日 / 总成本
 * - 按 Skill 拆分柱状图（recharts BarChart）
 * - 按 Provider 分布饼图（recharts PieChart）
 * - 数据来源：invoke('get_local_usage_summary', { range })
 *   桌面端走本地 SQLite，登录态也可同步云端走 /api/v2/user/usage（M4 · t17）
 *
 * 用法：
 *   <UsageDashboard range="7d" />
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface UsageByKey {
  key: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost: number;
}

interface UsageDaily {
  date: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost: number;
}

interface UsageSummary {
  total_calls: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost: number;
  range: string;
  by_skill: UsageByKey[];
  by_provider: UsageByKey[];
  daily: UsageDaily[];
}

export interface UsageDashboardProps {
  /// today | 7d | 30d
  range: 'today' | '7d' | '30d';
}

const PIE_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ef4444'];

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-card-soft p-4">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold gradient-text-h">{value}</div>
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </div>
  );
}

export default function UsageDashboard({ range }: UsageDashboardProps) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await invoke<UsageSummary>('get_local_usage_summary', { range });
        if (!cancelled) setSummary(s);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (err) {
    return (
      <div role="alert" className="glass-hint-danger text-[12px]">
        读取用量失败：{err}
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="text-[12px] text-muted">加载用量数据中…</div>
    );
  }

  const label =
    range === 'today' ? '今日' : range === '7d' ? '7 日' : '30 日';
  const fmtCost = (n: number) => `¥${n.toFixed(4)}`;

  return (
    <div className="flex flex-col gap-5">
      {/* 指标卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label={`${label}调用`}
          value={summary.total_calls.toString()}
        />
        <MetricCard
          label={`${label}输入 token`}
          value={summary.total_tokens_in.toLocaleString()}
        />
        <MetricCard
          label={`${label}输出 token`}
          value={summary.total_tokens_out.toLocaleString()}
        />
        <MetricCard
          label={`${label}成本`}
          value={fmtCost(summary.total_cost)}
          hint="按 ProviderPricing 估算"
        />
      </div>

      {/* 按 Skill 拆分（柱状） */}
      {summary.by_skill.length > 0 && (
        <div className="glass-card-soft p-4">
          <div className="text-[13px] font-semibold text-primary mb-3">按 Skill 拆分</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary.by_skill.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="key"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="calls" fill="#06b6d4" name="调用次数" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 按 Provider 分布（饼图） */}
      {summary.by_provider.length > 0 && (
        <div className="glass-card-soft p-4">
          <div className="text-[13px] font-semibold text-primary mb-3">Provider 分布</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={summary.by_provider}
                dataKey="calls"
                nameKey="key"
                outerRadius={80}
                label
              >
                {summary.by_provider.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {summary.daily.length === 0 && (
        <div className="text-[12px] text-muted text-center py-8">
          暂无 {label} 用量记录
        </div>
      )}
    </div>
  );
}
