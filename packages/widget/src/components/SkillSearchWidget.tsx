'use client';

import React, { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { useSkillSearch } from '../hooks/useSkillSearch';
import type { SkillSearchWidgetProps } from '../types';

export function SkillSearchWidget({
  apiUrl = 'http://localhost:3000/api',
  placeholder = '搜索 AI 技能...',
  showAdvancedFilter = false,
  showResults = true,
  pageSize = 20,
  className = '',
  theme,
  onSearchComplete,
  onSkillClick,
}: SkillSearchWidgetProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('');

  const { results, loading, error, search, clearResults } = useSkillSearch({
    apiUrl,
    pageSize,
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      const searchResults = await search({
        query,
        category: category || undefined,
        language: language || undefined,
      });
      onSearchComplete?.(searchResults);
    } catch (err) {
      console.error('搜索失败:', err);
    }
  };

  const handleClear = () => {
    setQuery('');
    setCategory('');
    setLanguage('');
    clearResults();
  };

  const themeStyles = {
    '--widget-primary': theme?.primaryColor || '#3b82f6',
    '--widget-bg': theme?.backgroundColor || '#ffffff',
    '--widget-text': theme?.textColor || '#1f2937',
    '--widget-border': theme?.borderColor || '#e5e7eb',
    '--widget-radius': theme?.borderRadius || '0.5rem',
  } as React.CSSProperties;

  return (
    <div className={`skill-search-widget ${className}`} style={themeStyles}>
      {/* 搜索框 */}
      <form onSubmit={handleSearch} className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-10 pr-10 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
              style={{
                backgroundColor: 'var(--widget-bg)',
                color: 'var(--widget-text)',
                borderColor: 'var(--widget-border)',
                borderRadius: 'var(--widget-radius)',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {showAdvancedFilter && (
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              style={{
                borderColor: 'var(--widget-border)',
                borderRadius: 'var(--widget-radius)',
              }}
            >
              <Filter className="w-5 h-5 text-gray-600" />
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: 'var(--widget-primary)',
              borderRadius: 'var(--widget-radius)',
            }}
          >
            {loading ? '搜索中...' : '搜索'}
          </button>
        </div>

        {/* 高级筛选 */}
        {showFilters && showAdvancedFilter && (
          <div className="mt-3 p-4 border rounded-lg bg-gray-50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
                  style={{
                    borderRadius: 'var(--widget-radius)',
                  }}
                >
                  <option value="">全部分类</option>
                  <option value="development">开发工具</option>
                  <option value="data">数据处理</option>
                  <option value="automation">自动化</option>
                  <option value="ai">AI/ML</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  语言
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
                  style={{
                    borderRadius: 'var(--widget-radius)',
                  }}
                >
                  <option value="">全部语言</option>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="go">Go</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </form>

      {/* 搜索结果 */}
      {showResults && results.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="text-sm text-gray-600">
            找到 {results.length} 个结果
          </div>
          
          <div className="space-y-3">
            {results.map((skill) => (
              <div
                key={skill.id}
                onClick={() => onSkillClick?.(skill)}
                className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                style={{
                  backgroundColor: 'var(--widget-bg)',
                  borderColor: 'var(--widget-border)',
                  borderRadius: 'var(--widget-radius)',
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg" style={{ color: 'var(--widget-text)' }}>
                      {skill.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">{skill.description}</p>
                    
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {skill.category && (
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {skill.category}
                        </span>
                      )}
                      {skill.tags?.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm text-gray-500 ml-4">
                    {skill.starCount !== undefined && skill.starCount > 0 && (
                      <span>⭐ {skill.starCount}</span>
                    )}
                    {skill.downloadCount !== undefined && skill.downloadCount > 0 && (
                      <span>📥 {skill.downloadCount}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* 无结果提示 */}
      {showResults && query && !loading && results.length === 0 && !error && (
        <div className="mt-6 text-center py-8 text-gray-500">
          <p>未找到相关技能</p>
          <p className="text-sm mt-1">尝试调整搜索条件</p>
        </div>
      )}
    </div>
  );
}
