import { prisma } from '@/lib/prisma';
import { PUBLIC_SKILL_WHERE } from '@/lib/governance/visibility';
import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skillhub.proclaw.cc';

  // 静态公开页面
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/skills`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sdk`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/search-demo`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/widget-demo`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/bounties`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    },
  ];

  // 从数据库获取所有公开技能页面
  let dynamicSkillPages: MetadataRoute.Sitemap = [];
  try {
    const skills = await prisma.skill.findMany({
      where: { ...PUBLIC_SKILL_WHERE },
      select: {
        slug: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    dynamicSkillPages = skills.map((skill) => ({
      url: `${baseUrl}/skills/${skill.slug}`,
      lastModified: skill.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.error('Failed to fetch skills for sitemap:', error);
  }

  return [
    ...staticPages,
    ...dynamicSkillPages,
  ];
}
