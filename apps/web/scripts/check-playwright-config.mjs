#!/usr/bin/env node
/**
 * Playwright config 静态检查
 *
 * 检查项：
 *   1. webServer 段必须存在且启用
 *   2. webServer.command 不能是注释的默认值
 *   3. webServer.url 必须指向 localhost / 127.0.0.1
 *   4. webServer.timeout 至少 60 秒（应对冷启动）
 *   5. baseURL 必须和 webServer.url 一致
 *   6. reuseExistingServer 必须配置（否则本地调试会起第二个 dev server）
 *
 * 用法：
 *   pnpm --filter @skillhub/web run test:e2e:check
 *   或加到 CI 在跑测试前检查
 *
 * 退出码：
 *   0 - 通过
 *   1 - 失败（错误消息会输出）
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '..', 'playwright.config.ts');

if (!existsSync(configPath)) {
  console.error(`❌ 找不到 ${configPath}`);
  process.exit(1);
}

const source = readFileSync(configPath, 'utf-8');
let failed = false;

function fail(msg) {
  console.error(`❌ ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`✅ ${msg}`);
}

/**
 * 提取 webServer 段的 body 内容（兼容普通对象和 IIFE 两种写法）
 */
function extractWebServerBody(src) {
  // 写法 A: webServer: { ... }
  const objMatch = src.match(/webServer:\s*\{([\s\S]*?)\n\s*\}\s*,?\s*\n?\s*\}/);
  if (objMatch) return objMatch[1];

  // 写法 B: webServer: (() => { ... })()
  const iifeMatch = src.match(/webServer:\s*\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)\(\)/);
  if (iifeMatch) return iifeMatch[1];

  return null;
}

/**
 * 从 body 中提取字段值
 *  支持字符串 / 模板字符串 / 三元表达式 / new URL(...)
 */
function extractField(body, fieldName) {
  // 1. 普通字符串 '...' 或 "..."
  const singleQuote = body.match(new RegExp(`${fieldName}:\\s*'([^']*)'`));
  if (singleQuote) return singleQuote[1];

  const doubleQuote = body.match(new RegExp(`${fieldName}:\\s*"([^"]*)"`));
  if (doubleQuote) return doubleQuote[1];

  // 2. 模板字符串 `...`
  const tpl = body.match(new RegExp(`${fieldName}:\\s*\`([^\`]+)\``));
  if (tpl) return tpl[1];

  // 3. new URL(`...`, baseURL)
  const urlObj = body.match(
    new RegExp(`${fieldName}:\\s*new\\s+URL\\(\\s*\`([^\`]+)\`\\s*,\\s*\`([^\`]+)\`\\s*\\)`)
  );
  if (urlObj) {
    // 把 baseURL + path 拼成完整 URL
    const base = urlObj[2].replace(/\$\{[^}]+\}/g, 'X');
    const path = urlObj[1];
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
  }

  // 4. 三元表达式（fallback）
  const ternary = body.match(new RegExp(`${fieldName}:\\s*([^,\\n}]+)`));
  if (ternary) return ternary[1].trim();

  return null;
}

// ===== 主检查流程 =====

