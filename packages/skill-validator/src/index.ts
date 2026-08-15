/**
 * @skillhub/skill-validator — 技能包静态校验器
 *
 * 校验 Agent Skills 标准技能包：
 *   1. 目录结构（SKILL.md 必须存在，无 node_modules/.git 混入）
 *   2. SKILL.md frontmatter（name/description 必填，version 语义化）
 *   3. manifest（skill.json / package.json）schema 与一致性
 *   4. 资源引用（正文/脚本中引用的 scripts/ assets/ 路径存在性）
 *
 * 仅依赖 zod（frontmatter 用内置轻量 YAML 子集解析器，
 * 覆盖 key: value / 引号字符串 / 列表 / 注释；复杂 YAML 请用 web 端 gray-matter 解析器）。
 */

import { readFile, readdir, stat } from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const SKILL_FRONTMATTER_SCHEMA = z.object({
  name: z.string().min(1, 'name 不能为空'),
  description: z.string().min(1, 'description 不能为空'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version 需为语义化版本 x.y.z').optional(),
  allowedTools: z.array(z.string()).optional(),
  license: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
});

export type SkillFrontmatter = z.infer<typeof SKILL_FRONTMATTER_SCHEMA>;

export const SKILL_MANIFEST_SCHEMA = z.object({
  name: z.string().min(1, 'name 不能为空'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version 需为语义化版本 x.y.z'),
  description: z.string().optional(),
  author: z.string().optional(),
  namespace: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type SkillManifest = z.infer<typeof SKILL_MANIFEST_SCHEMA>;

// ---------------------------------------------------------------------------
// 轻量 frontmatter 解析器
// ---------------------------------------------------------------------------

function unquote(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).replace(/\\(["'\\])/g, '$1');
  }
  return t;
}

/**
 * 解析 SKILL.md 的 YAML frontmatter（`---` 包裹段）。
 * 支持子集：`key: value`、`key: "quoted"`、`key:` 后跟 `- item` 列表、`#` 注释。
 */
export function parseFrontmatter(content: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) {
    return { data: {}, body: content };
  }
  const raw = match[1];
  const data: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const listMatch = /^-\s+(.*)$/.exec(trimmed);
    if (listMatch && currentKey) {
      const arr = Array.isArray(data[currentKey])
        ? (data[currentKey] as unknown[])
        : [];
      arr.push(unquote(listMatch[1]));
      data[currentKey] = arr;
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (kv) {
      currentKey = kv[1];
      data[currentKey] = unquote(kv[2]);
    }
  }

  return { data, body: content.slice(match[0].length) };
}

// ---------------------------------------------------------------------------
// 校验报告类型
// ---------------------------------------------------------------------------

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

export interface ValidationReport {
  valid: boolean;
  skillName?: string;
  version?: string;
  checks: CheckResult[];
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 核心校验
// ---------------------------------------------------------------------------

const RESOURCE_REF_RE = /(?:scripts|assets)\/[\w@./-]+/g;
const FORBIDDEN_DIRS = new Set(['node_modules', '.git']);

/**
 * 校验技能包目录，返回结构化报告。
 * errors 非空 → valid=false（拒绝发布）；仅 warnings → 可发布但需记录。
 */
export async function validateSkillPackage(dir: string): Promise<ValidationReport> {
  const checks: CheckResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 目录存在
  try {
    await stat(dir);
  } catch {
    checks.push({ name: '目录', status: 'fail', detail: `路径不存在: ${dir}` });
    return { valid: false, skillName: undefined, version: undefined, checks, errors: [`路径不存在: ${dir}`], warnings };
  }

  // 2. SKILL.md 存在
  const skillMdPath = path.join(dir, 'SKILL.md');
  try {
    await stat(skillMdPath);
    checks.push({ name: 'SKILL.md', status: 'pass' });
  } catch {
    checks.push({ name: 'SKILL.md', status: 'fail', detail: '缺失 SKILL.md' });
    errors.push('缺失 SKILL.md');
    return { valid: false, skillName: undefined, version: undefined, checks, errors, warnings };
  }

  // 3. 目录污染检查
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (FORBIDDEN_DIRS.has(entry)) {
      warnings.push(`目录包含 ${entry}/（不应随包发布）`);
    }
  }
  checks.push({
    name: '目录结构',
    status: warnings.length ? 'warn' : 'pass',
    detail: warnings.length ? '含 node_modules/.git' : '干净',
  });

  // 4. frontmatter
  const content = await readFile(skillMdPath, 'utf-8');
  const { data, body } = parseFrontmatter(content);
  // Agent Skills 标准用 kebab-case `allowed-tools`，归一化为 camelCase
  const normalized: Record<string, unknown> = { ...data };
  if (
    Array.isArray(normalized['allowed-tools']) &&
    normalized['allowedTools'] === undefined
  ) {
    normalized['allowedTools'] = normalized['allowed-tools'];
  }
  const fmResult = SKILL_FRONTMATTER_SCHEMA.safeParse(normalized);
  if (fmResult.success) {
    checks.push({ name: 'frontmatter', status: 'pass' });
  } else {
    const fmErrors = fmResult.error.issues.map(
      (issue) => `frontmatter.${issue.path.join('.')}: ${issue.message}`,
    );
    errors.push(...fmErrors);
    checks.push({ name: 'frontmatter', status: 'fail', detail: fmErrors.join('; ') });
  }
  const frontmatter = fmResult.success ? fmResult.data : undefined;

  // 正文非空检查
  if (!body.trim()) {
    warnings.push('SKILL.md 正文为空（只有 frontmatter）');
  }

  // 5. manifest
  let manifest: SkillManifest | undefined;
  const manifestPath = path.join(dir, 'skill.json');
  const pkgPath = path.join(dir, 'package.json');
  try {
    await stat(manifestPath);
  } catch {
    try {
      await stat(pkgPath);
    } catch {
      checks.push({ name: 'manifest', status: 'warn', detail: '无 skill.json / package.json' });
      warnings.push('无 skill.json / package.json');
    }
  }
  if (!checks.some((c) => c.name === 'manifest')) {
    const manifestFile = (await stat(manifestPath).then(() => manifestPath).catch(() => pkgPath));
    try {
      const raw = await readFile(manifestFile, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const mResult = SKILL_MANIFEST_SCHEMA.safeParse(parsed);
      if (mResult.success) {
        manifest = mResult.data;
        checks.push({ name: 'manifest', status: 'pass' });
        // 与 frontmatter 一致性
        if (frontmatter) {
          if (frontmatter.name && manifest.name !== frontmatter.name) {
            warnings.push(`manifest.name (${manifest.name}) 与 frontmatter.name (${frontmatter.name}) 不一致`);
          }
          if (frontmatter.version && manifest.version !== frontmatter.version) {
            warnings.push(`manifest.version (${manifest.version}) 与 frontmatter.version (${frontmatter.version}) 不一致`);
          }
        }
      } else {
        const mErrors = mResult.error.issues.map(
          (issue) => `manifest.${issue.path.join('.')}: ${issue.message}`,
        );
        errors.push(...mErrors);
        checks.push({ name: 'manifest', status: 'fail', detail: mErrors.join('; ') });
      }
    } catch {
      errors.push('manifest 不是合法 JSON');
      checks.push({ name: 'manifest', status: 'fail', detail: '不是合法 JSON' });
    }
  }

  // 6. 资源引用检查
  const refs = new Set<string>();
  for (const m of [content, body].filter(Boolean)) {
    for (const ref of m.match(RESOURCE_REF_RE) ?? []) {
      refs.add(ref);
    }
  }
  let missingRefs = 0;
  for (const ref of refs) {
    const refPath = path.join(dir, ref);
    try {
      await stat(refPath);
    } catch {
      missingRefs++;
      warnings.push(`引用的资源不存在: ${ref}`);
    }
  }
  checks.push({
    name: '资源引用',
    status: missingRefs ? 'warn' : 'pass',
    detail: `${refs.size} 个引用, ${missingRefs} 个缺失`,
  });

  return {
    valid: errors.length === 0,
    skillName: frontmatter?.name ?? manifest?.name,
    version: frontmatter?.version ?? manifest?.version,
    checks,
    errors,
    warnings,
  };
}
