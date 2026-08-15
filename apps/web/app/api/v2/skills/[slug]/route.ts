/**
 * GET /api/v2/skills/[slug] - 获取技能详情
 * Query params: include (可选, 如 "knowledge")
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { v2SuccessResponse, v2ErrorResponse } from '@/lib/services/V2ApiAuth';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const include = searchParams.get('include');

    const skill = await prisma.skill.findUnique({
      where: uuidRegex.test(slug) ? { id: slug } : { slug },
      include: {
        author: { select: { id: true, name: true, image: true } },
        namespace: { select: { id: true, slug: true, name: true } },
        _count: { select: { versions: true, reviews: true, comments: true } },
      },
    });

    if (!skill) {
      return v2ErrorResponse('技能不存在', 404);
    }

    // 获取版本历史摘要
    const recentVersions = await prisma.skillVersion.findMany({
      where: { skillId: skill.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, version: true, changelog: true, createdAt: true },
    });

    // 根据 include 参数获取扩展数据
    let knowledge = undefined;
    if (include === 'knowledge') {
      const kf = await prisma.knowledgeFragment.findUnique({ where: { skillId: skill.id } });
      if (kf) {
        knowledge = {
          id: kf.id,
          version: kf.version,
          content_type: kf.contentType,
          vectorized: kf.vectorized,
          chunk_count: kf.chunkCount,
          metadata: kf.metadata,
        };
      }
    }

    let childSkills = undefined;
    if (include === 'skill_pack') {
      const items = await prisma.skillPackItem.findMany({
        where: { packId: skill.id },
        include: {
          childSkill: { select: { id: true, name: true, slug: true, description: true } },
        },
        orderBy: { sortOrder: 'asc' },
      });
      childSkills = items.map((item) => ({
        ...item.childSkill,
        sort_order: item.sortOrder,
      }));
    }

    const data: Record<string, unknown> = {
      id: skill.id,
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      type: skill.type,
      version: skill.version,
      status: skill.status,
      industry_tags: skill.industryTags,
      plugin_compatible: skill.pluginCompatible,
      plugin_ids: skill.pluginIds,
      category_path: skill.categoryPath,
      locale: skill.locale,
      input_schema: skill.inputSchema,
      output_schema: skill.outputSchema,
      category: skill.category,
      tags: skill.tags,
      author_id: skill.authorId,
      author: skill.author,
      namespace: skill.namespace,
      download_count: skill.downloadCount,
      star_count: skill.starCount,
      rating: skill.rating,
      review_count: skill.reviewCount,
      created_at: skill.createdAt.toISOString(),
      updated_at: skill.updatedAt.toISOString(),
      versions_summary: recentVersions,
      knowledge,
      child_skills: childSkills,
      stats: {
        versions: skill._count.versions,
        reviews: skill._count.reviews,
        comments: skill._count.comments,
      },
    };

    return v2SuccessResponse({ data });
  } catch (error) {
    console.error('GET /api/v2/skills/[slug] 失败:', error);
    return v2ErrorResponse('获取技能详情失败', 500);
  }
}