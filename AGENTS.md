# AGENTS.md — Skill Hub 仓库指南（面向 AI 代理与人类开发者）

> 本文件是 AI 编码代理（DSH / DeerFlow / Claude Code / Cursor 等）进入本仓库的**入口文档**。
> 修改代码前请先通读；任何新增/变更的工程约定都应同步更新到这里。

---

## 1. 项目是什么

Skill Hub 是 ProClaw 生态的 **AI 技能市场平台**（"AI 时代的 npm/Docker Hub"），用于技能开发者发布、管理、变现 AI 技能包（Agent Skills，SKILL.md 标准），用户浏览、搜索、安装、付费订阅。

- 双模式：**自主管理平台**（用户上传技能包）+ **全球搜索引擎**（GitHub API 爬取元数据）
- 参考项目：iflytek/SkillHub（Apache 2.0）、Agent Skills 标准、ClawHub CLI 协议

## 2. 仓库结构

```
apps/
  web/        @skillhub/web    Next.js 15 (App Router) 主站：前台/后台/API/爬虫/审核
  cli/        @skillhub/cli    命令行工具：publish/install/search/import/export
packages/
  search-sdk/          @skillhub/search-sdk  搜索 SDK（已实现，可发布）
  widget/              @skillhub/widget      嵌入式 React 组件（已实现）
  skill-validator/     @skillhub/skill-validator   技能包静态校验（zod + 内置 frontmatter 解析，含 skillhub-validate CLI）
  skill-test-harness/  @skillhub/skill-test-harness 冒烟测试沙箱（隔离复制 + 任务执行 + 报告，零外部依赖）
  skill-eval/          @skillhub/skill-eval        质量评分 qualityScore 0-100（LLM-as-judge + 启发式兜底）
  api-client/          @skillhub/api-client  空骨架（待实现）
  ui/                  @skillhub/ui          空骨架（待实现）
  utils/               @skillhub/utils       空骨架（待实现）
deer-flow/     vendored bytedance/deer-flow（智能体编排框架副本，仅供集成参考，不参与构建）
skills/         仓库技能（Agent Skills 标准 SKILL.md）：repo-dev / skill-package-validator / skill-smoke-test / code-review，可被 DSH / DeerFlow / Claude Code 等 harness 加载
docs/          开发计划 / 架构 / 集成指南
.github/workflows/  CI（pnpm + turbo）
部署配置: apps/web/next.config.js（transpilePackages + standalone）、apps/web/vercel.json（Vercel）、根 Dockerfile.web + docker-compose.neon.yml + .dockerignore（Docker）、.env.production.example（env 模板）
```

## 3. 常用命令（根目录执行，pnpm workspace + turbo）

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装全部 workspace 依赖 |
| `pnpm dev` | 启动 web（next dev，:3000） |
| `pnpm build` | turbo 构建全部包 |
| `pnpm lint` / `pnpm lint:fix` | ESLint（flat config，`eslint.config.js`） |
| `pnpm typecheck` | turbo 跑各包 `tsc --noEmit` |
| `pnpm test` | turbo 跑单元测试 |
| `pnpm test:e2e` | Playwright E2E（apps/web/tests） |
| `pnpm test:cypress` | Cypress E2E（apps/web/cypress） |
| `pnpm db:generate` / `db:push` / `db:migrate` | Prisma（schema 在 `apps/web/prisma/schema.prisma`） |
| `pnpm ci` | 完整质量门禁：lint → typecheck → test → build |

单包命令用 `pnpm --filter <包名> <script>`，例如 `pnpm --filter @skillhub/web run test`。

## 4. 包命名与约定

- 包名统一 `@skillhub/*`；web 是 `@skillhub/web`，CLI 是 `@skillhub/cli`
- 依赖传递用 `workspace:*` 引用（见 `apps/web/package.json` 中的 `@skillhub/search-sdk`）
- 新包必须同时出现在 `pnpm-workspace.yaml` 覆盖的目录下并补 `package.json`
- 代码风格：TypeScript strict；`@/` 路径别名指向 `apps/web` 根；组件用 shadcn 风格（`components/ui/*` + `cn()`）
- 提交信息建议遵循 Conventional Commits（仓库已配置 changesets）

## 5. 环境变量

以 `apps/web/.env.example` 为准。核心变量：

