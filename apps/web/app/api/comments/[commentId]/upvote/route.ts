import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/comments/[commentId]/upvote
 * 点赞评论
 */
export async function POST(
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
      include: { user: true },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // TODO: 实现点赞去重逻辑（需要创建 CommentUpvote 表）
    // 目前简单实现：直接增加点赞数
    const updatedComment = await prisma.skillComment.update({
      where: { id: (await params).commentId },
      data: {
        upvotes: { increment: 1 },
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

    // 发送通知给评论作者（如果不是自己点的赞）
    if (comment.userId !== session.user.id) {
      await prisma.notification.create({
        data: {
          userId: comment.userId,
          type: 'SYSTEM',
          title: '你的评论获得了点赞',
          message: '有人点赞了你的评论',
          link: `/skills/${comment.skillId}`,
          metadata: {
            commentId: comment.id,
          },
        },
      });
    }

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error('Error upvoting comment:', error);
    return NextResponse.json(
      { error: 'Failed to upvote comment' },
      { status: 500 }
    );
  }
}
