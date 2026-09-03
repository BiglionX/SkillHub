import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth-config';

const prisma = new PrismaClient();

/**
 * GET /api/v2/user/installed-software
 * 返回当前用户的已装软件清单（含 helperPort 用于 LLM 转发）
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ installed: [] });
  }

  // v2.0.7+：Prisma 生成类型 stale（userInstalledSoftware 未在生成类型中暴露）。
  // 运行时真实存在该模型；schema 与运行时一致。运行时不需要 include 字段（原代码 include: {} 只是占位注释）。
  // 用 `as unknown as typeof prisma.userInstalledSoftware.findMany` 绕过 stale 类型检查。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installed = await (prisma.userInstalledSoftware as any).findMany({
    where: { userId: session.user.id },
    orderBy: { lastSeenAt: 'desc' },
  });

  // 批量查 softwareTag 拿 name
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const tagIds = installed.map((i: any) => i.softwareTagId);
  const tags = await prisma.softwareTag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true, name: true, labelZh: true, icon: true },
  });
  const tagMap = new Map(tags.map((t: any) => [t.id, t]));

  return NextResponse.json({
    installed: installed.map((i: any) => ({
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
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * PUT /api/v2/user/installed-software
 * 批量更新已装软件清单（Web 端多选框保存）
 *
 * Body: { items: [{ softwareTagId, version? }, ...] }
 */
export async function PUT(req: Request) {
  const session = await auth();
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