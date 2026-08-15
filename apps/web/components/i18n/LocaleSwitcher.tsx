/**
 * 语言切换器组件
 *
 * 提供 4 种语言切换：中文 / English / 日本語 / 한국어
 *
 * 三种变体：
 * - dropdown：下拉菜单（默认）
 * - inline：横向列表
 * - icon：仅图标（紧凑）
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { localeMeta, locales, type Locale } from '../../i18n/config';

export type LocaleSwitcherVariant = 'dropdown' | 'inline' | 'icon';

export interface LocaleSwitcherProps {
  /** UI 变体 */
  variant?: LocaleSwitcherVariant;
  /** 自定义 className */
  className?: string;
  /** 是否显示旗帜 emoji */
  showFlag?: boolean;
  /** 是否显示原生语言名（默认显示英文名） */
  showNativeName?: boolean;
}

export default function LocaleSwitcher({
  variant = 'dropdown',
  className = '',
  showFlag = true,
  showNativeName = false,
}: LocaleSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (variant !== 'dropdown') return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variant]);

  const currentMeta = localeMeta[locale];
  const label = (code: Locale) => {
    const meta = localeMeta[code];
    if (showNativeName) return meta.nativeName;
    return meta.englishName;
  };

  // Icon 变体：紧凑图标按钮 + 弹窗
  if (variant === 'icon') {
    return (
      <div ref={ref} className={`relative inline-block ${className}`}>
        <button
          type="button"
          aria-label={t('common.language')}
          title={t('common.language')}
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
        >
          <span aria-hidden>{showFlag ? currentMeta.flag : '🌐'}</span>
          <span className="font-mono text-xs uppercase">{currentMeta.code}</span>
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-1 w-44 rounded-md border border-gray-200 bg-white shadow-lg">
            {locales.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLocale(code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                  code === locale ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
                }`}
              >
                <span aria-hidden>{showFlag ? localeMeta[code].flag : '🌐'}</span>
                <span className="flex-1">{localeMeta[code].nativeName}</span>
                {code === locale && <span className="text-blue-600">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Inline 变体：横向列表
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {locales.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={code === locale}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
              code === locale
                ? 'bg-blue-100 font-semibold text-blue-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {showFlag && <span aria-hidden>{localeMeta[code].flag}</span>}
            <span>{label(code)}</span>
          </button>
        ))}
      </div>
    );
  }

  // Dropdown 变体（默认）
  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-label={t('common.language')}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {showFlag && <span aria-hidden>{currentMeta.flag}</span>}
        <span>{label(locale)}</span>
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t('common.language')}
          className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {locales.map((code) => (
            <li key={code} role="option" aria-selected={code === locale}>
              <button
                type="button"
                onClick={() => {
                  setLocale(code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                  code === locale ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
                }`}
              >
                {showFlag && <span aria-hidden>{localeMeta[code].flag}</span>}
                <span className="flex-1">
                  <span className="block">{localeMeta[code].nativeName}</span>
                  <span className="block text-xs text-gray-500">{localeMeta[code].englishName}</span>
                </span>
                {code === locale && <span className="text-blue-600">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
