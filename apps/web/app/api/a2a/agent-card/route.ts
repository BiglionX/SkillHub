/**
 * GET /api/a2a/agent-card
 *
 * 返回 SkillHub 的 A2A Agent Card。
 *
 * 其他 Agent 通过访问此端点发现 SkillHub 的能力：
 * - 可用的 Skills 列表
 * - 认证方式
 * - 协议版本
 * - 文档链接
 *
 * 参考：https://a2a-protocol.org/latest/#/documentation?id=agent-card
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAgentCard } from '@/lib/a2a/agent-card';
import { AgentCardSchema } from '@/lib/a2a/schemas';

export const dynamic = 'force-dynamic';
// Agent Card 变化频率低，缓存 5 分钟
export const revalidate = 300;

export async function GET(_request: NextRequest) {
  try {
    const card = await generateAgentCard();

    // 验证生成的 Card 符合 schema（防御性编程）
    const validation = AgentCardSchema.safeParse(card);
    if (!validation.success) {
      console.error('[a2a/agent-card] validation failed:', validation.error);
      return NextResponse.json(
        {
          error: 'AGENT_CARD_INVALID',
          message: 'Generated agent card failed schema validation',
          issues: validation.error.issues,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(card, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'X-A2A-Protocol-Version': '0.2',
      },
    });
  } catch (error) {
    console.error('[a2a/agent-card] error:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Failed to generate agent card',
      },
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
