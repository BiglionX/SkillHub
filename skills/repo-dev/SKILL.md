---
name: repo-dev
description: SkillHub 仓库开发指引。当需要在 SkillHub（ProClaw AI 技能市场平台）中开发、修改、重构代码，或排查构建/测试问题时使用。涵盖仓库地图、pnpm workspace 命令、代码约定与质量门禁。
---

# SkillHub 仓库开发指引 (repo-dev)

本技能指导 Agent 在 SkillHub 仓库（`D:\BigLionX\SkillHub`）中高效、合规地开发代码。**动手前先读 `AGENTS.md`**（仓库入口文档，含最新已知问题）。

## 何时使用

- 在 apps/web、apps/cli、packages/* 中新增或修改代码
- 运行/修复构建、类型检查、测试
- 排查 CI 或本地开发环境问题
- 重构、审计、跨文件改动

## 仓库地图（速览）

```
apps/web/        @skillhub/web   Next.js 15 (App Router) 主站
apps/cli/        @skillhub/cli   命令行（publish/install/search/config/skill export/import）
packages/search-sdk|widget       已实现；api-client|ui|utils 为空骨架
deer-flow/       vendored 第三方（勿改）
docs/            计划/架构/集成文档
skills/          本目录：仓库技能（SKILL.md）
```

## 常用命令（根目录，pnpm + turbo）

| 命令 | 作用 |
|---|---|
| `pnpm dev` | web dev（:3000） |
| `pnpm build` / `pnpm typecheck` / `pnpm test` | turbo 批量构建/类型/测试 |
| `pnpm lint` / `pnpm lint:fix` | ESLint（flat config） |
| `pnpm --filter @skillhub/web run test` | web 单元测试 |
| `pnpm --filter @skillhub/cli run build` | CLI 构建（tsc + add-shebang） |
| `pnpm db:generate` / `db:push` | Prisma |

## 工作流程

1. **定位**：读 `AGENTS.md` + 相关 `docs/`，确定改动涉及的包与模块
2. **基线**：改动前先跑一次 `pnpm --filter <包> run typecheck` 确认基线
3. **实现**：小步改动；web 代码用 `@/` 别名；新 API 路由放 `app/api/**` 并配 `__tests__/`
4. **自检**：每步 `pnpm lint` + `pnpm typecheck`（必要时 `pnpm test`）
5. **收尾**：更新 `AGENTS.md`（如涉及工程约定/已知问题）、补 changeset（`pnpm changeset`）

## 质量门禁（提交前必须全绿）

- [ ] `pnpm lint` 无 error
- [ ] `pnpm typecheck` 通过
- [ ] 相关测试通过（新功能必带测试）
- [ ] 涉及技能包格式/审核/支付/多租户：先读 `docs/plans/SKILLHUB_DEVELOPMENT_PLAN_V2.md` 与 `docs/features/DUAL_MODE_ARCHITECTURE.md`

## 参考

- `AGENTS.md`（权威入口）
- `docs/plans/SKILLHUB_DEVELOPMENT_PLAN_V2.md`
- `docs/features/DUAL_MODE_ARCHITECTURE.md`
