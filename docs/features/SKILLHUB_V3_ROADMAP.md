# SkillHub v3.0 升级路线图（Roadmap）

> **文档版本**: v1.0
> **创建日期**: 2026-06-24
> **状态**: 待用户审核

---

## 一、战略愿景

### 一句话定位

> **"AI Agent Skills 的 GitHub"** —— 唯一同时支持"自托管 + 开放标准 + MCP 集成 + Skills 爬虫"的中立平台

### 战略目标

| 阶段 | 时间 | 核心目标 | 状态 |
|---|---|---|---|
| **v2.0 Beta** | 2026-04 | 自主管理 + 爬虫搜索 + OpenAPI | ✅ 已发布 |
| **v2.5 GA** | 2026 Q3 末 | 标准对齐 + MCP 集成 + 框架现代化 | 🔄 进行中 |
| **v3.0 GA** | 2026 Q4 末 | 生态枢纽 + 可观测性 + Trust Score | 📋 规划中 |
| **v3.5** | 2027 Q1 | Skill 经济（付费/Bounty/Verified） | 🔮 未来 |
| **v4.0** | 2027 Q2 | Agent 网络（Skills ↔ Agent 双向市场） | 🔮 未来 |

---

## 二、版本演进图

```
v1.0 ──► v2.0-beta ──► v2.5-GA ──► v3.0-GA ──► v3.5 ──► v4.0
(2025)   (2026-04)     (2026-Q3)    (2026-Q4)    (2027)   (2027)
   │          │            │            │           │        │
   │          │            │            │           │        │
 基础     双模式+爬虫   标准对齐     生态枢纽    技能经济   Agent网络
 功能     +AI集成      +MCP        +可观测性   +Verified  +Bidirectional
                      +Next.js15   +Trust Score
```

---

## 三、v3.0 五大里程碑

### 🏁 M1：Agent Skills 标准对齐（Week 1-3）

**核心交付**：
- ✅ 兼容 `agentskills.io` 标准的 SKILL.md 解析器
- ✅ Skill 导入/导出 CLI
- ✅ 前端 SKILL.md 渲染 + 资源文件树
- ✅ API v2 发现端点（discovery）

**业务价值**：
- 一份 Skill，40+ Agent 工具可消费
- 解决"重复适配各平台格式"的痛点

**成功指标**：
- 至少 100 个 Skill 转换为标准 SKILL.md 格式
- `GET /api/v2/discovery` P95 < 300ms

---

### 🏁 M2：MCP 集成 + 官方 Registry 收录（Week 4-6）

**核心交付**：
- ✅ SkillHub 作为 MCP Server（5 个工具）
- ✅ SkillHub 作为 MCP Client（验证流程）
- ✅ 提交官方 MCP Registry 收录

**业务价值**：
- 在 Claude Desktop / Cursor / Codex 直接添加 SkillHub
- 获得 MCP Registry 官方曝光（7000+ Server 之一）

**成功指标**：
- 官方 MCP Registry 上线 `skillhub` 搜索结果
- MCP 工具调用 P95 < 500ms
- 至少 3 个集成测试场景通过

---

### 🏁 M3：框架现代化（Week 7-9）

**核心交付**：
- ✅ Next.js 15 + React 19 升级
- ✅ Skills 列表/详情页 Server Components 化
- ✅ 发布表单 Server Actions 改造
- ✅ Prisma 6 升级

**业务价值**：
- 页面 LCP 改善 ≥ 30%
- DX 改善（更少的客户端 JS）
- 为未来 Edge Runtime 铺路

**成功指标**：
- Lighthouse 评分 ≥ 90
- Bundle size 减少 ≥ 20%
- 现有 97 个测试 + 新增测试全部通过

---

### 🏁 M4：生态扩展（Week 10-11）

**核心交付**：
- ✅ DeerFlow 2.0 find-skills 协议对接
- ✅ Coze / TRAE / Dify 国产平台集成
- ✅ Langfuse 可观测性接入
- ✅ Skill 在线预览 + 6+ Agent 一键安装

**业务价值**：
- 进入国内 SuperAgent 生态
- Skill 作者可追踪被调用情况
- 用户体验提升（预览 + 一键安装）

**成功指标**：
- 至少 5 个 DeerFlow 用户通过 SkillHub 安装 Skill
- 国产 Agent 平台收录 ≥ 3 家

---

### 🏁 M5：Trust Score + GA 发布（Week 12）

**核心交付**：
- ✅ Trust Score 算法 + UI
- ✅ Feature Flag 灰度
- ✅ CHANGELOG + 文档
- ✅ Docker Hub / npm 发布

**业务价值**：
- 用户可信赖高评分 Skill
- 灰度发布降低风险

**成功指标**：
- v3.0.0 GA 在 2026-09-30 前发布
- 灰度期间 P0 故障 < 1 个

---

## 四、OKR 体系（2026 H2）

### O1：成为 Agent Skills 标准兼容的注册中心

| KR | 目标 |
|---|---|
| KR1.1 | 100% 现有 Skill 转换为 SKILL.md 标准 |
| KR1.2 | 0 个 Skill 因格式问题被 40+ Agent 拒绝 |
| KR1.3 | discovery 端点支持 10K+ Skills |

### O2：成为 MCP 协议层枢纽

