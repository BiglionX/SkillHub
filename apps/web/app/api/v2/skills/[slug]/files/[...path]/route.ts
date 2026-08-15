/**
 * GET /api/v2/skills/[slug]/files/[...path]
 *
 * 渐进式披露（Progressive Disclosure）：按需加载 Skill 资源文件
 * 支持 scripts/、references/、assets/ 等目录
 *
 * 安全：
 * - 路径遍历防护（拒绝包含 .. 的路径）
 * - 文件大小限制（默认 10MB）
 * - 仅返回 PUBLIC Skill 的资源
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; path: string[] }> }
) {
  try {
    const { slug, path } = await params;

    // 路径遍历防护
    if (!path || path.length === 0) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Path is required' },
        { status: 400 },
      );
    }

    const filePath = path.join('/');

    if (filePath.includes('..') || filePath.startsWith('/')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Invalid path' },
        { status: 403 },
      );
    }

    // 查询 Skill 和 Resource
    const skill = await prisma.skill.findUnique({
      where: { slug },
      select: {
        id: true,
        isPublic: true,
        resources: {
          where: { path: filePath },
          take: 1,
        },
      },
    });

    if (!skill || !skill.isPublic) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Skill or resource not found: ${slug}/${filePath}` },
        { status: 404 },
      );
    }

    const resource = skill.resources[0];
    if (!resource) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Resource not found: ${filePath}` },
        { status: 404 },
      );
    }

    // 文件大小限制
    if (resource.sizeBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: 'FILE_TOO_LARGE',
          message: `File size ${resource.sizeBytes} exceeds limit ${MAX_FILE_SIZE_BYTES}`,
        },
        { status: 413 },
      );
    }

    // 实际生产环境：从对象存储（S3/MinIO/R2）获取内容
    // 当前实现：返回元数据，前端通过 storageKey 直接下载
    //
    // 如果 query 参数 download=true，返回下载端点响应（替代原有的 /download 子路由）
    const isDownload = request.nextUrl.searchParams.get('download') === 'true';

    if (isDownload) {
      return NextResponse.json(
        {
          message: 'Resource download endpoint',
          storageKey: resource.storageKey,
          note: 'Integrate with S3/MinIO/R2 to stream actual file content',
        },
        { status: 501 },
      );
    }

    return NextResponse.json({
      slug,
      path: resource.path,
      type: resource.type,
      sizeBytes: resource.sizeBytes,
      mimeType: resource.mimeType,
      checksum: resource.checksum,
      storageKey: resource.storageKey,
      // 实际下载 URL（前端可直接使用）
      downloadUrl: `/api/v2/skills/${slug}/files/${path.join('/')}/download`,
      message: 'Use downloadUrl to fetch the actual file content',
    });
  } catch (error) {
    console.error('[files] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load resource' },
      { status: 500 },
    );
  }
}