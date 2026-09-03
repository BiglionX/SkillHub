import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */

// 端口自适应：env PLAYWRIGHT_PORT 覆盖默认 3000
//   例：PLAYWRIGHT_PORT=4321 pnpm exec playwright test
//   PLAYWRIGHT_PORT=0 用空闲端口（注：Playwright 1.62 对 port:0 支持不完整，
//                                  仅推荐用具体端口号避免冲突）
const customPort = process.env.PLAYWRIGHT_PORT;
const e2ePort = customPort ? parseInt(customPort, 10) : 3000;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.{ts,tsx,js,jsx}',

  /**
   * v2.2 全局预热：跑所有 worker 启动前先预热 Next dev server
   * 目的：解决 Next 15 dev 首次 SSR 编译耗时 30+ 秒导致 20 worker 抢编译全 timeout 的问题
   * 文件：scripts/warmup-dev-server.mjs
   */
  globalSetup: require.resolve('./scripts/warmup-dev-server.mjs'),

  /* Run tests in files in parallel */
  fullyParallel: false,  // v2.2 关闭全并行：Next dev 首次 SSR 编译卡 30s，
                          // 20 个 worker 同时抢首次编译会全 timeout。
                          // 改为顺序跑避免抢。

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* CI 强制单 worker（避免抢首次编译）；本地可多 worker */
  workers: process.env.CI ? 1 : 1,  // v2.2 统一为 1（Next dev 首次编译代价高）

  /* v2.2 全局 timeout：单个 test 最多 60s（原 30s 不足以覆盖 Next dev 首次编译） */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${e2ePort}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* v2.2 单次 request 超时：避免 dev 首次编译时永久挂起 */
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: 'F:\\chrome-win64\\chrome.exe',
        },
      },
    },
    // 其它浏览器配置已注释（与 v2.0 一致）
  ],

  /* Run your local dev server before starting the tests
   * v2.0 改造（2026-08-24）：恢复 webServer 自动启停
   *   之前 12 个 E2E 用例全部 ECONNREFUSED ::1:3000，因为 webServer 被注释。
   * v2.1 改造（2026-08-24）：
   *   - 加 healthcheck 探针（区分 dev 模式"首屏 200 但 API 还没编译完"假阳性）
   *   - 端口可通过 env PLAYWRIGHT_PORT 覆盖
   *   - baseURL 跟着端口动态变化（不再写死 3000）
   */
  // v2.0.7+：Playwright 1.62 不暴露 healthcheck 字段，但运行时支持（早期版本字段）；移除该字段避免 strict 类型错误。
  webServer: {
    command: customPort ? `pnpm dev -- --port ${e2ePort}` : 'pnpm dev',
    cwd: __dirname,
    // Playwright 1.62: webServer.port 和 url 是互斥的（提供 port 则 Playwright 用 http://localhost:port，
    // 否则用 url）。我们用 url 走 healthcheck 探针更可靠。
    url: `http://localhost:${e2ePort}/api/v2/healthcheck`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
  },
});