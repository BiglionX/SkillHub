# SkillHub v3.0 开发实施计划（12 周路线图）

> **文档版本**: v1.0
> **创建日期**: 2026-06-24
> **关联文档**: `SKILLHUB_V3_UPGRADE_REQUIREMENTS.md`
> **目标**: 12 周内完成 v3.0 GA，发布"AI Agent Skills 的 GitHub"
> **团队配置**: 2 全栈 + 1 AI 工程师 + 1 DevOps（兼职）

---

## 一、总览

### 1.1 时间线

```
Week 1-3  ▓▓▓ F1: Agent Skills 标准兼容            [P0]
Week 4-5  ▓▓▓ F2: MCP Server 集成                   [P0]
Week 5    ▓   F3: MCP Client 集成                   [P0]
Week 6    ▓   F4: 官方 MCP Registry 收录            [P0]
Week 7-9  ▓▓▓ F5: 框架现代化 Next.js 15 + React 19  [P1]
Week 10   ▓   F6: DeerFlow 2.0 集成                  [P2]
Week 10   ▓   F7: 国产 Agent 平台集成                [P2]
Week 11   ▓   F8: Langfuse 可观测性                  [P2]
Week 11   ▓   F9: Skill 在线预览                     [P2]
Week 12   ▓   F10: Trust Score + 灰度发布            [P2]
Week 12   ▓   Bug Bash + GA                         [全部]
```

### 1.2 里程碑

| Milestone | 日期 | 标志 |
|---|---|---|
| **M1**: 标准对齐完成 | Week 3 末 | 可导入/导出 SKILL.md，详情页渲染 |
| **M2**: MCP 集成完成 | Week 6 末 | Claude Desktop 可调用 SkillHub |
| **M3**: 框架现代化完成 | Week 9 末 | Next.js 15 + React 19 跑通 |
| **M4**: GA 候选 | Week 11 末 | 所有功能完成，测试通过 |
| **M5**: GA 发布 | Week 12 末 | v3.0.0 正式发布到 Docker Hub + npm |

---

## 二、阶段一：标准对齐（Week 1-3，P0）

### Week 1: 基础设施 + 数据模型

**目标**：建立 SKILL.md 标准兼容的数据库基础

#### 任务 1.1：添加依赖（0.5 天）

```bash
# apps/web
npm install gray-matter js-yaml
npm install -D @types/js-yaml

# 添加 MCP 依赖
npm install @modelcontextprotocol/sdk
```

文件：`apps/web/package.json`

#### 任务 1.2：扩展 Prisma Schema（1 天）

修改 `apps/web/prisma/schema.prisma`：

```prisma
model Skill {
  // ... 现有字段保留
  
  // 新增：Agent Skills 标准兼容
  skillMdContent       String?   @db.Text
  skillMdFrontmatter   Json?
  standardName         String?
  standardDescription  String?   @db.Text
  discoveryKeywords    String[]  @default([])
  
  resources            SkillResource[]
  
  agentSkillsVersion   String?
  lastAnalyzedAt       DateTime?
  
  @@index([standardName])
  @@index([agentSkillsVersion])
}

model SkillResource {
  id          String   @id @default(cuid())
  skillId     String
  skill       Skill    @relation(fields: [skillId], references: [id], onDelete: Cascade)
  
  type        String   // script | reference | asset | other
  path        String
  storageKey  String
  sizeBytes   Int
  mimeType    String?
  checksum    String?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([skillId, path])
  @@index([skillId, type])
}
```

#### 任务 1.3：创建数据库迁移（0.5 天）

```bash
cd apps/web
npx prisma migrate dev --name add_agent_skills_support
```

验证：`prisma migrate status` 显示迁移已应用

#### 任务 1.4：编写 SKILL.md 解析器（2 天）

新建文件：`apps/web/lib/skills/skill-md-parser.ts`

