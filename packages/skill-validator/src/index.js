"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_MANIFEST_SCHEMA = exports.SKILL_FRONTMATTER_SCHEMA = void 0;
exports.parseFrontmatter = parseFrontmatter;
exports.validateSkillPackage = validateSkillPackage;
const promises_1 = require("fs/promises");
const path = __importStar(require("path"));
const zod_1 = require("zod");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
exports.SKILL_FRONTMATTER_SCHEMA = zod_1.z.object({
    name: zod_1.z.string().min(1, 'name 不能为空'),
    description: zod_1.z.string().min(1, 'description 不能为空'),
    version: zod_1.z.string().regex(/^\d+\.\d+\.\d+$/, 'version 需为语义化版本 x.y.z').optional(),
    allowedTools: zod_1.z.array(zod_1.z.string()).optional(),
    license: zod_1.z.string().optional(),
    author: zod_1.z.string().optional(),
    homepage: zod_1.z.string().url().optional(),
});
exports.SKILL_MANIFEST_SCHEMA = zod_1.z.object({
    name: zod_1.z.string().min(1, 'name 不能为空'),
    version: zod_1.z.string().regex(/^\d+\.\d+\.\d+$/, 'version 需为语义化版本 x.y.z'),
    description: zod_1.z.string().optional(),
    author: zod_1.z.string().optional(),
    namespace: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
});
// ---------------------------------------------------------------------------
// 轻量 frontmatter 解析器
// ---------------------------------------------------------------------------
function unquote(v) {
    const t = v.trim();
    if ((t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1).replace(/\\(["'\\])/g, '$1');
    }
    return t;
}
/**
 * 解析 SKILL.md 的 YAML frontmatter（`---` 包裹段）。
 * 支持子集：`key: value`、`key: "quoted"`、`key:` 后跟 `- item` 列表、`#` 注释。
 */
function parseFrontmatter(content) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
    if (!match) {
        return { data: {}, body: content };
    }
    const raw = match[1];
    const data = {};
    let currentKey = null;
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const listMatch = /^-\s+(.*)$/.exec(trimmed);
        if (listMatch && currentKey) {
            const arr = Array.isArray(data[currentKey])
                ? data[currentKey]
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
// 核心校验
// ---------------------------------------------------------------------------
const RESOURCE_REF_RE = /(?:scripts|assets)\/[\w@./-]+/g;
const FORBIDDEN_DIRS = new Set(['node_modules', '.git']);
/**
 * 校验技能包目录，返回结构化报告。
 * errors 非空 → valid=false（拒绝发布）；仅 warnings → 可发布但需记录。
 */
async function validateSkillPackage(dir) {
    const checks = [];
    const errors = [];
    const warnings = [];
    // 1. 目录存在
    try {
        await (0, promises_1.stat)(dir);
    }
    catch {
        checks.push({ name: '目录', status: 'fail', detail: `路径不存在: ${dir}` });
        return { valid: false, skillName: undefined, version: undefined, checks, errors: [`路径不存在: ${dir}`], warnings };
    }
    // 2. SKILL.md 存在
    const skillMdPath = path.join(dir, 'SKILL.md');
    try {
        await (0, promises_1.stat)(skillMdPath);
        checks.push({ name: 'SKILL.md', status: 'pass' });
    }
    catch {
        checks.push({ name: 'SKILL.md', status: 'fail', detail: '缺失 SKILL.md' });
        errors.push('缺失 SKILL.md');
        return { valid: false, skillName: undefined, version: undefined, checks, errors, warnings };
    }
    // 3. 目录污染检查
    const entries = await (0, promises_1.readdir)(dir);
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
    const content = await (0, promises_1.readFile)(skillMdPath, 'utf-8');
    const { data, body } = parseFrontmatter(content);
    // Agent Skills 标准用 kebab-case `allowed-tools`，归一化为 camelCase
    const normalized = { ...data };
    if (Array.isArray(normalized['allowed-tools']) &&
        normalized['allowedTools'] === undefined) {
        normalized['allowedTools'] = normalized['allowed-tools'];
    }
    const fmResult = exports.SKILL_FRONTMATTER_SCHEMA.safeParse(normalized);
    if (fmResult.success) {
        checks.push({ name: 'frontmatter', status: 'pass' });
    }
    else {
        const fmErrors = fmResult.error.issues.map((issue) => `frontmatter.${issue.path.join('.')}: ${issue.message}`);
        errors.push(...fmErrors);
        checks.push({ name: 'frontmatter', status: 'fail', detail: fmErrors.join('; ') });
    }
    const frontmatter = fmResult.success ? fmResult.data : undefined;
    // 正文非空检查
    if (!body.trim()) {
        warnings.push('SKILL.md 正文为空（只有 frontmatter）');
    }
    // 5. manifest
    let manifest;
    const manifestPath = path.join(dir, 'skill.json');
    const pkgPath = path.join(dir, 'package.json');
    try {
        await (0, promises_1.stat)(manifestPath);
    }
    catch {
        try {
            await (0, promises_1.stat)(pkgPath);
        }
        catch {
            checks.push({ name: 'manifest', status: 'warn', detail: '无 skill.json / package.json' });
            warnings.push('无 skill.json / package.json');
        }
    }
    if (!checks.some((c) => c.name === 'manifest')) {
        const manifestFile = (await (0, promises_1.stat)(manifestPath).then(() => manifestPath).catch(() => pkgPath));
        try {
            const raw = await (0, promises_1.readFile)(manifestFile, 'utf-8');
            const parsed = JSON.parse(raw);
            const mResult = exports.SKILL_MANIFEST_SCHEMA.safeParse(parsed);
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
            }
            else {
                const mErrors = mResult.error.issues.map((issue) => `manifest.${issue.path.join('.')}: ${issue.message}`);
                errors.push(...mErrors);
                checks.push({ name: 'manifest', status: 'fail', detail: mErrors.join('; ') });
            }
        }
        catch {
            errors.push('manifest 不是合法 JSON');
            checks.push({ name: 'manifest', status: 'fail', detail: '不是合法 JSON' });
        }
    }
    // 6. 资源引用检查
    const refs = new Set();
    for (const m of [content, body].filter(Boolean)) {
        for (const ref of m.match(RESOURCE_REF_RE) ?? []) {
            refs.add(ref);
        }
    }
    let missingRefs = 0;
    for (const ref of refs) {
        const refPath = path.join(dir, ref);
        try {
            await (0, promises_1.stat)(refPath);
        }
        catch {
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
//# sourceMappingURL=index.js.map