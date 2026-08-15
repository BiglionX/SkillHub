/**
 * SKILL.md 解析器
 *
 * 实现 Agent Skills 开放标准（https://agentskills.io）的解析逻辑：
 * - 解析 YAML frontmatter（name + description + 扩展字段）
 * - 提取 Markdown 主体指令
 * - 提取渐进式披露（Progressive Disclosure）所需的关键词
 * - 校验必填字段
 *
 * @module lib/skills/skill-md-parser
 */

import matter from 'gray-matter';
import { z } from 'zod';

/**
 * Agent Skills frontmatter Schema
 *
 * 依据 https://agentskills.io/specification：
 * - name：必需，1-64 字符，字母数字/连字符/下划线
 * - description：必需，10-1024 字符
 * - 允许任意扩展字段（passthrough）
 */
export const SkillFrontmatterSchema = z
  .object({
    name: z
      .string()
      .min(1, 'name is required')
      .max(64, 'name must be at most 64 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'name can only contain letters, numbers, hyphens, and underscores',
      ),
    description: z
      .string()
      .min(10, 'description must be at least 10 characters')
      .max(1024, 'description must be at most 1024 characters'),
  })
  .passthrough();

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

/**
 * 解析后的 SKILL.md 结构
 */
export interface ParsedSkillMd {
  /** 原始内容（用于回写） */
  raw: string;
  /** 校验后的 frontmatter */
  frontmatter: SkillFrontmatter;
  /** 额外字段（标准之外的元数据） */
  extraFields: Record<string, unknown>;
  /** Markdown 主体（去除 frontmatter 后的指令内容） */
  body: string;
  /** 渐进式披露关键词（从 description 提取） */
  keywords: string[];
  /** 兼容的 Agent Skills 协议版本 */
  agentSkillsVersion: string;
  /** 第一行标题（若有） */
  title: string | null;
}

/**
 * 解析错误
 */
export class SkillMdParseError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'EMPTY_CONTENT'
      | 'MISSING_FRONTMATTER'
      | 'INVALID_FRONTMATTER'
      | 'INVALID_NAME'
      | 'INVALID_DESCRIPTION',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SkillMdParseError';
  }
}

/** 停用词列表（中英文混合） */
const STOP_WORDS = new Set([
  // 英文
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'this', 'that', 'these', 'those', 'it', 'its', 'be', 'been',
  // 中文常见虚词
  '的', '了', '在', '是', '和', '与', '或', '但', '为', '以',
  '把', '被', '从', '到', '给', '向', '用', '对', '这', '那',
]);

/** 当前实现的 Agent Skills 协议版本 */
const AGENT_SKILLS_VERSION = '1.0';

/**
 * 解析 SKILL.md 内容
 *
 * @param content - SKILL.md 原始内容
 * @returns 解析后的结构
 * @throws {SkillMdParseError} 解析失败时
 *
 * @example
 * ```ts
 * const parsed = parseSkillMd(`
 * ---
 * name: pdf-generation
 * description: Generate PDF documents from markdown
 * ---
 *
 * # PDF Generation Skill
 *
 * Use this skill to convert markdown to PDF.
 * `);
 *
 * console.log(parsed.frontmatter.name); // 'pdf-generation'
 * console.log(parsed.body); // Markdown 主体
 * ```
 */
export function parseSkillMd(content: string): ParsedSkillMd {
  // 1. 校验非空
  if (!content || typeof content !== 'string') {
    throw new SkillMdParseError(
      'SKILL.md content cannot be empty',
      'EMPTY_CONTENT',
    );
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new SkillMdParseError(
      'SKILL.md content cannot be empty',
      'EMPTY_CONTENT',
    );
  }

  // 2. 提取 frontmatter
  let parsedMatter: matter.GrayMatterFile<string>;
  try {
    parsedMatter = matter(trimmed);
  } catch (error) {
    throw new SkillMdParseError(
      'Failed to parse YAML frontmatter',
      'INVALID_FRONTMATTER',
      error,
    );
  }

  const fmData = parsedMatter.data;

  // 3. 校验必需字段存在
  if (!fmData || typeof fmData !== 'object') {
    throw new SkillMdParseError(
      'SKILL.md must contain a YAML frontmatter block',
      'MISSING_FRONTMATTER',
    );
  }

  if (!('name' in fmData) || !fmData.name) {
    throw new SkillMdParseError(
      'frontmatter.name is required',
      'INVALID_NAME',
    );
  }

  if (!('description' in fmData) || !fmData.description) {
    throw new SkillMdParseError(
      'frontmatter.description is required',
      'INVALID_DESCRIPTION',
    );
  }

  // 4. 使用 Zod Schema 校验
  const validationResult = SkillFrontmatterSchema.safeParse(fmData);
  if (!validationResult.success) {
    const firstIssue = validationResult.error.issues[0];
    const code = firstIssue?.path[0] === 'name' ? 'INVALID_NAME' : 'INVALID_DESCRIPTION';
    throw new SkillMdParseError(
      firstIssue?.message ?? 'frontmatter validation failed',
      code,
      validationResult.error.issues,
    );
  }

  // 5. 提取额外字段
  const { name, description, ...extraFields } = validationResult.data;

  // 6. 提取关键词
  const keywords = extractKeywords(description as string);

  // 7. 提取第一行标题
  const title = extractTitle(parsedMatter.content);

  return {
    raw: content,
    frontmatter: validationResult.data,
    extraFields,
    body: parsedMatter.content.trim(),
    keywords,
    agentSkillsVersion: AGENT_SKILLS_VERSION,
    title,
  };
}

/**
 * 从 description 提取关键词（用于渐进式披露）
 */
function extractKeywords(description: string): string[] {
  // 同时处理中英文：按非字母数字字符切分，中文按字符切分
  const tokens: string[] = [];

  // 提取英文/数字词
  const englishWords = description.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  tokens.push(...englishWords);

  // 提取中文（每 2-4 字作为一个 token）
  const chineseSegments = description.match(/[\u4e00-\u9fa5]{2,4}/g) ?? [];
  tokens.push(...chineseSegments);

  // 去停用词、去重
  const unique = Array.from(new Set(tokens))
    .filter((w) => !STOP_WORDS.has(w))
    .filter((w) => w.length >= 2);

  return unique.slice(0, 10);
}

/**
 * 提取 Markdown 第一行标题（H1）
 */
function extractTitle(body: string): string | null {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
    // 跳过空行
    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      return null;
    }
  }
  return null;
}

/**
 * 仅校验 frontmatter 是否合法（不返回完整解析结果）
 *
 * 用于上传时的快速校验
 */
export function validateSkillMd(content: string): {
  valid: boolean;
  errors: string[];
  frontmatter?: SkillFrontmatter;
} {
  try {
    const parsed = parseSkillMd(content);
    return {
      valid: true,
      errors: [],
      frontmatter: parsed.frontmatter,
    };
  } catch (error) {
    if (error instanceof SkillMdParseError) {
      return {
        valid: false,
        errors: [error.message],
      };
    }
    return {
      valid: false,
      errors: [(error as Error).message ?? 'Unknown error'],
    };
  }
}

/**
 * 生成符合标准的 SKILL.md 内容（用于导出）
 */
export function generateSkillMd(
  frontmatter: SkillFrontmatter,
  body: string,
): string {
  // 按 Agent Skills 标准格式生成：frontmatter + body
  const yamlFrontmatter = `name: ${frontmatter.name}\ndescription: ${frontmatter.description}`;
  return `---\n${yamlFrontmatter}\n---\n\n${body}\n`;
}