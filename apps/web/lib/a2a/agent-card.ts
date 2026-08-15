/**
 * A2A Agent Card 生成器
 *
 * 根据 SkillHub 的 Skills 数据动态生成符合 A2A 协议的 Agent Card。
 *
 * A2A Agent Card 是 A2A 协议的核心入口：
 * - 其他 Agent 通过 GET /api/a2a/agent-card 发现 SkillHub 的能力
 * - 根据 skills 列表决定可以发起哪些任务
 *
 * 参考：https://a2a-protocol.org/latest/#/documentation?id=agent-card
 */

import { prisma } from '@/lib/prisma';
import type { AgentCard, AgentSkill, AgentCapability } from './schemas';

const SKILLHUB_VERSION = '3.0.0';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://skillhub.proclaw.cc';

/**
 * 获取 SkillHub 的所有能力
 */
function getCapabilities(): AgentCapability[] {
  return [
    {
      name: 'streaming',
      enabled: true,
      description: 'Support streaming responses via Server-Sent Events',
    },
    {
      name: 'pushNotifications',
      enabled: true,
      description: 'Support push notifications via webhook for task completion',
    },
    {
      name: 'stateTransitionHistory',
      enabled: true,
      description: 'Return full task state transition history',
    },
    {
      name: 'i18n',
      enabled: true,
      description: 'Multi-locale support (zh-CN, en-US, ja-JP, ko-KR)',
    },
  ];
}

/**
 * 从数据库中获取作为 A2A Skills 暴露的 Skills
 *
 * 条件：
 * - 公开
 * - 已审核通过
 * - 兼容 Agent Skills 标准
 */
async function getAgentSkills(): Promise<AgentSkill[]> {
  const skills = await prisma.skill.findMany({
    where: {
      isPublic: true,
      status: 'APPROVED',
      standardName: { not: null },
    },
    select: {
      slug: true,
      standardName: true,
      standardDescription: true,
      discoveryKeywords: true,
      type: true,
      industryTags: true,
      locale: true,
      inputSchema: true,
      outputSchema: true,
    },
    orderBy: { downloadCount: 'desc' },
    take: 50, // Agent Card 不应过长
  });

  return skills.map((skill) => ({
    id: `skillhub:${skill.slug}`,
    name: skill.standardName || skill.slug,
    description: skill.standardDescription || 'No description available',
    tags: [
      ...(skill.discoveryKeywords || []),
      ...(skill.industryTags || []),
      skill.type,
      skill.locale,
    ].filter(Boolean),
    skillhubSlug: skill.slug,
    inputSchema: skill.inputSchema as Record<string, unknown> | undefined,
    outputSchema: skill.outputSchema as Record<string, unknown> | undefined,
    examples: [
      `POST ${BASE_URL}/api/a2a/tasks { "skillSlug": "${skill.slug}", "messages": [...] }`,
    ],
  }));
}

/**
 * 生成 SkillHub 的 Agent Card
 */
export async function generateAgentCard(): Promise<AgentCard> {
  const skills = await getAgentSkills();

  return {
    protocolVersion: '0.2',
    name: 'SkillHub',
    description:
      'SkillHub is an open-source, enterprise-grade AI Agent Skills registry. ' +
      'It enables other Agents to search, install, publish, and execute Skills ' +
      'following the Agent Skills open standard (https://agentskills.io).',
    url: `${BASE_URL}/api/a2a/tasks`,
    provider: {
      name: 'BigLionX',
      url: 'https://github.com/BigLionX',
    },
    version: SKILLHUB_VERSION,
    capabilities: getCapabilities(),
    authentication: {
      schemes: ['bearer', 'oauth2'],
      credentialsUrl: `${BASE_URL}/auth/oauth`,
      scopes: ['skills:read', 'skills:publish', 'skills:install'],
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills,
    documentationUrl: `${BASE_URL}/docs/integration/a2a`,
    iconUrl: `${BASE_URL}/logo.png`,
  };
}

/**
 * 静态 Agent Card（用于测试 / 文档）
 */
export const STATIC_AGENT_CARD: AgentCard = {
  protocolVersion: '0.2',
  name: 'SkillHub',
  description:
    'SkillHub is an open-source, enterprise-grade AI Agent Skills registry.',
  url: `${BASE_URL}/api/a2a/tasks`,
  provider: { name: 'BigLionX' },
  version: SKILLHUB_VERSION,
  capabilities: [
    { name: 'streaming', enabled: true },
    { name: 'pushNotifications', enabled: true },
    { name: 'stateTransitionHistory', enabled: true },
  ],
  authentication: {
    schemes: ['bearer', 'oauth2'],
  },
  defaultInputModes: ['text/plain', 'application/json'],
  defaultOutputModes: ['text/plain', 'application/json'],
  skills: [],
  documentationUrl: `${BASE_URL}/docs/integration/a2a`,
};
