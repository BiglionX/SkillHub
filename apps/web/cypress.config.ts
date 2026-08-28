import { defineConfig } from 'cypress';

/**
 * Cypress 配置
 *
 * v2.1 改造（2026-08-24）：e2e 加 devServer 自动启停
 * 原因：之前 e2e 配置缺 devServer，所有 e2e 测试都假设 dev server 已起，
 *      实际 CI/新人跑测时会全 ECONNREFUSED。
 *      修复方式参考 Playwright webServer 配置。
 *
 * 端口：可通过 CYPRESS_PORT 环境变量覆盖默认 3000
 *       例：CYPRESS_PORT=4321 pnpm --filter @skillhub/web run test:cypress
 */
const cypressPort = process.env.CYPRESS_PORT
  ? parseInt(process.env.CYPRESS_PORT, 10)
  : 3000;

export default defineConfig({
  e2e: {
    baseUrl: `http://localhost:${cypressPort}`,
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',

    // v2.1：自动起 dev server（修复之前缺 devServer 的问题）
    devServer: {
      command: cypressPort === 3000 ? 'pnpm dev' : `pnpm dev -- --port ${cypressPort}`,
      url: `http://localhost:${cypressPort}/api/v2/healthcheck`,
      // healthcheck: Cypress 1.x 没有专用字段，复用 url 做就绪探测
      timeout: 180_000, // Next 15 dev 冷启动慢
      reuseExistingServer: !process.env.CI,
      // 启动日志让 CI 可看
      stdout: 'pipe',
      stderr: 'pipe',
    },

    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    // 超时配置 - 开发环境需要更长的超时时间
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    // 内存优化配置
    experimentalMemoryManagement: true,
    numTestsKeptInMemory: 0,
    retries: {
      runMode: 2,
      openMode: 0,
    },
  },

  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack',
    },
  },
});