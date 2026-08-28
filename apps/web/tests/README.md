# Playwright E2E 测试

> **最后更新**: 2026-08-24
> **维护者**: SkillHub Team

## 📋 目录结构

```
apps/web/tests/
├── password-login.spec.ts       # 密码登录功能测试（基础 UI 测试）
├── install-button.spec.ts       # InstallButton 降级链路测试（M2）
├── tsconfig.json                # Playwright TypeScript 配置
└── README.md                    # 本文档
```

## 🚀 快速开始

### ⚡ 一键跑测试（自动启 dev server）

从 `apps/web` 目录直接跑——**不需要**手动启 dev server，Playwright `webServer` 配置会自动：

```bash
cd apps/web
pnpm exec playwright test
```

第一次跑会触发 `pnpm dev`（约 30-60 秒冷启动）；之后 `reuseExistingServer: true` 会复用本地已起的服务。

### 🎯 跑指定测试文件

```bash
pnpm exec playwright test install-button.spec.ts
pnpm exec playwright test password-login.spec.ts
```

### 🖱️ UI 模式（推荐用于开发）

```bash
pnpm exec playwright test --ui
```

可视化跑测、可设断点、看截图视频。

### 👀 Headed 模式（看浏览器跑）

```bash
pnpm exec playwright test --headed
```

### 📊 查看 HTML 报告

```bash
pnpm exec playwright show-report
```

默认起 `http://localhost:9323`。

---

## ⚙️ 配置说明（`playwright.config.ts`）

### webServer 自动启停（v2.0 关键变更）

```ts
webServer: {
  command: 'pnpm dev',
  cwd: __dirname,                // apps/web 目录
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,  // 本地复用，CI 拉新进程
  timeout: 180_000,              // Next 15 dev 冷启动慢，180s 兜底
  stdout: 'pipe',
  stderr: 'pipe',
},
```

### 为什么需要这个配置？

**问题场景（v1. 已被注释）**：

之前 `webServer` 段被注释掉了，导致：
- 跑测试时 `localhost:3000` 无进程监听
- 12 个 E2E 用例（`install-button.spec.ts`）全部 `ECONNREFUSED ::1:3000`
- HTTP 层根本到不了 → 即使路由正确、数据库正确，也全部失败

**修复后（v2.0）**：
- Playwright 自动 `pnpm dev` 起 Next dev server
- 等待 `http://localhost:3000` 可访问再跑测试
- CI 环境会拉新进程；本地若已有 dev server 则直接复用

### 其他关键配置

```ts
{
  testDir: './tests',
  testMatch: '**/*.spec.{ts,tsx,js,jsx}',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: 'F:\\chrome-win64\\chrome.exe' },
      },
    },
  ],
}
```

---

## 🔧 故障排查

### 0. v2.2 新增：`Test timeout of 30000ms exceeded`（API 不响应）

**症状**：所有 API测试用例 fail，错误是 `Test timeout of 30000ms exceeded.`，但**没有 ECONNREFUSED**——dev server 实际启动了（因为 public `/skillhub.png` 测试能过）。

**根因**：Next 15 dev 首次访问某个 Route Handler / Page 时要 webpack/turbopack 编译，单次编译可耗时 30+ 秒。20 个 worker 同时抢首次编译 → 全部 30s timeout。

**修复（v2.2 已落地，v2.3 修正 globalSetup export 签名）**：
1. `playwright.config.ts` 关闭 `fullyParallel`，`workers: 1`（避免抢首编）
2. 加 `globalSetup` → `scripts/warmup-dev-server.mjs`：所有 worker 启动前按顺序预热 9 个 API/页面（让首次编译在 dev 启动阶段完成）
3. 单 test timeout 从 30s 提到 60s（确保单个编译窗口够）
4. `actionTimeout: 30_000` + `navigationTimeout: 60_000`

**手动验证**：

```bash
# 1. 起 dev
pnpm dev &
# 2. 等启动完，单跑一个 API
curl -m 5 http://localhost:3000/api/v2/healthcheck
# 期望: {"status":"ok",...}

# 3. 跑预热脚本看每个 API 的首次编译耗时
pnpm run test:e2e:warmup
# 期望: 第一遍慢（10-30s/路由），第二遍快（<100ms）
```

