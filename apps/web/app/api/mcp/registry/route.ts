/**
 * 官方 MCP Registry 适配器
 *
 * 官方 Registry: https://registry.modelcontextprotocol.io
 * - 2025-12 MCP 协议捐赠给 Linux Foundation 下的 Agentic AI Foundation
 * - 官方 Registry 是 MCP Servers 的统一目录
 *
 * 本适配器让 SkillHub 的 MCP Server 可被注册到官方 Registry
 * 同时支持反向：从官方 Registry 拉取 MCP Servers 同步到 SkillHub
 *
 * 端点：
 * - GET  /api/mcp/registry/list      - 列出 Registry 中可同步的 MCP Servers
 * - POST /api/mcp/registry/sync     - 从 Registry 同步到 SkillHub
 * - GET  /api/mcp/registry/manifest - SkillHub 的 MCP Server 注册清单
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const OFFICIAL_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';
const SKILLHUB_MCP_ENDPOINT = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp/tools`
  : 'https://skillhub.proclaw.cc/api/mcp/tools';

interface RegistryServer {
  name: string;
  description: string;
  version: string;
  repository?: { url: string };
  homepage?: string;
  author?: { name: string };
  keywords?: string[];
  capabilities?: { tools?: boolean; resources?: boolean; prompts?: boolean };
}

/**
 * 获取或创建系统用户（与 CrawlerService/SkillsImportService 同模式）
 * 供无登录态的后台同步端点作为 Skill 作者
 */
async function getOrCreateSystemUser(): Promise<string> {
  const systemEmail = 'system@skillhub.io';

  let user = await prisma.user.findUnique({
    where: { email: systemEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: systemEmail,
        name: 'SkillHub System',
      },
    });
  }

  return user.id;
}

/**
 * GET /api/mcp/registry/list
 * 列出官方 Registry 中可同步的 MCP Servers
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'manifest') {
    return NextResponse.json(getSkillHubManifest());
  }

  try {
    // 调用官方 Registry API
    const response = await fetch(`${OFFICIAL_REGISTRY_URL}/v0.1/servers`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 }, // 1 小时缓存
    });

    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`);
    }

    const data = await response.json();
    const servers: RegistryServer[] = data.servers ?? [];

    return NextResponse.json({
      source: OFFICIAL_REGISTRY_URL,
      total: servers.length,
      servers: servers.slice(0, 50).map((s) => ({
        name: s.name,
        description: s.description?.slice(0, 200),
        version: s.version,
        repository: s.repository?.url,
        keywords: s.keywords,
      })),
    });
  } catch (error) {
    console.error('[registry] error:', error);
    return NextResponse.json(
      {
        error: 'REGISTRY_UNAVAILABLE',
        message:
          'Official MCP Registry is not reachable. You can still use SkillHub MCP Server independently.',
        fallback: getSkillHubManifest(),
      },
      { status: 503 },
    );
  }
}

/**
 * POST /api/mcp/registry/sync
 * 从官方 Registry 同步 MCP Servers 到 SkillHub
 * 创建一个 Skill 记录（type: MCP_SERVER）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, source } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'name is required' },
        { status: 400 },
      );
    }

    // 简化实现：仅记录同步请求
    // 实际生产：从 Registry 拉取详细 manifest，转换为 Skill
    const slug = `mcp-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    const existing = await prisma.skill.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { message: 'Already synced', slug },
        { status: 200 },
      );
    }

    const skill = await prisma.skill.create({
      data: {
        slug,
        name: `MCP: ${name}`,
        description: `MCP Server from ${source ?? OFFICIAL_REGISTRY_URL}`,
        version: '1.0.0',
        category: 'mcp-server',
        // SkillType 枚举为 PROMPT|KNOWLEDGE|RULE|SKILL_PACK，无 TOOL；
        // TODO: 如需 MCP Server 专属类型，扩展 SkillType 枚举并加迁移
        type: 'PROMPT',
        tags: ['mcp', 'registry'],
        status: 'PENDING_REVIEW',
        isPublic: false,
        source: 'mcp-registry',
        sourceUrl: `${OFFICIAL_REGISTRY_URL}/servers/${encodeURIComponent(name)}`,
        standardName: `mcp-${name}`,
        standardDescription: `MCP Server: ${name}`,
        discoveryKeywords: ['mcp', name],
        agentSkillsVersion: '1.0',
        authorId: await getOrCreateSystemUser(),
      },
    });

    return NextResponse.json(
      {
        message: 'Synced successfully',
        slug: skill.slug,
        id: skill.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[registry/sync] error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to sync from registry' },
      { status: 500 },
    );
  }
}

/**
 * 生成 SkillHub MCP Server 的注册清单
 *
 * 可提交给官方 Registry（https://registry.modelcontextprotocol.io）
 * 详细规范：https://github.com/modelcontextprotocol/registry
 */
function getSkillHubManifest() {
  return {
    schema: 'https://raw.githubusercontent.com/modelcontextprotocol/registry/main/schema/2025-11/server.schema.json',
    name: 'io.github.skillhub/skillhub-mcp',
    description:
      'SkillHub MCP Server - Browse, search, and install AI Agent Skills from the largest open marketplace',
    version: '3.0.0',
    repository: {
      type: 'git',
      url: 'https://github.com/BigLionX/SkillHub',
    },
    homepage: 'https://skillhub.proclaw.cc',
    author: {
      name: 'BigLionX Team',
      email: 'team@skillhub.proclaw.cc',
    },
    license: 'Apache-2.0',
    keywords: [
      'agent-skills',
      'mcp',
      'skill-marketplace',
      'ai-tools',
      'prompt-engineering',
    ],
    transport: [
      {
        type: 'http',
        url: SKILLHUB_MCP_ENDPOINT,
      },
    ],
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
    tools: [
      {
        name: 'search_skills',
        description: 'Search AI Agent Skills by keyword',
      },
      {
        name: 'get_skill',
        description: 'Get full SKILL.md content for a specific skill',
      },
      {
        name: 'list_skills_by_type',
        description: 'Browse skills by category',
      },
      {
        name: 'install_skill',
        description: 'Get installation instructions for a skill',
      },
    ],
    // 兼容 Agent Skills 开放标准的扩展字段
    'x-agent-skills': {
      version: '1.0',
      discoveryEndpoint: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://skillhub.proclaw.cc'}/api/v2/discovery`,
      standardsUrl: 'https://agentskills.io',
    },
  };
}