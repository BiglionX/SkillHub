import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPubliclyVisible } from '@/lib/governance/visibility';
import { auth } from '@/lib/auth-config';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api-response';

/**
 * GET /api/skills/[slug]/versions
 * 获取Skill的版本历史
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    // 查找Skill
    const skill = await prisma.skill.findUnique({
      where: { slug },
      select: { id: true, authorId: true, status: true, isPublic: true },
    });

    if (!isPubliclyVisible(skill)) {
      return notFoundResponse('Skill不存在');
    }

    // 获取版本列表
    const versions = await prisma.skillVersion.findMany({
      where: { skillId: skill.id },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse({ versions });
  } catch (error) {
    console.error('获取版本历史失败:', error);
    return errorResponse('获取版本历史失败', 500);
  }
}

/**
 * POST /api/skills/[slug]/versions
 * 创建新版本
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return unauthorizedResponse();
    }

    const { slug } = await params;
    const body = await request.json();
    const { version, changelog } = body;

    // 验证必填字段
    if (!version) {
      return errorResponse('版本号是必填项', 400);
    }

    // 查找Skill
    const skill = await prisma.skill.findUnique({
      where: { slug },
    });

    if (!skill) {
      return notFoundResponse('Skill不存在');
    }

    // 检查权限（只有作者可以创建新版本）
    if (skill.authorId !== session.user.id) {
      return errorResponse('没有权限创建新版本', 403);
    }

    // 检查版本号是否已存在
    const existingVersion = await prisma.skillVersion.findFirst({
      where: {
        skillId: skill.id,
        version,
      },
    });

    if (existingVersion) {
      return errorResponse('该版本号已存在', 400);
    }

    // 创建新版本
    const skillVersion = await prisma.skillVersion.create({
      data: {
        skillId: skill.id,
        version,
        changelog: changelog || '',
        manifest: { description: changelog || '' }, // 使用manifest存储元数据
        packageUrl: skill.packageUrl || '',
      },
    });

    // 更新Skill的当前版本号
    await prisma.skill.update({
      where: { id: skill.id },
      data: {
        version,
        updatedAt: new Date(),
      },
    });

    return successResponse(skillVersion, 201);
  } catch (error) {
    console.error('创建版本失败:', error);
    return errorResponse('创建版本失败', 500);
  }
}