const body = extractWebServerBody(source);
if (!body) {
  fail('webServer 段缺失或被注释。E2E 测试无法起 dev server 会全部 ECONNREFUSED');
  console.error('   （v2.0 之前正是因为这个原因导致 12 个用例全挂）');
} else {
  ok('webServer 段存在');

  // 1. command 必须有实际命令
  const commandValue = extractField(body, 'command');
  if (!commandValue || !commandValue.trim()) {
    fail('webServer.command 为空或被注释');
  } else {
    // 如果是三元表达式（如 customPort ? 'x' : 'y'），提取真实值
    let cmd = commandValue;
    const ternaryMatch = commandValue.match(/\?\s*['"`]([^'"`]+)['"`]\s*:\s*['"`]([^'"`]+)['"`]/);
    if (ternaryMatch) {
      // 取较短的那个作为示例（实际运行按 env 决定）
      cmd = `${ternaryMatch[1]} | ${ternaryMatch[2]}`;
    }
    ok(`webServer.command: ${cmd}`);
    if (!/pnpm|npm|yarn|next/i.test(commandValue)) {
      fail(`webServer.command 不是包管理器命令: ${commandValue}`);
    }
  }

  // 2. url 必须指向本地（兼容模板字符串）
  const urlTemplate = extractField(body, 'url');
  if (!urlTemplate) {
    fail('webServer.url 缺失');
  } else {
    // 把 ${var} 替换为占位符后检查
    const normalized = urlTemplate.replace(/\$\{[^}]+\}/g, 'X');
    if (!/localhost|127\.0\.0\.1|\[::1\]/.test(normalized)) {
      fail(`webServer.url 不是本地地址: ${urlTemplate}`);
    } else {
      ok(`webServer.url: ${urlTemplate}`);
    }

    // 3. baseURL 与 webServer.url 主机部分一致
    const baseUrlMatch = source.match(/baseURL:\s*['"`]([^'"`]+)['"`]/);
    if (!baseUrlMatch) {
      fail('baseURL 缺失');
    } else {
      const baseUrl = baseUrlMatch[1];
      // 提取主机段（scheme://host）
      const baseHost = baseUrl.replace(/\/.*$/, '');
      // url 可能是 template literal，去掉路径部分
      const urlHost = urlTemplate
        .split('/')
        .slice(0, 3)
        .join('/')
        .replace(/\$\{[^}]+\}/g, 'X');

      // baseURL 主机必须 == url 主机前缀（容忍模板里的变量）
      if (!urlHost.startsWith(baseHost)) {
        fail(`baseURL (${baseUrl}) 与 webServer.url (${urlTemplate}) 主机不一致`);
      } else {
        ok(`baseURL (${baseUrl}) 与 webServer.url 主机一致`);
      }
    }
  }

  // 4. timeout 检查（支持 180_000 这种带下划线的数字字面量）
  const timeoutMatch = body.match(/timeout:\s*([\d_]+)/);
  if (!timeoutMatch) {
    fail('webServer.timeout 缺失');
  } else {
    const ms = parseInt(timeoutMatch[1].replace(/_/g, ''), 10);
    if (ms < 60_000) {
      fail(`webServer.timeout (${ms}ms) 太短，建议≥ 60_000（Next dev 冷启动慢）`);
    } else {
      ok(`webServer.timeout: ${ms}ms (${Math.round(ms / 1000)}s)`);
    }
  }

  // 5. reuseExistingServer 检查
  const reuseMatch = body.match(/reuseExistingServer:\s*([^,\n}]+)/);
  if (reuseMatch) {
    ok(`webServer.reuseExistingServer: ${reuseMatch[1].trim()}`);
  } else {
    fail('webServer.reuseExistingServer 缺失，本地调试会起第二个 dev server');
  }

  // 6. healthcheck 检查（M2 v2.1 引入）
  const healthcheckMatch = body.match(/healthcheck:\s*['"`]([^'"`]+)['"`]/);
  if (healthcheckMatch) {
    ok(`webServer.healthcheck: ${healthcheckMatch[1]}`);
  } else {
    console.warn(`⚠️ webServer.healthcheck 缺失（推荐配 /api/v2/healthcheck，避免 Next dev 假阳性）`);
  }
}

// 额外检查：playwright test 应该可解析（沙箱可能拒子进程，所以是软警告）
console.log('\n📋 Playwright 版本检查（沙箱受限可跳过）：');
try {
  const { execSync } = await import('node:child_process');
  const version = execSync('pnpm exec playwright --version', {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 5000,
  }).trim();
  ok(`Playwright ${version}`);
} catch (err) {
  console.warn(`⚠️ 无法解析 playwright 版本（沙箱可能拒子进程）: ${err.message?.split('\n')[0]}`);
  console.warn(`   这一步失败不影响 config 静态检查本身`);
}

if (failed) {
  console.error('\n❌ playwright.config.ts 检查未通过，请修复后再跑 E2E 测试');
  process.exit(1);
}
console.log('\n✅ playwright.config.ts 检查通过');