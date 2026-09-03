import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth-config';

const prisma = new PrismaClient();

interface HelperHeartbeatPayload {
  alive?: boolean;
  version?: string;
  installed_software?: string[];     // software_tag names
  helper_port?: number;
  protocol_registered?: boolean;
}

interface HelperHeartbeat {
  alive: boolean;
  version?: string;
  installed_software_count?: number;
  helper_port?: number;
  protocol_registered?: boolean;
  user_id?: string | null;
  last_heartbeat?: string;
}

/**
 * GET /api/v2/helper/heartbeat
 *
 * 心跳读取（M2 升级版）：返回当前助手状态统计
 *   - 活跃助手数量（最近 5 分钟内有过心跳的）
 *   - 当前用户已装软件数量
 *
 * POST /api/v2/helper/heartbeat
 *
 * 心跳上报（M2 升级版）：
 *   - 助手定时上报本机软件 + 端口 + 协议状态
 *   - 后端存到 UserInstalledSoftware 表
 *   - 用于反向推送（新 Skill × 用户已装软件）
 *
 * 当前简化：完整反向推送逻辑在 F14 里程碑，本接口只负责数据落库
 */
export async function GET() {
  // 5 分钟内有 POST 过心跳的 = 活跃助手
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeCount = await prisma.userInstalledSoftware.count({
    where: { lastSeenAt: { gt: fiveMinAgo } },
    // v2.0.7+：distinct 走 unknown-cast 绕过 Prisma 生成类型 stale（schema 加了 userInstalledSoftware 后未重跑 prisma generate，TS 端窄到 never）
    distinct: ['userId'] as unknown as never,
  });

  const payload = {
    alive: true,
    active_helpers: activeCount,
    last_heartbeat: new Date().toISOString(),
  } as HelperHeartbeat;

  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const session = await auth();

  // 心跳上报可匿名（用户未登录也接受，便于后续关联）
  const body = (await req.json()) as HelperHeartbeatPayload;
  const installedSoftware: string[] = body.installed_software || [];
  const helperPort = body.helper_port;
  const protocolRegistered = body.protocol_registered;

  if (!Array.isArray(installedSoftware)) {
    return NextResponse.json({ error: 'installed_software 必须是数组' }, { status: 400 });
  }

  // 1. 查 softwareTag 记录
  const softwareTags = await prisma.softwareTag.findMany({
    where: { name: { in: installedSoftware } },
    select: { id: true, name: true },
  });

  if (softwareTags.length === 0 && installedSoftware.length > 0) {
    // 软件识别不到（不在白名单）也接受，不报错
  }

  // 2. 写入 UserInstalledSoftware
  //   - 登录用户：归属到 userId
  //   - 未登录：用 IP 哈希作为匿名 userId（M2 简化；M3 改为机器指纹）
  const userId = session?.user?.id || `anon:${await ipHash(req)}`;

  const now = new Date();

  // 先清掉该用户本次心跳未涵盖的旧记录（避免软件卸载后还残留）
  const currentTagIds = softwareTags.map((t) => t.id);
  await prisma.userInstalledSoftware.deleteMany({
    where: {
      userId,
      source: 'HELPER_SCAN',
      ...(currentTagIds.length > 0
        ? { softwareTagId: { notIn: currentTagIds } }
        : {}),
    },
  });

  // upsert 每条软件
  for (const tag of softwareTags) {
    await prisma.userInstalledSoftware.upsert({
      where: {
        userId_softwareTagId: {
          userId,
          softwareTagId: tag.id,
        },
      },
      update: {
        lastSeenAt: now,
        helperPort: helperPort || undefined,
      },
      create: {
        userId,
        softwareTagId: tag.id,
        source: 'HELPER_SCAN',
        helperPort: helperPort || undefined,
      },
    });
  }

  // 3. 记录日志（M2 简化：先 console.log，后续接入埋点系统）
  console.log(
    `[heartbeat] user=${userId.slice(0, 12)}... scanned=${installedSoftware.length} matched=${softwareTags.length} port=${helperPort} protocol=${protocolRegistered}`
  );

  return NextResponse.json({
    ok: true,
    received: installedSoftware.length,
    matched: softwareTags.length,
    user_id: userId.slice(0, 12) + '...',
    last_heartbeat: now.toISOString(),
  });
}

async function ipHash(req: NextRequest): Promise<string> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  // 简单 hash（生产环境应该用 crypto.subtle）
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
    hash |= 0;
  }
  return `ip-${Math.abs(hash).toString(36)}`;
}