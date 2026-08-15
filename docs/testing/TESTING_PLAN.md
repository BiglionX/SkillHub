# SkillHub 综合测试计划

> **文档版本**: v1.0  
> **创建日期**: 2026-06-25  
> **测试范围**: Web 应用 (apps/web)、CLI 工具 (apps/cli)、Search SDK (packages/search-sdk)、Widget (packages/widget)  
> **测试负责人**: QA Team  
> **批准人**: [待签署]

---

## 目录

1. [测试目标](#1-测试目标)
2. [测试范围](#2-测试范围)
3. [测试方法与策略](#3-测试方法与策略)
4. [测试层级详解](#4-测试层级详解)
5. [测试环境配置](#5-测试环境配置)
6. [测试数据管理](#6-测试数据管理)
7. [测试用例规范](#7-测试用例规范)
8. [成功标准](#8-成功标准)
9. [测试执行计划](#9-测试执行计划)
10. [缺陷管理流程](#10-缺陷管理流程)
11. [项目验收流程](#11-项目验收流程)
12. [附录](#12-附录)

---

## 1. 测试目标

### 1.1 总体目标

确保 SkillHub 平台在功能完整性、系统稳定性、数据安全性、性能表现和用户体验方面达到生产就绪标准，满足 v3.0 GA 发布要求。

### 1.2 具体目标

| 目标 ID | 目标描述 | 衡量指标 |
|---------|----------|----------|
| T-01 | 所有核心功能通过验证 | 功能测试通过率 ≥ 100% (所有计划用例执行完毕) |
| T-02 | API 响应符合规范 | 状态码正确率 100%，Schema 校验通过率 100% |
| T-03 | 关键用户流程无阻塞 | 端到端流程通过率 100% |
| T-04 | 数据库操作完整性 | CRUD 操作正常，事务一致性通过率 100% |
| T-05 | 安全防护有效 | OWASP Top 10 覆盖，认证鉴权全部通过 |
| T-06 | 性能满足基准要求 | API P95 < 200ms，页面加载 < 3s |
| T-07 | 多浏览器兼容 | Chrome/Firefox/WebKit 核心功能一致 |
| T-08 | 验收标准全部满足 | 项目验收检查清单 100% 通过 |

---

## 2. 测试范围

### 2.1 在测范围 (In Scope)

#### 应用层
- **Web 前端** (`apps/web`): 技能浏览、搜索、详情、用户认证、Dashboard、管理后台、国际化
- **API 层** (`apps/web/app/api/`): RESTful API、Auth API、Search API、Admin API、MCP API、A2A API
- **CLI 工具** (`apps/cli`): 技能导入/导出命令
- **Search SDK** (`packages/search-sdk`): 搜索客户端库
- **Widget** (`packages/widget`): 嵌入式技能组件

#### 功能模块
| 模块 | 子模块 | 优先级 |
|------|--------|--------|
| 用户认证 | 密码登录、OIDC、Session管理、权限控制 | P0 |
| 技能管理 | 创建/编辑/删除、版本管理、SKILL.md解析、导入/导出 | P0 |
| 搜索系统 | 全文搜索、语义搜索、全局搜索、建议、热门搜索 | P0 |
| API 服务 | REST API、MCP Server/Client、A2A协议 | P0 |
| 管理后台 | 用户管理、审核工作流、爬虫管理、审计日志 | P1 |
| 命名空间 | 团队管理、成员权限 | P1 |
| 国际化 | 多语言支持 (zh-CN/en-US/ja-JP/ko-KR) | P1 |
| 信任评分 | 评分计算、信誉系统 | P1 |
| Widget | 嵌入组件、搜索小部件 | P2 |
| 性能监控 | 缓存、性能追踪 | P2 |

#### 非功能需求
- 安全性: 认证、授权、XSS/CSRF防护、Rate Limiting
- 性能: API响应时间、页面加载速度、数据库查询效率
- 兼容性: 浏览器兼容 (Chrome/Firefox/Safari)、响应式布局
- 可用性: 错误处理、加载状态、空状态、边界情况

### 2.2 不在测范围 (Out of Scope)
- 第三方集成平台的端到端测试 (DeerFlow、Flowise 等)
- 移动原生应用测试
- 压力测试与长期稳定性测试 (计划在 GA 后进行)
- 基础设施层面的灾难恢复测试

---

## 3. 测试方法与策略

### 3.1 测试金字塔策略

```
         ╱╲
        ╱  ╲          E2E 测试 (Playwright + Cypress)
       ╱    ╲         ─────────────────────────────
      ╱      ╲        关键用户流程、跨页面交互
     ╱────────╲
    ╱          ╲      集成测试 (Jest + Vitest)
   ╱            ╲     ─────────────────────────────
  ╱              ╲    API 路由、服务层、数据库交互
 ╱────────────────╲
╱                  ╲  单元测试 (Jest + Vitest)
╱                    ╲ ─────────────────────────────
                      📐 工具函数、组件渲染、数据模型、hooks
```

### 3.2 测试类型与工具矩阵

| 测试层级 | 工具/框架 | 覆盖目标 | 执行频率 |
|----------|-----------|----------|----------|
| 单元测试 | Jest + Testing Library | 函数、组件、工具类 | 每次提交 |
| 单元测试 | Vitest | deer-flow 前端核心逻辑 | 每次提交 |
| 集成测试 | Jest + Supertest | API 路由、服务层 | 每次提交 |
| 组件测试 | Jest + React Testing Library | UI 组件渲染与交互 | 每次提交 |
| E2E 测试 | Playwright | 关键用户流程 (多浏览器) | CI 每次合并 |
| E2E 测试 | Cypress | 主要用户流程 | CI 每次合并 |
| 安全测试 | 手动 + ESLint 安全规则 | 认证、授权、输入验证 | 每次迭代 |
| 验收测试 | 手动执行 + 验收清单 | 全部功能与非功能需求 | GA 前 |

### 3.3 测试设计技术

| 技术 | 适用场景 |
|------|----------|
| 等价类划分 | 表单验证、输入校验、搜索参数 |
| 边界值分析 | 分页、数值范围、字符串长度 |
| 决策表测试 | 权限逻辑、审核工作流状态转换 |
| 状态转换测试 | 用户会话生命周期、任务状态流转 |
| 用例驱动测试 | 端到端用户流程 |
| 错误猜测 | 异常处理、网络错误、超时场景 |

---

## 4. 测试层级详解

### 4.1 单元测试 (Unit Testing)

#### 4.1.1 目标
验证最小的可测试单元（函数、组件、工具类）在隔离环境下的正确性。

#### 4.1.2 覆盖范围

**Web 前端 (`apps/web`)**
- 工具函数: `lib/utils.ts`, `lib/form-validation.ts`
- 数据模型: `types/index.ts` 的类型守卫和校验
- 服务层: `lib/services/*.ts` 中的纯函数和计算逻辑
- 搜索服务: `lib/search/SearchService.ts` 中的查询构建和结果处理
- 技能解析: `lib/skills/skill-md-parser.ts` 的 Markdown 解析逻辑
- UI 组件: `components/ui/*.tsx` 的渲染和交互逻辑
- Hook 逻辑: 自定义 React hooks
- 国际化: `i18n/config.ts` 的语言切换和字典查找

**CLI 工具 (`apps/cli`)**
- 命令解析逻辑
- API 客户端调用封装

**Search SDK (`packages/search-sdk`)**
- 查询构造器
- 响应解析
- 错误处理

#### 4.1.3 执行命令

```bash
# Web 应用单元测试
cd apps/web
npm test

# 带覆盖率报告
npm run test -- --coverage

# 监听模式
npm run test -- --watch

# 特定文件
npm test -- --testPathPattern="form-validation"

# deer-flow 单元测试
cd deer-flow/frontend
pnpm test
```

#### 4.1.4 通过标准
- 所有测试用例通过
- 代码行覆盖率 ≥ 80%
- 分支覆盖率 ≥ 75%
- 无 skipped 测试（除明确标记的 TODO）

#### 4.1.5 现有单元测试文件
```
apps/web/app/api/__tests__/          # API 单元测试
apps/web/lib/__tests__/              # 工具函数单元测试
apps/web/lib/search/__tests__/       # 搜索服务单元测试
apps/web/lib/services/__tests__/     # 服务层单元测试
apps/web/lib/skills/__tests__/       # 技能解析单元测试
apps/web/lib/a2a/__tests__/          # A2A 协议单元测试
apps/web/i18n/__tests__/             # 国际化单元测试
apps/web/components/ui/__tests__/    # UI 组件单元测试
apps/web/app/api/mcp/__tests__/      # MCP 单元测试
apps/web/app/api/v2/__tests__/       # V2 API 单元测试
deer-flow/frontend/tests/unit/       # deer-flow 单元测试
```

### 4.2 集成测试 (Integration Testing)

#### 4.2.1 目标
验证多个模块/服务之间的交互正确性，包括 API 路由、数据库操作、服务间调用。

#### 4.2.2 覆盖范围

**API 集成测试**
- 认证流程: 登录 → Session 创建 → 受保护资源访问 → 登出
- 技能 CRUD: 创建 → 读取 → 更新 → 删除 完整生命周期
- 搜索流程: 查询构建 → 索引检索 → 结果排序 → 分页返回
- 审核工作流: 提交审核 → 自动审核 → 人工复核 → 发布/拒绝
- 命名空间管理: 创建团队 → 添加成员 → 权限校验

**服务集成测试**
- 数据库读写: Prisma ORM 操作验证
- 缓存集成: Redis 缓存读写验证
- 外部服务调用: 爬虫服务、嵌入向量服务
- MCP 协议: Server/Client 通信

#### 4.2.3 测试数据策略
- 使用隔离的测试数据库 (PostgreSQL)
- 测试数据通过 seed 脚本初始化
- 每个测试用例独立的事务，测试完成后回滚
- 关键测试数据文件: `apps/web/scripts/create-test-user.ts`

#### 4.2.4 通过标准
- API 端点返回正确的 HTTP 状态码
- 响应体符合预期的 JSON Schema
- 数据库状态变更正确且一致
- 错误场景返回合适的错误信息和状态码
- 集成点超时和重试逻辑正常工作

### 4.3 系统测试 (System Testing)

#### 4.3.1 目标
在完整部署的系统上验证端到端功能、性能、安全性和兼容性。

#### 4.3.2 E2E 测试

**Playwright 测试 (`apps/web/tests/`)**
- 跨浏览器测试: Chromium, Firefox, WebKit
- 关键用户流程:
  - 用户注册 → 邮箱验证 → 登录 → 浏览技能 → 查看详情
  - 密码登录功能验证
  - OIDC 认证流程
  - 国际化切换
  - A2A 协议交互

**Cypress 测试 (`apps/web/cypress/e2e/`)**
- 主要用户流程 E2E
- 搜索功能测试
- 技能浏览和过滤
- 错误处理场景

#### 4.3.3 执行命令

```bash
# Playwright (apps/web)
npx playwright test
npx playwright test --ui        # UI 模式调试
npx playwright test --headed    # 显示浏览器

# Cypress (apps/web)
npx cypress run                 # 无头模式
npx cypress open                # 交互模式
```

#### 4.3.4 安全测试

| 检查项 | 方法 | 工具 |
|--------|------|------|
| SQL 注入 | 输入特殊字符测试 API | 手动 |
| XSS 攻击 | 脚本注入测试 | 手动 |
| CSRF 防护 | 跨站请求伪造测试 | 手动 |
| 认证绕过 | 未授权访问受保护资源 | 手动 |
| Rate Limiting | 高频请求测试 | 手动 |
| JWT/ Session 安全 | Token 篡改、过期测试 | 手动 |
| 权限提升 | 低权限用户访问高权限接口 | 手动 |

#### 4.3.5 兼容性测试

| 浏览器 | 最低版本 | 测试重点 |
|--------|----------|----------|
| Chrome | 最新 2 个大版本 | 全部功能 |
| Firefox | 最新 2 个大版本 | 核心功能 |
| Safari | 最新 2 个大版本 | 核心功能 |
| Edge | 最新版本 | 核心功能 |

### 4.4 用户验收测试 (UAT)

#### 4.4.1 目标
由利益相关者和最终用户验证系统是否满足业务需求，确认系统可以投入生产使用。

#### 4.4.2 参与角色

| 角色 | 职责 | 人数 |
|------|------|------|
| 产品经理 | 验证功能与需求一致 | 1 |
| 技术负责人 | 验证技术架构和性能 | 1 |
| QA 工程师 | 引导测试流程、记录问题 | 1 |
| 最终用户代表 | 执行实际使用场景测试 | 2-3 |
| DevOps 工程师 | 验证部署和运维流程 | 1 |

#### 4.4.3 UAT 测试场景

| 场景 ID | 场景描述 | 预期结果 |
|---------|----------|----------|
| UAT-01 | 新用户注册并完成邮箱验证 | 成功注册并登录 |
| UAT-02 | 用户浏览和搜索技能 | 搜索结果准确、页面加载流畅 |
| UAT-03 | 开发者发布新技能 | 技能成功发布并可见 |
| UAT-04 | 管理员审核并发布技能 | 审核流程正常、技能状态正确更新 |
| UAT-05 | 用户切换界面语言 | 所有界面正确切换 |
| UAT-06 | 安装并使用 Search SDK | SDK 成功集成并返回正确结果 |
| UAT-07 | 嵌入 Widget 到第三方页面 | Widget 正常渲染和交互 |
| UAT-08 | 命名空间团队协作 | 成员添加和权限正确 |
| UAT-09 | 密码重置流程 | 成功重置密码并登录 |
| UAT-10 | 管理后台数据分析 | 数据正确展示 |

#### 4.4.4 UAT 通过标准
- 所有 P0 场景 100% 通过
- P1 场景通过率 ≥ 90%
- 无阻塞性问题 (Severity = Critical/Blocker)

---

## 5. 测试环境配置

### 5.1 环境架构

```
┌─────────────────────────────────────────────────────────┐
│                    开发测试环境 (Local)                    │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Next.js  │  │PostgreSQL│  │  Redis   │  │  MinIO │  │
│  │ :3000    │  │ :5432    │  │ :6379    │  │ :9000  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 5.2 环境变量配置

**测试环境变量文件**: `apps/web/.env.test` (基于 `.env.example`)

```env
# 数据库
DATABASE_URL=postgresql://test:test@localhost:5432/skillhub_test
REDIS_URL=redis://localhost:6379/1

# 认证
NEXTAUTH_SECRET=test-secret-key-for-testing-only
NEXTAUTH_URL=http://localhost:3000

# OIDC
OIDC_ISSUER=http://localhost:3000
OIDC_CLIENT_ID=test-client-id
OIDC_CLIENT_SECRET=test-client-secret

# API 密钥
ADMIN_API_KEY=test-admin-api-key
CRAWLER_API_KEY=test-crawler-api-key

# 其他
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=test
```

### 5.3 环境准备步骤

```bash
# 1. 安装项目依赖
cd apps/web
npm ci

# 2. 创建测试数据库
psql -U postgres -c "CREATE DATABASE skillhub_test;"

# 3. 运行数据库迁移
npx prisma migrate deploy

# 4. 初始化测试数据
npx tsx scripts/create-test-user.ts

# 5. 验证环境
npx tsx scripts/check-db.ts

# 6. 确认 Jest 配置正确
cat jest.config.ts
```

### 5.4 环境隔离要求

| 资源 | 生产环境 | 测试环境 | 隔离方式 |
|------|----------|----------|----------|
| 数据库 | `skillhub_prod` | `skillhub_test` | 独立数据库名 |
| Redis | 默认 DB 0 | DB 1 | 独立 DB 编号 |
| 文件存储 | 生产 Bucket | 本地临时目录 | 独立路径 |
| 第三方 API | 正式密钥 | Mock/Test 密钥 | 环境变量切换 |

---

## 6. 测试数据管理

### 6.1 数据隔离策略

- **单元测试**: 使用 Jest mock 对象完全隔离，不触碰真实数据库
- **集成测试**: 使用独立测试数据库 `skillhub_test`，每个测试用例通过事务回滚隔离
- **E2E 测试**: 使用独立测试数据库，通过预设 seed 数据确保可重复性
- **测试数据生命周期**: Setup → Execute → Verify → Cleanup

### 6.2 种子数据 (Seed Data)

```typescript
// prisma/seed.ts (计划创建)
const seedData = {
  users: [
    { id: 'test-user-1', email: 'test@skillhub.dev', role: 'USER' },
    { id: 'test-admin-1', email: 'admin@skillhub.dev', role: 'ADMIN' },
  ],
  skills: [
    { id: 'test-skill-1', name: 'Test Skill', slug: 'test-skill' },
    { id: 'test-skill-2', name: 'Sample Skill', slug: 'sample-skill' },
  ],
  namespaces: [
    { id: 'test-ns-1', slug: 'test-team', name: 'Test Team' },
  ],
};
```

### 6.3 Mock 数据策略

| 服务 | Mock 方法 | Mock 文件 |
|------|-----------|-----------|
| Prisma (DB) | `jest.mock('@/lib/prisma')` | `jest.setup.ts` |
| SearchService | `jest.mock('@/lib/search/SearchService')` | `jest.setup.ts` |
| Next.js Router | `jest.mock('next/navigation')` | `jest.setup.ts` |
| 外部 HTTP 服务 | MSW (Mock Service Worker) | 各测试文件内 |
| Redis 缓存 | 内存 Mock | `lib/cache/__mocks__/` |
| 文件系统 | `mock-fs` | 各测试文件内 |

---

## 7. 测试用例规范

### 7.1 测试用例模板

```typescript
/**
 * Test Case: TC-[模块]-[编号]
 * 标题: [测试用例简短描述]
 * 优先级: P0/P1/P2
 * 测试类型: 单元/集成/系统/UAT
 * 
 * 前置条件:
 * - 条件 1
 * - 条件 2
 * 
 * 测试步骤:
 * 1. 步骤 1
 * 2. 步骤 2
 * 3. 步骤 3
 * 
 * 预期结果:
 * - 结果 1
 * - 结果 2
 * 
 * 实际结果: [执行后填写]
 * 状态: 通过/失败/跳过
 * 备注: [任何额外说明]
 */
```

### 7.2 Jest 测试命名规范

```typescript
describe('ModuleName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange - 准备测试数据
      // Act - 执行被测方法
      // Assert - 验证结果
    });
  });
});
```

### 7.3 测试用例索引

| 模块 | 测试文件 | 用例数 | 覆盖函数 |
|------|----------|--------|----------|
| API-Search | `app/api/__tests__/search.test.ts` | 20 | GET /api/search |
| API-Skills | `app/api/__tests__/skills.test.ts` | 8 | GET /api/skills |
| API-Reviews | `app/api/__tests__/reviews.test.ts` | 10 | CRUD /api/reviews |
| API-Analytics | `app/api/__tests__/analytics.test.ts` | 6 | GET /api/analytics |
| API-Namespaces | `app/api/__tests__/namespaces.test.ts` | 11 | CRUD /api/namespaces |
| API-Popular | `app/api/__tests__/popular.test.ts` | 13 | GET /api/search/popular |
| API-Suggestions | `app/api/__tests__/suggestions.test.ts` | 14 | GET /api/search/suggestions |
| MCP-Client | `app/api/mcp/__tests__/client.test.ts` | 5 (1 skip) | MCP Client |
| MCP-Tools | `app/api/mcp/__tests__/tools.test.ts` | 1 | MCP Tools |
| V2-Discovery | `app/api/v2/__tests__/discovery.test.ts` | 12 | V2 Discovery |
| SearchService | `lib/search/__tests__/SearchService.test.ts` | 19 | SearchService |
| FormValidation | `lib/__tests__/form-validation.test.ts` | 21 | form-validation |
| SkillMdParser | `lib/skills/__tests__/skill-md-parser.test.ts` | 20 | skill-md-parser |
| SkillScanner | `lib/skills/__tests__/skill-resource-scanner.test.ts` | 22 | skill-resource-scanner |
| TrustScore | `lib/services/__tests__/trust-score.test.ts` | 23 | TrustScoreService |
| A2A-Schemas | `lib/a2a/__tests__/schemas.test.ts` | 20 | A2A schemas |
| A2A-Store | `lib/a2a/__tests__/task-store.test.ts` | 14 | TaskStore |
| I18n-Config | `i18n/__tests__/config.test.ts` | 17 | i18n config |
| UI-Pagination | `components/ui/__tests__/Pagination.test.tsx` | 20 | Pagination |
| UI-SearchBox | `components/ui/__tests__/SearchBox.test.tsx` | 3 | SearchBox |
| UI-Alert | `components/ui/__tests__/Alert.test.tsx` | 9 | Alert |
| UI-ErrorBoundary | `components/ui/__tests__/ErrorBoundary.test.tsx` | 8 | ErrorBoundary |
| UI-LoadingSpinner | `components/ui/__tests__/LoadingSpinner.test.tsx` | 6 | LoadingSpinner |
| UI-PageLoader | `components/ui/__tests__/PageLoader.test.tsx` | 6 | PageLoader |
| UI-SkeletonLoader | `components/ui/__tests__/SkeletonLoader.test.tsx` | 39 | SkeletonLoader |
| UI-SearchHistory | `components/ui/__tests__/SearchHistory.test.tsx` | 19 | SearchHistory |
| UI-AdvancedFilter | `components/ui/__tests__/AdvancedFilterPanel.test.tsx` | 19 | AdvancedFilterPanel |
| **合计** | **27 个测试套件** | **385 (1 skip)** | **覆盖 14+ 个模块** |
| E2E-PasswordLogin | `tests/password-login.spec.ts` | - | 密码登录 |
| E2E-AuthCallback | `tests/auth-callback.test.ts` | - | OIDC 回调 |
| E2E-OIDCDiscovery | `tests/oidc-discovery.test.ts` | - | OIDC Discovery |
| E2E-OIDCRP | `tests/oidc-rp.test.ts` | - | OIDC RP |
| E2E-V3-i18nA2A | `tests/v3-i18n-a2a.test.ts` | - | i18n+A2A |
| E2E-Cypress-App | `cypress/e2e/app.cy.ts` | - | 应用流程 |
| E2E-Cypress-Login | `cypress/e2e/password-login.cy.ts` | - | 密码登录 |
| E2E-Cypress-Search | `cypress/e2e/search.cy.ts` | - | 搜索 |
| E2E-Cypress-Flow | `cypress/e2e/user-flow.cy.ts` | - | 用户流程 |
| deer-flow-Unit | `deer-flow/frontend/tests/unit/` | - | 核心逻辑 |
| deer-flow-E2E | `deer-flow/frontend/tests/e2e/` | - | 前端流程 |

---

## 8. 成功标准

### 8.1 质量门禁 (Quality Gates)

| 门禁 | 标准 | 阻断发布? |
|------|------|-----------|
| 单元测试通过率 | 100% | 是 |
| 单元测试覆盖率 | ≥ 80% lines, ≥ 75% branches | 是 |
| 集成测试通过率 | 100% | 是 |
| E2E 测试通过率 | 100% (P0), ≥ 90% (整体) | 是 |
| 安全扫描 | 无 Critical/High 漏洞 | 是 |
| 性能基准 | API P95 < 200ms | 否 (警告) |
| 代码规范 | ESLint 无 error | 是 |
| 类型检查 | TypeScript 无 error | 是 |

### 8.2 测试完成标准

- 所有计划的测试用例已执行
- 无 P0/P1 级别的未修复缺陷
- 所有已修复缺陷已验证关闭
- 测试报告已生成并评审
- 验收测试已完成并获得签署

### 8.3 缺陷严重等级定义

| 等级 | 定义 | 响应时间 | 修复时限 |
|------|------|----------|----------|
| Blocker | 阻塞核心业务流程，无法继续测试 | 立即 | 4 小时内 |
| Critical | 核心功能不可用，数据丢失或损坏 | 1 小时 | 24 小时内 |
| Major | 非核心功能异常，有变通方案 | 4 小时 | 48 小时内 |
| Minor | 界面问题或非功能性缺陷 | 24 小时 | 下个迭代 |
| Trivial | 拼写错误、样式微调等 | 72 小时 | 下个迭代 |

---

## 9. 测试执行计划

### 9.1 执行阶段

| 阶段 | 内容 | 时间 | 输出物 |
|------|------|------|--------|
| Phase 1 | 单元测试执行 + 覆盖率收集 | Day 1 | 单元测试报告 |
| Phase 2 | 集成测试执行 | Day 1-2 | 集成测试报告 |
| Phase 3 | 系统测试 (E2E + 安全 + 兼容) | Day 2-3 | 系统测试报告 |
| Phase 4 | UAT 验收测试 | Day 3-4 | UAT 报告 |
| Phase 5 | 缺陷修复 + 回归测试 | Day 4-5 | 回归测试报告 |
| Phase 6 | 验收评审 + 签署 | Day 5 | 验收报告 |

### 9.2 测试执行记录

每次测试执行后记录以下信息：

```markdown
## 测试执行记录

| 执行日期 | 测试层级 | 测试套件 | 总数 | 通过 | 失败 | 跳过 | 通过率 | 执行人 |
|----------|----------|----------|------|------|------|------|--------|--------|
| YYYY-MM-DD | 单元 | apps/web | N | N | N | N | XX% | [姓名] |
```

---

## 10. 缺陷管理流程

### 10.1 缺陷生命周期

```
发现缺陷 → 提交缺陷报告 → 评审确认 → 分配修复 → 修复完成 → 验证关闭
  ↑                                              │
  └─────────────── 验证不通过 ────────────────────┘
```

### 10.2 缺陷报告模板

```markdown
## 缺陷报告

- **缺陷 ID**: BUG-[YYYYMMDD]-[编号]
- **严重等级**: Blocker / Critical / Major / Minor / Trivial
- **模块**: [受影响模块]
- **测试环境**: [环境描述]
- **发现日期**: YYYY-MM-DD

### 描述
[清晰描述缺陷现象]

### 重现步骤
1. [步骤 1]
2. [步骤 2]
3. [步骤 3]

### 预期结果
[应该发生什么]

### 实际结果
[实际发生了什么]

### 附件
[截图/日志/视频链接]

### 状态
新建 / 已确认 / 修复中 / 已验证 / 关闭 / 重新打开
```

---

## 11. 项目验收流程

### 11.1 验收检查清单

#### 功能需求验收

| 检查项 | 需求 ID | 状态 | 验证方式 | 备注 |
|--------|---------|------|----------|------|
| 用户注册和登录 | FR-01 | ⬜ | 手动测试 | |
| 密码登录 | FR-02 | ⬜ | 自动+手动 | |
| OIDC 认证 | FR-03 | ⬜ | 自动+手动 | |
| 技能浏览 | FR-04 | ⬜ | 自动测试 | |
| 技能搜索 | FR-05 | ⬜ | 自动测试 | |
| 技能详情 | FR-06 | ⬜ | 自动测试 | |
| 技能发布 | FR-07 | ⬜ | 手动测试 | |
| 技能审核 | FR-08 | ⬜ | 手动测试 | |
| 命名空间管理 | FR-09 | ⬜ | 手动测试 | |
| 国际化支持 | FR-10 | ⬜ | 自动+手动 | |
| MCP 协议集成 | FR-11 | ⬜ | 自动+手动 | |
| A2A 协议集成 | FR-12 | ⬜ | 自动测试 | |
| Search SDK | FR-13 | ⬜ | 自动测试 | |
| Widget 嵌入 | FR-14 | ⬜ | 手动测试 | |
| 管理后台 | FR-15 | ⬜ | 手动测试 | |
| 审计日志 | FR-16 | ⬜ | 手动测试 | |
| API Keys 管理 | FR-17 | ⬜ | 手动测试 | |
| 信任评分 | FR-18 | ⬜ | 自动测试 | |

#### 非功能需求验收

| 检查项 | 需求 ID | 状态 | 验证方式 | 备注 |
|--------|---------|------|----------|------|
| 页面加载时间 < 3s | NFR-01 | ⬜ | 性能测试 | |
| API P95 < 200ms | NFR-02 | ⬜ | 性能测试 | |
| 多浏览器兼容 | NFR-03 | ⬜ | 自动测试 | |
| 响应式布局 | NFR-04 | ⬜ | 手动测试 | |
| 认证安全 | NFR-05 | ⬜ | 安全测试 | |
| XSS 防护 | NFR-06 | ⬜ | 安全测试 | |
| CSRF 防护 | NFR-07 | ⬜ | 安全测试 | |
| Rate Limiting | NFR-08 | ⬜ | 安全测试 | |
| 数据备份恢复 | NFR-09 | ⬜ | 手动测试 | |
| 错误处理友好 | NFR-10 | ⬜ | 手动测试 | |

### 11.2 验收评审会议

**参会人员:**
- 项目经理
- 产品经理
- 技术负责人
- QA 负责人
- 客户/利益相关者代表

**会议议程:**
1. 测试结果综述
2. 未修复缺陷评审
3. 验收检查清单逐项确认
4. 风险与缓解措施
5. 发布决策

### 11.3 验收签署

```markdown
## 项目验收签署页

**项目名称**: SkillHub v3.0
**验收日期**: YYYY-MM-DD

### 验收结论
- [ ] 通过 - 满足所有验收标准，同意发布
- [ ] 有条件通过 - 以下问题需在发布前解决：[列表]
- [ ] 不通过 - 未满足验收标准

### 签署人

| 角色 | 姓名 | 签名 | 日期 |
|------|------|------|------|
| 项目经理 | __________ | __________ | ______ |
| 产品经理 | __________ | __________ | ______ |
| 技术负责人 | __________ | __________ | ______ |
| QA 负责人 | __________ | __________ | ______ |
| 客户代表 | __________ | __________ | ______ |
```

---

## 12. 附录

### A. 测试工具与命令速查

```bash
# ──────────────────────────────────────────────
# 单元测试
# ──────────────────────────────────────────────
cd apps/web
npm test                        # 运行所有单元测试
npm run test -- --coverage      # 带覆盖率报告
npm run test -- --watch         # 监听模式
npm run test -- --verbose       # 详细输出

# ──────────────────────────────────────────────
# E2E 测试
# ──────────────────────────────────────────────
# Playwright
npx playwright test             # 运行所有 E2E
npx playwright test --ui        # UI 交互模式
npx playwright show-report      # 查看报告

# Cypress
npx cypress run                 # 无头模式
npx cypress open                # 交互模式

# ──────────────────────────────────────────────
# 数据库
# ──────────────────────────────────────────────
npx prisma migrate deploy       # 部署迁移
npx prisma db seed              # 填充种子数据
npx tsx scripts/check-db.ts     # 验证数据库状态

# ──────────────────────────────────────────────
# 代码质量
# ──────────────────────────────────────────────
npx eslint .                    # ESLint 检查
npx tsc --noEmit               # TypeScript 类型检查
```

### B. 参考资料

- [Jest 文档](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Playwright 文档](https://playwright.dev/docs/intro)
- [Cypress 文档](https://docs.cypress.io/guides/overview/why-cypress)
- [Vitest 文档](https://vitest.dev/guide/)
- [Next.js 测试指南](https://nextjs.org/docs/testing)

### C. 修订历史

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|----------|--------|
| v1.0 | 2026-06-25 | 初始版本 | QA Team |