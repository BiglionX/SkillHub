import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * GET /api/v2/user/installed-software
 * 返回当前用户的已装软件清单（含 helperPort 用于 LLM 转发）
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ installed: [] });
  }

  const installed = await prisma.userInstalledSoftware.findMany({
    where: { userId: session.user.id },
    include: {
      // 通过 softwareTagId 联表查 name（模型没建关联，直接查 SoftwareTag）
    },
    orderBy: { lastSeenAt: 'desc' },
  });

  // 批量查 softwareTag 拿 name
  const tagIds = installed.map((i) => i.softwareTagId);
  const tags = await prisma.softwareTag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true, name: true, labelZh: true, icon: true },
  });
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  return NextResponse.json({
    installed: installed.map((i) => ({
      softwareTagId: i.softwareTagId,
      softwareName: tagMap.get(i.softwareTagId)?.name,
      labelZh: tagMap.get(i.softwareTagId)?.labelZh,
      icon: tagMap.get(i.softwareTagId)?.icon,
      source: i.source,
      version: i.version,
      helperPort: i.helperPort,
      lastSeenAt: i.lastSeenAt,
    })),
  });
}

/**
 * PUT /api/v2/user/installed-software
 * 批量更新已装软件清单（Web 端多选框保存）
 *
 * Body: { items: [{ softwareTagId, version? }, ...] }
 */
export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await req.json();
  const items: Array<{ softwareTagId: string; version?: string }> = body.items || [];

  // 删除旧的，写入新的（按 userId 全量替换）
  await prisma.$transaction([
    prisma.userInstalledSoftware.deleteMany({ where: { userId: session.user.id } }),
    prisma.userInstalledSoftware.createMany({
      data: items.map((i) => ({
        userId: session.user.id,
        softwareTagId: i.softwareTagId,
        version: i.version,
        source: 'WEB_CHECKBOX',
      })),
      skipDuplicates: true,
    }),
  ]);

  return NextResponse.json({ ok: true, count: items.length });
}