import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPubliclyVisible } from '@/lib/governance/visibility';
import { auth } from '@/lib/auth-config';

interface SessionUser {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
}

/**
 * POST /api/skills/[slug]/feedback
 * 提交技能分类纠错反馈
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    
    const {
      feedbackType,
      suggestedCategory,
      suggestedSubcategory,
      reason,
    } = body;

    // 验证必填字段
    if (!feedbackType || !reason) {
      return NextResponse.json(
        { error: 'feedbackType and reason are required' },
        { status: 400 }
      );
    }

    // 查找skill
    const skill = await prisma.skill.findUnique({
      where: { slug },
      select: {
        id: true,
        category: true,
        subcategory: true,
        status: true,
        isPublic: true,
      },
    });

    if (!isPubliclyVisible(skill)) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    // 获取当前用户（可选）
    const session = await auth();
    const userId = session?.user?.id || null;

    // 创建反馈记录
    const feedback = await prisma.skillFeedback.create({
      data: {
        skillId: skill.id,
        userId,
        feedbackType,
        currentCategory: skill.category,
        suggestedCategory: suggestedCategory || null,
        currentSubcategory: skill.subcategory || null,
        suggestedSubcategory: suggestedSubcategory || null,
        reason,
        status: 'pending',
      },
    });

    return NextResponse.json(
      { 
        success: true, 
        feedback: {
          id: feedback.id,
          status: feedback.status,
          message: '感谢您的反馈！我们将尽快审核。',
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: 'Failed to create feedback' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/skills/[slug]/feedback
 * 获取技能的反馈列表（仅管理员）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    // 检查管理员权限
    const session = await auth();
    if (!session || (session.user as SessionUser)?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const skill = await prisma.skill.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    const feedbacks = await prisma.skillFeedback.findMany({
      where: { skillId: skill.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ feedbacks });
  } catch (error) {
    console.error('Error fetching feedbacks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedbacks' },
      { status: 500 }
    );
  }
}
