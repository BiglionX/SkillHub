# Changelog

所有 SkillHub 版本的显著变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 🔧 修复 (Fixed)

- 测试基建（`apps/web/jest.setup.ts`）：
  - 添加 `Response.json()` / `Response.redirect()` / `Response.error()` 静态方法与 `Response.json()` 实例方法 polyfill，解决 Next.js 15 测试环境兼容性
  - 添加 `TransformStream` polyfill，支持 MCP SDK（`eventsource-parser`）在测试环境运行
  - mock `@/lib/auth-config`（`auth`），供 skills / namespaces / reviews API 路由测试使用
  - 移除 SearchService 全局 mock，避免 ESM 模块加载问题

### 🛠️ 工程与维护 (Engineering)

- CLI 源码从 dist 产物反推还原并通过真实构建验证（`apps/cli`：`index.ts`、`commands/{install,publish,search,config}.ts`、`utils/{api,validator}.ts`）
- CLI `skill` 子命令组修复：`skillhub skill export <slug>` / `skillhub skill import <source>`（嵌套子命令替代多词命令名）
- 技能包测试管线三件套落地：`@skillhub/skill-validator`（静态校验）、`@skillhub/skill-test-harness`（运行时冒烟）、`@skillhub/skill-eval`（质量评分 qualityScore 0-100）
- web 测试全绿：27 套件 / 384 测试通过（1 跳过为原有）；`next build` 成功（47 静态页 + standalone 产物）
- 部署配置补齐：`next.config.js`（transpilePackages / standalone / node-builtin externals）、`apps/web/vercel.json`（pnpm workspace 命令）、`Dockerfile.web` + `.dockerignore`、`.env.production.example`
- 根 workspace lockfile 重建（pnpm，306KB 含全部 importers），清理过期嵌套 lockfile

## [2.0.05] - 2026-09-01

### 🖥️ 桌面助手 v2.0.05（helper UX 审计批次）

桌面端用户体验审计后的一次性修复批次，覆盖单实例窗口聚焦、失败反馈、Provider 切换与 Onboarding 引导留存。

### 🐛 修复 (Fixed)

- **单实例唤起焦点丢失**（`apps/helper/src-tauri/src/lib.rs`）：第二次启动 SkillHub Helper 时旧版 `set_focus()` 对最小化窗口无效，唤起后窗口只在任务栏闪一下。补 `unminimize()` + 临时 `set_always_on_top(true)` 300ms 后还原，确保从任务栏唤起能真正抢到焦点。
- **install 失败被静默吞错**（`apps/helper/src/App.tsx`）：v2.0.4 中 install 任务失败时仅 `setInstallProgress(null)`，用户被误导为「装成功了」，失败原因彻底丢失。v2.0.05 拆分出独立 `installFailure` state + 红色 toast；`invoke` 失败也同步弹失败浮窗（覆盖「调起安装失败」路径）；进度浮窗收到新一轮事件时自动清理旧的失败浮窗，避免堆叠。
- **切换 Provider 后误显「已保存」**（`apps/helper/src/pages/Settings.tsx`）：原 `savedTick` 是单数 number，切换 Provider 仍显示上一次的「✓ 已保存到本机」。改为 `Record<Provider, number>` 桶结构，按 Provider 隔离提示状态。
- **Onboarding 一次性跳过即永久失联**（`apps/helper/src/pages/Settings.tsx`）：原 `localStorage` flag 一旦置位就再也唤不回来，错过引导 = 永远不引导。改为 `dismissUntil` 时间戳，7 天后引导自动重现。
- **Onboarding 表单缺 Test 反馈**：首次配 Key 无 Test 入口，用户盲存到端才报错。新版把 Test 按钮下沉到 onboarding 表单（与主控台一致），保存前可一键验证 Key 有效性。
- **已装 Skills 空状态文案含内部协议术语**（`apps/helper/src/pages/Settings.tsx`）：原文"在顶部搜索框或首页对话框里输入需求，选好 Skill 后点「一键安装」，Web 端会通过 `skillhub://` 协议自动唤起本助手执行剧本"——`skillhub://` 是内部协议，普通用户不需要知道。改为"请到 SkillHub Web 端搜索你想做的事，挑好后点「一键安装」即可"。
- **协议唤起时强制抢回 Settings Tab**（`apps/helper/src/App.tsx`）：旧版外部浏览器 `skillhub://...` 唤起助手时，无论用户在哪个 Tab 都强制 `setTab('settings')`，破坏"看 About Tab"的上下文。改为仅在非 settings 时切换。

### ✨ 新增 (Added)

