/**
 * CLI 工具 API 客户端（v2 扩展）
 *
 * 新增 Agent Skills 标准的 import / export / discovery 接口
 */

import axios from 'axios';
import { getConfig } from '../config/config';

export interface DiscoverySkill {
  slug: string;
  name: string;
  description: string;
  keywords?: string[];
  type: string;
  industryTags?: string[];
  agentSkillsVersion?: string;
  locale?: string;
  stats?: {
    stars: number;
    downloads: number;
    qualityScore: number;
  };
}

export interface DiscoveryResponse {
  version: string;
  generatedAt: string;
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  skills: DiscoverySkill[];
}

export interface ImportResult {
  slug: string;
  name: string;
  url: string;
}

/**
 * 调用 Agent Skills 标准发现端点
 */
export async function fetchDiscovery(
  options: { apiUrl: string; type?: string; locale?: string; limit?: number } = {
    apiUrl: '',
  }
): Promise<DiscoveryResponse> {
  const config = getConfig();
  const apiUrl = options.apiUrl || config.apiUrl;

  const params: Record<string, unknown> = {};
  if (options.type) params.type = options.type;
  if (options.locale) params.locale = options.locale;
  if (options.limit) params.limit = options.limit;

  const response = await axios.get(`${apiUrl}/api/v2/discovery`, { params });
  return response.data;
}

/**
 * 通过 v2 discovery 端点搜索 Skill
 *
 * 兼容旧 search 命令的接口，使用新的标准端点
 */
export async function searchViaDiscovery(
  query: string,
  options: { apiUrl?: string; type?: string; limit?: number } = {}
): Promise<DiscoverySkill[]> {
  const all = await fetchDiscovery({
    apiUrl: options.apiUrl || '',
    type: options.type,
    limit: options.limit ?? 1000,
  });

  const q = query.toLowerCase();
  return all.skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.keywords?.some((k) => k.toLowerCase().includes(q)),
  );
}

/**
 * 下载 Skill 的 SKILL.md
 */
export async function downloadSkillMd(
  slug: string,
  apiUrl?: string,
): Promise<string> {
  const config = getConfig();
  const url = apiUrl || config.apiUrl;

  const response = await axios.get(`${url}/api/v2/skills/${slug}/skill.md`, {
    responseType: 'text',
    timeout: 10000,
  });
  return response.data;
}