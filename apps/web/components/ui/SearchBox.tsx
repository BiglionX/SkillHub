'use client';

import { useState, useEffect, useRef, useCallback, FormEvent, KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Suggestion {
  text: string;
  type: 'skill' | 'category' | 'tag';
}

interface SearchBoxProps {
  placeholder?: string;
  className?: string;
}

// 定义搜索历史API的接口（已由 global.d.ts 定义，保留此用于类型检查）

export default function SearchBox({ 
  placeholder = '搜索 Skills...', 
  className = '' 
}: SearchBoxProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 防抖获取搜索建议
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}&limit=5`);
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 原生防抖函数
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debounce = <T extends (...args: any[]) => void>(func: T, wait: number) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    
    const debounced = ((..._debounceArgs: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(..._debounceArgs), wait);
    }) as T & { cancel: () => void };

    debounced.cancel = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    return debounced;
  };

  // 使用防抖获取搜索建议
  const debouncedFetch = useCallback(
    debounce((q: string) => fetchSuggestions(q), 300),
    [fetchSuggestions]
  );

  useEffect(() => {
    if (query.length >= 2) {
      debouncedFetch(query);
    } else {
      setSuggestions([]);
    }
    
    return () => {
      debouncedFetch.cancel();
    };
  }, [query, debouncedFetch]);

  // 点击外部关闭建议列表
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionRef.current &&
        !suggestionRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      // 添加到搜索历史
      if (typeof window !== 'undefined' && window.__searchHistoryAPI) {
        window.__searchHistoryAPI.addToHistory(query.trim());
      }
      
      router.push(`/skills?q=${encodeURIComponent(query.trim())}`);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestionText: string) => {
    setQuery(suggestionText);
    
    // 添加到搜索历史
    if (typeof window !== 'undefined' && window.__searchHistoryAPI) {
      window.__searchHistoryAPI.addToHistory(suggestionText);
    }
    
    router.push(`/skills?q=${encodeURIComponent(suggestionText)}`);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={suggestionRef}>
      <form onSubmit={handleSearch} className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => query.length >= 2 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-12 pr-32 py-3.5 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm hover:shadow-md"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-linear-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
        >
          搜索
        </button>
      </form>

      {/* 搜索建议下拉列表 */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-500">加载中...</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion.text)}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{suggestion.text}</span>
                    <span className="text-xs text-gray-500 capitalize px-2 py-1 bg-gray-100 rounded-full">
                      {suggestion.type === 'skill' ? '技能' : 
                       suggestion.type === 'category' ? '分类' : '标签'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 无建议提示 */}
      {showSuggestions && query.length >= 2 && suggestions.length === 0 && !isLoading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 px-4 py-3 text-sm text-gray-500">
          未找到相关建议
        </div>
      )}
    </div>
  );
}
