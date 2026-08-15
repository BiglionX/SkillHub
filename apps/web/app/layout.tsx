import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ReactQueryProvider } from '@/components/providers/ReactQueryProvider';
import { ToastProvider } from '@/components/ui/ToastContainer';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { I18nProvider } from '@/lib/i18n/I18nProvider';
import { cookies, headers } from 'next/headers';
import { isValidLocale, defaultLocale, type Locale } from '@/i18n/config';
import { negotiateLocale } from '@/lib/i18n/locale-negotiate';
import { getDictionary } from '@/i18n/dictionaries';
import type { ReactNode } from 'react';

const inter = Inter({ subsets: ['latin'] });

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skillhub.proclaw.cc';

/**
 * 从请求中检测当前 locale
 *
 * 优先级：Cookie > Accept-Language > 默认值
 */
async function detectCurrentLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get('skillhub_locale')?.value;
    if (cookieValue && isValidLocale(cookieValue)) {
      return cookieValue;
    }
  } catch {
    // cookies() 在 generateMetadata 等场景可能不可用
  }
  try {
    const headerStore = await headers();
    return negotiateLocale(headerStore.get('accept-language'));
  } catch {
    return defaultLocale;
  }
}

/**
 * 静态生成所有支持的 locale 的 metadata
 * （通过 generateStaticParams 提升 SEO）
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await detectCurrentLocale();

  // 根据 locale 生成本地化的 metadata
  const titles: Record<Locale, string> = {
    'zh-CN': 'Skill Hub - AI Agent 技能注册中心',
    'en-US': 'Skill Hub - AI Agent Skills Registry',
    'ja-JP': 'Skill Hub - AIエージェントスキルレジストリ',
    'ko-KR': 'Skill Hub - AI 에이전트 스킬 레지스트리',
  };

  const descriptions: Record<Locale, string> = {
    'zh-CN': '企业级、开源、可自托管的 AI Agent 技能注册中心。发现、发布、管理高质量的 AI Agent 技能。',
    'en-US': 'Enterprise-grade, open-source AI agent skill registry. Discover, publish, and manage high-quality AI agent skills.',
    'ja-JP': 'エンタープライズグレードのオープンソース AI エージェントスキルレジストリ。高品質な AI エージェントスキルを発見、公開、管理します。',
    'ko-KR': '엔터프라이즈급 오픈소스 AI 에이전트 스킬 레지스트리. 고품질 AI 에이전트 스킬을 발견, 게시 및 관리하세요.',
  };

  const ogLocales: Record<Locale, string> = {
    'zh-CN': 'zh_CN',
    'en-US': 'en_US',
    'ja-JP': 'ja_JP',
    'ko-KR': 'ko_KR',
  };

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: titles[locale],
      template: `%s | ${titles[locale].split(' - ')[0]}`,
    },
    description: descriptions[locale],
    icons: {
      icon: '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
    openGraph: {
      type: 'website',
      locale: ogLocales[locale],
      siteName: 'Skill Hub',
      title: titles[locale],
      description: descriptions[locale],
      images: [
        {
          url: '/skillhub.png',
          width: 1200,
          height: 630,
          alt: titles[locale],
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: titles[locale],
      description: descriptions[locale],
      images: ['/skillhub.png'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-video-preview': -1,
        'max-snippet': -1,
      },
    },
    alternates: {
      canonical: baseUrl,
      languages: {
        'zh-CN': `${baseUrl}?locale=zh-CN`,
        'en-US': `${baseUrl}?locale=en-US`,
        'ja-JP': `${baseUrl}?locale=ja-JP`,
        'ko-KR': `${baseUrl}?locale=ko-KR`,
      },
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await detectCurrentLocale();
  const dictionary = getDictionary(locale);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Skill Hub',
    url: baseUrl,
    description:
      'Enterprise-grade, open-source AI agent skill registry.',
    inLanguage: locale,
    publisher: {
      '@type': 'Organization',
      name: 'Skill Hub',
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/skillhub.png`,
      },
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/skills?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    // 当前支持的 locale（zh-CN/en-US/ja-JP/ko-KR）均为 LTR；
    // 若未来引入阿拉伯语等 RTL locale，需在 Locale 类型中加入 'ar' 后再启用此分支
    <html lang={locale} dir="ltr">
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <I18nProvider locale={locale} dictionary={dictionary}>
          <SessionProvider>
            <ReactQueryProvider>
              <ToastProvider>{children}</ToastProvider>
            </ReactQueryProvider>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

