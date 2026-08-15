/**
 * SKILL.md 自动发现爬虫 v2
 *
 * 升级版爬虫，自动识别符合 Agent Skills 开放标准的 SKILL.md 文件
 *
 * 用法：
 *   npx tsx scripts/crawl-skill-md.ts --repo anthropics/skills
 *   npx tsx scripts/crawl-skill-md.ts --query "SKILL.md" --limit 100
 *
 * 核心特性：
 * - 通过 GitHub Code Search 查找包含 SKILL.md 的仓库
 * - 解析 frontmatter 提取 name + description
 * - 提取 discovery_keywords 用于 Agent 发现
 * - 自动检测 Agent Skills 版本
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import axios from 'axios';
import { prisma } from '../apps/web/lib/prisma';
import { parseSkillMd, SkillMdParseError } from '../apps/web/lib/skills/skill-md-parser';
import { scanResources, inferResourceType } from '../apps/web/lib/skills/skill-resource-scanner';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

interface CrawlOptions {
  repo?: string;
  query?: string;
  limit?: number;
  minStars?: number;
  dryRun?: boolean;
}

interface DiscoveredSkill {
  repoFullName: string;
  defaultBranch: string;
  skillMdPath: string;
  rawUrl: string;
  htmlUrl: string;
  stars: number;
  description: string;
}

const GITHUB_API = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function ghHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  };
}

/**
 * 通过 GitHub Code Search 查找含 SKILL.md 的仓库
 */
async function searchSkillMdRepos(
  query: string,
  limit: number,
  minStars: number,
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = [];
  const seen = new Set<string>();

  try {
    // GitHub Code Search API（需要 token）
    const response = await axios.get(`${GITHUB_API}/search/code`, {
      headers: ghHeaders(),
      params: {
        q: `${query} filename:SKILL.md`,
        per_page: Math.min(100, limit),
      },
    });

    for (const item of response.data.items ?? []) {
      const repoFullName = item.repository?.full_name;
      if (!repoFullName || seen.has(repoFullName)) continue;
      seen.add(repoFullName);

      // 获取仓库详情（stars、default branch）
      const repoResp = await axios.get(`${GITHUB_API}/repos/${repoFullName}`, {
        headers: ghHeaders(),
      });

      if (repoResp.data.stargazers_count < minStars) continue;

      results.push({
        repoFullName,
        defaultBranch: repoResp.data.default_branch ?? 'main',
        skillMdPath: item.path,
        rawUrl: `https://raw.githubusercontent.com/${repoFullName}/${repoResp.data.default_branch ?? 'main'}/${item.path}`,
        htmlUrl: item.html_url,
        stars: repoResp.data.stargazers_count,
        description: repoResp.data.description ?? '',
      });

      if (results.length >= limit) break;
    }
  } catch (error: unknown) {
    const err = error as { response?: { status?: number }; message?: string };
    if (err.response?.status === 403) {
      console.warn('⚠️  GitHub API rate limit. Using fallback search strategy.');
      return fallbackSearch(query, limit, minStars);
    }
    console.error('Search failed:', err.message);
  }

  return results;
}

/**
 * Fallback: 通过 GitHub Repo Search + 文件探测
 */
async function fallbackSearch(
  query: string,
  limit: number,
  minStars: number,
): Promise<DiscoveredSkill[]> {
  console.log('📡 Using repository search fallback...');
  const results: DiscoveredSkill[] = [];

  const response = await axios.get(`${GITHUB_API}/search/repositories`, {
    headers: ghHeaders(),
    params: {
      q: `${query} SKILL.md in:readme`,
      per_page: Math.min(50, limit),
    },
  });

  for (const repo of response.data.items ?? []) {
    if (repo.stargazers_count < minStars) continue;

    // 探测 SKILL.md 位置
    const candidates = [
      'SKILL.md',
      'skill.md',
      '.claude/skills/SKILL.md',
      'skills/SKILL.md',
    ];
    for (const path of candidates) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch ?? 'main'}/${path}`;
        const head = await axios.head(rawUrl, { timeout: 5000 });
        if (head.status === 200) {
          results.push({
            repoFullName: repo.full_name,
            defaultBranch: repo.default_branch ?? 'main',
            skillMdPath: path,
            rawUrl,
            htmlUrl: `https://github.com/${repo.full_name}/blob/${repo.default_branch ?? 'main'}/${path}`,
            stars: repo.stargazers_count,
            description: repo.description ?? '',
          });
          break;
        }
      } catch {
        continue;
      }
    }

    if (results.length >= limit) break;
  }

  return results;
}