```typescript
import matter from 'gray-matter';
import { z } from 'zod';

export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(10).max(1024),
  // 允许扩展字段
}).passthrough();

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface ParsedSkillMd {
  frontmatter: SkillFrontmatter;
  body: string;
  keywords: string[];
  agentSkillsVersion: string;
}

export function parseSkillMd(content: string): ParsedSkillMd {
  const parsed = matter(content);
  const fm = SkillFrontmatterSchema.parse(parsed.data);
  
  return {
    frontmatter: fm,
    body: parsed.content,
    keywords: extractKeywords(fm.description),
    agentSkillsVersion: '1.0',
  };
}

function extractKeywords(description: string): string[] {
  // 简单分词 + 去停用词
  const stopWords = new Set(['a', 'the', 'is', 'are', '和', '是', '的']);
  return description
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);
}
```

#### 任务 1.5：单元测试（1 天）

新建文件：`apps/web/lib/skills/__tests__/skill-md-parser.test.ts`

测试覆盖：
- ✅ 合法 SKILL.md 解析
- ✅ frontmatter 字段缺失报错
- ✅ description 过短报错
- ✅ 扩展字段保留

### Week 2: API 端点 + CLI 命令

#### 任务 2.1：实现发现端点（1 天）

新建文件：`apps/web/app/api/v2/discovery/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET() {
  const skills = await prisma.skill.findMany({
    where: { 
      isPublic: true,
      standardName: { not: null },
    },
    select: {
      slug: true,
      standardName: true,
      standardDescription: true,
      discoveryKeywords: true,
      type: true,
      agentSkillsVersion: true,
    },
    take: 1000,
  });
  
  return NextResponse.json({
    version: '1.0',
    generatedAt: new Date().toISOString(),
    skills,
  });
}
```

#### 任务 2.2：实现 SKILL.md 下载端点（1 天）

新建文件：`apps/web/app/api/v2/skills/[slug]/skill.md/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const skill = await prisma.skill.findUnique({
    where: { slug: params.slug },
    select: {
      skillMdContent: true,
      standardName: true,
      standardDescription: true,
    },
  });
  
  if (!skill?.skillMdContent) {
    return new NextResponse('Skill not found or no SKILL.md', { status: 404 });
  }
  
  return new NextResponse(skill.skillMdContent, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

#### 任务 2.3：实现资源文件端点（1 天）

新建文件：`apps/web/app/api/v2/skills/[slug]/files/[...path]/route.ts`

支持渐进式披露的资源加载

#### 任务 2.4：CLI import/export 命令（2 天）

修改 `apps/cli/src/commands/skill.ts`，添加：

```typescript
// skillhub skill import <github-url>
program
  .command('skill import')
  .argument('<source>', 'GitHub URL or owner/repo@skill-name')
  .option('--namespace <ns>', '目标命名空间', 'personal')
  .action(async (source, options) => {
    // 1. 解析 GitHub URL
    // 2. 下载 SKILL.md
    // 3. 调用 SkillHub API POST /api/v2/skills/import
    // 4. 显示结果
  });

// skillhub skill export <slug>
program
  .command('skill export')
  .argument('<slug>', 'Skill slug')
  .option('-o, --output <dir>', '输出目录', './')
  .action(async (slug, options) => {
    // 1. 调用 SkillHub API GET /api/v2/skills/{slug}/export
    // 2. 解压到目录
  });
```

#### 任务 2.5：API v2 集成测试（2 天）

新建 `apps/web/tests/api/v2/skills.test.ts`

### Week 3: 前端 + 收尾

#### 任务 3.1：Skill 详情页 SKILL.md 渲染（2 天）

修改 `apps/web/app/skills/[slug]/page.tsx`：

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 在详情页添加 Tabs
<Tabs>
  <Tab label="README" />
  <Tab label="SKILL.md" />
  <Tab label="Scripts" />
  <Tab label="Changelog" />
</Tabs>

// SKILL.md Tab
<ReactMarkdown remarkPlugins={[remarkGfm]}>
  {skill.skillMdContent}
</ReactMarkdown>
```

#### 任务 3.2：资源文件树（1 天）

新建 `apps/web/components/skills/ResourceTree.tsx`

#### 任务 3.3：Agent 兼容徽章组件（1 天）

新建 `apps/web/components/skills/AgentCompatBadge.tsx`