- **Settings Section 4：诊断 / 故障排查卡片**（`apps/helper/src/pages/Settings.tsx`）：原 Section 4 是"关于"页面，与顶部 About Tab 内容重叠且对故障排查没用。改为诊断卡片，展示：
  - 本机 HTTP 端口号 + 一键复制（Web 端探测助手时使用）
  - skillhub:// 协议注册状态（已注册 / 未注册 · Web 端可能唤不起助手）
  - 数据目录路径（`%APPDATA%\skillhub-helper\.data`）

### 🛠️ 工程 (Engineering)

- helper 版本号从 1.0.0 占位 → **2.0.05**（`apps/helper/package.json` / `Cargo.toml` / `tauri.conf.json`），与 commit 信息中的 v2.0.5 系列对齐（之前 3 个文件的 version 字段一直是 1.0.0 占位）

### ⚠️ 已知 deferrals（详见 `.qoder/plans/v2.0.5-followup.md`）

- **PR-4** base_url 持久化（Custom Provider 的 Base URL 重启即丢）— 涉及 KeyStore schema 扩展，单 PR
- **P0-17** install 进度单数 state 并发覆盖 — 需堆叠 / 队列 UI 重构，单 PR
- **P1-21** install-from-url payload 缺 `version` / `job_id` — 需前后端协议改造，与 PRD F8 一起
- **P1-22** 心跳缺 user identity — 需 Web 端 F14 `UserInstalledSoftware` 表 + OIDC session 注入
- **P2-*** 视觉 / 无障碍 / 日志 polish 10+ 项 — 影响面小，后续 polish 批次合并

## [3.0.0] - 2026-09-30

### 🎉 重大更新 - v3.0 GA Release

本次发布完成 12 周 AI 生态升级路线图，将 SkillHub 升级为 **"AI Agent Skills 的 GitHub"**。

### ✨ 新增功能 (Added)

#### F1: Agent Skills 开放标准兼容
- ✅ SKILL.md 解析器（`lib/skills/skill-md-parser.ts`）
- ✅ 资源文件扫描器（`lib/skills/skill-resource-scanner.ts`）
- ✅ 数据库 Schema 扩展：`SkillResource` 模型 + `skillMdContent` / `skillMdFrontmatter` / `standardName` / `standardDescription` / `discoveryKeywords` / `agentSkillsVersion` 字段
- ✅ API v2 端点：
  - `GET /api/v2/discovery` - 轻量发现端点
  - `GET /api/v2/skills/{slug}/skill.md` - 标准 SKILL.md 下载
  - `GET /api/v2/skills/{slug}/files/{path}` - 渐进式披露资源
  - `POST /api/v2/skills/import` - 从 GitHub 导入
- ✅ Skill 详情页 SKILL.md 渲染（`SkillMdViewer.tsx`）
- ✅ CLI 命令：`skillhub skill import` / `skillhub skill export`

#### F2: MCP Server
- ✅ SkillHub 作为 MCP Server 暴露 5 个工具：
  - `skillhub_search` - 搜索 Skills
  - `skillhub_get_skill` - 获取 Skill 详情
  - `skillhub_install_skill` - 生成安装命令
  - `skillhub_publish_skill` - 发布 Skill
  - `skillhub_list_skills_by_platform` - 按平台列出
- ✅ Streamable HTTP 传输（`POST /api/mcp`）
- ✅ OAuth 2.1 认证（写操作）

#### F3: MCP Client
- ✅ MCP 连接池（`McpClientPool.ts`）
- ✅ 发布前验证流程（自动调用 GitHub MCP 验证仓库）
- ✅ Agent 调用详情页展示 MCP 验证徽章

#### F4: 官方 MCP Registry 收录
- ✅ `server.json` 符合官方 schema
- ✅ 提交到 modelcontextprotocol/registry

#### F5: 框架现代化
- ✅ 升级到 Next.js 15.5.4
- ✅ 升级到 React 19.2.0
- ✅ 升级到 TypeScript 5.7
- ✅ Server Components / Server Actions 重构就绪
- ✅ 修复 Next.js 15 异步 `params` 适配（`Promise<{...}>`）

#### F6 (i18n): 多语言支持 ⭐ NEW
- ✅ 支持 4 种语言：简体中文 / English / 日本語 / 한국어
- ✅ Locale 协商：Cookie > Accept-Language > 默认
- ✅ 服务端翻译工具（`lib/i18n/server.ts`）
- ✅ 客户端 React Context（`I18nProvider.tsx` + `useI18n` hook）
- ✅ 语言切换器组件（`LocaleSwitcher.tsx`）：3 种变体（dropdown / inline / icon）
- ✅ 语言切换面板（`LocalePanel.tsx`）
- ✅ API 端点：
  - `GET /api/v2/locales` - 列出所有支持的语言
  - `POST /api/v2/locales/set` - 设置用户偏好
  - `GET /api/v2/skills/{slug}/i18n?locale=xx` - Skill 多语言内容

