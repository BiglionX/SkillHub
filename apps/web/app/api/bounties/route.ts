import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { PUBLIC_SKILL_WHERE } from '@/lib/governance/visibility';
import { z } from 'zod';

// 验证创建悬赏的请求体
const createBountySchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20),
  requirements: z.object({
    category: z.string(),
    subcategory: z.string().optional(),
    tags: z.array(z.string()).optional(),
    complexity: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  }),
  reward: z.number().positive(),
  currency: z.string().default('CNY'),
  deadline: z.string().datetime().optional(),
});

/**
 * GET /api/bounties - 获取悬赏列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const creatorId = searchParams.get('creatorId');
    const applicantId = searchParams.get('applicantId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const order = searchParams.get('order') || 'desc';

    const where: Record<string, unknown> = {};
    
    // 如果指定了 creatorId=me，获取当前用户发布的悬赏
    if (creatorId === 'me') {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: '请先登录' },
          { status: 401 }
        );
      }
      where.creatorId = session.user.id;
    } else if (status) {
      // 否则按状态过滤
      where.status = status;
    } else {
      // 默认只显示开放的悬赏
      where.status = 'OPEN';
    }

    // 如果指定了 applicantId=me，获取当前用户申请的悬赏
    if (applicantId === 'me') {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: '请先登录' },
          { status: 401 }
        );
      }
      // 通过 applications 表查找用户申请过的悬赏
      const applications = await prisma.bountyApplication.findMany({
        where: { userId: session.user.id },
        select: { bountyId: true },
      });
      const bountyIds = applications.map(app => app.bountyId);
      where.id = { in: bountyIds };
    }

    if (category) {
      where.requirements = {
        path: ['category'],
        equals: category,
      };
    }

    const [bounties, total] = await Promise.all([
      prisma.skillBounty.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          // 只关联公开可见的技能，避免悬赏列表泄漏未审核/私有技能
          skill: {
            where: { ...PUBLIC_SKILL_WHERE },
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              applications: true,
              submissions: true,
            },
          },
        },
        orderBy: {
          [sortBy]: order,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.skillBounty.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        bounties,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching bounties:', error);
    return NextResponse.json(
      { success: false, error: '获取悬赏列表失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bounties - 创建新悬赏
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = createBountySchema.parse(body);

    const bounty = await prisma.skillBounty.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        requirements: JSON.stringify(validatedData.requirements),
        reward: validatedData.reward,
        currency: validatedData.currency,
        deadline: validatedData.deadline ? new Date(validatedData.deadline) : null,
        creatorId: user.id,
        status: 'OPEN',
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'BOUNTY_CREATED',
        resourceType: 'SkillBounty',
        resourceId: bounty.id,
        actorId: user.id,
        metadata: {
          title: bounty.title,
          reward: bounty.reward.toString(),
        },
      },
    });

    return NextResponse.json(
      { success: true, data: bounty },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const flattened = error.flatten();
      return NextResponse.json(
        { success: false, error: '验证失败', details: flattened.fieldErrors },
        { status: 400 }
      );
    }
    
    console.error('Error creating bounty:', error);
    return NextResponse.json(
      { success: false, error: '创建悬赏失败' },
      { status: 500 }
    );
  }
}