/**
 * 下载并解析 SKILL.md
 */
async function downloadAndParse(discovered: DiscoveredSkill) {
  try {
    const response = await axios.get(discovered.rawUrl, {
      responseType: 'text',
      timeout: 10000,
    });
    return { content: response.data, error: null };
  } catch (error: unknown) {
    const err = error as { message?: string };
    return { content: null, error: err.message ?? 'Download failed' };
  }
}

/**
 * 生成 slug
 */
function generateSlug(name: string, repoFullName: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const repoHash = repoFullName.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase();
  return `${baseSlug}-${repoHash}`;
}

/**
 * 主流程
 */
async function main() {
  const args = process.argv.slice(2);
  const options: CrawlOptions = {
    query: 'SKILL.md',
    limit: 30,
    minStars: 20,
    dryRun: args.includes('--dry-run'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo') options.repo = args[++i];
    else if (args[i] === '--query') options.query = args[++i];
    else if (args[i] === '--limit') options.limit = parseInt(args[++i]);
    else if (args[i] === '--min-stars') options.minStars = parseInt(args[++i]);
  }

  console.log('🚀 SKILL.md Auto-Discovery Crawler v2');
  console.log('=====================================\n');
  console.log('Options:', options);

  if (!GITHUB_TOKEN) {
    console.warn('⚠️  GITHUB_TOKEN not set. Rate limits will apply (60 req/h).');
  }

  // 1. 发现 SKILL.md 仓库
  console.log('\n📡 Step 1: Discovering SKILL.md repositories...');
  const discovered = options.repo
    ? [await discoverSingleRepo(options.repo)]
    : await searchSkillMdRepos(options.query!, options.limit!, options.minStars!);

  console.log(`  Found ${discovered.length} candidate(s)`);

  if (discovered.length === 0) {
    console.log('  No candidates found. Try lower --min-stars or different query.');
    return;
  }

  // 2. 下载并解析
  console.log('\n📥 Step 2: Downloading and parsing SKILL.md files...');
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const d of discovered) {
    if (!d) continue;
    const { content, error } = await downloadAndParse(d);
    if (!content) {
      console.log(`  ✗ ${d.repoFullName}: ${error}`);
      failed++;
      continue;
    }

    // 3. 解析 frontmatter
    let parsed;
    try {
      parsed = parseSkillMd(content);
    } catch (err) {
      if (err instanceof SkillMdParseError) {
        console.log(`  ⚠️  ${d.repoFullName}: Invalid SKILL.md (${err.code})`);
        skipped++;
        continue;
      }
      throw err;
    }

    const slug = generateSlug(parsed.frontmatter.name, d.repoFullName);
    const skillMdPath = d.skillMdPath.replace(/\/SKILL\.md$/, '').replace(/^.*?\//, '');

    if (options.dryRun) {
      console.log(`  ✓ [DRY-RUN] ${d.repoFullName}`);
      console.log(`     name: ${parsed.frontmatter.name}`);
      console.log(`     description: ${parsed.frontmatter.description.slice(0, 80)}...`);
      console.log(`     slug: ${slug}`);
      console.log(`     keywords: ${parsed.keywords.slice(0, 5).join(', ')}`);
      success++;
      continue;
    }

    // 4. 扫描资源（scripts/、references/、assets/）
    let resources: Array<{
      type: string;
      path: string;
      storageKey: string;
      sizeBytes: number;
      mimeType?: string;
      checksum: string;
    }> = [];

    try {
      const scanned = await scanResources(d.repoFullName, d.defaultBranch, skillMdPath);
      resources = scanned.map((r) => ({
        ...r,
        type: inferResourceType(r.path),
        storageKey: `skills/${slug}/${r.path}`,
        checksum: '', // TODO: 计算 SHA-256
      }));
    } catch {
      // 资源扫描失败不影响主流程
    }

    // 5. 保存到数据库
    try {
      const existing = await prisma.skill.findUnique({ where: { slug } });
      if (existing) {
        console.log(`  ↻ ${d.repoFullName}: Already exists, updating...`);
        await prisma.skill.update({
          where: { slug },
          data: {
            description: parsed.frontmatter.description,
            readme: parsed.body,
            standardName: parsed.frontmatter.name,
            standardDescription: parsed.frontmatter.description,
            discoveryKeywords: parsed.keywords,
            agentSkillsVersion: parsed.agentSkillsVersion,
            skillMdContent: parsed.raw,
            skillMdFrontmatter: parsed.frontmatter as unknown as object,
            lastAnalyzedAt: new Date(),
            starCount: d.stars,
            sourceUrl: d.htmlUrl,
            source: 'github-crawl',
          },
        });
      } else {
        await prisma.skill.create({
          data: {
            slug,
            name: parsed.frontmatter.name,
            description: parsed.frontmatter.description,
            readme: parsed.body,
            version: '1.0.0',
            category: 'imported',
            tags: [],
            status: 'PENDING_REVIEW',
            isPublic: false,
            standardName: parsed.frontmatter.name,
            standardDescription: parsed.frontmatter.description,
            discoveryKeywords: parsed.keywords,
            agentSkillsVersion: parsed.agentSkillsVersion,
            skillMdContent: parsed.raw,
            skillMdFrontmatter: parsed.frontmatter as unknown as object,
            lastAnalyzedAt: new Date(),
            starCount: d.stars,
            sourceUrl: d.htmlUrl,
            source: 'github-crawl',
          },
        });
      }

      // 资源保存（如果有）
      if (resources.length > 0) {
        await prisma.skillResource.deleteMany({ where: { skill: { slug } } });
        for (const r of resources) {
          await prisma.skillResource.create({
            data: {
              skill: { connect: { slug } },
              type: r.type,
              path: r.path,
              storageKey: r.storageKey,
              sizeBytes: r.sizeBytes,
              mimeType: r.mimeType,
              checksum: r.checksum,
            },
          });
        }
      }

      console.log(`  ✓ ${d.repoFullName} → ${slug} (${resources.length} resources)`);
      success++;
    } catch (err) {
      const e = err as { message?: string };
      console.log(`  ✗ ${d.repoFullName}: Save failed - ${e.message}`);
      failed++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  Total: ${discovered.length}`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped (invalid): ${skipped}`);

  if (options.dryRun) {
    console.log('\n💡 Run without --dry-run to actually save to database.');
  }
}

/**
 * 探测单个仓库
 */
async function discoverSingleRepo(repoFullName: string): Promise<DiscoveredSkill> {
  const repoResp = await axios.get(`${GITHUB_API}/repos/${repoFullName}`, {
    headers: ghHeaders(),
  });
  const defaultBranch = repoResp.data.default_branch ?? 'main';

  // 探测 SKILL.md 位置
  const candidates = [
    'SKILL.md',
    'skill.md',
    '.claude/skills/SKILL.md',
    'skills/SKILL.md',
  ];
  for (const path of candidates) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${defaultBranch}/${path}`;
      const head = await axios.head(rawUrl, { timeout: 5000 });
      if (head.status === 200) {
        return {
          repoFullName,
          defaultBranch,
          skillMdPath: path,
          rawUrl,
          htmlUrl: `https://github.com/${repoFullName}/blob/${defaultBranch}/${path}`,
          stars: repoResp.data.stargazers_count,
          description: repoResp.data.description ?? '',
        };
      }
    } catch {
      continue;
    }
  }
  throw new Error(`SKILL.md not found in ${repoFullName}`);
}

main()
  .catch((err) => {
    console.error('❌ Crawler failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });