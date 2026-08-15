import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api-response';

/**
 * DELETE /api/settings/api-keys/[id]
 * 删除 API 密钥
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return unauthorizedResponse();
    }

    const keyId = (await params).id;

    // 验证密钥存在且属于当前用户
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId: session.user.id,
      },
    });

    if (!apiKey) {
      return errorResponse('API 密钥不存在或无权删除', 404);
    }

    // 删除密钥
    await prisma.apiKey.delete({
      where: {
        id: keyId,
      },
    });

    return successResponse({ message: 'API 密钥已删除' });
  } catch (error) {
    console.error('删除 API 密钥失败:', error);
    return errorResponse('删除 API 密钥失败', 500);
  }
}