支持的 Agent：Claude Code、Cursor、Codex、Gemini CLI、Roo Code、DeerFlow

#### 任务 3.4：E2E 测试（2 天）

使用 Playwright 测试：
- ✅ 导入 SKILL.md 流程
- ✅ 详情页 SKILL.md 渲染
- ✅ 资源树展开

---

## 三、阶段二：MCP 集成（Week 4-6，P0）

### Week 4: MCP Server 核心

#### 任务 4.1：安装 MCP SDK（0.5 天）

```bash
cd apps/web
npm install @modelcontextprotocol/sdk
```

#### 任务 4.2：MCP Server 实现（3 天）

新建 `apps/web/lib/mcp/server.ts`：

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { SearchService } from '@/lib/search/SearchService';

export function createSkillHubMcpServer() {
  const server = new McpServer({
    name: 'skillhub',
    version: '3.0.0',
  });
  
  // 工具 1: skillhub_search
  server.tool(
    'skillhub_search',
    '搜索 AI Agent Skills',
    {
      query: z.string().describe('搜索关键词或自然语言描述'),
      type: z.enum(['prompt', 'knowledge', 'rule', 'skill_pack']).optional(),
      industryTags: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(50).default(10),
      offset: z.number().int().min(0).default(0),
    },
    async ({ query, type, industryTags, limit, offset }) => {
      const results = await SearchService.search({
        query,
        type,
        industryTags,
        limit,
        offset,
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2),
        }],
      };
    }
  );
  
  // 工具 2: skillhub_get_skill
  server.tool(
    'skillhub_get_skill',
    '获取 Skill 详情，包括 SKILL.md 和资源清单',
    {
      slug: z.string().describe('Skill slug'),
      includeResources: z.boolean().default(true),
    },
    async ({ slug, includeResources }) => {
      const skill = await prisma.skill.findUnique({
        where: { slug },
        include: { resources: includeResources },
      });
      
      if (!skill) {
        throw new Error(`Skill not found: ${slug}`);
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(skill, null, 2),
        }],
      };
    }
  );
  
  // 工具 3-5: skillhub_install_skill / publish_skill / list_skills_by_platform
  // ...
  
  return server;
}
```

#### 任务 4.3：HTTP 传输端点（1 天）

新建 `apps/web/app/api/mcp/route.ts`：

```typescript
import { createSkillHubMcpServer } from '@/lib/mcp/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const server = createSkillHubMcpServer();
const transport = new StreamableHTTPServerTransport();

export async function POST(request: Request) {
  await transport.handleRequest(request, server);
}
```

#### 任务 4.4：stdio 传输（CLI 模式，1 天）

新建 `apps/cli/src/mcp-server.ts`，作为 `npx @skillhub/mcp-server` 入口

#### 任务 4.5：MCP Server 单元测试（2 天）

测试每个工具的：
- ✅ 正常输入返回正确格式
- ✅ 错误输入抛出明确错误
- ✅ 大数据量性能 < 500ms

### Week 5: MCP Client + 安全

#### 任务 5.1：MCP Client 连接池（2 天）

新建 `apps/web/lib/mcp/client.ts`：

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export class McpConnectionPool {
  private clients = new Map<string, Client>();
  
  async getConnection(serverUrl: string): Promise<Client> {
    if (!this.clients.has(serverUrl)) {
      const client = new Client({ name: 'skillhub', version: '3.0.0' });
      await client.connect(serverUrl);
      this.clients.set(serverUrl, client);
    }
    return this.clients.get(serverUrl)!;
  }
}
```

#### 任务 5.2：发布前验证流程（2 天）

修改 `apps/web/lib/services/SkillsImportService.ts`：

```typescript
async function validateBeforePublish(skill: Skill) {
  // 1. 调用 GitHub MCP 验证仓库
  // 2. 调用 Skill 标准检查 MCP
  // 3. 调用安全扫描 MCP
  // 返回验证报告
}
```

#### 任务 5.3：OAuth 认证中间件（1 天）

新建 `apps/web/lib/mcp/auth.ts`：

仅写操作（publish/install）需要 Bearer Token

