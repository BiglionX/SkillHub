/**
 * Accept-Language 协商
 *
 * 解析浏览器 / 客户端发送的 Accept-Language 头，
 * 选择 SkillHub 支持的最佳匹配 locale
 */

import { locales, defaultLocale, type Locale } from '../../i18n/config';

/**
 * 解析 Accept-Language 头
 *
 * 格式：zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7
 * 返回按 q 值排序的 locale 列表
 */
interface ParsedLanguage {
  tag: string;
  quality: number;
}

export function parseAcceptLanguage(header: string | null | undefined): ParsedLanguage[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const segments = part.trim().split(';');
      const tag = segments[0]?.trim() ?? '';
      const qSegment = segments.find((s) => s.trim().startsWith('q='));
      const quality = qSegment ? parseFloat(qSegment.split('=')[1] ?? '1') : 1;
      return { tag, quality: isNaN(quality) ? 1 : quality };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);
}

/**
 * 协商最佳 locale
 *
 * @param acceptLanguage - Accept-Language 头
 * @returns 最佳匹配的 SkillHub locale
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  const parsed = parseAcceptLanguage(acceptLanguage);
  if (parsed.length === 0) return defaultLocale;

  // 第一轮：精确匹配
  for (const entry of parsed) {
    if ((locales as readonly string[]).includes(entry.tag)) {
      return entry.tag as Locale;
    }
  }

  // 第二轮：模糊匹配（如 en -> en-US）
  const langToDefault: Record<string, Locale> = {
    zh: 'zh-CN',
    en: 'en-US',
    ja: 'ja-JP',
    ko: 'ko-KR',
  };
  for (const entry of parsed) {
    const primary = entry.tag.split('-')[0]?.toLowerCase();
    if (primary && langToDefault[primary]) {
      return langToDefault[primary];
    }
  }

  return defaultLocale;
}

/**
 * 完整协商（考虑 Cookie + Accept-Language + 默认值）
 *
 * 优先级：Query 参数 > Cookie > Accept-Language > 默认
 */
export function negotiateFullLocale(
  options: {
    queryLocale?: string | null;
    cookieLocale?: string | null;
    acceptLanguage?: string | null;
  },
): Locale {
  if (options.queryLocale && (locales as readonly string[]).includes(options.queryLocale)) {
    return options.queryLocale as Locale;
  }
  if (options.cookieLocale && (locales as readonly string[]).includes(options.cookieLocale)) {
    return options.cookieLocale as Locale;
  }
  return negotiateLocale(options.acceptLanguage);
}
