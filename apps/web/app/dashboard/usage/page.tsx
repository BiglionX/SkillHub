'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/providers/SessionProvider';
import Link from 'next/link';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Coins, Layers, Bot, FileBarChart, RefreshCw } from 'lucide-react';
import {
  AreaChart, Area, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ByDayRow {
  date: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costCny: number;
}
interface ByProviderRow {
  provider: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costCny: number;
  sharePct: number;
}
interface BySkillRow {
  skillSlug: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costCny: number;
}
interface UsagePayload {
  range: '7d' | '30d' | '90d';
  since: string;
  totals: {
    calls: number;
    tokensIn: number;
    tokensOut: number;
    costCny: number;
    distinct_skills: number;
    distinct_providers: number;
  };
  by_day: ByDayRow[];
  by_provider: ByProviderRow[];
  by_skill: BySkillRow[];
}

const PROVIDER_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899'];

const PROVIDER_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  zhipu: '智谱 GLM',
  anthropic: 'Anthropic',
  moonshot: 'Moonshot Kimi',
};

export default function UsageDashboardPage() {
  const { status } = useSession();
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-usage', range],
    queryFn: async () => {
      const res = await fetch(`/api/v2/user/usage?range=${range}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('请先登录');
        throw new Error('获取用量数据失败');
      }
      const json = (await res.json()) as UsagePayload;
      return json;
    },
    enabled: status === 'authenticated',
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000, // 1 分钟
  });

  // 未登录拦截
  if (status === 'unauthenticated') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用量中心</h1>
          <p className="mt-1 text-sm text-gray-600">查看您的 LLM 调用用量与成本</p>
        </div>
        <div className="flex items-center justify-center min-h-100 rounded-xl border border-gray-200 bg-white">
          <div className="text-center">
            <FileBarChart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">请先登录</h2>
            <p className="text-gray-600 mb-4">登录后才能查看个人用量数据</p>
            <Link
              href="/auth/signin"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              去登录
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const totals = data?.totals ?? {
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    costCny: 0,
    distinct_skills: 0,
    distinct_providers: 0,
  };
  const byDay = data?.by_day ?? [];
  const byProvider = data?.by_provider ?? [];
  const bySkill = data?.by_skill ?? [];

  const costYuan = totals.costCny.toFixed(4);

  // Provider 饼图数据
  const pieData = byProvider.map((p) => ({
    name: PROVIDER_LABEL[p.provider] ?? p.provider,
    rawProvider: p.provider,
    value: p.calls,
    sharePct: p.sharePct,
    costCny: p.costCny,
  }));

  return (
    <div className="space-y-6">
      {/* 标题 + 时间范围 + 刷新 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用量中心</h1>
          <p className="mt-1 text-sm text-gray-600">
            桌面助手 + Web 端调用 LLM 的聚合数据；本地用量以 SQLite 为准，云端汇总以本页为准
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-1 bg-white rounded-lg border border-gray-200 p-1">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  range === r
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {r === '7d' ? '最近 7 天' : r === '30d' ? '最近 30 天' : '最近 90 天'}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="刷新数据"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p>{error instanceof Error ? error.message : '加载用量失败'}</p>
        </div>
      )}

      {/* 4 个指标卡 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <UsageStatCard
          icon={<Activity className="w-6 h-6" />}
          color="blue"
          title="调用次数"
          value={totals.calls.toLocaleString()}
          subtitle={`${totals.distinct_providers} 个 Provider / ${totals.distinct_skills} 个 Skill`}
        />
        <UsageStatCard
          icon={<ArrowDownToLine className="w-6 h-6" />}
          color="cyan"
          title="Input Tokens"
          value={totals.tokensIn.toLocaleString()}
          subtitle={`≈ ${(totals.tokensIn / 1000).toFixed(2)} K`}
        />
        <UsageStatCard
          icon={<ArrowUpFromLine className="w-6 h-6" />}
          color="purple"
          title="Output Tokens"
          value={totals.tokensOut.toLocaleString()}
          subtitle={`≈ ${(totals.tokensOut / 1000).toFixed(2)} K`}
        />
        <UsageStatCard
          icon={<Coins className="w-6 h-6" />}
          color="amber"
          title="估算成本"
          value={`¥ ${costYuan}`}
          subtitle="按当前 Provider 单价"
        />
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 每日 tokens 趋势 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">每日 Tokens 趋势</h3>
          {byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="tokensIn" name="Input" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} />
                <Area type="monotone" dataKey="tokensOut" name="Output" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>

        {/* 每日调用次数 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">每日调用次数</h3>
          {byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="calls" name="调用次数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>

        {/* Provider 占比 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Provider 占比（按调用次数）</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, idx) => (
                    <Cell key={`provider-${idx}`} fill={PROVIDER_COLORS[idx % PROVIDER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, props) => {
                    const payload = props.payload as (typeof pieData)[number];
                    return [
                      `${value} 次（${payload.sharePct.toFixed(1)}% / ¥${payload.costCny.toFixed(4)}）`,
                      payload.name,
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>

        {/* 每日成本 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">每日成本（¥）</h3>
          {byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number) => [`¥ ${value.toFixed(4)}`, '成本']}
                />
                <Line type="monotone" dataKey="costCny" name="成本" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>

      {/* Top 10 Skill 表格 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5" /> 调起最多的 Skill（Top 10）
          </h3>
          <span className="text-xs text-gray-500">按调用次数排序</span>
        </div>
        {bySkill.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Skill</th>
                  <th className="py-2 pr-3 text-right">调用</th>
                  <th className="py-2 pr-3 text-right">Input</th>
                  <th className="py-2 pr-3 text-right">Output</th>
                  <th className="py-2 pr-3 text-right">成本</th>
                </tr>
              </thead>
              <tbody>
                {bySkill.map((s, idx) => (
                  <tr key={`${s.skillSlug}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-3 text-gray-500">{idx + 1}</td>
                    <td className="py-2 pr-3 font-mono text-gray-900">
                      {s.skillSlug === '(未关联)' ? (
                        <span className="text-gray-500 italic">未关联</span>
                      ) : (
                        s.skillSlug
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{s.calls}</td>
                    <td className="py-2 pr-3 text-right">{s.tokensIn.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right">{s.tokensOut.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right">¥ {s.costCny.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <Bot className="w-5 h-5 mr-2" /> 暂无调用记录 — 让助手跑一次搜索就有了
          </div>
        )}
      </div>

      {/* 隐私说明 */}
      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
        <p>
          <strong>隐私说明：</strong>
          所有用量记录由桌面助手（v2.0.5+）或 Web 端 NLU 调用产生。游客匿名记录可通过助手设置页「关联到账号」合并到当前用户。
        </p>
      </div>
    </div>
  );
}

interface UsageStatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  color: 'blue' | 'cyan' | 'purple' | 'amber';
}

function UsageStatCard({ icon, title, value, subtitle, color }: UsageStatCardProps) {
  const colorMap = {
    blue: 'bg-blue-100 text-blue-600',
    cyan: 'bg-cyan-100 text-cyan-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
  };
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
          <p className="text-xs text-gray-500 mt-1 truncate">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-full ${colorMap[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-70 text-gray-400">
      <Activity className="w-8 h-8 mb-2" />
      <p className="text-sm">暂无数据</p>
    </div>
  );
}