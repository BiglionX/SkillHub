/**
 * SkillHub i18n 核心配置
 *
 * 支持 4 种语言：
 * - zh-CN：简体中文（默认）
 * - en-US：英文
 * - ja-JP：日文
 * - ko-KR：韩文
 */

export const locales = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as const;

export type Locale = (typeof locales)[number];

/** 默认 locale（当无法识别用户偏好时使用） */
export const defaultLocale: Locale = 'zh-CN';

/**
 * Locale 回退链
 *
 * 例如：当用户请求 ja-JP 但当前 Skill 没有日文翻译时，
 * 会按以下顺序查找：ja-JP → en-US → zh-CN → 返回原文
 */
export const localeFallbackChain: Record<Locale, Locale[]> = {
  'zh-CN': ['zh-CN', 'en-US'],
  'en-US': ['en-US', 'zh-CN'],
  'ja-JP': ['ja-JP', 'en-US', 'zh-CN'],
  'ko-KR': ['ko-KR', 'en-US', 'zh-CN'],
};

/** Locale 元信息（用于语言切换器 UI） */
export interface LocaleMeta {
  code: Locale;
  /** 显示名称（原生语言） */
  nativeName: string;
  /** 英文名称 */
  englishName: string;
  /** 中文名称 */
  chineseName: string;
  /** 旗帜 emoji（可选，仅 UI 展示） */
  flag: string;
  /** 文字方向 */
  dir: 'ltr' | 'rtl';
  /** 是否为默认 locale */
  isDefault?: boolean;
}

export const localeMeta: Record<Locale, LocaleMeta> = {
  'zh-CN': {
    code: 'zh-CN',
    nativeName: '简体中文',
    englishName: 'Simplified Chinese',
    chineseName: '简体中文',
    flag: '🇨🇳',
    dir: 'ltr',
    isDefault: true,
  },
  'en-US': {
    code: 'en-US',
    nativeName: 'English',
    englishName: 'English',
    chineseName: '英文',
    flag: '🇺🇸',
    dir: 'ltr',
  },
  'ja-JP': {
    code: 'ja-JP',
    nativeName: '日本語',
    englishName: 'Japanese',
    chineseName: '日文',
    flag: '🇯🇵',
    dir: 'ltr',
  },
  'ko-KR': {
    code: 'ko-KR',
    nativeName: '한국어',
    englishName: 'Korean',
    chineseName: '韩文',
    flag: '🇰🇷',
    dir: 'ltr',
  },
};

/** Cookie 名（用于持久化用户语言偏好） */
export const LOCALE_COOKIE = 'skillhub_locale';

/** Cookie 有效期（一年） */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** 命名空间（用于代码分割） */
export const namespaces = ['common', 'skills', 'errors', 'api'] as const;
export type Namespace = (typeof namespaces)[number];

/**
 * 类型守卫：判断字符串是否为有效的 Locale
 */
export function isValidLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * 规范化 locale（处理大小写、空格等）
 */
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const trimmed = value.trim();
  // 直接匹配
  if (isValidLocale(trimmed)) return trimmed;
  // 尝试去除地区代码（如 en-US -> en）
  const lang = trimmed.split(/[-_]/)[0]?.toLowerCase();
  if (!lang) return null;
  // 语言代码到 locale 的映射
  const langMap: Record<string, Locale> = {
    zh: 'zh-CN',
    'zh-cn': 'zh-CN',
    'zh-hans': 'zh-CN',
    en: 'en-US',
    'en-us': 'en-US',
    ja: 'ja-JP',
    'ja-jp': 'ja-JP',
    ko: 'ko-KR',
    'ko-kr': 'ko-KR',
  };
  return langMap[lang] ?? langMap[lang.toLowerCase()] ?? null;
}
