/**
 * POST /api/v2/locales/set
 *
 * 设置用户 locale 偏好（写入 Cookie）。
 * 前端 LocaleSwitcher 在切换语言时调用此端点同步服务端 Cookie。
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isValidLocale, locales, type Locale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { locale } = body as { locale?: string };

    if (!locale || !isValidLocale(locale)) {
      return NextResponse.json(
        {
          error: 'INVALID_LOCALE',
          message: `Invalid locale: ${locale}. Supported: ${locales.join(', ')}`,
        },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return NextResponse.json(
      {
        success: true,
        locale: locale as Locale,
        message: 'Locale preference saved',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('[locales/set] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to set locale preference' },
      { status: 500 },
    );
  }
}
