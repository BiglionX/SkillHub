'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers/SessionProvider';
import Link from 'next/link';
import EnhancedSearchBox from '@/components/ui/EnhancedSearchBox';
import SkillCard from '@/components/ui/SkillCard';
import AdvancedFilterPanel from '@/components/ui/AdvancedFilterPanel';
import Pagination from '@/components/ui/Pagination';
import SearchHistory from '@/components/ui/SearchHistory';
import GlobalSearchLoadingIndicator from '@/components/ui/GlobalSearchLoadingIndicator';
import PromoCards from '@/components/ui/PromoCards';
import DSHBanner from '@/components/ui/DSHBanner';
import ChatIntentInput from '@/components/chat-intent-input'; // v3 M1: 智能问答入口
import OnboardingHelperPrompt from '@/components/onboarding-helper-prompt'; // v3 M1: Onboarding 引导
import SoftwareIconBar from '@/components/software-icon-bar'; // v3 M1: 软件过滤栏
import SoftwarePickerDialog from '@/components/software-picker-dialog'; // v3 M1: 已装软件多选

interface SearchParams {
  q?: string;
  category?: string;
  subcategory?: string;
  language?: string;
  source?: string;
  license?: string;
  minQuality?: string;
  minStars?: string;
  maxStars?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  page?: string;
  semantic?: string;
  global?: string;
  software?: string; // v3 M1：按软件过滤
}

interface SkillWithRelations {
  id: string;
  name: string;
  slug: string;
  description: string;
  downloadCount: number;
  starCount: number;
  rating: number;
  source?: string | null;
  tags?: string[] | null;
  category?: string;
  subcategory?: string | null;
  confidence?: number | null;
  author?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  namespace?: {
    id: string;
    slug: string;
    name: string;
  } | null;
}

interface SkillsData {
  skills: SkillWithRelations[];
  total: number;
  categoryStats: Record<string, unknown>[];
  databaseError: boolean;
}

const categoryNames: Record<string, string> = {
  'ai_ml': 'AI/ML',
  'development': '开发工具',
  'data_analytics': '数据分析',
  'automation': '自动化',
  'communication': '通讯协作',
  'business': '商业金融',
  'security': '安全',
  'devops': 'DevOps',
  'web_mobile': 'Web/移动',
  'productivity': '生产力',
  'general': '其他',
};

