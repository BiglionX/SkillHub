/**
 * 客户端 i18n Provider
 *
 * 通过 React Context 在客户端组件树中提供翻译函数和当前 locale
 */

'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from '../../i18n/config';
import { isValidLocale } from '../../i18n/config';
import type { Dictionary } from '../../i18n/dictionaries';
import { getDictionary } from '../../i18n/dictionaries';

export interface I18nContextValue {
  locale: Locale;
  dictionary: Dictionary;
  /** 翻译函数：t('common.appName') */
  t: (key: string) => string;
  /** 切换 locale（同时写入 Cookie 和刷新页面） */
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /** 当前 locale（服务端从 Cookie / Accept-Language 推断） */
  locale: Locale;
  /** 可选：直接传入 dictionary（避免重复加载） */
  dictionary?: Dictionary;
  children: ReactNode;
}

export function I18nProvider({ locale, dictionary, children }: I18nProviderProps) {
  const safeLocale: Locale = isValidLocale(locale) ? locale : 'zh-CN';
  const dict = useMemo(() => dictionary ?? getDictionary(safeLocale), [dictionary, safeLocale]);

  const t = useCallback(
    (key: string): string => {
      const segments = key.split('.');
      let value: unknown = dict;
      for (const segment of segments) {
        if (value && typeof value === 'object' && segment in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[segment];
        } else {
          // 开发模式下提示缺失翻译
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[i18n] Missing translation: ${key} (locale: ${safeLocale})`);
          }
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    },
    [dict, safeLocale],
  );

  const setLocale = useCallback((newLocale: Locale) => {
    if (typeof document === 'undefined') return;
    // 设置 Cookie（一年有效期）
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `skillhub_locale=${newLocale}; path=/; max-age=${oneYear}; samesite=lax`;
    // 刷新页面以应用新 locale（避免 SSR/CSR 不一致）
    window.location.reload();
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale: safeLocale, dictionary: dict, t, setLocale }),
    [safeLocale, dict, t, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * 在客户端组件中使用 i18n
 *
 * ```tsx
 * 'use client';
 * import { useI18n } from '@/lib/i18n/I18nProvider';
 *
 * export default function MyComponent() {
 *   const { t, locale, setLocale } = useI18n();
 *   return <h1>{t('common.appName')}</h1>;
 * }
 * ```
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