- `DATABASE_URL` / `DIRECT_URL`：PostgreSQL（Neon serverless）
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL`：认证会话
- `SKILLHUB_OIDC_CLIENT_ID` / `SKILLHUB_OIDC_CLIENT_SECRET`：NvwaX OIDC
- `REDIS_URL` / `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`：缓存
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `ZHIPU_API_KEY`：Embedding/LLM
- `SKILLSMP_API_KEY`：SkillsMP 同步

本地开发复制 `apps/web/.env.example` → `apps/web/.env.local` 并填真实值。

## 6. 技能包（Skill Package）规范

平台分发的是 Agent Skills 标准的技能包，结构示例：

```
my-skill/
├── SKILL.md            # frontmatter: name, description, version, allowed-tools...
├── scripts/
├── assets/
└── package.json
```

- `SKILL.md` 是核心：frontmatter（YAML）+ 正文（技能指令）。解析器：`apps/web/lib/skills/skill-md-parser.ts`（gray-matter + zod）
- CLI 通过 `/api/v2/discovery`、`/api/v2/skills/{slug}/skill.md` 等端点与平台交互（见 `apps/cli/src/utils/api-v2.ts`）
- 发布审核流程：自动化审核 + 人工复核（`app/api/reviews`、admin 页面）
- **技能包测试管线（Step 3）**：静态校验 `@skillhub/skill-validator`（或 `npx skillhub-validate <dir>`）→ 运行时冒烟 `@skillhub/skill-test-harness`（对应 `skills/skill-smoke-test` 技能）→ 质量评分 `@skillhub/skill-eval`（写 `qualityScore`）。三包均含 `build`/`typecheck` 脚本，纳入 turbo 通用任务；与 web 审核流程的 API 接线尚未实施（待 root `pnpm install` 后接入）。

## 7. 测试约定

- **单元测试**：Jest（`apps/web/jest.config.ts`，next/jest），测试文件与源码同目录 `__tests__/`，或用 `tests/*.test.ts`
- **组件测试**：@testing-library/react
- **E2E**：Playwright（`apps/web/tests/*.spec.ts`）+ Cypress（`apps/web/cypress`）
- 新功能必须带测试；改 API 路由时更新对应 `app/api/**/__tests__/`

## 8. 已知问题 / 当前状态（2026-04 恢复工程地基后）

> ⚠️ 以下为已确认的存量问题，修复前请先与维护者确认：

1. **`apps/cli/src` 已从 dist + 原始 lockfile 反推还原并通过真实构建验证（2026-04）**：`index.ts`、`commands/{install,publish,search,config}.ts`、`utils/{api,validator}.ts` 依据 dist 编译产物重建；`export.ts` / `import.ts` / `api-v2.ts` / `config.ts` 为原存文件。已用 `apps/cli/node_modules` 真实依赖跑通 `tsc --noEmit`、`tsc` 构建（含 add-shebang）与运行时冒烟（--version / --help / search）。依赖版本按 `apps/cli/pnpm-lock.yaml` 原始规格对齐（commander ^11、inquirer ^8、zod ^3.22 等）。
2. **CLI `skill` 子命令组已修复（2026-04）**：原 `export.ts` / `import.ts` 注册为 `.command('skill export <slug>')`（commander 不支持多词命令名，导致 `--help` 显示异常、参数解析错误）；已改为 `index.ts` 中创建 `skill` 父命令组 + 嵌套 `export <slug>` / `import <source>` 子命令，用法不变：`skillhub skill export <slug>` / `skillhub skill import <source>`。
3. **`packages/api-client` / `packages/ui` / `packages/utils` 为空骨架**：只有 package.json，无源码（skill-validator / skill-test-harness / skill-eval 已实现并验证，见第 6 节）。
4. **web 测试与构建已全绿（2026-04 修复后）**：`pnpm --filter @skillhub/web run test` 27 套件/384 测试通过（1 跳过为原有）；`next build` 成功（47 静态页 + standalone）。期间修复的存量问题：MCP route `getMcpServer` 缺 export、API 路由/页面 props 未适配 Next 15（params/searchParams 需 Promise）、`SkillType` 非法字面量（TOOL→PROMPT）、`reviews.rating`→`comments.rating`（Review 是审核记录）、`analytics/personal` 用 `downloadCount` 标量、缺 `lib/utils/logger`、i18n 相对路径错误、jest transformIgnorePatterns 不适配 pnpm 布局、eslint 缺 jest 全局/TS no-undef、instrumentation 编译 node 内建模块 external 缺失等。
5. **`deer-flow/` 是整体 vendored 的第三方仓库**：不要把它当作本项目代码修改；ESLint 已忽略该目录。
6. **根 workspace lockfile 已重建（2026-04，306KB 含全部 importers）**：本地 `pnpm install` 已生成并生效。建议顺手删除过期的嵌套 lockfile `apps/web/pnpm-lock.yaml`、`apps/cli/pnpm-lock.yaml`（根 lockfile 已覆盖，留着会被 Next/工具链误判）。
7. **部署配置已补齐（2026-04）**：`apps/web/next.config.js`（含 transpilePackages、standalone、outputFileTracingRoot、webpack node-builtin externals——instrumentation 编译必需）、`apps/web/vercel.json`（已改为 pnpm workspace 命令）、`Dockerfile.web` + `.dockerignore`（新建，Docker 部署用）、`.env.production.example`（补齐 OIDC/DIRECT_URL/SkillsMP/Upstash 等变量）。**已在本地跑通 `next build`（含 standalone 产物）**，但 Vercel/Docker 部署仍未实跑。
8. **仓库外的流浪 lockfile**：`D:\BigLionX\package-lock.json`（633KB，仓库上一级目录）会干扰 Next 根目录探测——已用 `outputFileTracingRoot` 屏蔽，建议手动删除该文件。

## 9. 对 AI 代理的工作指引

- 先读本文件 + `docs/` 中相关文档，再动手
- 仓库技能在 `skills/` 目录（Agent Skills 标准），按任务类型加载：开发用 `repo-dev`、技能包静态校验用 `skill-package-validator`、运行时冒烟用 `skill-smoke-test`、审查用 `code-review`
- 小步改动，每步用 `pnpm --filter @skillhub/web run typecheck` 或 `pnpm lint` 自检
- 跨文件重构 / 审计 / 批量任务：使用 harness 的 subagent / workflow 能力并行拆分，主代理只做整合与验收
- 涉及技能包格式、审核流程、支付、多租户的改动，先读 `docs/plans/SKILLHUB_DEVELOPMENT_PLAN_V2.md` 与 `docs/features/DUAL_MODE_ARCHITECTURE.md`
- 遇到与本节"已知问题"冲突的行为，以本节为准并记录偏差
