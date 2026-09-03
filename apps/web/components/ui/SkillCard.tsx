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

// 获取质量分数对应的 glass-pill 变体（plan §3.2 + glass.css）
function getQualityScorePillClass(score: number): string {
  if (score >= 80) return 'glass-pill-success';
  if (score >= 60) return 'glass-pill-warning';
  return 'glass-pill-neutral';
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
    // v2.0.7+：plan §3.2 技能卡片走 glass.css。
    // 主体用 .glass-card glass-card-hover，顶部 hover 时显现 cyan→indigo→magenta 渐变指示线（glass-top-bar-wide）。
    // 状态/质量/标签徽章改用 .glass-pill-* 系列，按钮改用 .glow-btn-primary / .glow-btn-ghost。
    <Link
      href={`/skills/${slug}`}
      className="glass-card glass-card-hover group block hover:-translate-y-1 relative transition-all"
    >
      <div className="glass-top-bar-wide opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-bold text-glass-text-primary line-clamp-1 group-hover:text-glass-text-link transition-colors">
            {name}
          </h3>
          {namespace && (
            <span className="glass-pill glass-pill-violet ml-2">
              {namespace.name}
            </span>
          )}
        </div>

        {/* 子分类和质量分数徽章 */}
        {(subcategory || qualityScore) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {subcategory && (
              <span className="glass-pill glass-pill-cyan">
                {getSubcategoryLabel(subcategory)}
              </span>
            )}
            {qualityScore && (
              <span className={`glass-pill ${getQualityScorePillClass(qualityScore)}`}>
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                {Math.round(qualityScore)}%
              </span>
            )}
          </div>
        )}

        <p className="text-sm text-glass-text-secondary mb-5 line-clamp-2 leading-relaxed">
          {description}
        </p>

        {/* Author and Stats */}
        <div className="flex items-center justify-between pt-4 border-t border-glass-border">
          <div className="flex items-center gap-2">
            {author?.image ? (
              <img
                src={author.image}
                alt={author.name || ''}
                className="w-8 h-8 rounded-full mr-2 ring-2 ring-glass-card-300/60"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-magenta-500 flex items-center justify-center mr-2 text-white text-xs font-bold">
                {author?.name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm text-glass-text-primary font-medium truncate max-w-30">{author?.name || '未知作者'}</span>
              {source && (
                <span className="text-xs text-glass-text-muted">
                  来源: {source}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center text-sm text-glass-text-secondary" title="下载次数">
              <svg className="w-4 h-4 mr-1 text-glass-text-link" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {formatNumber(downloadCount)}
            </span>
            <span className="flex items-center text-sm text-glass-text-secondary" title="Stars">
              <svg className="w-4 h-4 mr-1 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              {formatNumber(starCount)}
            </span>
          </div>
        </div>

        {/* Action Buttons: Comment and Download */}
        <div className="mt-4 flex gap-2">
          <button className="glow-btn glow-btn-ghost glow-btn-sm flex-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            评论
          </button>
          <button className="glow-btn glow-btn-primary glow-btn-sm flex-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                className="glass-pill"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 更新时间 */}
        {updatedAt && (
          <div className="mt-3 text-xs text-glass-text-muted">
            更新于 {formatDate(updatedAt)}
          </div>
        )}
      </div>
    </Link>
  );
}