#### F7 (A2A): Agent-to-Agent 协议 ⭐ NEW
- ✅ A2A Agent Card（`GET /api/a2a/agent-card`）
- ✅ Task 管理 API（`/api/a2a/tasks`）
  - 创建 / 列表 / 详情 / 取消
  - 支持 webhook 通知
- ✅ `.well-known/agent.json` 标准发现端点
- ✅ Zod schema 完整类型定义
- ✅ 内存任务存储（生产可替换 Redis）

#### F10: Trust Score ⭐ NEW
- ✅ 0-100 分评分算法
- ✅ 4 维度权重：Stars 30% + Downloads 30% + Reviews 25% + Activity 15%
- ✅ 对数缩放，避免极端值主导
- ✅ 等级评定（A+ / A / B / C / D）
- ✅ Verified 徽章（≥80 分）
- ✅ API 端点：`GET /api/v2/skills/{slug}/trust-score`
- ✅ UI 徽章组件（`TrustScoreBadge.tsx`）：3 种变体
- ✅ 定时任务（每周日凌晨 3 点）

### 🔧 性能优化 (Performance)

- ✅ CDN 边缘缓存配置（`next.config.js`）
  - 静态资源 1 年 immutable 缓存
  - API 响应 5 分钟 revalidate + stale-while-revalidate
- ✅ Redis 缓存封装（`lib/cache/redis-cache.ts`）
  - 进程内 LRU 降级实现
  - 自动序列化 JSON
  - SCAN + DEL 前缀批量失效
- ✅ Next.js `unstable_cache` 包装（`lib/cache/api-cache.ts`）
- ✅ 性能监控工具（`lib/perf/performance-monitor.ts`）
  - P95 / 平均耗时
  - 慢查询警告（>1s）
- ✅ 图片优化（AVIF/WebP）
- ✅ 包导入优化（MUI / lucide-react）
- ✅ Partial Prerendering（incremental）

### 🔒 安全 (Security)

- ✅ 安全响应头（CSP, X-Frame-Options, X-Content-Type-Options, HSTS）
- ✅ `.well-known/agent.json` 重定向规则
- ✅ MCP 写操作 OAuth 认证
- ✅ A2A Bearer Token 认证
- ✅ Trust Score 计算中的零暴露（不返回计算中间值）

### 📝 文档 (Documentation)

- ✅ `docs/features/SKILLHUB_V3_UPGRADE_REQUIREMENTS.md` - PRD
- ✅ `docs/features/SKILLHUB_V3_DEVELOPMENT_PLAN.md` - 开发计划
- ✅ `docs/features/SKILLHUB_V3_ROADMAP.md` - 路线图
- ✅ `docs/features/NEXTJS_15_REACT_19_UPGRADE_GUIDE.md` - 升级指南
- ✅ `docs/integration/A2A_INTEGRATION_GUIDE.md` - A2A 集成指南 ⭐ NEW
- ✅ `docs/integration/I18N_GUIDE.md` - i18n 集成指南 ⭐ NEW
- ✅ `docs/integration/TRUST_SCORE.md` - Trust Score 算法说明 ⭐ NEW

### 🧪 测试 (Tests)

- ✅ 单元测试：i18n 字典完整性（4 语言 key 集合一致）
- ✅ 单元测试：A2A Schemas 验证（AgentCard / Task / Message）
- ✅ 单元测试：Task Store CRUD
- ✅ 单元测试：Trust Score 维度计算
- ✅ 单元测试：Trust Score 总分计算 + 等级评定
- ✅ 集成测试：i18n API + A2A API
- ✅ Next.js 15 兼容性检查脚本（`scripts/check-nextjs15-compat.ts`）

### 📦 依赖更新 (Dependencies)

- `next`: ^14.2.35 → **^15.5.4**
- `react`: ^18.3.1 → **^19.2.0**
- `react-dom`: ^18.3.1 → **^19.2.0**
- `@types/react`: ^18.3.0 → **^19.2.0**
- `@modelcontextprotocol/sdk`: ^1.29.0 (新增)
- `gray-matter`: ^4.0.3 (新增)
- `@upstash/redis`: ^1.37.0 (新增)
- `js-yaml`: (新增)
- `react-syntax-highlighter`: (新增)
- `lucide-react`: ^0.469.0 (新增)

---

## [2.0.0-beta] - 2025-09-15

### 新增
- 自托管 SkillHub + 全球搜索双模式
- OpenAPI 3.0 集成
- Flowise / LangChain / Dify 适配器
- ClawHub 协议兼容

---

[3.0.0]: #300---2026-09-30
[2.0.0-beta]: #200-beta---2025-09-15
