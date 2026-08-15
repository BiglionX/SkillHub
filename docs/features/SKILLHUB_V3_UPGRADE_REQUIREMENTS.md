# SkillHub v3.0 升级需求文档（PRD）

> **文档版本**: v1.0
> **创建日期**: 2026-06-24
> **目标版本**: SkillHub v3.0（GA: 2026 Q4）
> **依据**: 2025-12 Agent Skills 开放标准 + MCP 协议 + DeerFlow 2.0 + 当前项目 v2.0 Beta
> **状态**: 待用户审核

---

## 一、项目背景

### 1.1 战略背景

自 2025 年 10 月 Anthropic 发布 Agent Skills 概念以来，AI Agent 生态发生了根本性变化：

- **2025-11**：MCP（Model Context Protocol）发布，成为 Agent ↔ 工具/数据的标准协议
- **2025-12-18**：Agent Skills 正式成为 **开放标准**（[agentskills.io](https://agentskills.io)），跨 40+ Agent 工具可移植
- **2025-12**：MCP 捐赠给 Agentic AI Foundation，进入中立治理阶段
- **2026-02**：字节跳动 DeerFlow 2.0 发布（74K+ Star），确立 SuperAgent Harness 范式
- **2026-03**：OpenAI 官方 MCP Registry 上线（[registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)）
- **2026-04**：Claude Opus 4.8 / GPT-5.5 发布，Agent 长任务能力突破
- **2026-06**：Agent Skills 已被 **40+ 客户端**原生支持（Claude Code / Cursor / Codex / Gemini CLI / Roo Code / Junie / TRAE / Spring AI / VS Code 等）

**SkillHub 当前 v2.0-beta 状态**：已完成自托管 + 爬虫搜索 + AI 集成（OpenAPI 3.0）+ 知识片段体系，但 **未跟进上述开放生态标准**，处于战略滞后状态。

### 1.2 升级必要性

| 现状 | 风险 | 机会 |
|---|---|---|
| 自有 SKILL 格式未对齐 agentskills.io 标准 | Skills 只能被 SkillHub 自有渠道消费 | 一份资源，40+ Agent 工具复用 |
| 集成走 OpenAPI 而非 MCP | 错失 MCP Server Registry 曝光 | 官方 Registry 收录后获得百万开发者曝光 |
| Next.js 14 + React 18 | 落后一代，错失 Server Components/Server Actions | 性能提升 + DX 改善 |
| 无 DeerFlow 2.0 / 国产 Agent 集成 | 失去国内 SuperAgent 生态入口 | 中文化优势 + DeerFlow 协议对接 |
| 无 Skill 可观测性 | Skill 被调用时无 Tracing | Langfuse/Phoenix 集成价值 |
| 无 Skill 在线预览 | 用户只能下载后才知道是否有用 | 提升转化率 |

### 1.3 升级目标

**总目标**：将 SkillHub 升级为 **"AI Agent Skills 的 GitHub"** —— 唯一同时支持"自托管 + 开放标准 + MCP 集成 + Skills 爬虫"的中立平台。

**关键结果（OKR）**：
- **O1**: 成为 agentskills.io 兼容的 Skills 注册中心
- **O2**: 成为 MCP Server + MCP Client 双角色枢纽
- **O3**: 接入 DeerFlow 2.0 / Cursor / Claude Code 等 10+ Agent 平台
- **O4**: 完成框架现代化（Next.js 15 + React 19）

---

## 二、需求范围

### 2.1 功能范围（In Scope）

| 模块 | 内容 | 优先级 |
|---|---|---|
| **F1: Agent Skills 标准兼容** | SKILL.md 导入导出 / 渐进式披露 / 资源管理 | P0 |
| **F2: MCP Server** | SkillHub 作为 MCP Server 暴露工具集 | P0 |
| **F3: MCP Client** | SkillHub 消费 MCP 工具 | P0 |
| **F4: 官方 MCP Registry 收录** | 提交 server.json + 元数据 | P0 |
| **F5: 框架现代化** | Next.js 15 + React 19 + Server Actions | P1 |
| **F6: DeerFlow 2.0 集成** | find-skills 协议对接 + 中文优先索引 | P2 |
| **F7: 国产 Agent 平台集成** | Coze / TRAE / Dify / 通义 / 文心 | P2 |
| **F8: Skill 可观测性** | Langfuse 集成 + Tracing | P2 |
| **F9: Skill 在线预览** | Web Container 沙箱 + SKILL.md 渲染 | P2 |
| **F10: Skill Trust Score** | 健康度评分 + Verified 徽章 | P2 |

### 2.2 非范围（Out of Scope）

- ❌ 完整重写为 LangGraph/LangChain 框架（保持 Next.js）
- ❌ 迁移到新数据库（保持 PostgreSQL + Prisma）
- ❌ 完全重构 UI（保留 MUI，仅增量优化）
- ❌ 商业化改造（保持 Apache 2.0 + 现有 Premium 模型）

---

## 三、详细功能需求

### F1: Agent Skills 开放标准兼容（P0，3 周）

#### F1.1 背景

Anthropic 主导的 [Agent Skills 开放标准](https://agentskills.io/specification) 已成为行业事实标准。一个 Skill 是包含 `SKILL.md` 的文件夹：

```
my-skill/
├── SKILL.md          # 必需：YAML frontmatter (name + description) + Markdown 指令
├── scripts/          # 可选：可执行代码
├── references/       # 可选：参考文档
├── assets/           # 可选：模板、资源
└── ...
```

**渐进式披露（Progressive Disclosure）**：Agent 启动时仅加载 name + description，任务匹配时才加载完整 SKILL.md，从而支持海量 Skills。

#### F1.2 用户故事

- **US-F1-01**：作为 Skill 作者，我希望能够从 GitHub 仓库一键导入 SKILL.md，自动提取 name、description、scripts、references 到 SkillHub
- **US-F1-02**：作为 SkillHub 用户，我希望能够浏览 Skill 时看到"可在哪些 Agent 中使用"的徽章
- **US-F1-03**：作为 Agent 开发者，我希望通过 `GET /api/v2/skills/{slug}/skill.md` 直接获取符合开放标准的 SKILL.md
- **US-F1-04**：作为 SkillHub 用户，我希望 Skill 详情页能像 Markdown 阅读器一样渲染 SKILL.md，并显示关联的 scripts/references/assets 文件树
- **US-F1-05**：作为 CLI 用户，我希望使用 `skillhub skill import <owner/repo@skill-name>` 和 `skillhub skill export <slug>` 命令

#### F1.3 数据模型变更

在 `skills` 表中新增字段：

```prisma
model Skill {
  // ... 现有字段
  
  // === 新增：Agent Skills 开放标准兼容 ===
  skillMdContent      String?         // SKILL.md 完整内容
  skillMdFrontmatter  Json?           // 解析后的 YAML frontmatter
  
  // 渐进式披露元数据
  standardName        String?         // 标准 name（与 frontmatter 一致）
  standardDescription String? @db.Text // 标准 description（与 frontmatter 一致）
  discoveryKeywords   String[]        // 用于 Agent 发现的关键词
  
  // 资源清单
  resources           SkillResource[] // scripts / references / assets
  
  // 兼容标记
  agentSkillsVersion  String?         // 兼容的 Agent Skills 协议版本（如 "1.0"）
  
  // 时间戳
  lastAnalyzedAt      DateTime?       // 最近一次 SKILL.md 分析时间
}

model SkillResource {
  id          String   @id @default(cuid())
  skillId     String
  skill       Skill    @relation(fields: [skillId], references: [id], onDelete: Cascade)
  
  type        String   // "script" | "reference" | "asset" | "other"
  path        String   // 相对路径，如 "scripts/check.sh"
  storageKey  String   // 对象存储 key
  sizeBytes   Int
  mimeType    String?
  checksum    String?  // SHA-256
  
  createdAt   DateTime @default(now())
  
  @@unique([skillId, path])
  @@index([skillId, type])
}
```

#### F1.4 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v2/skills/{slug}/skill.md` | 返回标准 SKILL.md（text/markdown） |
| GET | `/api/v2/skills/{slug}/files/{path}` | 返回资源文件（按渐进式披露） |
| GET | `/api/v2/discovery` | 返回所有 Skill 的 name + description（轻量发现端点） |
| POST | `/api/v2/skills/import` | 从 GitHub URL 导入 SKILL.md |
| GET | `/api/v2/skills/{slug}/export` | 导出符合标准的 .zip 包 |

#### F1.5 验收标准

- [ ] `skillhub skill import https://github.com/anthropics/skills/tree/main/pdf` 成功导入并填充元数据
- [ ] `curl https://skillhub.proclaw.cc/api/v2/skills/pdf/skill.md` 返回标准 SKILL.md
- [ ] Skill 详情页正确渲染 SKILL.md（带代码高亮、TOC）
- [ ] 资源树显示 `scripts/`、`references/`、`assets/` 目录
- [ ] 数据库迁移无破坏性（向后兼容现有 Skill 数据）
- [ ] 单元测试覆盖率 ≥ 85%

---

### F2: MCP Server 集成（P0，2 周）

#### F2.1 背景

[Model Context Protocol（MCP）](https://modelcontextprotocol.io/) 是 Anthropic 于 2025-11 发布的开放协议，用于 AI Agent ↔ 工具/数据互通。2025-12 捐赠给 Agentic AI Foundation。官方 Registry（[registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)）已上线，收录 7000+ Server。

#### F2.2 用户故事

- **US-F2-01**：作为 Claude Code / Cursor / Codex 用户，我希望在配置 MCP 时直接添加 SkillHub，从而搜索/安装/发布 Skills
- **US-F2-02**：作为 SkillHub 管理员，我希望 SkillHub MCP Server 在官方 Registry 上被收录
- **US-F2-03**：作为 Skill 作者，我希望通过 MCP 工具 `skillhub_publish_skill` 在 Agent 内部完成发布

#### F2.3 MCP 工具定义

```typescript
// SkillHub MCP Server 暴露的工具

{
  name: "skillhub_search",
  description: "搜索 AI Agent Skills。返回匹配的 Skills 列表，包含 name、description、downloadCount、trustScore。",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词或自然语言描述" },
      type: { type: "string", enum: ["prompt", "knowledge", "rule", "skill_pack"], description: "技能类型过滤" },
      industryTags: { type: "array", items: { type: "string" }, description: "行业标签过滤" },
      limit: { type: "number", default: 10, maximum: 50 },
      offset: { type: "number", default: 0 }
    },
    required: ["query"]
  }
}

{
  name: "skillhub_get_skill",
  description: "获取 Skill 详情，包括 SKILL.md、scripts、references、assets 资源清单。",
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Skill 标识" },
      includeResources: { type: "boolean", default: true }
    },
    required: ["slug"]
  }
}

{
  name: "skillhub_install_skill",
  description: "生成 Skill 安装命令或返回 SKILL.md 内容，供调用方 Agent 使用。",
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string" },
      targetPlatform: { type: "string", enum: ["claude-code", "cursor", "codex", "gemini-cli", "roo-code", "deerflow"] }
    },
    required: ["slug"]
  }
}

{
  name: "skillhub_publish_skill",
  description: "发布新 Skill 到 SkillHub。需要 OAuth 认证。",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      skillMdContent: { type: "string" },
      resources: { type: "array", items: { type: "object" } },
      namespace: { type: "string" },
      industryTags: { type: "array", items: { type: "string" } }
    },
    required: ["name", "description", "skillMdContent"]
  }
}

{
  name: "skillhub_list_skills_by_platform",
  description: "列出某 Agent 平台可用的 Skills（如 Cursor / Claude Code）。",
  inputSchema: {
    type: "object",
    properties: {
      platform: { type: "string", enum: ["claude-code", "cursor", "codex", "gemini-cli", "roo-code", "deerflow", "all"] },
      limit: { type: "number", default: 20 }
    },
    required: ["platform"]
  }
}
```

#### F2.4 端点与协议

- **传输方式**：Streamable HTTP（推荐）+ stdio（CLI 子进程）
- **端点**：`POST https://skillhub.proclaw.cc/api/mcp`
- **协议版本**：MCP 2025-11-25（最新）
- **认证**：Bearer Token（API Key）+ OAuth 2.1（发布操作）

#### F2.5 server.json manifest

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/server.schema.json",
  "name": "io.github.biglionx/skillhub",
  "description": "SkillHub - AI Agent Skills 注册中心。搜索、安装、发布符合 Agent Skills 开放标准的 Skills。",
  "repository": {
    "url": "https://github.com/BigLionX/SkillHub",
    "source": "github"
  },
  "version": "3.0.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@skillhub/mcp-server",
      "version": "3.0.0",
      "transport": {
        "type": "stdio"
      }
    },
    {
      "registryType": "mcpb",
      "identifier": "skillhub",
      "version": "3.0.0",
      "transport": {
        "type": "streamable-http",
        "url": "https://skillhub.proclaw.cc/api/mcp"
      }
    }
  ],
  "tools": [
    { "name": "skillhub_search" },
    { "name": "skillhub_get_skill" },
    { "name": "skillhub_install_skill" },
    { "name": "skillhub_publish_skill" },
    { "name": "skillhub_list_skills_by_platform" }
  ]
}
```

#### F2.6 验收标准

- [ ] 在 Claude Desktop 配置中可添加 SkillHub MCP Server
- [ ] 调用 `skillhub_search("pdf generation")` 返回 ≥3 条结果
- [ ] 调用 `skillhub_get_skill({slug: "pdf"})` 返回完整 SKILL.md
- [ ] server.json 通过官方 MCP Registry 校验并被收录
- [ ] MCP Server 端点 P95 响应时间 < 500ms
- [ ] 单元测试覆盖所有 5 个工具

---

### F3: MCP Client 集成（P0，1 周）

#### F3.1 用户故事

- **US-F3-01**：作为 SkillHub 用户，我希望在 Skill 详情页看到"已验证可工作"的 MCP 工具调用结果
- **US-F3-02**：作为管理员，我希望在 Skill 发布前自动调用 GitHub MCP Server 验证仓库真实性

#### F3.2 实现要点

- 集成 `@modelcontextprotocol/client` 到 `apps/web/lib/mcp/`
- 提供 MCP Server 连接管理（`McpConnectionPool`）
- 实现"验证工作流"：发布前调用 GitHub MCP 验证仓库存在且 SKILL.md 可读

#### F3.3 验收标准

- [ ] 发布 Skill 时自动通过 MCP 验证仓库（≥3 个工具调用）
- [ ] Skill 详情页显示 MCP 验证徽章（如 "✓ Verified by GitHub MCP"）
- [ ] MCP Client 连接池支持 100 并发

---

### F4: 官方 MCP Registry 收录（P0，1 周）

#### F4.1 流程

1. 实现 MCP Server 自动化测试
2. 编写 `server.json` 与 README
3. 提交 PR 到 [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)
4. 通过 CI 检查（Schema 验证 + 启动测试）
5. 被合并后即在官方 Registry 显示

#### F4.2 验收标准

- [ ] PR 合并到 modelcontextprotocol/registry 主分支
- [ ] 在 https://registry.modelcontextprotocol.io 可搜索到 `skillhub`
- [ ] "Install with Claude Desktop" 一键命令可用

---

### F5: 框架现代化 - Next.js 15 + React 19（P1，3 周）

#### F5.1 升级清单

| 包 | 当前 | 升级到 | 影响 |
|---|---|---|---|
| `next` | ^14.2.35 | ^15.x | Server Actions 稳定、Cache 默认行为变更 |
| `react` | ^18.3.1 | ^19.x | useActionState、useFormStatus、use() |
| `react-dom` | ^18.3.1 | ^19.x | 同上 |
| `@types/react` | ^18.3.0 | ^19.x | 类型变更 |
| `prisma` | ^5.22.0 | ^6.x | 新版本特性 |

#### F5.2 重点改造

1. **Server Components 化 Skills 列表页**（`apps/web/app/skills/page.tsx`）
   - 列表数据服务端获取，减少客户端 JS 体积
   - 利用 `unstable_cache` 缓存搜索结果

2. **Server Actions 替代 API Routes 表单**
   - Skill 发布表单改用 Server Action
   - 评论、评分提交改用 Server Action
   - 表单库仍保留 react-hook-form 作为客户端校验

3. **`useActionState` 优化发布流程**
   - 渐进式提交状态展示
   - 失败重试更优雅

#### F5.3 验收标准

- [ ] `npm run build` 成功，无 TypeScript 错误
- [ ] Skills 列表页 LCP < 1.5s（Lighthouse）
- [ ] 现有 97 个测试全部通过
- [ ] 新增 Server Action 测试 ≥ 10 个

---

### F6: DeerFlow 2.0 集成（P2，1 周）

#### F6.1 背景

字节跳动 DeerFlow 2.0（74K+ Star）于 2026-02 发布，定位"SuperAgent Harness"，基于 LangGraph & LangChain。其标准 Skill 发现协议见 `deer-flow/skills/public/find-skills/SKILL.md`。

#### F6.2 用户故事

- **US-F6-01**：作为 DeerFlow 用户，我希望通过 `npx skills find` 命令能直接搜索 SkillHub
- **US-F6-02**：作为 DeerFlow 用户，我希望通过 `install-skill.sh biglionx/skillhub@<skill>` 一键安装 SkillHub Skill

#### F6.3 集成实现

- 提供 `GET /api/deerflow/skills.json`（deerflow 标准发现端点）
- 提供 `GET /api/deerflow/install/{slug}` 返回安装脚本
- 在 Skill 详情页标注"DeerFlow Compatible"徽章
- 中文 Skill 在中文 DeerFlow 用户搜索时优先

#### F6.4 验收标准

- [ ] DeerFlow 2.0 可发现 SkillHub Skills
- [ ] 至少 5 个示例 Skill 可被 DeerFlow 安装并运行
- [ ] 集成文档发布到 docs/integration/

---

### F7: 国产 Agent 平台集成（P2，1 周）

#### F7.1 平台清单

| 平台 | 集成方式 | 状态 |
|---|---|---|
| **Coze**（字节跳动） | 官方插件协议 | 新增 |
| **TRAE**（字节跳动 IDE） | Skills 目录 | 新增 |
| **Dify** | 现有 v1.0 → 升级到 v1.10 + Skill 插件 | 升级 |
| **纳米 AI** | MCP Server 形式 | 新增 |
| **通义 / 文心** | Skill Card API | 新增 |

#### F7.2 验收标准

- [ ] Coze 商店可搜索 SkillHub Skill
- [ ] TRAE IDE 可导入 SkillHub Skills
- [ ] Dify v1.10 集成测试通过

---

### F8: Skill 可观测性 - Langfuse（P2，1 周）

#### F8.1 用户故事

- **US-F8-01**：作为 Skill 作者，我希望看到 Skill 被调用次数、成功率、平均耗时
- **US-F8-02**：作为管理员，我希望追踪 Skill 端到端调用链

#### F8.2 实现

- 部署 Langfuse（Docker 或 Cloud）
- SkillHub API 中加入 Langfuse SDK 埋点
- Skill 调用 `skillhub_search`、`skillhub_get_skill` 时上报
- 在 Skill 详情页嵌入 Langfuse Trace 链接

#### F8.3 验收标准

- [ ] Langfuse 部署并接入 SkillHub
- [ ] Skill 调用可被追踪到 Trace 级别
- [ ] Skill 详情页显示近 30 天调用统计

---

### F9: Skill 在线预览（P2，1 周）

#### F9.1 用户故事

- **US-F9-01**：作为用户，我希望在下载 Skill 之前能预览其 SKILL.md 的渲染效果
- **US-F9-02**：作为用户，我希望看到"在 Claude Code 中运行"的一键安装按钮

#### F9.2 实现

- Skill 详情页增强：
  - Tabs：README / SKILL.md / Scripts / Changelog
  - SKILL.md 渲染（react-markdown 已具备 ✅）
  - 代码高亮、目录（TOC）支持
  - "在 X Agent 中安装" 一键复制命令

#### F9.3 验收标准

- [ ] Skill 详情页支持 SKILL.md 渲染
- [ ] 提供 6+ Agent 平台的一键安装按钮
- [ ] 资源树可展开/折叠

---

### F10: Skill Trust Score（P2，1 周）

#### F10.1 评分维度

| 维度 | 权重 | 说明 |
|---|---|---|
| 下载量 | 25% | 最近 30 天下载数 |
| Star 数 | 15% | 源仓库 Star |
| 更新频率 | 20% | 最近更新时间距今天数 |
| 社区评分 | 20% | 用户评分（1-5） |
| 兼容性 | 10% | 是否通过 MCP/Agent Skills 标准认证 |
| 安全扫描 | 10% | 是否通过安全检查 |

#### F10.2 验收标准

- [ ] Trust Score 计算逻辑单元测试覆盖
- [ ] Skill 列表页可按 Trust Score 排序
- [ ] Verified 徽章显示在 ≥ 80 分 Skill 上

---

## 四、非功能需求

### 4.1 性能

| 指标 | 目标 |
|---|---|
| MCP Server P95 响应 | < 500ms |
| 搜索结果 P95 | < 800ms |
| Skills 列表页 LCP | < 1.5s |
| SKILL.md 渲染 | < 200ms |
| 并发 MCP 连接 | ≥ 100 |

### 4.2 安全

- MCP Server 所有写操作必须 OAuth 认证
- SKILL.md 上传执行静态安全扫描（不执行）
- 资源文件类型白名单（防止恶意脚本上传）
- 速率限制：未认证 60 次/分钟，认证 600 次/分钟

### 4.3 可观测性

- 集成 OpenTelemetry（Langfuse 后端）
- 关键路径埋点：搜索 / 安装 / 发布 / MCP 调用

### 4.4 兼容性

- **向后兼容**：现有 OpenAPI 3.0 接口不破坏
- **数据库迁移**：所有 schema 变更均可回滚
- **API 版本**：新功能走 `/api/v2/*`，旧 API 保留

### 4.5 国际化

- 现有 `locale` 字段保留
- 中英双语文档
- 中文 Skill 优先索引（中文用户）

---

## 五、依赖与风险

### 5.1 新增依赖

| 包 | 用途 | 许可 |
|---|---|---|
| `@modelcontextprotocol/sdk` | MCP Server/Client | MIT |
| `@modelcontextprotocol/registry` | Registry 提交工具 | MIT |
| `langfuse` | 可观测性 | MIT |
| `gray-matter` | YAML frontmatter 解析 | MIT |

### 5.2 风险评估

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| Agent Skills 标准继续演进 | 中 | 字段设计宽松，支持自定义 frontmatter |
| Next.js 15 升级破坏现有功能 | 高 | 在 feature 分支独立升级，保留回滚 |
| MCP 协议版本变更 | 中 | 锁定到 MCP 2025-11-25，监控 roadmap |
| DeerFlow 协议变动 | 低 | 仅对接 find-skills 公开接口 |
| Langfuse 部署复杂度 | 低 | 使用 Langfuse Cloud 兜底 |

---

## 六、验收与发布标准

### 6.1 v3.0 GA 发布标准

- [ ] F1-F5 全部完成（标准兼容 + MCP + 框架升级）
- [ ] 单元测试覆盖率 ≥ 85%
- [ ] E2E 测试覆盖 MCP 调用链
- [ ] 官方 MCP Registry 收录
- [ ] 文档完整（API、用户、开发者）
- [ ] CHANGELOG 更新
- [ ] Docker 镜像构建成功

### 6.2 灰度发布

- **Week 10**：内测（团队内部）
- **Week 11**：小流量（10% 用户开启 MCP Server）
- **Week 12**：GA 全量

---

## 七、附录

### 7.1 参考资料

- [Agent Skills 开放标准](https://agentskills.io)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Official MCP Registry](https://registry.modelcontextprotocol.io)
- [skills.sh Skills 排行榜](https://skills.sh)
- [DeerFlow 2.0](https://github.com/bytedance/deer-flow)
- [Anthropic Agent Skills 公告](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

### 7.2 术语表

| 术语 | 说明 |
|---|---|
| **Agent Skills** | 包含 SKILL.md 的文件夹，用于扩展 Agent 能力 |
| **MCP** | Model Context Protocol，Agent ↔ 工具的标准协议 |
| **Progressive Disclosure** | 渐进式披露：仅在需要时加载资源 |
| **SKILL.md** | Skill 的标准元数据 + 指令文件 |
| **Skill Pack** | 多个 Skill 的组合包 |
| **Trust Score** | Skill 健康度评分（0-100） |

### 7.3 关联文档

- `SKILLHUB_V3_DEVELOPMENT_PLAN.md`：12 周开发实施计划
- `SKILLHUB_V3_ROADMAP.md`：路线图与里程碑
- `docs/features/SkillHub_企业级技能仓库强化能力_PRD_v2.0.md`：v2.0 PRD（已存在）

---

**文档结束** | 请审核通过后，进入开发实施计划（`SKILLHUB_V3_DEVELOPMENT_PLAN.md`）