---
name: code-review
description: SkillHub 代码审查。当需要审查 PR / 代码改动（web、cli、packages）时使用——运行质量门禁、核对工程约定、检查安全与市场平台特定风险，输出结构化审查意见。
---

# SkillHub 代码审查 (code-review)

本技能指导 Agent 对 SkillHub 仓库的代码改动做系统性审查。

## 何时使用

- 审查 PR（合并前）
- 复查 AI 代理或协作者的改动
- 上线前自查

## 工作流程

### 1. 理解改动
- 读 diff 与相关 issue/描述，明确意图
- 定位受影响包（apps/web、apps/cli、packages/*）

### 2. 运行质量门禁（可执行时）
- [ ] `pnpm lint`（无 error，warning 需说明）
- [ ] `pnpm typecheck`
- [ ] 相关测试：`pnpm --filter <包> run test` / `test:e2e`
- [ ] 涉及 Prisma：schema 变更是否配套 `db:migrate`/迁移说明

### 3. 工程约定核对
- [ ] 包命名 `@skillhub/*`、`workspace:*` 依赖
- [ ] web 代码 `@/` 别名、i18n（zh-CN/en-US/ja-JP/ko-KR 四语言 dictionary 同步）
- [ ] API 路由有 `__tests__/`；错误处理用 `lib/api-response` 的 success/error 系列
- [ ] 注释/日志语言一致，无调试残留（console.log 无理由出现）

### 4. 安全与平台特定风险
- [ ] 认证：管理/写操作走 `lib/auth-config` + `lib/admin-auth`，禁止裸信凭
- [ ] 限流：公开 API 是否考虑 `lib/middleware/rate-limit`
- [ ] 技能包相关改动：是否影响 SKILL.md 解析（`lib/skills/skill-md-parser.ts`）、审核流程（`app/api/reviews`）、v2 端点（`/api/v2/*`）
- [ ] 注入风险：SKILL.md 内容渲染（react-markdown）是否允许危险 HTML
- [ ] 密钥/URL 硬编码、.env 泄漏

### 5. 输出审查意见（markdown）

```
# 审查意见: <PR/改动描述>
- 结论: 批准 / 需修改 / 拒绝
- 阻塞项: (必须修复)
- 建议项: (可优化)
- 测试覆盖评估: 充分/不足 (具体)
```

## 注意

- 只审查、不直接改代码（除非用户明确要求"修复审查发现的问题"）
- 对空骨架包（api-client/ui/utils）的改动按实际内容审查，不为空目录扣分
