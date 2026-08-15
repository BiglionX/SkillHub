/**
 * GET /api/v2/skills/[slug]/skill.md
 *
 * 返回符合 Agent Skills 开放标准的 SKILL.md
 * Content-Type: text/markdown; charset=utf-8
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1 小时缓存

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const skill = await prisma.skill.findUnique({
      where: { slug },
      select: {
        slug: true,
        skillMdContent: true,
        standardName: true,
        standardDescription: true,
        agentSkillsVersion: true,
        isPublic: true,
      },
    });

    if (!skill || !skill.isPublic) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Skill not found: ${slug}` },
        { status: 404 },
      );
    }

    // 优先返回已标准化的 SKILL.md
    if (skill.skillMdContent) {
      return new NextResponse(skill.skillMdContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'Access-Control-Allow-Origin': '*',
          'X-Agent-Skills-Version': skill.agentSkillsVersion || '1.0',
          'X-Skill-Slug': skill.slug,
        },
      });
    }

    // 降级：从 name + description 动态生成 SKILL.md
    if (skill.standardName && skill.standardDescription) {
      const generated = generateSkillMdFromSkill({
        slug: skill.slug,
        standardName: skill.standardName,
        standardDescription: skill.standardDescription,
      });
      return new NextResponse(generated, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Agent-Skills-Version': '1.0',
          'X-Skill-Slug': skill.slug,
          'X-Skill-Source': 'generated',
        },
      });
    }

    return NextResponse.json(
      {
        error: 'NO_SKILL_MD',
        message: `Skill ${slug} has no SKILL.md content yet`,
      },
      { status: 404 },
    );
  } catch (error) {
    console.error('[skill.md] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load SKILL.md' },
      { status: 500 },
    );
  }
}

/**
 * 从 Skill 数据动态生成符合标准的 SKILL.md
 */
function generateSkillMdFromSkill(skill: {
  slug: string;
  standardName: string;
  standardDescription: string;
}): string {
  return `---
name: ${skill.standardName}
description: ${skill.standardDescription}
---

# ${skill.standardName}

This Skill is hosted on [SkillHub](https://skillhub.proclaw.cc/skills/${skill.slug}).

## Description

${skill.standardDescription}

## Installation

Install via SkillHub CLI:

\`\`\`bash
skillhub skill install ${skill.slug}
\`\`\`

Or browse at:
https://skillhub.proclaw.cc/skills/${skill.slug}
`;
}