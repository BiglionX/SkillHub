#!/usr/bin/env node
/**
 * Prisma client stale 检测 + 自动 generate
 *
 * 背景：
 *   pnpm 严格模式下，apps/web/prisma/schema.prisma 改动后，
 *   apps/web/node_modules/.prisma/client/ 里的 TS 类型可能不会自动同步，
 *   导致 `pnpm typecheck` 报「类型 PrismaClient 上不存在属性 xxx」（M4 经验，AGENTS.md §8.11）。
 *
 * 工作原理：
 *   1. 计算 apps/web/prisma/schema.prisma 的 SHA-256
 *   2. 与 apps/web/prisma/.schema-hash（stamp 文件，.gitignore 忽略）比较
 *   3. 不一致 → 调 `pnpm --filter @skillhub/web run db:generate` 重新生成
 *   4. 把当前哈希写回 stamp 文件
 *
 * 用法：
 *   node scripts/check-prisma-stale.mjs          # 默认：stale 时自动 generate
 *   node scripts/check-prisma-stale.mjs --check  # 只检测，stale 退出 1（适合 CI gate / pre-commit）
 *   node scripts/check-prisma-stale.mjs --force  # 强制重新 generate（无视 stamp）
 *
 * 退出码：
 *   0 = 客户端已是最新，或重新生成成功
 *   1 = stale 且处于 --check 模式
 *   2 = generate 子进程失败
 *   3 = schema 文件不存在
 *
 * 与 root prebuild 的关系：
 *   root package.json 的 "prebuild": "pnpm db:generate" 每次 build 都直接 generate，
 *   不查 stamp，简单粗暴可靠。本脚本是细粒度版本，适合：
 *     - 手动检测（开发改了 schema 还没跑 build，pnpm typecheck 也能立刻发现）
 *     - pre-commit hook（提交前确认 schema 和 client 一致）
 *     - CI dry-run（--check 模式作为门禁）
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const SCHEMA = join(ROOT, 'apps', 'web', 'prisma', 'schema.prisma');
const CLIENT_DIR = join(ROOT, 'apps', 'web', 'node_modules', '.prisma', 'client');
const CLIENT_DTS = join(CLIENT_DIR, 'index.d.ts');
const STAMP_FILE = join(ROOT, 'apps', 'web', 'prisma', '.schema-hash');

/** 计算文件 SHA-256（小写十六进制） */
function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** 读 stamp；不存在或读失败返回 null */
function readStamp() {
  if (!existsSync(STAMP_FILE)) return null;
  try {
    return readFileSync(STAMP_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

/** 写 stamp；失败仅警告，不阻断 */
function writeStamp(hash) {
  try {
    writeFileSync(STAMP_FILE, `${hash}\n`, 'utf8');
  } catch (err) {
    console.warn(`[prisma-stale] WARN: stamp 写失败: ${err.message}`);
  }
}

/**
 * 检测客户端状态
 * @returns {{
 *   kind: 'fresh' | 'lazy-init' | 'stale' | 'error',
 *   reason?: string,
 *   current?: string,
 *   stored?: string,
 * }}
 *   fresh     - stamp 哈希 == schema 哈希
 *   lazy-init - client 已存在但 stamp 缺失（首次运行，写 stamp 即可）
 *   stale     - 真正需要 regenerate
 *   error     - schema 文件不存在
 */
function detect() {
  if (!existsSync(SCHEMA)) {
    return { kind: 'error', reason: `schema 不存在: ${relative(ROOT, SCHEMA)}` };
  }
  const current = sha256File(SCHEMA);
  const stored = readStamp();
  const clientExists = existsSync(CLIENT_DTS);

  if (!clientExists) {
    return { kind: 'stale', reason: '生成的客户端缺失（未跑过 db:generate）', current };
  }
  if (stored === null) {
    // 首次运行：client 已存在但 stamp 缺失，跳过 generate，仅写 stamp
    return { kind: 'lazy-init', current };
  }
  if (current !== stored) {
    return { kind: 'stale', reason: 'schema 已变更（哈希不匹配）', current, stored };
  }
  return { kind: 'fresh', current };
}

/** 调 pnpm db:generate；返回 true=成功 */
function runGenerate() {
  console.log('[prisma-stale] 运行: pnpm --filter @skillhub/web run db:generate');
  const res = spawnSync('pnpm', ['--filter', '@skillhub/web', 'run', 'db:generate'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return res.status === 0;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const force = args.includes('--force');

  const result = detect();
  const schemaRel = relative(ROOT, SCHEMA);
  const stampRel = relative(ROOT, STAMP_FILE);
  const clientRel = relative(ROOT, CLIENT_DTS);

  // 错误情况（schema 缺失）
  if (result.kind === 'error') {
    console.error(`[prisma-stale] ERR: ${result.reason}`);
    process.exit(3);
  }

  // fresh + 非 force → 直接成功
  if (result.kind === 'fresh' && !force) {
    console.log(`[prisma-stale] OK: ${schemaRel} 哈希与 ${stampRel} 一致`);
    console.log(`[prisma-stale]   stamp: ${result.current.slice(0, 12)}…`);
    process.exit(0);
  }

  // lazy-init（首次运行）：写 stamp 即可，不必重新 generate
  if (result.kind === 'lazy-init' && !force) {
    if (checkOnly) {
      console.log('[prisma-stale] OK (lazy-init): client 已存在，stamp 待初始化');
      console.log(`[prisma-stale]   run without --check to initialize`);
      process.exit(0);
    }
    console.log('[prisma-stale] 首次运行：client 已存在（pnpm postinstall 跑过 generate），仅写 stamp');
    writeStamp(result.current);
    console.log(`[prisma-stale]   stamp: ${result.current.slice(0, 12)}…`);
    process.exit(0);
  }

  // stale 报告 / force 说明
  if (result.kind === 'stale') {
    console.warn(`[prisma-stale] STALE: ${result.reason}`);
    if (result.current && result.stored) {
      console.warn(`[prisma-stale]   stored:  ${result.stored.slice(0, 12)}…`);
      console.warn(`[prisma-stale]   current: ${result.current.slice(0, 12)}…`);
    }
    console.warn(`[prisma-stale]   schema:  ${schemaRel}`);
    console.warn(`[prisma-stale]   client:  ${clientRel}`);
  } else if (force) {
    console.log('[prisma-stale] --force 模式，强制重新生成');
  }

  // --check 模式：仅报告，不修复
  if (checkOnly) {
    console.error('');
    console.error('Prisma 客户端是 stale 状态。可执行：');
    console.error('  pnpm db:generate                                       # 直接重生成');
    console.error('  node scripts/check-prisma-stale.mjs                   # 默认（auto-fix）');
    console.error('  node scripts/check-prisma-stale.mjs --force            # 强制重生成');
    process.exit(1);
  }

  // 默认 / --force：自动 generate
  const ok = runGenerate();
  if (!ok) {
    console.error('[prisma-stale] ERR: db:generate 子进程失败');
    process.exit(2);
  }

  // 写新 stamp
  const newHash = sha256File(SCHEMA);
  writeStamp(newHash);
  console.log(`[prisma-stale] 已重新生成 client，新 stamp: ${newHash.slice(0, 12)}…`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[prisma-stale] 未捕获错误:', err);
  process.exit(2);
});
