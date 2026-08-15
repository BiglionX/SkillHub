/**
 * GET /api/v2/locales
 *
 * 返回 SkillHub 支持的所有 locale 列表及其元信息
 *
 * 客户端组件可以调用此端点动态获取 locale 信息，
 * 也可以直接使用 i18n/config.ts 中的静态数据。
 */

import { NextResponse } from 'next/server';
import { locales, localeMeta, defaultLocale } from '@/i18n/config';

export const dynamic = 'force-static';
export const revalidate = 3600; // 1 小时缓存（locale 列表很少变化）

export async function GET() {
  const items = locales.map((code) => ({
    ...localeMeta[code],
    code,
    isDefault: code === defaultLocale,
  }));

  return NextResponse.json(
    {
      version: '1.0',
      defaultLocale,
      count: items.length,
      locales: items,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    },
  );
}
