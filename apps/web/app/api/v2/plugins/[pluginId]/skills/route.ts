/**
 * GET /api/v2/plugins/[pluginId]/skills - 获取插件关联的技能列表
 * 按 plugin_id 获取与指定 ProClaw 插件关联的技能
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PUBLIC_SKILL_WHERE } from '@/lib/governance/visibility';
import { v2SuccessResponse, v2ErrorResponse } from '@/lib/services/V2ApiAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> }
) {
  try {
    const { pluginId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const skip = (page - 1) * limit;

    // 查询与指定插件关联的技能
    const where = {
      pluginCompatible: true,
      pluginIds: { has: pluginId },
      ...PUBLIC_SKILL_WHERE,
    };

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          type: true,
          version: true,
          industryTags: true,
          pluginIds: true,
          inputSchema: true,
          outputSchema: true,
          authorId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.skill.count({ where }),
    ]);

    const data = skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      type: skill.type,
      version: skill.version,
      industry_tags: skill.industryTags,
      plugin_ids: skill.pluginIds,
      input_schema: skill.inputSchema,
      output_schema: skill.outputSchema,
      created_at: skill.createdAt.toISOString(),
      updated_at: skill.updatedAt.toISOString(),
    }));

    return v2SuccessResponse({
      data,
      plugin_id: pluginId,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('GET /api/v2/plugins/[pluginId]/skills 失败:', error);
    return v2ErrorResponse('获取插件关联技能失败', 500);
  }
}
