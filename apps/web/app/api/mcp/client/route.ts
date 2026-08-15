/**
 * MCP Client 管理 API
 *
 * GET  /api/mcp/client           - 列出所有活跃连接
 * POST /api/mcp/client/connect   - 连接到 MCP Server
 * POST /api/mcp/client/disconnect - 断开连接
 * POST /api/mcp/client/call      - 调用工具
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getMcpClientPool,
  PRESET_MCP_SERVERS,
  type McpServerConfig,
} from '@/lib/services/McpClientPool';

export const dynamic = 'force-dynamic';

export async function GET() {
  const pool = getMcpClientPool();
  return NextResponse.json({
    activeConnections: pool.listConnections(),
    presets: PRESET_MCP_SERVERS.map((s) => ({
      name: s.name,
      transport: s.transport,
      command: s.command,
      url: s.url,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const pool = getMcpClientPool();

    switch (action) {
      case 'connect': {
        const config: McpServerConfig = body.config;
        if (!config?.name || !config?.transport) {
          return NextResponse.json(
            { error: 'BAD_REQUEST', message: 'config.name and config.transport are required' },
            { status: 400 },
          );
        }

        try {
          const client = await pool.connect(config);
          return NextResponse.json({
            message: 'Connected successfully',
            name: config.name,
            serverInfo: client.getServerVersion?.() ?? null,
          });
        } catch (error) {
          const e = error as { message?: string };
          return NextResponse.json(
            { error: 'CONNECTION_FAILED', message: e.message ?? 'Unknown error' },
            { status: 502 },
          );
        }
      }

      case 'disconnect': {
        const { name } = body;
        if (!name) {
          return NextResponse.json(
            { error: 'BAD_REQUEST', message: 'name is required' },
            { status: 400 },
          );
        }
        await pool.disconnect(name);
        return NextResponse.json({ message: 'Disconnected', name });
      }

      case 'list-tools': {
        const { name } = body;
        if (!name) {
          return NextResponse.json(
            { error: 'BAD_REQUEST', message: 'name is required' },
            { status: 400 },
          );
        }
        try {
          const result = await pool.listTools(name);
          return NextResponse.json(result);
        } catch (error) {
          const e = error as { message?: string };
          return NextResponse.json(
            { error: 'LIST_FAILED', message: e.message ?? 'Unknown error' },
            { status: 502 },
          );
        }
      }

      case 'call-tool': {
        const { name, toolName, args } = body;
        if (!name || !toolName) {
          return NextResponse.json(
            { error: 'BAD_REQUEST', message: 'name and toolName are required' },
            { status: 400 },
          );
        }

        try {
          const result = await pool.callTool(name, toolName, args ?? {});
          return NextResponse.json(result);
        } catch (error) {
          const e = error as { message?: string };
          return NextResponse.json(
            { error: 'CALL_FAILED', message: e.message ?? 'Unknown error' },
            { status: 502 },
          );
        }
      }

      default:
        return NextResponse.json(
          {
            error: 'BAD_REQUEST',
            message: `Unknown action: ${action}. Valid: connect, disconnect, list-tools, call-tool`,
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error('[mcp/client] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500 },
    );
  }
}