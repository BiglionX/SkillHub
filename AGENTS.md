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
              转型路线：docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md（v2.0，2026-08：按场景分类 + 三交付物）
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
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `ZHIPU_API_KEY`：Embedding（云端托管）
- ~~`DEEPSEEK_API_KEY`~~：**v2.0.2 起云端不再持有 LLM Key**。用户在桌面助手设置页填 Key，本地 AES 加密保存；Web 经助手转发调用 LLM。`LlmGateway` 服务口占位（`useCloudFallback=false`），未来云端托管可启用。详见 [ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md §6 D6](./docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md)
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
   - **Vercel 已实跑（2026-08）并修复三处**：① `apps/web/vercel.json` 的 `buildCommand` 需先构建 workspace 依赖再构建 web（`pnpm --filter @skillhub/search-sdk build && pnpm --filter @skillhub/widget build && pnpm --filter @skillhub/skill-validator build && pnpm --filter @skillhub/web run build`），否则全新 checkout 缺 `dist/` 报 `Can't resolve '@skillhub/widget'/'@skillhub/search-sdk'`；② `packages/widget` devDeps 的 `@types/react` 从 ^18 对齐到 ^19（+`@types/react-dom`），否则 tsup `--dts` 因 @types/react 18/19 双版本冲突报 TS2786；③ **Edge Function 修复**：`next.config.js` 的 node 内建模块 externals 必须限定 `nextRuntime === 'nodejs'`（否则 middleware Edge bundle 引用 `path/fs/crypto/os` 等被 Vercel 拒绝），且 `instrumentation.ts` 必须 Edge 安全——Next 15 会把它同时编译进 Edge 运行时，任何静态引入的 Node 内建模块（path/dotenv/调度器等）都要移入 `NEXT_RUNTIME === 'nodejs'` 守卫 + 动态导入。
