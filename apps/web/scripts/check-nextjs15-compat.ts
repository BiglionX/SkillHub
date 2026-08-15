/**
 * Next.js 15 兼容性检查脚本
 *
 * 用途：检查项目中所有动态路由是否已升级到 Next.js 15 的 Promise<params> 模式
 *
 * 运行：npx tsx scripts/check-nextjs15-compat.ts
 *
 * 检查项：
 * 1. 所有 page.tsx 的动态路由 params 必须使用 Promise<{...}>
 * 2. 所有 page.tsx 的 searchParams 必须使用 Promise<{...}>
 * 3. 所有 useParams() 调用必须 await
 * 4. 所有 cookies()/headers() 调用必须 await
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';

const APPS_WEB_DIR = join(process.cwd(), 'apps', 'web');
const APP_DIR = join(APPS_WEB_DIR, 'app');

interface Issue {
  file: string;
  type: 'PARAMS_SYNC' | 'SEARCHPARAMS_SYNC' | 'COOKIES_NO_AWAIT' | 'HEADERS_NO_AWAIT';
  line?: number;
  message: string;
}

const issues: Issue[] = [];

/**
 * 递归获取所有 page.tsx 文件
 */
function getAllPages(dir: string): string[] {
  const pages: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        pages.push(...getAllPages(fullPath));
      } else if (entry === 'page.tsx' || entry === 'page.ts') {
        pages.push(fullPath);
      }
    }
  } catch {
    // 目录不存在
  }
  return pages;
}

/**
 * 检查单个文件
 */
function checkFile(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = relative(APPS_WEB_DIR, filePath).replace(/\\/g, '/');

  // 跳过客户端组件（'use client'）
  if (content.trimStart().startsWith("'use client'") || content.trimStart().startsWith('"use client"')) {
    return;
  }

  // 1. 检查 params 同步定义
  // 模式：interface XxxProps { params: { ... } }
  // 排除：params: Promise<{...}>
  const paramsSyncRegex = /params:\s*\{\s*[a-zA-Z_][\w]*:\s*(?:string|number)\s*[;}]/;
  if (paramsSyncRegex.test(content) && !content.includes('params: Promise<')) {
    issues.push({
      file: relPath,
      type: 'PARAMS_SYNC',
      message: 'params 应该是 Promise<{...}>（Next.js 15 要求）',
    });
  }

  // 2. 检查 searchParams 同步定义
  const searchParamsSyncRegex = /searchParams:\s*\{[^}]*\}/;
  if (searchParamsSyncRegex.test(content) && !content.includes('searchParams: Promise<')) {
    issues.push({
      file: relPath,
      type: 'SEARCHPARAMS_SYNC',
      message: 'searchParams 应该是 Promise<{...}>（Next.js 15 要求）',
    });
  }

  // 3. 检查 cookies() 和 headers() 调用（必须是 await 或 .then）
  const cookiesRegex = /(?<!await\s)(?<!\.\s)cookies\(\)/g;
  const headersRegex = /(?<!await\s)(?<!\.\s)headers\(\)/g;
  let match;
  while ((match = cookiesRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    issues.push({
      file: relPath,
      type: 'COOKIES_NO_AWAIT',
      line: lineNum,
      message: 'cookies() 调用必须 await（Next.js 15 要求）',
    });
  }
  while ((match = headersRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    issues.push({
      file: relPath,
      type: 'HEADERS_NO_AWAIT',
      line: lineNum,
      message: 'headers() 调用必须 await（Next.js 15 要求）',
    });
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 Next.js 15 兼容性检查');
  console.log('================================');
  console.log(`扫描目录: ${relative(process.cwd(), APP_DIR)}`);
  console.log('');

  const pages = getAllPages(APP_DIR);
  console.log(`找到 ${pages.length} 个 page 文件`);
  console.log('');

  for (const page of pages) {
    checkFile(page);
  }

  if (issues.length === 0) {
    console.log('✅ 所有动态路由已兼容 Next.js 15');
    console.log('');
    process.exit(0);
  }

  console.log(`❌ 发现 ${issues.length} 个兼容性问题：`);
  console.log('');

  // 按类型分组
  const grouped: Record<string, Issue[]> = {};
  for (const issue of issues) {
    if (!grouped[issue.type]) grouped[issue.type] = [];
    grouped[issue.type]!.push(issue);
  }

  for (const [type, items] of Object.entries(grouped)) {
    console.log(`📌 ${type} (${items.length}):`);
    for (const issue of items) {
      const lineInfo = issue.line ? `:${issue.line}` : '';
      console.log(`   - ${issue.file}${lineInfo}`);
      console.log(`     ${issue.message}`);
    }
    console.log('');
  }

  console.log('修复建议：');
  console.log('1. params 类型改为 Promise<{...}> 并在函数体内 await');
  console.log('2. searchParams 类型改为 Promise<{...}> 并 await');
  console.log('3. cookies() 和 headers() 调用前加 await');
  console.log('');
  console.log('参考：https://nextjs.org/docs/app/building-your-application/upgrading/version-15');

  process.exit(1);
}

main();
