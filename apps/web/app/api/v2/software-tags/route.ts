import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/v2/software-tags
 * 返回所有软件标签 + 每个标签下的 Skill 数量
 */
export async function GET() {
  const tags = await prisma.softwareTag.findMany({
    select: {
      id: true,
      name: true,
      labelZh: true,
      icon: true,
      _count: {
        select: { skills: true },
      },
    },
    orderBy: { labelZh: 'asc' },
  });

  return NextResponse.json({
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      labelZh: t.labelZh,
      icon: t.icon,
      skillCount: t._count.skills,
    })),
  });
}