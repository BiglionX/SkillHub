# Skill Hub — AI Agent 技能市场平台

> **"AI 时代的 npm / Docker Hub"** —— 技能开发者发布、管理、变现 AI 技能包（Agent Skills，`SKILL.md` 标准），用户浏览、搜索、安装、付费订阅。

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-green.svg)]()
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](apps/web)
[![React](https://img.shields.io/badge/React-19-61dafb)](apps/web)

---

## 📖 项目简介

Skill Hub 是 ProClaw 生态的 **AI 技能市场平台**，提供两种使用模式：

1. **自主管理平台（核心）**：用户创建命名空间、上传并管理技能包，支持审核、订阅与变现；
2. **全球搜索引擎（v2.0+）**：通过 GitHub API 爬取元数据，自动发现并索引全球数十万个 Skills。

平台全面兼容 [Agent Skills 标准](https://agent-skills.org)（`SKILL.md`），并提供技能包的**静态校验 → 运行时冒烟 → 质量评分**完整测试管线。

## ✨ 核心特性

- 🔍 **双模式**：自主管理平台 + 全球搜索引擎（智能爬虫每日更新）
- 📦 **Agent Skills 开放标准**：`SKILL.md` 解析器、资源扫描器、渐进式披露下载
- 🔌 **MCP Server / Client**：5 个工具（搜索 / 详情 / 安装 / 发布 / 列表），Streamable HTTP + OAuth 2.1 认证
- 🌐 **多语言 i18n**：简体中文 / English / 日本語 / 한국어（Cookie > Accept-Language 协商）
- 🤖 **A2A 协议**：Agent Card + Task 管理 API + `.well-known/agent.json` 发现端点
- ⭐ **Trust Score 信任评分**：0-100 分，4 维度权重（Stars / Downloads / Reviews / Activity）
- 🧪 **技能包测试管线**：`skill-validator`（静态校验）→ `skill-test-harness`（冒烟）→ `skill-eval`（qualityScore）
- 🖥️ **CLI 工具**：`skillhub publish / install / search / skill export / skill import`
- 🔐 **企业级安全**：CSP / HSTS 安全头、MCP 写操作 OAuth、A2A Bearer Token、审核与审计日志

## 🏗️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 15（App Router）、React 19、TypeScript（strict）、Tailwind CSS 4、shadcn 风格组件 |
| 后端 | Next.js API Routes、Prisma + PostgreSQL（Neon serverless）、Redis（Upstash） |
| 生态 | pnpm workspace + Turbo、Jest / Playwright / Cypress、Changesets |
| 部署 | Vercel（`vercel.json`）/ Docker（`Dockerfile.web` + `docker-compose.neon.yml`） |

## 📁 仓库结构

```
apps/
  web/        @skillhub/web    Next.js 15 主站：前台 / 后台 / API / 爬虫 / 审核
  cli/        @skillhub/cli    命令行工具：publish / install / search / import / export
packages/
  search-sdk/          @skillhub/search-sdk          搜索 SDK
  widget/              @skillhub/widget              嵌入式 React 组件
  skill-validator/     @skillhub/skill-validator     技能包静态校验（zod + frontmatter 解析）
  skill-test-harness/  @skillhub/skill-test-harness  冒烟测试沙箱
  skill-eval/          @skillhub/skill-eval          质量评分 qualityScore 0-100
  api-client/ ui/ utils/  空骨架（待实现）
skills/          仓库技能（Agent Skills 标准 SKILL.md）：repo-dev / skill-package-validator / skill-smoke-test / code-review
docs/            开发计划 / 架构 / 集成指南
deer-flow/       vendored 智能体编排框架（仅集成参考，不参与构建）
```

## 🚀 快速开始

```bash
# 1. 安装依赖（根目录）
pnpm install

# 2. 配置环境变量
cp apps/web/.env.example apps/web/.env.local   # 填入真实值

# 3. 初始化数据库
pnpm db:push        # 或 pnpm db:migrate

# 4. 启动开发服务器
pnpm dev            # http://localhost:3000
```

## 📋 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 web（next dev，:3000） |
| `pnpm build` | turbo 构建全部包 |
| `pnpm lint` / `pnpm lint:fix` | ESLint（flat config） |
| `pnpm typecheck` | 各包 `tsc --noEmit` |
| `pnpm test` | 单元测试 |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm ci` | 完整质量门禁：lint → typecheck → test → build |

单包命令：`pnpm --filter <包名> <script>`，例如 `pnpm --filter @skillhub/web run test`。

## 🧩 技能包测试管线

```bash
# 静态校验
npx skillhub-validate <dir>
# 运行时冒烟（隔离复制 + 任务执行 + 报告）
# 质量评分（写入 qualityScore）
```

对应仓库技能：`skills/skill-package-validator`、`skills/skill-smoke-test`。

## 🌐 部署

- **Vercel**：`apps/web/vercel.json`（pnpm workspace 命令 + 新加坡区域 + Cron），推送到 GitHub `master` 自动部署；
- **Docker**：`Dockerfile.web` + `docker-compose.neon.yml`（Neon PostgreSQL + Upstash Redis）。

环境变量模板：`apps/web/.env.example`、`.env.production.example`（生产）。

## 📚 文档

- `AGENTS.md` — 仓库入口文档（面向 AI 代理与人类开发者）
- `CHANGELOG.md` — 版本变更记录
- `docs/plans/SKILLHUB_DEVELOPMENT_PLAN_V2.md` — 开发计划
- `docs/features/DUAL_MODE_ARCHITECTURE.md` — 双模式架构
- `docs/integration/` — DeerFlow / Flowise / SkillsMP 等集成指南

## 📄 License

Apache 2.0（见 [LICENSE](LICENSE)）
