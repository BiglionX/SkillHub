/**
 * 服务端 i18n 工具
 *
 * 在 Server Components / Server Actions 中使用：
 *
 * ```tsx
 * import { getServerTranslations } from '@/lib/i18n/server';
 *
 * export default async function Page() {
 *   const { t, locale } = await getServerTranslations();
 *   return <h1>{t('common.appName')}</h1>;
 * }
 * ```
 */

import { headers, cookies } from 'next/headers';
import { getDictionary, type Dictionary } from '../../i18n/dictionaries';
import { defaultLocale, isValidLocale, type Locale } from '../../i18n/config';
import { negotiateLocale } from './locale-negotiate';

export interface ServerTranslations {
  locale: Locale;
  t: <K extends keyof Dictionary>(namespace: K) => Dictionary[K];
  /** 简化版翻译：t('common.appName') */
  tt: (key: string) => string;
}

/**
 * 从请求头解析当前 locale
 */
async function detectLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get('skillhub_locale')?.value;
    if (cookieValue && isValidLocale(cookieValue)) {
      return cookieValue;
    }
  } catch {
    // cookies() 可能在 middleware / generateStaticParams 中不可用
  }

  try {
    const headerStore = await headers();
    const acceptLanguage = headerStore.get('accept-language');
    return negotiateLocale(acceptLanguage);
  } catch {
    return defaultLocale;
  }
}

/**
 * 获取服务端翻译函数
 */
export async function getServerTranslations(): Promise<ServerTranslations> {
  const locale = await detectLocale();
  const dict = getDictionary(locale);

  return {
    locale,
    t: <K extends keyof Dictionary>(namespace: K) => dict[namespace],
    tt: (key: string): string => {
      const segments = key.split('.');
      let value: unknown = dict;
      for (const segment of segments) {
        if (value && typeof value === 'object' && segment in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[segment];
        } else {
          return key; // fallback to key
        }
      }
      return typeof value === 'string' ? value : key;
    },
  };
}

/**
 * 同步版本的 getServerTranslations（适用于已知 locale 的场景，如 generateStaticParams）
 */
export function getDictionarySync(locale: Locale): Dictionary {
  return getDictionary(locale);
}
