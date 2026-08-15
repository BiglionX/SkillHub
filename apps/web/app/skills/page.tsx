import { Metadata } from 'next';
import PublicSkillsClient from './PublicSkillsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Skill仓库',
  description: '浏览和发现优秀的 AI Agent 技能，探索企业级开源 AI Agent 技能注册中心',
  openGraph: {
    title: 'Skill仓库 - SkillHub',
    description: '浏览和发现优秀的 AI Agent 技能，探索企业级开源 AI Agent 技能注册中心',
    url: '/skills',
  },
  twitter: {
    title: 'Skill仓库 - SkillHub',
    description: '浏览和发现优秀的 AI Agent 技能，探索企业级开源 AI Agent 技能注册中心',
  },
};

interface SearchParams {
  q?: string;
  category?: string;
  subcategory?: string;
  language?: string;
  source?: string;
  license?: string;
  minQuality?: string;
  minStars?: string;
  maxStars?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  page?: string;
  semantic?: string;
  global?: string;
}

export default async function PublicSkillsPage({
  searchParams,
}: {
  // Next.js 15: searchParams 是 Promise
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  return <PublicSkillsClient searchParams={resolved} />;
}
