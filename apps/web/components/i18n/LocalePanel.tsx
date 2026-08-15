/**
 * 多语言切换快捷面板组件（高级 UI）
 *
 * 展示当前支持的所有语言，并提供切换功能。
 * 可放置在 Dashboard、设置页或登录页。
 */

'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import { locales, localeMeta } from '../../i18n/config';

export interface LocalePanelProps {
  /** 自定义标题 */
  title?: string;
  /** 自定义 className */
  className?: string;
  /** 是否显示完成度信息（未来扩展） */
  showCompletion?: boolean;
}

export default function LocalePanel({
  title,
  className = '',
  showCompletion = false,
}: LocalePanelProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {title || t('common.language')}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {localeMeta[locale].nativeName} ({localeMeta[locale].englishName})
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {locales.map((code) => {
          const meta = localeMeta[code];
          const isActive = code === locale;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={isActive}
              className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                isActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span aria-hidden className="text-2xl">
                {meta.flag}
              </span>
              <div className="flex-1">
                <div className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                  {meta.nativeName}
                </div>
                <div className="text-xs text-gray-500">
                  {meta.englishName} · {meta.code}
                </div>
              </div>
              {isActive && (
                <span aria-hidden className="text-blue-600">
                  ✓
                </span>
              )}
              {showCompletion && !isActive && (
                <span className="text-xs text-gray-400">
                  {/* 预留：翻译完成度 */}
                  100%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
