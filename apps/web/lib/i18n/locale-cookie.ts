/**
 * Locale Cookie 管理
 *
 * 用于持久化用户语言偏好（一年有效期）
 */

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isValidLocale, defaultLocale, type Locale } from '../../i18n/config';

/**
 * 从 Cookie 读取用户偏好 locale
 *
 * 必须在服务端组件 / Server Action 中调用
 */
export async function getLocaleFromCookie(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
    if (cookieValue && isValidLocale(cookieValue)) {
      return cookieValue;
    }
  } catch {
    // cookies() 可能在某些场景不可用（如 middleware）
  }
  return defaultLocale;
}

/**
 * 设置 Locale Cookie
 *
 * @param locale - 目标 locale
 */
export async function setLocaleCookie(locale: Locale): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  } catch (error) {
    console.warn('[locale-cookie] setLocaleCookie failed:', error);
  }
}

/**
 * 从 NextRequest 中读取 locale（middleware / API route 使用）
 */
export function getLocaleFromRequestCookie(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): Locale {
  const cookieValue = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieValue && isValidLocale(cookieValue)) {
    return cookieValue;
  }
  return defaultLocale;
}
