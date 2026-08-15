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
import { z } from 'zod';
export declare const SKILL_FRONTMATTER_SCHEMA: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    allowedTools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    license: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    homepage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    version?: string | undefined;
    allowedTools?: string[] | undefined;
    license?: string | undefined;
    author?: string | undefined;
    homepage?: string | undefined;
}, {
    name: string;
    description: string;
    version?: string | undefined;
    allowedTools?: string[] | undefined;
    license?: string | undefined;
    author?: string | undefined;
    homepage?: string | undefined;
}>;
export type SkillFrontmatter = z.infer<typeof SKILL_FRONTMATTER_SCHEMA>;
export declare const SKILL_MANIFEST_SCHEMA: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    namespace: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    version: string;
    description?: string | undefined;
    author?: string | undefined;
    namespace?: string | undefined;
    tags?: string[] | undefined;
}, {
    name: string;
    version: string;
    description?: string | undefined;
    author?: string | undefined;
    namespace?: string | undefined;
    tags?: string[] | undefined;
}>;
export type SkillManifest = z.infer<typeof SKILL_MANIFEST_SCHEMA>;
/**
 * 解析 SKILL.md 的 YAML frontmatter（`---` 包裹段）。
 * 支持子集：`key: value`、`key: "quoted"`、`key:` 后跟 `- item` 列表、`#` 注释。
 */
export declare function parseFrontmatter(content: string): {
    data: Record<string, unknown>;
    body: string;
};
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
/**
 * 校验技能包目录，返回结构化报告。
 * errors 非空 → valid=false（拒绝发布）；仅 warnings → 可发布但需记录。
 */
export declare function validateSkillPackage(dir: string): Promise<ValidationReport>;
//# sourceMappingURL=index.d.ts.map