import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  rating: z.number().min(1).max(5).optional(),
});

/**
 * PUT /api/comments/[commentId]
 * 更新评论
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
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
    const validation = updateCommentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    // 查找评论
    const comment = await prisma.skillComment.findUnique({
      where: { id: (await params).commentId },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // 检查权限（只有作者可以编辑）
    if (comment.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { content, rating } = validation.data;

    // 更新评论
    const updatedComment = await prisma.skillComment.update({
      where: { id: (await params).commentId },
      data: {
        ...(content && { content }),
        ...(rating !== undefined && { rating }),
        isEdited: true,
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

    // 如果更新了评分，重新计算技能平均评分
    if (rating !== undefined) {
      const skill = await prisma.skill.findUnique({
        where: { id: comment.skillId },
      });
      
      if (skill) {
        const ratings = await prisma.skillComment.findMany({
          where: {
            skillId: comment.skillId,
            rating: { not: null },
          },
          select: { rating: true },
        });

        if (ratings.length > 0) {
          const avgRating =
            ratings.reduce((sum: number, r: { rating: number | null }) => sum + (r.rating || 0), 0) / ratings.length;

          await prisma.skill.update({
            where: { id: comment.skillId },
            data: {
              rating: avgRating,
              reviewCount: ratings.length,
            },
          });
        }
      }
    }

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error('Error updating comment:', error);
    return NextResponse.json(
      { error: 'Failed to update comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comments/[commentId]
 * 删除评论
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 查找评论
    const comment = await prisma.skillComment.findUnique({
      where: { id: (await params).commentId },
      include: { skill: true },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // 检查权限（作者或管理员可以删除）
    // @ts-ignore - role will be available after Prisma client regeneration
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN';
    if (comment.userId !== session.user.id && !isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // 删除评论（级联删除回复）
    await prisma.skillComment.delete({
      where: { id: (await params).commentId },
    });

    // 如果评论有评分，重新计算技能平均评分
    if (comment.rating) {
      const ratings = await prisma.skillComment.findMany({
        where: {
          skillId: comment.skillId,
          rating: { not: null },
        },
        select: { rating: true },
      });

      if (ratings.length > 0) {
        const avgRating =
          ratings.reduce((sum: number, r: { rating: number | null }) => sum + (r.rating || 0), 0) / ratings.length;

        await prisma.skill.update({
          where: { id: comment.skillId },
          data: {
            rating: avgRating,
            reviewCount: ratings.length,
          },
        });
      } else {
        // 没有评分了，重置
        await prisma.skill.update({
          where: { id: comment.skillId },
          data: {
            rating: 0,
            reviewCount: 0,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