| KR | 目标 |
|---|---|
| KR2.1 | 官方 MCP Registry 收录 |
| KR2.2 | MCP 工具月调用量 ≥ 10K |
| KR2.3 | 支持 MCP Client 验证流程 100% Skill |

### O3：接入 10+ Agent 平台

| KR | 目标 |
|---|---|
| KR3.1 | DeerFlow 2.0 集成上线 |
| KR3.2 | Coze / TRAE / Dify 收录 |
| KR3.3 | 国产 Agent 平台 ≥ 5 家 |

### O4：完成框架现代化

| KR | 目标 |
|---|---|
| KR4.1 | Next.js 15 + React 19 全量升级 |
| KR4.2 | Lighthouse 评分 ≥ 90 |
| KR4.3 | 测试覆盖率 ≥ 85% |

---

## 五、关键日期

| 日期 | 事件 |
|---|---|
| 2026-06-24 | 升级需求文档 v1.0 发布 |
| 2026-07-01 | v3.0 开发启动 |
| 2026-07-21 | M1 完成：标准对齐 |
| 2026-08-11 | M2 完成：MCP 集成 |
| 2026-09-01 | M3 完成：框架现代化 |
| 2026-09-22 | M4 完成：生态扩展 |
| 2026-09-29 | M5 完成：GA 发布 |
| 2026-09-30 | **v3.0.0 GA 发布到生产** |
| 2026-10-15 | 第一周生产监控报告 |
| 2026-12-31 | v3.0 GA 季度回顾 + v3.5 规划 |

---

## 六、版本命名约定

| 类型 | 后缀 | 说明 |
|---|---|---|
| 正式版 | v3.0.0 | GA 发布 |
| 补丁 | v3.0.1 | Bug fix |
| 次版本 | v3.1.0 | 向后兼容新功能 |
| 预发布 | v3.0.0-rc.1 | Release Candidate |
| 内测 | v3.0.0-beta.1 | 公开测试 |

---

## 七、沟通与发布渠道

### 7.1 发布渠道

- **GitHub Releases**：技术发版说明
- **Docker Hub**：镜像发布
- **npm**：CLI 工具 + SDK
- **官方博客**：功能解读 + 用户故事
- **Discord / 社区**：用户通知

### 7.2 文档站点

- `docs/` 目录（现有）
- 在线文档站（计划 Q4 启用 Astro/Starlight）

---

## 八、跨版本主题（持续进行）

### 8.1 安全

- 每版本安全审计
- 自动化 SAST（SonarQube）
- 依赖漏洞扫描（Dependabot）

### 8.2 性能

- 每月 Lighthouse 报告
- 数据库查询优化审查
- CDN / 缓存策略迭代

### 8.3 可观测性

- 接入 OpenTelemetry（已规划）
- 关键路径 Tracing
- 错误监控（Sentry）

### 8.4 国际化

- 中文 Skill 优先
- 中英双语 UI
- 多语言文档

---

## 九、未在 v3.0 但纳入路标

### v3.5（2027 Q1）

- Skill Bounty 完整闭环
- Premium Skill 付费机制
- Verified 徽章 + 第三方评测
- Skill 反向收益分成

### v4.0（2027 Q2）

- Agent ↔ Skill 双向市场
- A2A 协议支持（Agent-to-Agent）
- 跨平台 Skill 网络
- 自主 Agent 创建（Meta-Skill）

---

## 十、依赖与假设

### 10.1 关键依赖

- Anthropic 持续维护 Agent Skills 开放标准
- MCP 协议保持稳定（已捐赠给基金会，假设稳定）
- Langfuse 项目持续活跃
- DeerFlow 2.0 协议不发生破坏性变更

### 10.2 关键假设

- 团队 2 全栈 + 1 AI + 1 DevOps 兼职配置到位
- PostgreSQL + Prisma 保持现有架构
- 不需要重写为 LangGraph（保持 Next.js）
- 现有 OpenAPI 用户会平滑迁移或共存

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 升级破坏现有功能 | 高 | feature 分支 + 灰度发布 + 回滚预案 |
| MCP 协议再次变更 | 中 | 锁定版本 + 监控 roadmap |
| 团队人手不足 | 高 | 砍掉 P2 任务，专注 P0 |
| Agent Skills 标准演进 | 中 | 字段设计宽松 |
| DeerFlow 协议变动 | 低 | 仅对接公开接口 |

---

## 十二、决策记录（ADR 索引）

| ID | 决策 | 状态 |
|---|---|---|
| ADR-001 | 采用 Agent Skills 开放标准作为 Skill 主格式 | ✅ 通过 |
| ADR-002 | 同时支持 MCP Server + MCP Client 双角色 | ✅ 通过 |
| ADR-003 | 升级 Next.js 15 + React 19 | ✅ 通过 |
| ADR-004 | 不重写为 LangGraph，保持 Next.js | ✅ 通过 |
| ADR-005 | 使用 Langfuse 而非自建可观测性 | ✅ 通过 |
| ADR-006 | Trust Score 算法（详见 ADR-006） | 📋 待 |

---

**文档结束** | 配套文档：[升级需求文档](./SKILLHUB_V3_UPGRADE_REQUIREMENTS.md) · [开发实施计划](./SKILLHUB_V3_DEVELOPMENT_PLAN.md)