import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// 验证评论数据的 Schema
const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  rating: z.number().min(1).max(5).optional(),
  parentId: z.string().uuid().optional(),
});

/**
 * GET /api/skills/[slug]/comments
 * 获取技能的评论列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // 通过 slug 查找技能
    const skill = await prisma.skill.findUnique({
      where: { slug: (await params).slug },
      select: { id: true },
    });

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'newest'; // newest, oldest, highest, most_upvoted

    const skip = (page - 1) * limit;

    // 构建排序条件
    const orderBy: Record<string, 'asc' | 'desc'> = sortBy === 'oldest'
      ? { createdAt: 'asc' }
      : sortBy === 'highest'
      ? { rating: 'desc' }
      : sortBy === 'most_upvoted'
      ? { upvotes: 'desc' }
      : { createdAt: 'desc' };

    // 获取顶级评论（没有 parentId 的）
    const [comments, total] = await Promise.all([
      prisma.skillComment.findMany({
        where: {
          skillId: skill.id,
          parentId: null, // 只获取顶级评论
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          replies: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          _count: {
            select: {
              replies: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.skillComment.count({
        where: {
          skillId: skill.id,
          parentId: null,
        },
      }),
    ]);

    return NextResponse.json({
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills/[slug]/comments
 * 创建新评论
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = commentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, rating, parentId } = validation.data;

    // 通过 slug 验证技能是否存在
    const skill = await prisma.skill.findUnique({
      where: { slug: (await params).slug },
    });

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    // 如果是回复，验证父评论是否存在
    if (parentId) {
      const parentComment = await prisma.skillComment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment) {
        return NextResponse.json(
          { error: 'Parent comment not found' },
          { status: 404 }
        );
      }
    }

    // 创建评论
    const comment = await prisma.skillComment.create({
      data: {
        skillId: skill.id,
        userId: session.user.id,
        content,
        rating: rating || null,
        parentId: parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    // 如果包含评分，更新技能的平均评分
    if (rating) {
      await updateSkillRating(skill.id);
    }

    // 如果是回复，发送通知给被回复的用户
    if (parentId) {
      const parentComment = await prisma.skillComment.findUnique({
        where: { id: parentId },
        include: { user: true },
      });

      if (parentComment && parentComment.userId !== session.user.id) {
        await prisma.notification.create({
          data: {
            userId: parentComment.userId,
            type: 'COMMENT_REPLY',
            title: '有人回复了你的评论',
            message: `${session.user.name || '匿名用户'} 回复了你在技能 "${skill.name}" 上的评论`,
            link: `/skills/${skill.slug}`,
            metadata: {
              commentId: comment.id,
              skillId: skill.id,
            },
          },
        });
      }
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}

/**
 * 更新技能的平均评分
 */
async function updateSkillRating(skillId: string) {
  const ratings = await prisma.skillComment.findMany({
    where: {
      skillId,
      rating: { not: null },
    },
    select: {
      rating: true,
    },
  });

  if (ratings.length === 0) {
    return;
  }

  const avgRating =
    ratings.reduce((sum: number, r: { rating: number | null }) => sum + (r.rating || 0), 0) / ratings.length;

  await prisma.skill.update({
    where: { id: skillId },
    data: {
      rating: avgRating,
      reviewCount: ratings.length,
    },
  });
}
