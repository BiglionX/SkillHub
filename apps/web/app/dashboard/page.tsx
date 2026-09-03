'use client';

import { useQuery } from '@tanstack/react-query';
import { Package, Download, DollarSign, RefreshCw, Bot, Globe, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/providers/SessionProvider';
import { StatCard, StatsGrid } from '@/components/ui/StatCard';
import { TimeRangeSelector, type TimeRange } from '@/components/ui/TimeRangeSelector';

interface PersonalStats {
  totalSkills: number;
  totalDownloads: number;
  averageRating: number;
  totalRevenue: number;
  activeUsers: number;
  skillsByStatus: Array<{ status: string; count: number }>;
  recentSkills: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    downloadCount: number;
    rating: number;
    reviewCount: number;
    price: number;
    updatedAt: string;
  }>;
  downloadsTrend: Array<{ date: string; downloads: number }>;
  timeRange: string;
}

export default function DashboardPage() {
  const { status } = useSession();
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  // 获取个人统计数据（仅在已登录时请求）
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['personal-stats', timeRange],
    queryFn: async () => {
      // 双重检查：确保已登录才发起请求
      if (status !== 'authenticated') {
        throw new Error('未登录');
      }
      
      const response = await fetch(`/api/analytics/personal?timeRange=${timeRange}`, {
        credentials: 'include', // 携带 cookies
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('请先登录');
        }
        throw new Error('获取统计数据失败');
      }
      const result = await response.json();
      return result.data as PersonalStats;
    },
    staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
    enabled: status === 'authenticated', // 仅在已登录时启用查询
    retry: false, // 禁用自动重试
    refetchOnWindowFocus: false, // 禁用窗口聚焦时重新获取
    refetchOnMount: false, // 禁用挂载时重新获取
    refetchOnReconnect: false, // 禁用网络重连时重新获取
  });

  // 如果未登录或加载中，显示相应提示
  if (status === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">请先登录</h2>
          <p className="text-gray-600 mb-4">登录后才能查看个人数据</p>
          <Link
            href="/auth/signin"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            去登录
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  const stats = data || {
    totalSkills: 0,
    totalDownloads: 0,
    averageRating: 0,
    totalRevenue: 0,
    activeUsers: 0,
    skillsByStatus: [],
    recentSkills: [],
    downloadsTrend: [],
    timeRange: 'all',
  };

  // 计算平均评分的显示值
  const displayRating = stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '0.0';

  return (
    <div className="space-y-8">
      {/* 页面标题和操作 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">欢迎回来! 👋</h1>
          <p className="mt-1 text-sm text-gray-500">
            这里是您的个人数据中心，查看和管理您的 Skills
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
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

      {/* 快捷操作 - 移到标题栏下方 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/analytics"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            查看详细分析
          </Link>
          <Link
            href="/dashboard/skills/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <Package className="w-4 h-4 mr-2" />
            发布新 Skill
          </Link>
          <Link
            href="/dashboard/skills"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            管理 Skills
          </Link>
          <Link
            href="/dashboard/bounties"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            我的悬赏
          </Link>
          <Link
            href="/dashboard/namespaces"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            管理命名空间
          </Link>
          <Link
            href="/widget-demo"
            className="inline-flex items-center px-4 py-2 border border-purple-300 text-sm font-medium rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
            Skill 元数据管理器
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-200 text-purple-800">
              NEW
            </span>
          </Link>
          <Link
            href="/dashboard/integration"
            className="inline-flex items-center px-4 py-2 border border-purple-300 text-sm font-medium rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            SDK 集成指南
          </Link>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p>加载数据失败，请重试</p>
        </div>
      )}

      {/* 统计卡片网格（v2.0.7+：StatCard 改用 GlassTone，与 admin/page.tsx 对齐） */}
      <StatsGrid columns={4}>
        <StatCard
          title="我的 Skills"
          value={stats.totalSkills}
          icon={<Package className="w-6 h-6" />}
          color="cyan"
          isLoading={isLoading}
          trend={{
            value: 12,
            label: '较上月',
            isPositive: true,
          }}
        />
        <StatCard
          title="总下载量"
          value={stats.totalDownloads.toLocaleString()}
          icon={<Download className="w-6 h-6" />}
          color="success"
          isLoading={isLoading}
          trend={{
            value: 8,
            label: '较上周',
            isPositive: true,
          }}
        />
        <StatCard
          title="平均评分"
          value={displayRating}
          icon={<span className="text-2xl">⭐</span>}
          color="warning"
          isLoading={isLoading}
        />
        <StatCard
          title="总收入"
          value={`¥${stats.totalRevenue.toLocaleString()}`}
          icon={<DollarSign className="w-6 h-6" />}
          color="magenta"
          isLoading={isLoading}
          trend={{
            value: 15,
            label: '较上月',
            isPositive: true,
          }}
        />
      </StatsGrid>

      {/* Skills状态分布 */}
      {stats.skillsByStatus.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Skills 状态分布</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.skillsByStatus.map((item) => (
              <div key={item.status} className="text-center">
                <div className="text-2xl font-bold text-gray-900">{item.count}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {item.status === 'APPROVED' && '已发布'}
                  {item.status === 'DRAFT' && '草稿'}
                  {item.status === 'PENDING_REVIEW' && '审核中'}
                  {item.status === 'UNDER_REVIEW' && '审核中'}
                  {item.status === 'REJECTED' && '已拒绝'}
                  {item.status === 'ARCHIVED' && '已归档'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近的 Skills */}
      {stats.recentSkills.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">最近更新的 Skills</h2>
            <Link
              href="/dashboard/skills"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              查看全部 →
            </Link>
          </div>
          <div className="space-y-3">
            {stats.recentSkills.slice(0, 5).map((skill) => (
              <Link
                key={skill.id}
                href={`/dashboard/skills/${skill.slug}`}
                className="block p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{skill.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Download className="w-4 h-4" />
                        {skill.downloadCount}
                      </span>
                      {skill.reviewCount > 0 && (
                        <span className="flex items-center gap-1">
                          ⭐ {skill.rating.toFixed(1)}
                        </span>
                      )}
                      <span>
                        {new Date(skill.updatedAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      skill.status === 'APPROVED'
                        ? 'bg-green-100 text-green-800'
                        : skill.status === 'DRAFT'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {skill.status === 'APPROVED' && '已发布'}
                    {skill.status === 'DRAFT' && '草稿'}
                    {skill.status === 'PENDING_REVIEW' && '审核中'}
                    {skill.status === 'UNDER_REVIEW' && '审核中'}
                    {skill.status === 'REJECTED' && '已拒绝'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* AI Agent 集成推广卡片 */}
      <div className="mt-8">
        <a
          href="https://skillhub.proclaw.cc/api/openapi"
          target="_blank"
          rel="noopener noreferrer"
          className="group block relative overflow-hidden bg-linear-to-r from-orange-500 via-red-500 to-pink-500 rounded-xl p-6 text-white hover:shadow-xl transition-all duration-300 hover:scale-[1.01]"
        >
          {/* 背景装饰 */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -ml-16 -mb-16" />
          
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">AI Agent 集成</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-400 text-purple-900 mt-1">
                      NEW
                    </span>
                  </div>
                </div>
                <p className="text-sm text-white/90 mb-3">
                  OpenAPI 3.0 标准接口，支持 Flowise、LangChain、Dify 等平台自动发现和调用 SkillHub 的技能
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-white/20 backdrop-blur-sm">
                    <Globe className="w-3 h-3 mr-1" />
                    OpenAPI 3.0
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-white/20 backdrop-blur-sm">
                    <Bot className="w-3 h-3 mr-1" />
                    AI 工具
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-white/20 backdrop-blur-sm">
                    ⚡ 即插即用
                  </span>
                </div>
              </div>
              <ArrowRight className="w-6 h-6 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all mt-3" />
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}