**如果单跑还是 timeout**：dev server 本身有问题（比如 instrumentation 卡住、或中间件 matcher 配错），看 [§故障排查 §1](#1-econnrefused-13000-或-econnrefused-1270013000) 和 §2 检查。

### 1. `ECONNREFUSED ::1:3000` 或 `ECONNREFUSED 127.0.0.1:3000`

**症状**：所有测试用例 fail，错误是 `connect ECONNREFUSED`。

**根因**：Playwright webServer 没自动起 / dev server 没起来。

**排查步骤**：

```bash
# 1. 单独启 dev server 看是否能起
cd apps/web
pnpm dev
# 期望输出: "Ready in Xms" 或 "started server on http://localhost:3000"

# 2. 手动 curl 一下
curl http://localhost:3000
# 期望: HTML 响应

# 3. 如果上面 OK，再跑测试
pnpm exec playwright test install-button.spec.ts
```

**常见原因**：
- **端口冲突**：另一个进程占了 3000 → `lsof -i :3000` / `netstat -ano | findstr :3000` 查谁占用
- **IPv6 问题**：Node 把 `localhost` 解析为 `::1` 而 dev server 只 listen v4 → `playwright.config.ts` 的 `webServer.url` 用 `127.0.0.1:3000` 替代
- **首次冷启动超时**：Next 15 dev 启动慢，把 `webServer.timeout` 加大到 180000（已经设了）

### 2. 测试本地能跑，CI 跑失败

**症状**：本地 `pnpm exec playwright test` 全绿，GitHub Actions 跑失败。

**可能原因**：
- CI 没装 Playwright 浏览器：`npx playwright install --with-deps`
- CI 没启 webServer：检查 `webServer.reuseExistingServer: !process.env.CI`（`process.env.CI=true` 时强制起新进程）
- CI 端口被墙：默认 3000 一般 OK，特殊情况用 `webServer.port` 改

### 3. IPv6/IPv4 解析问题

**症状**：`connect ECONNREFUSED ::1:3000`（IPv6）

**修复**：在 `playwright.config.ts` 把 `baseURL` 和 `webServer.url` 都改成 `http://127.0.0.1:3000`：

```ts
use: { baseURL: 'http://127.0.0.1:3000' },
webServer: { url: 'http://127.0.0.1:3000', ... },
```

### 4. 单个测试慢 / 超时

```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000);  // 单测超时设 60 秒
  // ...
});
```

或全局：

```ts
export default defineConfig({ timeout: 60000, ... });
```

---

## ✍️ 编写测试

### 基本结构

```typescript
import { test, expect } from '@playwright/test';

test.describe('功能模块测试', () => {
  test('应该能够执行某个操作', async ({ page }) => {
    await page.goto('/some-page');
    await page.click('#button');
    await expect(page.locator('.success')).toBeVisible();
  });
});
```

### 常用 API

#### 导航
```typescript
await page.goto('/login');
await page.waitForLoadState('networkidle');
```

#### 元素操作
```typescript
await page.click('button[type="submit"]');
await page.fill('input[email]', 'test@example.com');
await page.selectOption('select#role', 'admin');
```

#### 断言
```typescript
await expect(page.locator('.error')).toBeVisible();
await expect(page.locator('h1')).toContainText('Welcome');
expect(page.url()).toContain('/dashboard');
await expect(page.locator('.item')).toHaveCount(5);
```

#### API 直接调用（`page.request`）
```typescript
// 不走浏览器 UI，直接打 HTTP（适合后端路由契约测试）
const res = await page.request.post('/api/v2/intent/parse', {
  data: { query: '帮我修图' },
});
expect(res.ok()).toBeTruthy();
const data = await res.json();
```

这是 `install-button.spec.ts` 的主要模式（12 个用例都是 API 契约测试）。

### 调试技巧

#### 1. `--debug` 标志
```bash
pnpm exec playwright test --debug
```
打开浏览器开发者工具，每个步骤前暂停。

#### 2. 截图
```typescript
await page.screenshot({ path: 'screenshot.png' });
```

#### 3. Trace
`playwright.config.ts` 已开 `trace: 'on-first-retry'`。
```bash
pnpm exec playwright show-trace trace.zip
```

#### 4. 控制台日志
```typescript
page.on('console', msg => console.log(msg.text()));
```

---

## 🚀 CI/CD 集成

### GitHub Actions 示例

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps
      
      - name: Setup database
        run: |
          pnpm --filter @skillhub/web run db:push
          pnpm --filter @skillhub/web run seed:v3
      
      - name: Run tests
        run: pnpm exec playwright test
        # webServer 自动启 pnpm dev，无需手动起服务
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: apps/web/playwright-report/
```

---

## 📝 最佳实践

1. **优先用 `page.request` 做 API 契约测试**（不需要浏览器 UI 启动开销）
2. **用相对 URL**：`/login` 而不是 `http://localhost:3000/login`
3. **避免 `waitForTimeout`**：用 `waitForSelector` 或 `waitForLoadState`
4. **每个测试独立**：不依赖其他测试的副作用
5. **清理测试数据**：测试后清理创建的数据（用 `test.afterEach`）
6. **有意义的测试名称**：清楚描述测试目的
7. **充分利用 `reuseExistingServer`**：本地调试时手动 `pnpm dev`，E2E 跑得快

---

## 📊 与 Cypress 的分工

| 工具 | 目录 | 用途 |
|---|---|---|
| **Playwright** | `apps/web/tests/` | 跨浏览器、API 契约测试、SVG/截图 |
| **Cypress** | `apps/web/cypress/e2e/` | 完整 UI 流测试 |

两个工具并行使用，按场景选：

- **快 API 测试** → Playwright
- **跨浏览器兼容性** → Playwright
- **完整 UI 流程** → Cypress（更直观）

---

## 📚 资源

- [Playwright 官方文档](https://playwright.dev/)
- [Playwright API 参考](https://playwright.dev/docs/api/class-playwright)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
- [调试指南](https://playwright.dev/docs/debug)

---

## 🆘 需要帮忙？

如果遇到问题：

1. 先看本文档的"故障排查"小节
2. 跑 `pnpm exec playwright test --list` 看 config 是否能加载
3. 手动 `pnpm dev` 看 dev server 能否启动
4. 看 `playwright-report/` 的 HTML 报告（`pnpm exec playwright show-report`）
5. 还不行就开 issue 附上报告截图 + `playwright.config.ts`