export default function PublicSkillsClient({ searchParams }: { searchParams: SearchParams }) {
  const { data: session } = useSession();
  const [data, setData] = useState<SkillsData | null>(null);
  const [loading, setLoading] = useState(true);

  const query = searchParams.q;
  const software = searchParams.software; // v3 M1
  const category = searchParams.category;
  const subcategory = searchParams.subcategory;
  const language = searchParams.language;
  const source = searchParams.source;
  const license = searchParams.license;
  const minQuality = searchParams.minQuality ? parseInt(searchParams.minQuality) : undefined;
  const minStars = searchParams.minStars ? parseInt(searchParams.minStars) : undefined;
  const maxStars = searchParams.maxStars ? parseInt(searchParams.maxStars) : undefined;
  const dateFrom = searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined;
  const dateTo = searchParams.dateTo ? new Date(searchParams.dateTo) : undefined;
  const sortBy = searchParams.sortBy || 'relevance';
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const useSemanticSearch = searchParams.semantic === 'true';
  const useGlobalSearch = searchParams.global === 'true';
  const [globalResults, setGlobalResults] = useState<SkillWithRelations[]>([]);

  const fetchData = async () => {
    setLoading(true);
    setData(null);
    setGlobalResults([]);

    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (subcategory) params.set('subcategory', subcategory);
    if (language) params.set('language', language);
    if (source) params.set('source', source);
    if (license) params.set('license', license);
    if (minQuality) params.set('minQuality', String(minQuality));
    if (minStars) params.set('minStars', String(minStars));
    if (maxStars) params.set('maxStars', String(maxStars));
    if (dateFrom) params.set('dateFrom', dateFrom.toISOString());
    if (dateTo) params.set('dateTo', dateTo.toISOString());
    if (sortBy) params.set('sortBy', sortBy);
    if (searchParams.page) params.set('page', searchParams.page);

    if (useGlobalSearch && query) {
      try {
        const response = await fetch(
          `/api/search/global?q=${encodeURIComponent(query)}`,
          { cache: 'no-store' }
        );
        if (response.ok) {
          const result = await response.json();
          setData({
            skills: result.local.skills || [],
            total: result.local.total || 0,
            categoryStats: [],
            databaseError: false,
          });
          setGlobalResults(result.global.skills || []);
        } else {
          // Fallback to public API
          const res = await fetch(`/api/skills/public?${params}`, { cache: 'no-store' });
          const d = await res.json();
          setData(d);
        }
      } catch {
        const res = await fetch(`/api/skills/public?${params}`, { cache: 'no-store' });
        const d = await res.json();
        setData(d);
      }
    } else {
      const res = await fetch(`/api/skills/public?${params}`, { cache: 'no-store' });
      const d = await res.json();
      setData(d);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [
    query, category, subcategory, language, source, license,
    minQuality, minStars, maxStars, dateFrom, dateTo, sortBy, page,
    useGlobalSearch, useSemanticSearch,
  ]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 via-white to-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-500 text-lg">正在加载技能数据...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (data?.databaseError) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 via-white to-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="text-center bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/50 max-w-lg mx-auto p-12">
            <div className="w-20 h-20 mx-auto mb-6 bg-blue-50 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">数据库连接中</h3>
            <p className="text-gray-600 mb-6">数据库正在唤醒，首次加载可能需要几秒钟</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              刷新重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { skills = [], total = 0, categoryStats = [] } = data || {};

  // Build categories
  const categories = [
    { value: '', label: '全部', count: total },
    ...(categoryStats as Array<{ category: string; _count: number }>)
      .map(stat => ({
        value: stat.category,
        label: categoryNames[stat.category] || stat.category,
        count: stat._count,
      }))
      .sort((a, b) => b.count - a.count),
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 via-white to-gray-100">
      {/* 顶部导航 */}
      <nav className="sticky top-0 z-50 w-full px-6 py-2 border-b border-gray-200 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center group">
              <img src="/skillhub.png" alt="Skill Hub Logo" className="h-16 w-auto object-contain transition-transform group-hover:scale-105" />
            </Link>
          </div>
          <div className="flex items-center space-x-6">
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              首页
            </Link>
            <Link
              href="/bounties"
              className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              技能悬赏
            </Link>
            <Link
              href="https://github.com/BigLionX/SkillHub"
              target="_blank"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              GitHub
            </Link>
            <div className="flex items-center space-x-3 pl-4 border-l border-gray-200">
              {session ? (
                <>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    {session.user?.image ? (
                      <img
                        src={session.user.image}
                        alt={session.user.name || '用户头像'}
                        className="w-8 h-8 rounded-full object-cover border-2 border-blue-200"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                        {session.user?.name?.charAt(0) || session.user?.email?.charAt(0) || 'U'}
                      </div>
                    )}
                    <span className="max-w-25 truncate">
                      {session.user?.name || session.user?.email}
                    </span>
                  </Link>
                  <button
                    onClick={async () => {
                      const { handleSignOut } = await import('@/app/actions/auth-actions');
                      await handleSignOut();
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-red-600 border border-gray-300 hover:border-red-300 rounded-lg transition-colors"
                  >
                    退出
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    登录
                  </Link>
                  <Link
                    href="/register"
                    className="px-5 py-2.5 text-sm font-medium text-white bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    注册
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-linear-to-r from-blue-600 via-indigo-700 to-purple-800 text-white">
        {/* 背景：科技主题图片（叠加 blend 增强质感） */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1920&auto=format&fit=crop')",
          }}
        />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDYwIEwgNjAgMCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIGZpbGwtb3BhY2l0eT0iMC4zIiBzdHJva2Utb3BhY2l0eT0iMC4zIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium mb-6">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
              发现优秀的 AI Agent 技能
            </div>
            <h1 className="text-5xl font-extrabold mb-6 tracking-tight">
              Skill信息聚合平台
            </h1>
            <p className="gradient-text text-sm font-medium mb-3 max-w-2xl mx-auto tracking-wide">
              ✨ v2.0.7+ 全新玻璃拟态体验
            </p>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
              探索、下载和分享社区创建的优质技能，为你的 AI Agent 赋能无限可能
            </p>

            <div className="max-w-3xl mx-auto">
              <EnhancedSearchBox
                placeholder="搜索技能名称、描述或标签..."
                enableSemanticSearch={useSemanticSearch}
                initialQuery={query || ''}
              />
              <div className="mt-2 text-left">
                <SearchHistory maxItems={10} />
              </div>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{total}</div>
                <div className="text-sm text-blue-100">可用技能</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{categories.length - 1}</div>
                <div className="text-sm text-blue-100">分类</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">
                  {'\u221E'}
                </div>
                <div className="text-sm text-blue-100">可能性</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DSH 开源融合广告横幅 */}
      <DSHBanner />

      {/* v3 M1：软件过滤栏（顶部图标，点击过滤 Skill） */}
      <SoftwareIconBar activeSoftwareName={software} />

      {/* v3 M1：智能问答入口（占屏 60% 大对话框，PRD §2.4 统一推荐逻辑） */}
      <ChatIntentInput />

      {/* v3 M1：Onboarding 引导（首次访问用户看到） */}
      <OnboardingHelperPrompt />
      <SoftwarePickerDialog />

      {/* 快速标签栏 */}
      {categories.length > 1 && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap mr-2">快速筛选：</span>
              {categories.slice(0, 8).map((cat) => (
                <Link
                  key={cat.value}
                  href={cat.value ? `/skills?category=${cat.value}` : '/skills'}
                  className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    category === cat.value
                      ? 'bg-linear-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.label}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    category === cat.value ? 'bg-white/20' : 'bg-gray-200'
                  }`}>
                    {cat.count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-8">
          {/* 侧边栏 - 高级筛选 */}
          <aside className="w-64 shrink-0">
            <AdvancedFilterPanel
              categories={categories.filter(c => c.value).map(c => ({
                value: c.value,
                label: c.label,
                count: c.count,
              }))}
            />

            <div className="mt-6">
              <PromoCards />
            </div>
          </aside>

          {/* 主内容区 */}
          <main className="flex-1">
            <GlobalSearchLoadingIndicator
              isGlobalSearch={useGlobalSearch && !!query}
              hasLocalResults={skills.length > 0}
              hasGlobalResults={globalResults.length > 0}
            />

            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  找到 <span className="font-bold text-blue-600">{total}</span> 个 Skills
                </p>
              </div>
              {skills.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>按</span>
                  <select className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>下载量</option>
                    <option>评分</option>
                    <option>最新</option>
                  </select>
                  <span>排序</span>
                </div>
              )}
            </div>

            {/* Skills 网格 */}
            {skills.length === 0 && globalResults.length === 0 ? (
              <div className="text-center py-20 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/50">
                <div className="w-20 h-20 mx-auto mb-6 bg-linear-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">未找到 Skills</h3>
                <p className="text-gray-600 mb-6">尝试调整搜索条件或浏览其他分类</p>
                <Link
                  href="/skills"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  返回首页
                </Link>
              </div>
            ) : (
              <>
                {/* 本地搜索结果 */}
                {skills.length > 0 && (
                  <section className="mb-12">
                    {searchParams.global === 'true' && !!query && (
                      <h2 className="text-xl font-bold mb-4 text-gray-900">
                        本站结果 ({skills.length})
                      </h2>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {skills.map((skill: SkillWithRelations) => (
                        <SkillCard
                          key={skill.id}
                          name={skill.name}
                          slug={skill.slug}
                          description={skill.description}
                          subcategory={skill.subcategory}
                          tags={skill.tags}
                          qualityScore={skill.confidence}
                          starCount={skill.starCount}
                          downloadCount={skill.downloadCount}
                          source={skill.source}
                          author={skill.author}
                          namespace={skill.namespace}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* 全网搜索结果 */}
                {searchParams.global === 'true' && !!query && globalResults.length > 0 && (
                  <section className="mt-12">
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="text-xl font-bold text-gray-900">
                        全网搜索结果 ({globalResults.length})
                      </h2>
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
                        实时爬取
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {globalResults.map((skill: SkillWithRelations) => (
                        <SkillCard
                          key={skill.id}
                          name={skill.name}
                          slug={skill.slug}
                          description={skill.description}
                          subcategory={skill.subcategory}
                          tags={skill.tags}
                          qualityScore={skill.confidence}
                          starCount={skill.starCount}
                          downloadCount={skill.downloadCount}
                          source={skill.source}
                          author={skill.author}
                          namespace={skill.namespace}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* 只有本地结果时显示原有网格 */}
                {!(searchParams.global === 'true' && !!query) && skills.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {skills.map((skill: SkillWithRelations) => (
                      <SkillCard
                        key={skill.id}
                        name={skill.name}
                        slug={skill.slug}
                        description={skill.description}
                        subcategory={skill.subcategory}
                        tags={skill.tags}
                        qualityScore={skill.confidence}
                        starCount={skill.starCount}
                        downloadCount={skill.downloadCount}
                        source={skill.source}
                        author={skill.author}
                        namespace={skill.namespace}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 分页 */}
            {total > limit && (
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(total / limit)}
                totalItems={total}
                pageSize={limit}
                className="mt-8"
              />
            )}
          </main>
        </div>
      </div>

      {/* 页脚 */}
      <footer className="bg-gray-900 text-gray-300 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="mb-4">
                <img src="/skillhub.png" alt="Skill Hub Logo" className="h-14 w-auto object-contain" />
              </div>
              <p className="text-gray-400 max-w-md leading-relaxed">
                企业级开源 AI Agent 技能注册中心。发现、发布和管理高质量的 AI 技能，为你的项目赋能。
              </p>
              <div className="flex space-x-4 mt-6">
                <a
                  href="https://github.com/BigLionX/SkillHub"
                  target="_blank"
                  className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">快速链接</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="/" className="hover:text-white transition-colors">首页</Link>
                </li>
                <li>
                  <Link href="/bounties" className="hover:text-white transition-colors">技能悬赏</Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white transition-colors">登录</Link>
                </li>
                <li>
                  <Link href="/register" className="hover:text-white transition-colors">注册</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">资源</h3>
              <ul className="space-y-2">
                <li>
                  <a href="https://github.com/BigLionX/SkillHub" target="_blank" className="hover:text-white transition-colors">GitHub</a>
                </li>
                <li>
                  <a href="https://github.com/BigLionX/SkillHub/blob/main/README.md" target="_blank" className="hover:text-white transition-colors">文档</a>
                </li>
                <li>
                  <a href="https://github.com/BigLionX/SkillHub/issues" target="_blank" className="hover:text-white transition-colors">反馈问题</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} Skill Hub. 基于 Apache-2.0 许可证开源。</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
