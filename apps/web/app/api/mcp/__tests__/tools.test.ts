/**
 * MCP Server 单元测试
 *
 * 注意：
 * - GET 端点和需要 MCP Server 实例的 POST 测试依赖
 *   @modelcontextprotocol/sdk 的传输层，在单元测试环境中被跳过，
 *   将在集成测试中覆盖。
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/mcp/tools/route';

describe('MCP Server /api/mcp/tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST - JSON-RPC 请求验证', () => {
    it('应拒绝非法 JSON-RPC 请求', async () => {
      const request = new NextRequest('http://localhost/api/mcp/tools', {
        method: 'POST',
        body: JSON.stringify({ invalid: true }),
      });

      const response = await POST(request);
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.jsonrpc).toBe('2.0');
      expect(data.error.code).toBe(-32600);
    });
  });
});