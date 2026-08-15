/**
 * GET /.well-known/agent.json
 *
 * A2A 协议标准要求 Agent 在 .well-known/agent.json 暴露其 Agent Card。
 * 这是 A2A 发现机制的标准入口。
 *
 * 参考：https://a2a-protocol.org/latest/#/documentation?id=discovery
 *
 * 此路由重定向到 /api/a2a/agent-card 以保持单一数据源。
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET() {
  // 重定向到统一的 agent card 端点
  return NextResponse.redirect(new URL('/api/a2a/agent-card', 'http://localhost'), {
    status: 308,
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

// 备用：直接返回 agent card（避免重定向开销）
// import { generateAgentCard } from '@/lib/a2a/agent-card';
// export async function GET() {
//   const card = await generateAgentCard();
//   return NextResponse.json(card, {
//     headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
//   });
// }