8. **仓库外的流浪 lockfile**：`D:\BigLionX\package-lock.json`（633KB，仓库上一级目录）会干扰 Next 根目录探测——已用 `outputFileTracingRoot` 屏蔽，建议手动删除该文件。
9. **apps/helper 已接入 `tauri-plugin-opener`（2026-08）**：LLM Key 设置页的"获取 Key →"原是 `<a target="_blank">`，在 Tauri 2 WebView 里不会自动跳转默认浏览器。修复后走 `tauri-plugin-opener::openUrl()` 走系统 shell。**ACL 严格收紧**：`apps/helper/src-tauri/capabilities/default.json` 仅放行三个 Provider 文档域名（`platform.deepseek.com`、`platform.openai.com`、`open.bigmodel.cn`，glob `*`），非白名单 URL 在 Rust 层被拦截——前端被注入也只能量开白名单域名。新增 Provider 时务必同步更新该文件。
10. **桌面端升级为「主客户端」并完成 M4 用量看板（2026-09，v2.0.5 已落地）**：v2.1 PRD ([docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md §5.3](docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md)) 正式把桌面端从「协议唤起器 + Key 保险箱 + 扫描仪」定位升级为「主客户端」，覆盖 A/B/C 三类全闭环。**Tab 体系从 2 Tab 升级为 5 Tab**（[App.tsx:15](apps/helper/src/App.tsx#L15)）：`home` / `explore` / `my` / `usage` / `settings`（详见 [§10](#10-对-ai-代理的工作指引)）。
  - **桌面端落地**（apps/helper）：`usage_store.rs`（SQLite 本地用量记账 + 90 天滚动清理 + CSV 导出 + 幂等 `client_record_id`）、`llm_proxy.rs` 注入 `UsageStore` + 6 个新 invoke（`record_usage` / `get_local_usage_summary` / `export_usage_csv` / `prune_local_usage` / `ensure_guest_session` / `get_recommended_for_local_software`）+ ChatBody 加 M4 字段（`client_record_id` / `session_id` / `skill_slug`）+ 5 Tab 前端（`Home` / `Explore` / `MySkills` / `Usage` / `Settings`）+ `<NluSearchBox>` / `<ProviderPriceBadge>` / `<SkillCard>` / `<UsageDashboard>` 4 个组件。
  - **Web 端落地**（apps/web）：`GuestSession` / `UsageRecord` / `ProviderPricing` 三张 Prisma 表 + User 2 反关联 + migration SQL（20260903）+ 4 条 API（`/api/v2/provider-pricing` 公开 GET + Redis 1h 缓存 / `/api/v2/usage/sync` POST 幂等同步 + 成本回填 / `/api/v2/user/usage` GET 聚合 + `DATE_TRUNC` 原生 SQL / `/api/v2/auth/bind-guest` POST 合并匿名 → 用户）+ `/dashboard/usage` 页面（4 指标卡 + 4 图 + Top 10 表 + 隐私说明）+ 首页分支（已登录→`/dashboard/usage`，未登录→`/skills`）+ `/skills` nav 加「用量」链接。
  - **资源约束**随之提高：助手内存 ≤ 80MB（空闲）、安装包 ≤ 8MB、冷启动 ≤ 1500ms（均含 React.lazy 拆分页面）。
  - **Web 端首页降级为「下载助手」，原 NLU 入口保留到 `/skills` 子路径 + canonical tag**。
  - 设计文档：[HELPER_USAGE_DASHBOARD.md](docs/features/HELPER_USAGE_DASHBOARD.md)（v0.2 含实施同步 §11）；PRD：[ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md §14.4 M4 里程碑](docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md)；改造计划总纲：[`.qoder/plans/桌面端主客户端化改造方案_a99a4d27.md`](.qoder/plans/桌面端主客户端化改造方案_a99a4d27.md)；实施记录：[`.qoder/plans/M4_桌面端主客户端实施_aac15783.md`](.qoder/plans/M4_桌面端主客户端实施_aac15783.md)。
11. **Prisma 5.22 + pnpm virtual store 类型 stale（2026-09，M4 经验）**：新加 `prisma` 模型后，`pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 会报「类型 `PrismaClient` 上不存在属性 `xxx`」——Prisma generator 输出在 pnpm virtual store（`.pnpm-store`），TS 类型解析时找不到。**绕过模式**：跟现有 `userInstalledSoftware` 一样，用 `(prisma as any).xxxModel as any` 强制断言（已在 `apps/web/app/api/v2/usage/sync/route.ts`、`provider-pricing/route.ts`、`auth/bind-guest/route.ts`、`user/usage/route.ts`、`scripts/seed-m4-pricing.ts` 5 处统一）。**正确解决**：在 CI 容器内跑 `pnpm exec prisma generate`，确保 `.prisma/client` 目录生成后再 typecheck。M4 期间 `prisma validate` 通过、`tsc --noEmit` 退出 0，但未实跑 `prisma generate` + 真实数据库连接，待 Vercel 部署时验证。
12. **桌面端 50 次/天游客强制限流未在 Rust 层落地（2026-09，M4 deferral）**：`HELPER_USAGE_DASHBOARD.md §6.2` 规定的"游客每天 50 次 LLM 调用"上限，目前仅文档+ Web 端 `bind-guest` 路由判断；`apps/helper/src-tauri/src/usage_store.rs` 未加 `count_today_guest()` 调用拦截。**M5 补**：在 `UsageStore::count_today_guest()` 已留方法，待 `llm_proxy::handle_chat` 入口接入。详见 [HELPER_USAGE_DASHBOARD.md §6.2](docs/features/HELPER_USAGE_DASHBOARD.md)。
13. **M4 复盘：2 个 CRITICAL 缺陷已修复（2026-09）**：v2.0.5 推送后 CodeReview 发现 2 个 CRITICAL 问题，均已修复：
  - **CRITICAL #1**：`usage_store.rs::prune_older_than` 同一函数内对 `std::sync::Mutex` 二次 `lock()` → 永久死锁。设置页手动清理 90 天前 + `prune_removes_old_records` 单元测试会卡死整助手。修复：把 DELETE 包入独立作用域让 `conn` drop 释放锁 + 去掉手动 `PRAGMA wal_checkpoint`（SQLite WAL 自动管理）。
  - **CRITICAL #2**：`llm_proxy.rs::handle_chat` 把 `resp.tokens_used`（数字）的 `to_string()` 当 `model` 字段填进 SQLite → model 列全是数字串，CSV 导出 + 按 model 聚合全部失效。修复：给 `provider/mod.rs::ChatResponse` 加 `pub model: String` + `LlmProvider::chat` 构造处填 `model: model.clone()` + `llm_proxy.rs` 用 `resp.model.clone()`。
  - **教训**：复杂改动上线前必须跑 `cargo test`（不能只 `cargo check`）。后续 PR 评审应包含 review scope = current_session 的代码审计（CodeReview subagent 可被显式调用）。

## 9. 版本号规则（2026-08 落地）

格式 **`<X>.<Y>.<Z>`**，三段百进制：

- 每次发版只动 `Z`：`Z + 1`
- `Z` 满百（`99 → 100`）→ `Z = 0`，`Y + 1`
- `Y` 满百 → `Y = 0`，`X + 1`
- 起始版号：**`0.1.00`**
- `Z` 永远两位（`00`–`99`，不满补零）；`Y` < 10 时不补零（`0.1.00` / `0.10.00` / `1.0.00`）

工具：[`scripts/bump-version.py`](scripts/bump-version.py)，支持 `package.json` / `Cargo.toml` / `tauri.conf.json`，自动识别文件类型：

```bash
python scripts/bump-version.py --file apps/helper/package.json          # +1
python scripts/bump-version.py --file apps/helper/package.json --dry-run # 预览
python scripts/bump-version.py --file packages/new-thing/package.json --start   # 新包首次发版 → 0.1.00
python scripts/bump-version.py --file apps/helper/package.json --set 0.3.05      # 显式跳版本
```

已发版到 npm / crates.io 的版本**不可重置**（破坏依赖链）；规则适用于下一次发版。详见 [`docs/plans/VERSIONING_RULE.md`](docs/plans/VERSIONING_RULE.md)。

## 10. 对 AI 代理的工作指引

- 先读本文件 + `docs/` 中相关文档，再动手
- 仓库技能在 `skills/` 目录（Agent Skills 标准），按任务类型加载：开发用 `repo-dev`、技能包静态校验用 `skill-package-validator`、运行时冒烟用 `skill-smoke-test`、审查用 `code-review`
- 小步改动，每步用 `pnpm --filter @skillhub/web run typecheck` 或 `pnpm lint` 自检
- 跨文件重构 / 审计 / 批量任务：使用 harness 的 subagent / workflow 能力并行拆分，主代理只做整合与验收
- 涉及技能包格式、审核流程、支付、多租户的改动，先读 `docs/plans/SKILLHUB_DEVELOPMENT_PLAN_V2.md` 与 `docs/features/DUAL_MODE_ARCHITECTURE.md`
- 遇到与本节"已知问题"冲突的行为，以本节为准并记录偏差

### 10.1 【v2.1 新增】桌面端 5-Tab 体系（2026-09）

`apps/helper/src/App.tsx` 入口的 `Tab` 联合类型与功能：

| Tab | 路由 | 内容 | 主要组件（计划新增） | 关联 PRD |
|---|---|---|---|---|
| **home** | `tab=home` | NLU 搜索框 + 「为你推荐」面板 | `<HomePage>` / `<NluSearchBox>` / `<RecommendedForYou>` | F16 / F17 |
| **explore** | `tab=explore` | 顶部软件过滤 + Skill 列表 | `<ExplorePage>` / `<SoftwareIconBar>` / `<SkillCard>` | F16 |
| **my** | `tab=my` | 已装 Skills 列表 + 用量小卡 + 卸载 | `<MySkillsPage>` / `<InstalledSkillItem>` / `<UsageMiniCard>` | F16 / F18 |
| **usage** | `tab=usage` | 用量 Dashboard（日/周/月 + 按 Skill + 按 Provider + 估算费用 + 导出 CSV） | `<UsagePage>` / `<UsageDashboard>` | F16 / F18 |
| **settings** | `tab=settings` | LLM Key + 本机软件 + 诊断 + 关于（保留现有，扩展） | `<Settings>` | — |

**顶栏右侧徽章**（始终可见）：
- LLM Key 状态徽章（已就绪 / 未配置 → 未配 Key 时点 C 类 Skill 高亮引导）
- 登录徽章（已绑定 Web 账号 / 游客 → 游客用满 50 次后弹注册引导）

**键盘导航**：Home / End 在 Tab 间跳，← → 在 Tab 内焦点移动，Enter 触发。

> 涉及桌面端改动前先读 PRD [§5.3](docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md) 红线修正 + [§14.4 M4 里程碑](docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md) + [HELPER_USAGE_DASHBOARD.md](docs/features/HELPER_USAGE_DASHBOARD.md)。
