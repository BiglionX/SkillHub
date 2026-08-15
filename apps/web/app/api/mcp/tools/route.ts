/**
 * MCP Server 端点
 *
 * 符合 Model Context Protocol 2025-11 规范
 * 提供 SkillHub Skills 作为 MCP Tools，AI Agent 可直接调�?
 *
 * 端点�?
 * - GET  /api/mcp/tools       - 列出所有可用工�?
 * - POST /api/mcp/tools/list  - JSON-RPC 2.0 标准请求（ListTools�?
 * - POST /api/mcp/tools/call  - JSON-RPC 2.0 标准请求（CallTool�?
 *
 * 用法�?
 *   �?Claude Desktop / Cursor / Cline 中配置：
 *   {
 *     "mcpServers": {
 *       "skillhub": {
 *         "url": "https://skillhub.proclaw.cc/api/mcp/tools"
 *       }
 *     }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { prisma } from '@/lib/prisma';
import type { SkillType } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * MCP Server 实例（单例）
 */
let mcpServerInstance: Server | null = null;

export async function getMcpServer(): Promise<Server> {
  if (mcpServerInstance) return mcpServerInstance;

  const server = new Server(
    {
      name: 'skillhub',
      version: '3.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // 列出所有可用工�?
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'search_skills',
          description:
            'Search AI Agent Skills on SkillHub by keyword. Returns matching skills with name, description, and metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search keyword (matches name, description, keywords)',
              },
              type: {
                type: 'string',
                enum: ['PROMPT', 'KNOWLEDGE', 'RULE', 'SKILL_PACK'],
                description: 'Filter by skill type',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (1-50)',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_skill',
          description:
            'Get detailed information about a specific Skill by slug, including its full SKILL.md content.',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Unique skill identifier (e.g., "pdf-generation")',
              },
            },
            required: ['slug'],
          },
        },
        {
          name: 'list_skills_by_type',
          description:
            'List all Skills of a specific type. Useful for browsing by category.',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['PROMPT', 'KNOWLEDGE', 'RULE', 'SKILL_PACK'],
                description: 'Skill type',
              },
              limit: {
                type: 'number',
                description: 'Maximum results (1-100)',
                default: 20,
              },
            },
            required: ['type'],
          },
        },
        {
          name: 'install_skill',
          description:
            'Get installation instructions and SKILL.md URL for a specific Skill. The agent can then download and use the skill.',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Skill slug to install',
              },
            },
            required: ['slug'],
          },
        },
      ],
    };
  });

  // 处理工具调用
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case 'search_skills': {
          const query = String(safeArgs.query ?? '').trim();
          const type = safeArgs.type ? String(safeArgs.type) : null;
          const limit = Math.min(50, Math.max(1, Number(safeArgs.limit ?? 10)));

          if (!query) {
            return {
              content: [
                { type: 'text', text: 'Error: query is required' },
              ],
              isError: true,
            };
          }

          const where: Record<string, unknown> = {
            isPublic: true,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { standardName: { contains: query, mode: 'insensitive' } },
              { standardDescription: { contains: query, mode: 'insensitive' } },
            ],
          };
          if (type) where.type = type.toUpperCase();

          const skills = await prisma.skill.findMany({
            where,
            take: limit,
            select: {
              slug: true,
              name: true,
              description: true,
              type: true,
              industryTags: true,
              starCount: true,
              downloadCount: true,
            },
            orderBy: [{ starCount: 'desc' }, { downloadCount: 'desc' }],
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    total: skills.length,
                    skills: skills.map((s) => ({
                      slug: s.slug,
                      name: s.name,
                      description: s.description?.slice(0, 200),
                      type: s.type,
                      stars: s.starCount,
                      downloads: s.downloadCount,
                      url: `https://skillhub.proclaw.cc/skills/${s.slug}`,
                    })),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'get_skill': {
          const slug = String(safeArgs.slug ?? '').trim();
          if (!slug) {
            return {
              content: [{ type: 'text', text: 'Error: slug is required' }],
              isError: true,
            };
          }

          const skill = await prisma.skill.findUnique({
            where: { slug },
            select: {
              slug: true,
              name: true,
              description: true,
              readme: true,
              skillMdContent: true,
              standardName: true,
              standardDescription: true,
              agentSkillsVersion: true,
              type: true,
              industryTags: true,
              starCount: true,
              downloadCount: true,
              version: true,
              isPublic: true,
              author: { select: { name: true } },
              namespace: { select: { name: true, slug: true } },
            },
          });

          if (!skill || !skill.isPublic) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Skill not found: ${slug}. Browse at https://skillhub.proclaw.cc/skills`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...skill,
                    skillMdUrl: `https://skillhub.proclaw.cc/api/v2/skills/${slug}/skill.md`,
                    pageUrl: `https://skillhub.proclaw.cc/skills/${slug}`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'list_skills_by_type': {
          const type = String(safeArgs.type ?? '').toUpperCase();
          const limit = Math.min(100, Math.max(1, Number(safeArgs.limit ?? 20)));

          if (!['PROMPT', 'KNOWLEDGE', 'RULE', 'SKILL_PACK'].includes(type)) {
            return {
              content: [{ type: 'text', text: 'Error: invalid type' }],
              isError: true,
            };
          }

          const skills = await prisma.skill.findMany({
            where: { type: type as SkillType, isPublic: true },
            take: limit,
            select: {
              slug: true,
              name: true,
              description: true,
              starCount: true,
            },
            orderBy: { starCount: 'desc' },
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    type,
                    total: skills.length,
                    skills: skills.map((s) => ({
                      slug: s.slug,
                      name: s.name,
                      description: s.description?.slice(0, 150),
                      stars: s.starCount,
                    })),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'install_skill': {
          const slug = String(safeArgs.slug ?? '').trim();
          if (!slug) {
            return {
              content: [{ type: 'text', text: 'Error: slug is required' }],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    slug,
                    instructions: [
                      `# Install ${slug} on your Agent`,
                      ``,
                      `## Option 1: Direct SKILL.md download`,
                      `\`\`\`bash`,
                      `# Get the SKILL.md URL`,
                      `curl https://skillhub.proclaw.cc/api/v2/skills/${slug}/skill.md`,
                      ``,
                      `# Save it to your Agent's skills directory:`,
                      `#   Claude Code: ~/.claude/skills/${slug}/SKILL.md`,
                      `#   Cursor:      ~/.cursor/skills/${slug}/SKILL.md`,
                      `#   Windsurf:    ~/.codeium/windsurf/skills/${slug}/SKILL.md`,
                      `\`\`\``,
                      ``,
                      `## Option 2: CLI (recommended)`,
                      `\`\`\`bash`,
                      `npx @skillhub/cli skill install ${slug}`,
                      `# or if installed globally:`,
                      `skillhub skill install ${slug}`,
                      `\`\`\``,
                      ``,
                      `## Option 3: Import in Agent`,
                      `Paste this URL into your Agent's skill discovery:`,
                      `https://skillhub.proclaw.cc/api/v2/skills/${slug}/skill.md`,
                    ].join('\n'),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const e = error as { message?: string };
      return {
        content: [
          { type: 'text', text: `Tool execution failed: ${e.message ?? 'Unknown error'}` },
        ],
        isError: true,
      };
    }
  });

  mcpServerInstance = server;
  return server;
}

/**
 * GET /api/mcp/tools
 * 返回 MCP 服务器信息和可用工具列表（REST 接口�?
 */
export async function GET() {
  const server = await getMcpServer();

  // 模拟 ListTools 请求
  const tools = await server.request(
    { method: 'tools/list', params: {} },
    ListToolsRequestSchema,
  );

  return NextResponse.json({
    name: 'skillhub',
    version: '3.0.0',
    description: 'SkillHub MCP Server - AI Agent Skills marketplace',
    protocol: 'MCP 2025-11',
    transport: 'HTTP (Streamable)',
    endpoint: '/api/mcp/tools',
    documentation: 'https://skillhub.proclaw.cc/docs/mcp',
    tools,
  });
}

/**
 * POST /api/mcp/tools
 * JSON-RPC 2.0 标准 MCP 请求处理
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证 JSON-RPC 2.0 格式
    if (body.jsonrpc !== '2.0' || !body.method) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
          id: body.id ?? null,
        },
        { status: 400 },
      );
    }

    const server = await getMcpServer();

    // 路由到对�?schema
    let schema;
    if (body.method === 'tools/list') schema = ListToolsRequestSchema;
    else if (body.method === 'tools/call') schema = CallToolRequestSchema;
    else {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id: body.id,
        },
        { status: 404 },
      );
    }

    const result = await server.request(
      { method: body.method, params: body.params ?? {} },
      schema,
    );

    return NextResponse.json({
      jsonrpc: '2.0',
      result,
      id: body.id,
    });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: e.message ?? 'Internal error' },
        id: null,
      },
      { status: 500 },
    );
  }
}