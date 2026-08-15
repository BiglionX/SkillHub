/**
 * i18n 单元测试
 *
 * 覆盖：
 * - 配置验证（locales / fallback chain / normalization）
 * - 字典完整性（所有 locale 必须有相同的 key 集合）
 * - Accept-Language 协商
 * - 服务端翻译函数
 */

import { describe, it, expect } from '@jest/globals';
import {
  locales,
  defaultLocale,
  localeMeta,
  localeFallbackChain,
  isValidLocale,
  normalizeLocale,
  type Locale,
} from '../config';
import { getDictionary, getAllDictionaries } from '../dictionaries';

describe('i18n config', () => {
  it('包含 4 种支持的语言', () => {
    expect(locales).toEqual(['zh-CN', 'en-US', 'ja-JP', 'ko-KR']);
    expect(locales).toHaveLength(4);
  });

  it('默认 locale 为 zh-CN', () => {
    expect(defaultLocale).toBe('zh-CN');
  });

  it('每个 locale 都有完整的元信息', () => {
    for (const code of locales) {
      const meta = localeMeta[code];
      expect(meta.code).toBe(code);
      expect(meta.nativeName).toBeTruthy();
      expect(meta.englishName).toBeTruthy();
      expect(meta.chineseName).toBeTruthy();
      expect(meta.flag).toBeTruthy();
      expect(meta.dir).toBe('ltr');
    }
  });

  it('每个 locale 都有非空的 fallback chain', () => {
    for (const code of locales) {
      expect(localeFallbackChain[code].length).toBeGreaterThan(0);
      // 第一个必须是自身
      expect(localeFallbackChain[code][0]).toBe(code);
    }
  });

  it('fallback chain 中不应重复 locale', () => {
    for (const code of locales) {
      const chain = localeFallbackChain[code];
      expect(new Set(chain).size).toBe(chain.length);
    }
  });

  it('isValidLocale 正确识别有效/无效 locale', () => {
    expect(isValidLocale('zh-CN')).toBe(true);
    expect(isValidLocale('en-US')).toBe(true);
    expect(isValidLocale('ja-JP')).toBe(true);
    expect(isValidLocale('ko-KR')).toBe(true);

    expect(isValidLocale('xx-XX')).toBe(false);
    expect(isValidLocale('en')).toBe(false);
    expect(isValidLocale('')).toBe(false);
    expect(isValidLocale(null)).toBe(false);
    expect(isValidLocale(undefined)).toBe(false);
    expect(isValidLocale(123)).toBe(false);
  });

  it('normalizeLocale 处理各种输入', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('zh-cn')).toBe('zh-CN');
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('en')).toBe('en-US');
    expect(normalizeLocale('EN')).toBe('en-US');
    expect(normalizeLocale('ja')).toBe('ja-JP');
    expect(normalizeLocale('ko')).toBe('ko-KR');
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
    expect(normalizeLocale('xx')).toBeNull();
  });
});

describe('i18n dictionaries', () => {
  it('所有 locale 都包含通用字典', () => {
    for (const code of locales) {
      const dict = getDictionary(code);
      expect(dict.common).toBeDefined();
      expect(dict.common.appName).toBe('SkillHub');
      expect(dict.common.search).toBeTruthy();
      expect(dict.common.appSlogan).toBeTruthy();
    }
  });

  it('所有 locale 都有相同的关键 key 集合', () => {
    const allKeys: Record<Locale, string[]> = {} as Record<Locale, string[]>;

    function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      const keys: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    for (const code of locales) {
      const dict = getDictionary(code);
      allKeys[code] = flattenKeys(dict as unknown as Record<string, unknown>);
    }

    const reference = allKeys[defaultLocale];
    for (const code of locales) {
      expect(allKeys[code]).toEqual(reference);
    }
  });

  it('getAllDictionaries 返回所有 4 个 locale', () => {
    const all = getAllDictionaries();
    expect(Object.keys(all).sort()).toEqual([...locales].sort());
  });

  it('每个 locale 的核心翻译都不同（验证翻译确实完成）', () => {
    const appNames: Record<string, string> = {};
    for (const code of locales) {
      appNames[code] = getDictionary(code).common.appName;
    }
    // appName 在所有 locale 都相同（品牌名）
    expect(Object.values(appNames).every((v) => v === 'SkillHub')).toBe(true);

    // 但搜索词应该是翻译后的
    const searchTerms: Record<string, string> = {};
    for (const code of locales) {
      searchTerms[code] = getDictionary(code).common.search;
    }
    expect(new Set(Object.values(searchTerms)).size).toBeGreaterThan(1);
  });
});

describe('i18n Accept-Language negotiation', () => {
  // 动态导入以避免循环依赖
  const { negotiateLocale } = require('@/lib/i18n/locale-negotiate');

  it('空输入返回默认 locale', () => {
    expect(negotiateLocale(null)).toBe(defaultLocale);
    expect(negotiateLocale(undefined)).toBe(defaultLocale);
    expect(negotiateLocale('')).toBe(defaultLocale);
  });

  it('精确匹配优先', () => {
    expect(negotiateLocale('zh-CN')).toBe('zh-CN');
    expect(negotiateLocale('en-US')).toBe('en-US');
    expect(negotiateLocale('ja-JP')).toBe('ja-JP');
    expect(negotiateLocale('ko-KR')).toBe('ko-KR');
  });

  it('支持 q 值排序', () => {
    expect(negotiateLocale('ja-JP;q=0.5,en-US;q=0.9')).toBe('en-US');
    expect(negotiateLocale('en;q=0.5,zh-CN;q=0.9')).toBe('zh-CN');
  });

  it('语言代码模糊匹配', () => {
    expect(negotiateLocale('en')).toBe('en-US');
    expect(negotiateLocale('zh')).toBe('zh-CN');
    expect(negotiateLocale('ja')).toBe('ja-JP');
    expect(negotiateLocale('ko')).toBe('ko-KR');
  });

  it('不匹配的语言回退到默认', () => {
    expect(negotiateLocale('fr-FR')).toBe(defaultLocale);
    expect(negotiateLocale('de')).toBe(defaultLocale);
  });

  it('复杂 Accept-Language 头正确解析', () => {
    expect(negotiateLocale('zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('zh-CN');
    expect(negotiateLocale('en-GB,en;q=0.9,fr;q=0.8')).toBe('en-US');
  });
});
