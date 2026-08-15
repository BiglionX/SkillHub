/**
 * Knowledge Fragment API v2 端点
 * GET /api/v2/skills/[slug]/knowledge - 获取知识片段内容
 * POST /api/v2/skills/[slug]/knowledge - 创建/更新知识片段
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { knowledgeService } from '@/lib/services/KnowledgeService';
import { authenticateV2Request, v2SuccessResponse, v2ErrorResponse, unauthorizedResponse } from '@/lib/services/V2ApiAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const versionStr = searchParams.get('version');
    const version = versionStr ? parseInt(versionStr) : undefined;

    const skill = await prisma.skill.findUnique({ where: { id: slug }, select: { id: true, type: true } });
    if (!skill) {
      return v2ErrorResponse('技能不存在', 404);
    }

    const fragment = await knowledgeService.getFragment(slug, version);
    if (!fragment) {
      return v2ErrorResponse('该技能没有知识片段', 404);
    }

    let responseContent = fragment.content;
    if (format === 'csv' && fragment.contentType === 'csv' && fragment.rawContent) {
      responseContent = fragment.rawContent;
    }

    return v2SuccessResponse({
      data: {
        id: fragment.id,
        skill_id: fragment.skillId,
        version: fragment.version,
        content_type: fragment.contentType,
        content: responseContent,
        vectorized: fragment.vectorized,
        chunk_count: fragment.chunkCount,
        metadata: fragment.metadata,
        created_at: fragment.createdAt.toISOString(),
        updated_at: fragment.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v2/knowledge 失败:', error);
    return v2ErrorResponse('获取知识片段失败', 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await authenticateV2Request(request);
    if (!auth.authenticated) {
      return unauthorizedResponse(auth.error || '认证失败');
    }

    const { slug } = await params;
    const body = await request.json();
    const { content, contentType, rawContent, changelog } = body;

    if (!content) {
      return v2ErrorResponse('知识片段内容不能为空', 400);
    }

    const validContentTypes = ['json', 'csv', 'text'];
    if (contentType && !validContentTypes.includes(contentType)) {
      return v2ErrorResponse(`无效的内容类型「${contentType}」，支持的类型：${validContentTypes.join(', ')}`, 400);
    }

    const finalContentType = contentType || 'json';

    // 检查是否已有知识片段
    const existing = await prisma.knowledgeFragment.findUnique({ where: { skillId: slug } });

    let result;
    if (existing) {
      // 更新已有片段
      result = await knowledgeService.updateFragment(slug, {
        content: content as Record<string, unknown> | unknown[],
        rawContent,
        changelog: changelog || `版本 ${existing.version + 1}`,
        createdBy: auth.userId,
      });
    } else {
      // 创建新片段
      result = await knowledgeService.createFragment({
        skillId: slug,
        contentType: finalContentType as 'json' | 'csv' | 'text',
        content: content as Record<string, unknown> | unknown[],
        rawContent,
        changelog: changelog || '初始版本',
        createdBy: auth.userId,
      });
    }

    return v2SuccessResponse({
      data: {
        id: result.id,
        skill_id: result.skillId,
        version: result.version,
        content_type: result.contentType,
        vectorized: result.vectorized,
        chunk_count: result.chunkCount,
        created_at: result.createdAt.toISOString(),
        updated_at: result.updatedAt.toISOString(),
        changelog: changelog || null,
      },
    }, existing ? 200 : 201);
  } catch (error) {
    console.error('POST /api/v2/knowledge 失败:', error);
    return v2ErrorResponse('保存知识片段失败', 500);
  }
}