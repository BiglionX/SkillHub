/**
 * GET /api/v2/skills/[slug]/i18n?locale=<locale>
 *
 * 返回指定 Skill 在指定 locale 下的本地化内容。
 *
 * 策略：
 * 1. Skill 主表已有 locale 字段（如 zh-CN）。
 * 2. 如果请求的 locale 与 Skill 主 locale 一致 → 直接返回。
 * 3. 如果不一致 → 尝试从 SkillTranslation 表查找。
 * 4. 未找到 → 按 fallback chain 返回降级翻译。
 *
 * 响应格式：
 * {
 *   slug: "pdf-tools",
 *   locale: "ja-JP",
 *   requestedLocale: "ja-JP",
 *   name: "PDFツール",
 *   description: "...",
 *   skillMd: "...",
 *   fallbackChain: ["ja-JP", "en-US", "zh-CN"],
 *   isFallback: false
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isValidLocale, localeFallbackChain, type Locale } from '@/i18n/config';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const requestedLocale = searchParams.get('locale') || '';

    if (!isValidLocale(requestedLocale)) {
      return NextResponse.json(
        {
          error: 'INVALID_LOCALE',
          message: `Invalid locale: ${requestedLocale}. Supported: zh-CN, en-US, ja-JP, ko-KR`,
        },
        { status: 400 },
      );
    }

    // 1. 查找 Skill 主记录
    const skill = await prisma.skill.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        standardName: true,
        standardDescription: true,
        skillMdContent: true,
        locale: true,
        isPublic: true,
      },
    });

    if (!skill || !skill.isPublic) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Skill not found: ${slug}` },
        { status: 404 },
      );
    }

    const fallbackChain = localeFallbackChain[requestedLocale];
    let resolvedLocale: Locale = (skill.locale as Locale) || 'zh-CN';
    let isFallback = resolvedLocale !== requestedLocale;
    let name = skill.standardName || skill.name;
    let description = skill.standardDescription || skill.description;
    let skillMd = skill.skillMdContent;

    // 2. 尝试按 fallback chain 查找更优翻译
    const translation = await findTranslation(skill.id, requestedLocale);
    if (translation) {
      name = translation.name || name;
      description = translation.description || description;
      skillMd = translation.skillMdContent || skillMd;
      resolvedLocale = requestedLocale;
      isFallback = false;
    }

    return NextResponse.json({
      slug,
      locale: resolvedLocale,
      requestedLocale,
      name,
      description,
      skillMd,
      fallbackChain,
      isFallback,
      originalLocale: skill.locale,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
        'Vary': 'Accept-Language',
      },
    });
  } catch (error) {
    console.error('[skill i18n] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load localized skill data' },
      { status: 500 },
    );
  }
}

/**
 * 查找 Skill 多语言翻译
 *
 * 按 fallback chain 顺序查找翻译记录。
 * 如果找到翻译，返回翻译内容；否则返回 null 继续 fallback。
 */
async function findTranslation(
  skillId: string,
  requestedLocale: Locale,
): Promise<{ name?: string; description?: string; skillMdContent?: string } | null> {
  // 获取 fallback chain
  const chain = localeFallbackChain[requestedLocale];

  // 按 fallback chain 顺序查找翻译
  for (const locale of chain) {
    const translation = await prisma.skillTranslation.findUnique({
      where: {
        skillId_locale: {
          skillId,
          locale,
        },
      },
    });

    if (translation) {
      return {
        name: translation.name ?? undefined,
        description: translation.description ?? undefined,
        skillMdContent: translation.skillMdContent ?? undefined,
      };
    }
  }

  return null;
}
