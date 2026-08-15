/**
 * GET /api/v2/skills/[slug]/versions - 获取版本列表
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { v2SuccessResponse, v2ErrorResponse } from '@/lib/services/V2ApiAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // 检查技能是否存在
    const skill = await prisma.skill.findUnique({ where: { id: slug }, select: { id: true } });
    if (!skill) {
      return v2ErrorResponse('技能不存在', 404);
    }

    // 获取 SkillVersion 记录
    const [versions, total] = await Promise.all([
      prisma.skillVersion.findMany({
        where: { skillId: slug },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.skillVersion.count({ where: { skillId: slug } }),
    ]);

    // 获取知识片段版本
    const [knowledgeVersions, knowledgeTotal] = await Promise.all([
      prisma.knowledgeVersion.findMany({
        where: { skillId: slug },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, changelog: true, createdBy: true, createdAt: true },
      }),
      prisma.knowledgeVersion.count({ where: { skillId: slug } }),
    ]);

    return v2SuccessResponse({
      data: {
        skill_versions: versions.map((v) => ({
          id: v.id,
          version: v.version,
          changelog: v.changelog,
          package_url: v.packageUrl,
          created_at: v.createdAt.toISOString(),
        })),
        knowledge_versions: knowledgeVersions.map((v: { id: string; version: number; changelog: string | null; createdBy: string | null; createdAt: Date }) => ({
          id: v.id,
          version: v.version,
          changelog: v.changelog,
          created_by: v.createdBy,
          created_at: v.createdAt.toISOString(),
        })),
      },
      pagination: {
        page,
        limit,
        total: total + knowledgeTotal,
        total_pages: Math.ceil(Math.max(total, knowledgeTotal) / limit),
      },
    });
  } catch (error) {
    console.error('GET /api/v2/skills/[slug]/versions 失败:', error);
    return v2ErrorResponse('获取版本列表失败', 500);
  }
}