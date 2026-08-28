#!/usr/bin/env node
/**
 * Dev Server 预热脚本
 *
 * 背景（v2.2 修复）：
 *   Next 15 dev 首次访问 Route Handler / 页面时要 webpack/turbopack 编译，
 *   单次编译可能耗时 30+ 秒。
 *   之前 Playwright 跑测时 20 个 worker 同时抢首次编译，全部 30s timeout。
 *
 * 解法：
 *   Playwright 提供 `globalSetup` 选项（在所有 worker 启动前执行一次），
 *   我们在 globalSetup 里把 9 个测试要打的 API 路由按顺序各 GET 一次，
 *   触发 Next dev 预编译。
 *
 * 注意：
 *   - 这是预热，不是测试断言：失败也要继续（dev 编译可能部分超时）
 *   - 最多等 30 秒/路由（用 AbortController）
 *   - 失败时 warn 提示，但 exit 0（让测试继续跑，hot cache 还有用）
 */
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.PLAYWRIGHT_PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

const WARMUP_ROUTES = [
  // API 路由（按 install-button.spec.ts + password-login.spec.ts 顺序）
  '/api/v2/healthcheck',
  '/api/v2/intent/parse',  // POST
  '/api/v2/helper/heartbeat',  // GET
  '/api/v2/software-tags',
  '/api/v2/install/jobs/nonexistent-job-id/cancel',
  '/api/v2/install/jobs/nonexistent-job-id/retry',
  // 页面路由（password-login 的 API 契约测试要 GET）
  '/login',
  '/',
  '/skillhub.png',
];

const TIMEOUT_MS = 30_000;

async function warmupOne(path, attempt = 1) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const start = Date.now();
  try {
    const method = path.includes('intent/parse') ? 'POST' : 'GET';
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: method === 'POST' ? JSON.stringify({ query: 'warmup' }) : undefined,
    });
    const ms = Date.now() - start;
    const status = res.status;
    console.log(`  [${attempt}] ${method.padEnd(4)} ${path.padEnd(60)} → ${status} (${ms}ms)`);
    return { path, status, ms, ok: true };
  } catch (err) {
    const ms = Date.now() - start;
    const isTimeout = err.name === 'AbortError';
    console.log(
      `  [${attempt}] ${path.padEnd(60)} → ${isTimeout ? 'TIMEOUT' : 'ERROR'} (${ms}ms) ${err.message?.slice(0, 60)}`
    );
    // 重试 1 次（Next dev 第二次访问通常命中缓存）
    if (attempt === 1) {
      await sleep(2000);
      return warmupOne(path, 2);
    }
    return { path, status: 0, ms, ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`\n🔥 Warming up Next dev server at ${BASE}\n`);
  console.log('Routes to pre-compile:');
  for (const r of WARMUP_ROUTES) console.log(`  - ${r}`);
  console.log('');

  const results = [];
  for (const path of WARMUP_ROUTES) {
    const r = await warmupOne(path);
    results.push(r);
    // 间隔 500ms 让 Next 处理下一个编译
    await sleep(500);
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;

  console.log(`\n📊 Warmup summary: ${ok} ok, ${fail} failed`);
  if (fail > 0) {
    console.log('⚠️  Some routes timed out — Next dev may need longer cold start.');
    console.log('   Tests will still run; failures here just mean slower first hit.');
  }

  // 不 exit 1：warmup 失败不阻塞测试启动
  // （Playwright globalSetup 期望 default export 函数，不要 process.exit）
}

/**
 * Playwright globalSetup default export
 * 文档要求：必须 default export 一个函数，签名 () => Promise<void>
 * https://playwright.dev/docs/test-global-setup-teardown
 */
export default async function globalSetup() {
  try {
    await main();
  } catch (err) {
    console.error('Warmup script crashed (continuing):', err);
  }
  // 注意：不调用 process.exit()——Playwright 会管理这个脚本的生命周期
}

// 也保留 CLI 直接运行能力（pnpm run test:e2e:warmup）
// 通过检测 import.meta.url 判断是否是主入口
const isMain = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMain) {
  globalSetup();
}