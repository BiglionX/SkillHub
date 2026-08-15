/**
 * 字典加载器（服务端 / 客户端通用）
 *
 * 支持静态导入所有 locale 字典，避免异步加载带来的复杂性。
 * 如果未来需要懒加载，可以改为 dynamic import。
 */

import type { Locale } from '../config';
import { zhCN } from './zh-CN';
import { enUS } from './en-US';
import { jaJP } from './ja-JP';
import { koKR } from './ko-KR';

/**
 * 统一字典类型（结构与 zh-CN 保持一致，运行时无需类型完全一致）
 */
export interface Dictionary {
  common: {
    appName: string;
    appSlogan: string;
    search: string;
    searchPlaceholder: string;
    submit: string;
    cancel: string;
    confirm: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    update: string;
    loading: string;
    success: string;
    error: string;
    retry: string;
    close: string;
    back: string;
    next: string;
    previous: string;
    yes: string;
    no: string;
    language: string;
    settings: string;
    profile: string;
    logout: string;
    login: string;
    register: string;
    home: string;
    docs: string;
    github: string;
    navigation: string;
    toggleMenu: string;
    toggleTheme: string;
    pageNotFound: string;
    serverError: string;
    comingSoon: string;
    [key: string]: string;
  };
  skills: Record<string, string>;
  errors: Record<string, string>;
  api: Record<string, string>;
}

/**
 * 强制转换为统一 Dictionary 类型（各 locale 结构完全一致，仅值不同）
 */
const dictionaries: Record<Locale, Dictionary> = {
  'zh-CN': zhCN as unknown as Dictionary,
  'en-US': enUS as unknown as Dictionary,
  'ja-JP': jaJP as unknown as Dictionary,
  'ko-KR': koKR as unknown as Dictionary,
};

/**
 * 获取指定 locale 的字典
 *
 * @param locale - 目标 locale
 * @returns 字典对象
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/**
 * 获取所有字典（用于 SSG / 文档生成）
 */
export function getAllDictionaries(): Record<Locale, Dictionary> {
  return dictionaries;
}
