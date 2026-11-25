import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPubliclyVisible } from '@/lib/governance/visibility';
import { semanticSearchService } from '@/lib/search/SemanticSearchService';
import { successResponse, errorResponse } from '@/lib/api-response';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/skills/[slug]/related
 * 获取相关Skills（支持通过 slug 或 id 查询）
 */
export async function GET(
  request: NextRequest,
  { params }: Props
) {
  try {
    const { slug } = await params;
    
    if (!slug) {
      return errorResponse('Skill slug 或 ID 为必填项', 400);
    }

    // 支持通过 id 或 slug 查询
    const where = slug.startsWith('skill_') || slug.length === 36
      ? { id: slug }
      : { slug };

    // 查找技能以获取其 ID
    const skill = await prisma.skill.findUnique({
      where,
      select: { id: true, status: true, isPublic: true }
    });

    if (!isPubliclyVisible(skill)) {
      return errorResponse('Skill 不存在', 404);
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5');
    const minSimilarity = parseFloat(searchParams.get('minSimilarity') || '0.5');

    console.log(`🔗 获取Skill ${skill.id} 的相关技能`);

    // 获取相关Skills
    const relatedSkills = await semanticSearchService.getRelatedSkills(
      skill.id,
      limit,
      minSimilarity
    );

    return successResponse({
      skillId: skill.id,
      relatedSkills,
      total: relatedSkills.length,
    });
  } catch (error) {
    console.error('❌ 获取相关技能失败:', error);
    return errorResponse('获取相关技能失败', 500);
  }
}
