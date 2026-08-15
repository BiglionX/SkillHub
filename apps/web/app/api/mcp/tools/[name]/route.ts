/**
 * MCP Server 单工具详情端点
 *
 * GET /api/mcp/tools/[name] - 获取单个工具的完整 schema
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMcpServer } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const server = await getMcpServer();
  const response = await server.request(
    { method: 'tools/list', params: {} },
    // @ts-expect-error - SDK accepts any
    { parse: (v: unknown) => v },
  );

  const tool = (response as { tools?: Array<{ name: string }> }).tools?.find(
    (t) => t.name === name,
  );

  if (!tool) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: `Tool not found: ${name}` },
      { status: 404 },
    );
  }

  return NextResponse.json(tool);
}