### Week 6: 官方 Registry 收录

#### 任务 6.1：编写 server.json（0.5 天）

文件：`packages/mcp-server/server.json`（新建包）

#### 任务 6.2：编写 README + 安装指南（1 天）

文件：`packages/mcp-server/README.md`

#### 任务 6.3：CI 测试（1 天）

GitHub Actions：MCP Server 启动测试 + 工具调用测试

#### 任务 6.4：提交 PR 到 modelcontextprotocol/registry（0.5 天）

按照 [Registry 贡献指南](https://github.com/modelcontextprotocol/registry/blob/main/CONTRIBUTING.md)

#### 任务 6.5：监控收录状态 + 文档更新（1 天）

- 等待 PR Review
- 更新 `docs/integration/MCP_REGISTRY_INTEGRATION.md`

---

## 四、阶段三：框架现代化（Week 7-9，P1）

### Week 7: Next.js 15 升级

#### 任务 7.1：升级 Next.js（0.5 天）

```bash
cd apps/web
npm install next@^15 react@^19 react-dom@^19
npm install -D @types/react@^19 @types/react-dom@^19
```

#### 任务 7.2：修复 breaking changes（2 天）

参考：https://nextjs.org/docs/app/building-your-application/upgrading/version-15

重点：
- `cookies()`、`headers()` 变为 async
- `fetch()` 不再默认缓存
- `params` 为 Promise

#### 任务 7.3：升级 Prisma 6（0.5 天）

```bash
npm install prisma@^6 @prisma/client@^6
```

#### 任务 7.4：完整回归测试（2 天）

确保 97 个测试 + 新增测试全部通过

### Week 8: Server Components 化

#### 任务 8.1：Skills 列表页改造（2 天）

`apps/web/app/skills/page.tsx`：

```tsx
// 改为 Server Component
import { prisma } from '@/lib/prisma';

export default async function SkillsPage({ searchParams }) {
  const { q, type, page } = await searchParams;
  const skills = await prisma.skill.findMany({ ... });
  
  return <SkillsList initial={skills} />;
}
```

#### 任务 8.2：Skill 详情页改造（1 天）

`apps/web/app/skills/[slug]/page.tsx`：转为 Server Component

#### 任务 8.3：缓存策略优化（2 天）

```typescript
import { unstable_cache } from 'next/cache';

export const getCachedSkill = unstable_cache(
  async (slug: string) => prisma.skill.findUnique({ where: { slug } }),
  ['skill'],
  { revalidate: 3600, tags: ['skill'] }
);
```

### Week 9: Server Actions

#### 任务 9.1：Skill 发布 Server Action（2 天）

新建 `apps/web/app/skills/actions.ts`：

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function publishSkillAction(formData: FormData) {
  // 1. 校验
  // 2. 写入数据库
  // 3. 重新验证路径
  revalidatePath('/skills');
  redirect(`/skills/${slug}`);
}
```

#### 任务 9.2：评论 / 评分 Server Actions（1 天）

#### 任务 9.3：useActionState 优化发布表单（1 天）

#### 任务 9.4：性能验证（1 天）

- Lighthouse 评分 ≥ 90
- Bundle size 减少 ≥ 20%

---

## 五、阶段四：生态扩展（Week 10-11，P2）

### Week 10: DeerFlow + 国产平台

#### 任务 10.1：DeerFlow find-skills 端点（2 天）

新建 `apps/web/app/api/deerflow/skills.json/route.ts`

#### 任务 10.2：DeerFlow 安装脚本（1 天）

返回 `bash install-skill.sh biglionx/skillhub@<slug>`

#### 任务 10.3：Coze 插件集成（1 天）

#### 任务 10.4：TRAE Skills 目录兼容（1 天）

### Week 11: 可观测性 + 预览

#### 任务 11.1：Langfuse 部署 + 接入（2 天）

```bash
# docker-compose 添加 langfuse 服务
langfuse:
  image: langfuse/langfuse:latest
  environment:
    DATABASE_URL: postgresql://...
    NEXTAUTH_URL: http://localhost:3001
```

#### 任务 11.2：Skill 调用埋点（2 天）

`apps/web/lib/observability/langfuse.ts`：

```typescript
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse();

export function traceSkillCall(slug: string, action: string, metadata?: any) {
  return langfuse.trace({
    name: `skill_${action}`,
    metadata: { skillSlug: slug, ...metadata },
  });
}
```

#### 任务 11.3：Skill 详情页 SKILL.md 渲染增强（1 天）

添加代码高亮 + TOC

#### 任务 11.4：6+ Agent 一键安装按钮（1 天）

支持的平台：Claude Code、Cursor、Codex、Gemini CLI、Roo Code、DeerFlow

---

## 六、阶段五：Trust Score + 灰度发布（Week 12，P2）

### Week 12.1: Trust Score 实现（2 天）

#### 任务 12.1.1：评分算法（1 天）

新建 `apps/web/lib/skills/trust-score.ts`

#### 任务 12.1.2：定时计算任务（0.5 天）

使用现有的 `lib/services/TaskScheduler.ts`

#### 任务 12.1.3：UI 展示（0.5 天）

### Week 12.2: 灰度发布（2 天）

#### 任务 12.2.1：Feature Flag 系统（1 天）

新增 `lib/feature-flags.ts`，支持：
- MCP Server（10% 用户开启）
- SKILL.md 渲染（50% 用户）
- Trust Score（100%）

#### 任务 12.2.2：监控指标接入（1 天）

### Week 12.3: GA 发布（2 天）

#### 任务 12.3.1：CHANGELOG.md（0.5 天）

#### 任务 12.3.2：发布到 Docker Hub + npm（0.5 天）

#### 任务 12.3.3：博客文章（1 天）

---

## 七、测试策略

### 7.1 测试覆盖率目标

| 模块 | 目标覆盖率 |
|---|---|
| MCP Server | ≥ 90% |
| SKILL.md 解析 | ≥ 95% |
| API v2 端点 | ≥ 85% |
| 新增 Server Actions | ≥ 80% |
| Trust Score | ≥ 90% |

### 7.2 测试金字塔

```
       ╱╲      E2E (Playwright)       5%
      ╱──╲     
     ╱────╲    集成 (API + DB)         25%
    ╱──────╲  
   ╱────────╲  单元 (Jest)              70%
  ╱──────────╲
```

### 7.3 必测关键路径

1. **Skill 导入 → SKILL.md 解析 → 数据库写入 → API 暴露**
2. **MCP 客户端 → 工具调用 → 数据库查询 → JSON 响应**
3. **Skill 发布 → MCP 验证 → Trust Score 计算 → 列表展示**
4. **Next.js 15 Server Action → 表单提交 → 重定向 → 缓存失效**

---

## 八、部署与发布

### 8.1 Docker 镜像

```dockerfile
# Dockerfile.web 新增
RUN npm install @modelcontextprotocol/sdk gray-matter
```

构建命令保持：`docker-compose up -d --build`

### 8.2 数据库迁移

所有迁移在 `apps/web/prisma/migrations/` 下，按版本号命名。

### 8.3 环境变量新增

```bash
# .env.example 新增
MCP_SERVER_ENABLED=true
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=http://localhost:3001
SKILLHUB_VERSION=3.0.0
```

### 8.4 回滚方案

每个阶段保持独立 feature branch，出问题时 `git revert` 即可。

---

## 九、风险登记

| ID | 风险 | 影响 | 概率 | 缓解 | 责任人 |
|---|---|---|---|---|---|
| R1 | Next.js 15 升级破坏现有路由 | 高 | 中 | feature 分支独立升级 | 全栈 A |
| R2 | MCP 协议版本变更 | 中 | 低 | 锁定 2025-11-25 | 全栈 B |
| R3 | MCP Registry 审核不通过 | 中 | 中 | 提前对照 schema 校验 | AI 工程师 |
| R4 | DeerFlow 协议变动 | 低 | 低 | 只对接公开接口 | AI 工程师 |
| R5 | Langfuse 性能开销 | 中 | 中 | 异步上报 + 采样 | 全栈 A |
| R6 | SKILL.md 安全风险 | 高 | 中 | 静态扫描 + 类型白名单 | DevOps |

---

## 十、沟通计划

### 10.1 周会节奏

- **每日 Standup**：15 分钟，同步进度 / 阻塞
- **每周 Review**：周五 16:00，演示本周成果
- **M1/M2/M3/M4/M5 Review**：里程碑节点

### 10.2 文档同步

每个 PR 必须：
- 更新 `CHANGELOG.md`
- 关联 Issue / PRD 章节
- 同步 `docs/` 中相关文档

---

## 十一、附录：任务清单总表

### P0 任务（必须完成）

| ID | 任务 | 工作量 | 周次 |
|---|---|---|---|
| F1.1 | 数据库 Schema 扩展 | 1d | W1 |
| F1.2 | SKILL.md 解析器 | 2d | W1 |
| F1.3 | API v2 discovery 端点 | 1d | W2 |
| F1.4 | API v2 skill.md 端点 | 1d | W2 |
| F1.5 | API v2 files 端点 | 1d | W2 |
| F1.6 | CLI import/export | 2d | W2 |
| F1.7 | 前端 SKILL.md 渲染 | 2d | W3 |
| F1.8 | 资源文件树 | 1d | W3 |
| F1.9 | Agent 兼容徽章 | 1d | W3 |
| F1.10 | E2E 测试 | 2d | W3 |
| F2.1 | MCP Server 核心 | 3d | W4 |
| F2.2 | HTTP 传输端点 | 1d | W4 |
| F2.3 | stdio 传输 | 1d | W4 |
| F2.4 | MCP Server 单元测试 | 2d | W4 |
| F3.1 | MCP Client 连接池 | 2d | W5 |
| F3.2 | 发布前验证 | 2d | W5 |
| F3.3 | OAuth 中间件 | 1d | W5 |
| F4.1 | server.json | 0.5d | W6 |
| F4.2 | README + 指南 | 1d | W6 |
| F4.3 | CI 测试 | 1d | W6 |
| F4.4 | 提交 Registry PR | 0.5d | W6 |

### P1 任务（应当完成）

| ID | 任务 | 工作量 | 周次 |
|---|---|---|---|
| F5.1 | Next.js 15 升级 | 0.5d | W7 |
| F5.2 | 修复 breaking changes | 2d | W7 |
| F5.3 | Prisma 6 升级 | 0.5d | W7 |
| F5.4 | 回归测试 | 2d | W7 |
| F5.5 | Server Components 改造 | 5d | W8 |
| F5.6 | Server Actions 实现 | 4d | W9 |
| F5.7 | 性能验证 | 1d | W9 |

### P2 任务（最好完成）

| ID | 任务 | 工作量 | 周次 |
|---|---|---|---|
| F6.1 | DeerFlow 发现端点 | 2d | W10 |
| F6.2 | DeerFlow 安装脚本 | 1d | W10 |
| F7.1 | Coze 插件 | 1d | W10 |
| F7.2 | TRAE Skills 兼容 | 1d | W10 |
| F8.1 | Langfuse 部署 | 2d | W11 |
| F8.2 | Skill 调用埋点 | 2d | W11 |
| F9.1 | SKILL.md 渲染增强 | 1d | W11 |
| F9.2 | 一键安装按钮 | 1d | W11 |
| F10.1 | Trust Score 算法 | 1d | W12 |
| F10.2 | Trust Score UI | 0.5d | W12 |
| F12.1 | Feature Flag | 1d | W12 |
| F12.2 | 监控接入 | 1d | W12 |
| F12.3 | CHANGELOG + 发布 | 1d | W12 |

---

## 十二、下一步

1. ✅ **审核通过本计划** → 开始 Week 1 任务
2. ✅ **创建对应的 GitHub Issues / Projects** → 任务可视化
3. ✅ **建立 feature 分支策略** → `feature/v3-agent-skills`, `feature/v3-mcp-server`...
4. ✅ **配置 CI/CD 增强** → 自动测试 MCP Server、自动部署到 Preview 环境

---

**文档结束** | 进入实施前请用户确认：是否按 P0+P1 优先实施？