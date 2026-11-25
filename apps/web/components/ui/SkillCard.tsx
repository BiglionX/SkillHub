'use client';

import Link from 'next/link';

interface SkillCardProps {
  id: string;
  name: string;
  slug: string;
  description: string;
  category?: string;
  subcategory?: string | null;
  tags?: string[] | null;
  qualityScore?: number | null;
  starCount?: number;
  downloadCount?: number;
  source?: string | null;
  author?: {
    name: string | null;
    image: string | null;
  } | null;
  namespace?: {
    name: string;
  } | null;
  updatedAt?: string;
}

// 子分类标签映射
const subcategoryLabels: Record<string, string> = {
  'ai_agent': 'AI代理',
  'llm_tools': 'LLM工具',
  'ml_framework': 'ML框架',
  'computer_vision': '计算机视觉',
  'speech_audio': '语音处理',
  'workflow_automation': '工作流自动化',
  'rpa_bot': 'RPA机器人',
  'task_scheduling': '任务调度',
  'database': '数据库',
  'data_viz': '数据可视化',
  'web_scraping': '网络爬虫',
  'mobile_app': '移动应用',
  'frontend': '前端开发',
  'ecommerce': '电商',
  'dev_tools': '开发工具',
  'testing': '测试工具',
  'documentation': '文档工具',
  'cli_tools': 'CLI工具',
};

function getSubcategoryLabel(subcategory: string): string {
  return subcategoryLabels[subcategory] || subcategory;
}

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// /skills 列表是浅色主题，徽章不能用深色玻璃的 glass-pill-* 变体（那些文字是白色）
function getQualityScorePillClass(score: number): string {
  if (score >= 80) return 'border-green-200 bg-green-50 text-green-700';
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

export default function SkillCard({
  name,
  slug,
  description,
  subcategory,
  tags,
  qualityScore,
  starCount = 0,
  downloadCount = 0,
  source,
  author,
  namespace,
  updatedAt,
}: Omit<SkillCardProps, 'id' | 'category'>) {
  // 格式化更新时间
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return '今天';
    if (diffInDays === 1) return '昨天';
    if (diffInDays < 7) return `${diffInDays}天前`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}周前`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}个月前`;
    return `${Math.floor(diffInDays / 365)}年前`;
  };

  return (
    <Link
      href={`/skills/${slug}`}
      className="group relative block rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-linear-to-r from-cyan-400 via-indigo-500 to-purple-500 opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="line-clamp-1 text-lg font-bold text-gray-900 transition-colors group-hover:text-cyan-600">
            {name}
          </h3>
          {namespace && (
            <span className="ml-2 inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 font-mono text-[11px] text-purple-700">
              {namespace.name}
            </span>
          )}
        </div>

        {/* 子分类和质量分数徽章 */}
        {(subcategory || qualityScore) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {subcategory && (
              <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-mono text-[11px] text-cyan-700">
                {getSubcategoryLabel(subcategory)}
              </span>
            )}
            {qualityScore && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] ${getQualityScorePillClass(qualityScore)}`}>
                <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                {Math.round(qualityScore)}%
              </span>
            )}
          </div>
        )}

        <p className="mb-5 line-clamp-2 text-sm leading-relaxed text-gray-600">
          {description}
        </p>

        {/* Author and Stats */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2">
            {author?.image ? (
              <img
                src={author.image}
                alt={author.name || ''}
                className="mr-2 h-8 w-8 rounded-full object-cover ring-2 ring-blue-100"
              />
            ) : (
              <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-cyan-400 to-purple-500 text-xs font-bold text-white">
                {author?.name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <div className="flex flex-col">
              <span className="max-w-30 truncate text-sm font-medium text-gray-900">{author?.name || '未知作者'}</span>
              {source && (
                <span className="text-xs text-gray-400">
                  来源: {source}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center text-sm text-gray-500" title="下载次数">
              <svg className="mr-1 h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {formatNumber(downloadCount)}
            </span>
            <span className="flex items-center text-sm text-gray-500" title="Stars">
              <svg className="mr-1 h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              {formatNumber(starCount)}
            </span>
          </div>
        </div>

        {/* Action Buttons: Comment and Download */}
        <div className="mt-4 flex gap-2">
          <button type="button" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-cyan-300 hover:text-cyan-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            评论
          </button>
          <button type="button" className="glow-btn glow-btn-primary glow-btn-sm flex-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下载
          </button>
        </div>

        {/* 标签 */}
        {tags && tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.slice(0, 3).map((tag: string, idx: number) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-[11px] text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 更新时间 */}
        {updatedAt && (
          <div className="mt-3 text-xs text-gray-400">
            更新于 {formatDate(updatedAt)}
          </div>
        )}
      </div>
    </Link>
  );
}
