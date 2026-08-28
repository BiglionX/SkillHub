# SkillHub 一键安装桌面助手 — 需求文档（PRD）v2.0

> **文档版本**: v2.0（重写）
> **创建日期**: 2026-08（基于 v1.0 反馈重写）
> **目标版本**: SkillHub v3.x
> **状态**: 待产品/技术负责人审核
> **前置版本**: [v1.0](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md)（已归档，仅供参考）

---

## 目录

1. [背景与战略修正](#1-背景与战略修正)
2. [核心抽象：场景三分类 + 三交付物](#2-核心抽象场景三分类--三交付物)
3. [产品定位与北极星指标](#3-产品定位与北极星指标)
4. [用户画像与核心旅程](#4-用户画像与核心旅程)
5. [范围与非范围](#5-范围与非范围)
6. [关键决策（已锁定）](#6-关键决策已锁定)
7. [功能需求](#7-功能需求)
   - F1 智能问答入口（首页对话框）
   - F2 技能货架与软件过滤
   - F3 Skill 详情页（三形态差异化）
   - F4 安装执行（环境依赖型 / A 类）
   - F5 OAuth 连接器（数据授权型 / B 类）
   - F6 即时生成（内容生成型 / C 类）
   - F7 桌面助手本体（Helper）
   - F8 自定义协议与浏览器唤起
   - F9 软件路径自动发现 + 手动补位
   - F10 安装剧本（Playbook）引擎
   - F11 运行时依赖保障
   - F12 半自动降级流程图
   - F13 环境检测（Web 端 + 桌面端）
   - F14 本地软件清单上报 + 反向推送
   - F15 安装埋点与遥测
8. [非功能需求](#8-非功能需求)
9. [技术架构](#9-技术架构)
10. [数据模型](#10-数据模型)
11. [剧本 DSL](#11-剧本-dsl)
12. [API 契约](#12-api-契约)
13. [安全与权限模型](#13-安全与权限模型)
14. [实施路线图与里程碑](#14-实施路线图与里程碑)
15. [风险与开放问题](#15-风险与开放问题)
16. [验收标准](#16-验收标准)
17. [附录](#17-附录)

---

## 1. 背景与战略修正

### 1.1 v1.0 方案的偏差

v1.0 把「**安装**」当成核心问题，把所有 Skill 都默认走「桌面助手 + 协议唤起 + 剧本执行」一条路。

**问题**：

- 「帮我写一篇小红书爆款文案」这种 Skill **根本不该有安装流程**——它是内容生成，点了就直接出结果
- 「把飞书文档同步到 Notion」这种 Skill **重点是 OAuth 授权**——安装是次要的，连接是主要的
- 把 60% 的内容生成型 Skill 强按「安装按钮」走，是把简单问题复杂化

### 1.2 v2.0 的修正

> **核心抽象**：「按 Skill 的物理空间分类，给出不同的交付物」。
> 
> **产品的本质**：不再只是「Skill 商店」，而是「**跨环境、跨软件的 Skill 智能调度台**」。
> 
> **用户价值**：从「替用户干活」升级为「**替用户省掉读几百页英文文档的时间**」。

### 1.3 战略定位

| 维度 | v1.0 表述 | v2.0 表述 |
|---|---|---|
| 定位 | AI 时代的 Steam / 应用商店 | **跨环境、跨软件的 Skill 智能调度台** |
| 用户价值 | 替用户执行安装 | **替用户省掉读文档的时间** |
| 助手定位 | 核心壁垒，所有 Skill 必经之路 | **仅环境依赖型 Skill 的执行载体** |
| 入口 | 搜索 / 分类 | **首页大对话框（NLU 入口）+ 顶部软件过滤** |

### 1.4 与 V3 路线的关系（不变）

仍与 [SKILLHUB_V3_UPGRADE_REQUIREMENTS.md](./SKILLHUB_V3_UPGRADE_REQUIREMENTS.md) 互补：

- F1 Agent Skills 标准兼容：环境依赖型 Skill 的 SKILL.md 标准
- F2/F3 MCP：可作为数据授权型 Skill 的后端协议
- F9 在线预览：内容生成型 Skill 的「试运行」能力

---

## 2. 核心抽象：场景三分类 + 三交付物

### 2.1 分类总表

| 分类 | 物理空间 | 用户典型场景 | 交付物 | 安装？ |
|---|---|---|---|---|
| **A. 环境依赖型** | IDE / Photoshop / Blender / Office 等已装软件 | 「用 VSCode 调试这段 JS」「给 PS 加磨皮滤镜」 | **操作指令包**（图文 + GIF + 一键复制） | ✅ 需要装到目标软件 |
| **B. 数据授权型** | 第三方 SaaS（飞书/Notion/邮件/Gmail） | 「把飞书文档同步到 Notion」「自动归档邮件附件」 | **OAuth 连接器**（一键授权 + 模板） | ⚠️ 只需 OAuth，不需要装本地 |
| **C. 内容生成型** | 无（在线跑通） | 「写一篇小红书爆款」「总结会议纪要」「生成 PPT」 | **最终结果**（立即生成 + 可调参数） | ❌ 不需要任何安装 |

### 2.2 三交付物的详细规范

#### A. 操作指令包（环境依赖型）

```
┌────────────────────────────────────────────┐
│ 🛠 代码诊断 Skill                          │
│                                            │
│ 适用软件：Visual Studio Code                │
│                                            │
│ 📦 该 Skill 需要 VS Code 环境才能使用        │
│                                            │
│ ┌────────────────────────────────────┐     │
│ │ [GIF 动图 1 分钟]                   │     │
│ │ 1. 打开 VSCode 命令面板             │     │
│ │ 2. 输入命令：                       │     │
│ │    ext install skillhub.diagnostics│     │
│ │ 3. 重启 VSCode                     │     │
│ └────────────────────────────────────┘     │
│                                            │
│ 📋 配置代码（已自动生成）：                  │
│ ┌────────────────────────────────────┐     │
│ │ {                                  │     │
│ │   "skillhub.diagnostics": {        │     │
│ │     "lint": true,                  │     │
│ │     "format": "prettier"           │     │
│ │   }                                │     │
│ │ }                                  │     │
│ └────────────────────────────────────┘     │
│                       [📋 一键复制]         │
│                                            │
│ 💡 您想我怎么帮您？                          │
│ [📹 看完整操作视频] [📖 看图文步骤] [🤖 自动安装] │
└────────────────────────────────────────────┘
```

#### B. OAuth 连接器（数据授权型）

```
┌────────────────────────────────────────────┐
│ 🔗 飞书 → Notion 自动同步 Skill             │
│                                            │
│ 首次使用需要连接两个账号（一次性）：          │
│                                            │
│ ┌──────────────┐     ┌──────────────┐      │
│ │ 🪶 飞书      │     │ 📝 Notion    │      │
│ │ [未连接]     │     │ [未连接]     │      │
│ │ [点击授权]   │     │ [点击授权]   │      │
│ └──────────────┘     └──────────────┘      │
│                                            │
│ 授权完成后，您只需说「同步」，我会自动执行。   │
│                                            │
│                  [下一步：配置同步规则 ▶]   │
└────────────────────────────────────────────┘
```

授权完成后，自动进入「模板配置页」：

```
┌────────────────────────────────────────────┐
│ 📋 配置同步规则                            │
│                                            │
│ 同步源：                                   │
│   ○ 飞书文档（最近 7 天）                   │
│   ○ 指定文件夹：[选择...]                  │
│   ● 全部文档（实时）                        │
│                                            │
│ 同步目标 Notion 数据库：                    │
│   [下拉选择...]                            │
│                                            │
│ 字段映射：                                 │
│   飞书标题   →  Notion Name                │
│   飞书内容   →  Notion Body                │
│   飞书创建者 →  Notion Author              │
│                                            │
│                  [💾 保存并启用]            │
└────────────────────────────────────────────┘
```

#### C. 最终结果（内容生成型）

```
┌────────────────────────────────────────────┐
│ ✍️ 小红书爆款文案 Skill                    │
│                                            │
│ 🎯 主题：618 母婴好物推荐                   │
│                                            │
│ ┌────────────────────────────────────┐     │
│ │ 宝妈必囤！618 这 5 款母婴好物，     │     │
│ │ 闭眼入不踩雷～                       │     │
│ │                                     │     │
│ │ 1️⃣ 奶瓶消毒器（小白熊）              │     │
│ │ 蒸汽消毒+烘干二合一，懒妈福音...     │     │
│ │                                     │     │
│ │ 2️⃣ 婴儿背带（BabyBjorn）            │     │
│ │ ...                                 │     │
│ └────────────────────────────────────┘     │
│                                            │
│ 调参数：[语气▼活泼] [长度▼中等] [emoji▼多] │
│                                            │
│        [🔄 不满意？重生成]                  │
│        [📋 复制]  [💾 保存]  [📤 分享]      │
└────────────────────────────────────────────┘
```

### 2.3 关键引导语（统一暴露给用户的「选择权」）

```
这个 Skill 需要在「Visual Studio Code」环境下使用。
您希望我怎么帮您？

[📋 先给我看操作步骤]  [🎥 看 1 分钟动图]  [🤖 自动安装]
```

> **设计原则**：永远把「选择权」交给用户。普通人看不懂代码，但他看得懂「下一步该点哪里、该复制什么」。

### 2.4 推荐阶段的统一逻辑

```
用户输入 → LLM 解析 → { intent_tags, environment_tags, required_actions }
                                  ↓
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
           A 类（环境依赖）  B 类（数据授权）  C 类（内容生成）
                  │               │               │
                  ▼               ▼               ▼
            操作指令包      OAuth 连接器       最终结果
            + 一键复制      + 模板配置        + 调参数
                  │               │               │
                  └───────────────┴───────────────┘
                                  ↓
                          通用引导语（§2.3）
```

---

## 3. 产品定位与北极星指标

### 3.1 一句话定位

> **SkillHub = 跨环境、跨软件的 AI Skill 智能调度台**。**用一句话描述需求，我们帮您找到合适的 Skill 并直接出结果**。

### 3.2 北极星指标

**「Skill 一次成功率」（Skill First-Try Success Rate, SFTSR）**

```
SFTSR = （用户输入需求后，第一次就获得可使用结果的比例）
      = A 类：安装成功 + 至少一次操作完成
      + B 类：授权完成 + 模板可配置
      + C 类：生成结果 + 用户标记「可用」
目标：M3 ≥ 70%，M6 ≥ 85%
```

### 3.3 子指标

| 分类 | 指标 | 目标 |
|---|---|---|
| 全局 | 首页对话框采用率 / 总访问 | ≥ 40% |
| 全局 | 顶部软件过滤点击率 | ≥ 25% |
| A 类 | 一键安装完成率（OISR） | ≥ 85% |
| A 类 | 流程图降级完成率 | ≥ 50% |
| A 类 | 桌面助手下载率（唤起失败后） | ≥ 60% |
| B 类 | OAuth 授权完成率（开始 → 完成） | ≥ 75% |
| B 类 | 二次复用率（同一 Skill 第二次用） | ≥ 60% |
| C 类 | 生成结果满意率（用户未点「重生成」） | ≥ 65% |
| C 类 | 平均生成时长 | ≤ 8s |

### 3.4 反指标

| 指标 | 阈值 |
|---|---|
| 助手被误关/卸载率（30 天内） | < 5% |
| OAuth 拒绝率 | < 20% |
| 生成结果被举报违规 | < 0.1% |

---

## 4. 用户画像与核心旅程

### 4.1 用户分层（与 v1.0 一致，本节简略）

| 画像 | 占比 | 主用交付物 | 次用 |
|---|---|---|---|
| 小白用户（设计师/运营/营销） | 60% | C（内容生成）→ A（PS/Excel 插件） | B |
| 半技术用户（产品/独立开发者） | 25% | A（IDE 插件）→ C | B |
| AI 开发者 | 15% | A + CLI | C |

> **重要洞察**：60% 的小白用户**主要用 C 类**——他们最常见的诉求是「帮我写文案/做 PPT」，根本不需要装任何东西。所以 C 类必须做到「点开就用」，不能有任何摩擦。

### 4.2 核心旅程 A：小白用户首次使用 C 类

```
1. 访问 SkillHub
   ↓
2. 看到首页大对话框（NLU 入口）
   "描述您想解决的问题，我帮您找现成的 Skill"
   ↓
3. 输入：「帮我写一篇 618 母婴好物小红书」
   ↓
4. LLM 解析 → 标签 → 检索 → Top 3
   ↓
5. 推荐「小红书爆款文案 Skill」
   ↓
6. 点 [立即生成]
   ↓
7. 弹出输入参数：主题、语气、长度
   ↓
8. 8 秒后生成结果
   ↓
9. 用户 [复制] / [重生成] / [调参数]
```

### 4.3 核心旅程 B：A 类（设计师装 PS 滤镜）

```
1. 用户在首页输入：「帮我把照片皮肤磨皮」
   ↓
2. 推荐「PS 磨皮 Skill」
   ↓
3. 弹「操作指令包」（§2.2-A）：
   - GIF 演示
   - 配置代码（已高亮）
   - [📋 一键复制]
   - 关键引导语（§2.3）
   ↓
4a. 选「自动安装」→ 走桌面助手（一键安装）
4b. 选「看图文步骤」→ 半自动降级流程图
```

### 4.4 核心旅程 C：B 类（运营同步飞书到 Notion）

```
1. 用户输入：「把本周飞书会议纪要同步到 Notion」
   ↓
2. 推荐「飞书 → Notion 自动同步 Skill」
   ↓
3. 弹 OAuth 连接器（§2.2-B）：
   - [授权飞书] [授权 Notion]
   ↓
4. 用户完成双 OAuth（页面跳转回来）
   ↓
5. 进入模板配置页（§2.2-B 下半部分）
   ↓
6. 用户保存模板
   ↓
7. 后续用户在 SkillHub 对话框说「同步」即可触发
```

---

## 5. 范围与非范围

### 5.1 In Scope

- ✅ 智能问答入口（首页大对话框，LLM 意图解析）
- ✅ 技能货架与顶部软件图标过滤
- ✅ Skill 详情页（**三形态差异化渲染**）
- ✅ 内容生成型 Skill 的「立即生成」流程
- ✅ 数据授权型 Skill 的 OAuth 连接器 + 模板配置
- ✅ 环境依赖型 Skill 的操作指令包 + 桌面助手
- ✅ 桌面助手（Tauri + Rust，Windows + macOS）
- ✅ `skillhub://` 自定义协议
- ✅ 软件路径自动扫描 + 手动补位
- ✅ 安装剧本引擎（双轨：内置 + 发布者声明）
- ✅ Python/Node 运行时便携版
- ✅ 半自动降级流程图
- ✅ Web 端「我有这些软件」多选框（替代强制下载助手）
- ✅ 桌面端本机软件清单上报 → 反向 Skill 推送
- ✅ 安装埋点与 OISR/SFTSR 仪表盘
- ✅ 进度通道（SSE）

### 5.2 Out of Scope

- ❌ Linux 桌面助手（M3 评估）
- ❌ 移动端 Skill
- ❌ 助手自动升级（M3 不做）
- ❌ 助手中的「技能商店浏览」（助手只做执行）
- ❌ 付费/订阅逻辑（V3 路线已有）
- ❌ 已装技能的卸载 UI

---

## 6. 关键决策（已锁定）

### D1 ✅ 桌面端技术栈：**Tauri + Rust**

（与 v1.0 一致，理由不变）

### D2 ✅ 剧本来源：**双轨（发布者声明 + 平台内置白名单）**

（与 v1.0 一致）

### D3 ✅ 协议唤起失败兜底：**强推助手 + 自动展开流程图双轨**

（与 v1.0 一致）

### D4 ✅ 进度通道：**Server-Sent Events（SSE）**

（与 v1.0 一致）

### D5 ✅ 运行时分发：**嵌入便携版到助手安装包**

（与 v1.0 一致）

### D6 ✅ LLM 接入策略：**用户本地 Key + 助手转发（默认） / 云端托管（占位，未来启用）**

> **决策日期**：2026-08；**v2.0 调整**：云端不再默认提供 LLM 服务。用户自带 Key，本地助手转发。
>
> **为什么这样调整**：
1. **隐私合规**：用户 Key 不上云，零泄露风险（GDPR/个保法友好）
2. **成本透明**：用户用自己 Key，按调用量付费给 LLM Provider，不经过平台「中间商」
3. **多 Provider 自由**：用户可选 DeepSeek / OpenAI / GLM / 自托管 vLLM，不被绑死
4. **保留云端服务口**：`LlmGateway` 代码占位写好（注释清楚），未来想托管只需开关切换，不重写架构
5. **代价**：C 类 Skill **必须依赖桌面助手**才能工作（详见 §14 里程碑调整）

| 阶段 | 策略 | 说明 |
|---|---|---|
| **主路径（M1+）** | 用户本地 Key + 助手转发 | Web 请求 → 桌面助手（解密本地 Key）→ 调 LLM Provider → 返回 Web |
| **占位服务口** | `apps/web/lib/services/LlmGateway.ts` | 代码留 hook + 注释「未来云端托管启用」，默认抛 503 |
| **兜底** | 启发式 | LLM 超时/失败/未配置 Key 时退化为 SQL LIKE + 关键词字典 |
| **缓存** | 助手端 SQLite（24h）+ LLM Provider prompt cache | 跨 Web 端 + 助手端，相同 query 不重复扣费 |
| **冷启动** | 关键词字典 | 首次部署 / 用户未配置 Key 时，硬编码 `关键词 → 标签` 映射 |

**默认 Provider 推荐**：DeepSeek（理由保留 v2.0：价格、中文、OpenAI 兼容）；但用户可自由切换。

**模型选型**（用户可选，默认 DeepSeek）：

| 用途 | 模型 | 理由 |
|---|---|---|
| 意图解析（F1） | `deepseek-chat` | 8B 价位、中文强、JSON 模式稳定 |
| 内容生成（C 类，F6） | `deepseek-chat`（默认）/ `deepseek-reasoner`（复杂推理型 Skill） | 95% 的 C 类是文案/纪要等「生成型」任务，chat 足够；少量需要推理的可切 reasoner |
| Embedding（V3 路线已有，云端托管） | `deepseek-embed` | 已接入；该服务走云端，不经助手（不算用户 Key） |

### D6.1 ✅ 用户 Key 存储与转发

| 项 | 决策 | 说明 |
|---|---|---|
| Key 存储位置 | **助手本地配置文件** | `apps/helper/.data/llm-keys.json`，AES-256 加密，密钥从用户机器指纹派生 |
| 多 Provider 支持 | ✅ 同时支持 DeepSeek / OpenAI / GLM / 自定义 baseURL | 用户在助手设置页切换 |
| Key 入云 | ❌ **永不**入云 | 助手转发时 Key 始终在助手内存中，不写入日志、不上报埋点 |
| 转发协议 | Web ↔ 助手：本机 HTTP（`127.0.0.1:port`） + mTLS | 助手启动时随机端口，Web 通过 `skillhub://` 协议唤起时获取端口号 |
| 助手离线时 | C 类降级为「未配置」提示 | 「请在 SkillHub Helper 设置中填入您的 LLM API Key」 |

### D6.2 ✅ 助手转发链路（核心数据流）

```
Web (apps/web)
   │ POST /api/v2/intent/parse { query }
   │ ↓
   │ 后端校验登录态、查询 Redis 缓存
   │ ↓ 缓存未命中
   │ 调助手本机 HTTP: POST http://127.0.0.1:{port}/llm/chat
   │   ↓
   │   助手解密本地 Key
   │   ↓
   │   调 DeepSeek API（用户自费）
   │   ↓
   │   返回结果
   │ ↓
   │ 后端写缓存 + 转发响应
   ↓
Web 渲染 Top 3 推荐
```

**助手本机 HTTP 端点**（新增 `apps/helper/src-tauri/src/llm_proxy.rs`）：

```
POST  http://127.0.0.1:{port}/llm/chat         # 通用 LLM 调用（意图解析 + 内容生成）
GET   http://127.0.0.1:{port}/llm/status        # 助手当前是否配置了 Key（前端探测用）
POST  http://127.0.0.1:{port}/llm/keys/test     # 测试某个 Provider 的 Key 是否有效
```

**CORS / 同源**：助手本机 HTTP 仅绑定 `127.0.0.1`，不暴露 LAN；Web 通过 `skillhub://` 协议唤起助手后从注册表/响应中读端口号写入到 `window.__SKILLHUB_HELPER_PORT__`。

**LLM 输入输出契约**：

```typescript
// 输入
type IntentParseInput = {
  query: string;                          // 用户口语化描述
  available_software: SoftwareTag[];      // 当前用户本机已装的软件（来自环境检测）
  available_intents: IntentTag[];         // 平台已注册的意图标签
};

// 输出
type IntentParseOutput = {
  software_tags: string[];                // e.g. ["photoshop", "vscode"]
  intent_tags: string[];                  // e.g. ["image-retouch", "code-diagnose"]
  skill_category: 'A' | 'B' | 'C';        // 关键：决定交付物类型
  confidence: number;                     // 0-1
  reasoning?: string;                     // LLM 解释，用于调试
};
```

### D7 ✅ 三交付物必含元素（按你确认的清单）

| 交付物 | 必含元素 |
|---|---|
| **A. 操作指令包** | ①软件路径图标 ② 文案描述 ③ GIF/视频动图（≤ 1 分钟）④ 一键复制代码块按钮 ⑤ 「遇到问题点这里」反馈文档链接 ⑥ 关键引导语（§2.3） |
| **B. OAuth 连接器** | ① 第三方 Logo + 锁名 ② 「授权飞书」/「授权 Notion」双 OAuth 按钮 ③ 授权后跳转到「下一步」模板配置页 ④ 后续可重复使用同一 Skill |
| **C. 最终结果** | ① 直接出结果（文案/PPT/纪要）②「不满意？重生成」按钮 ③ 「调参数」侧边栏（语气、长度、格式）④ 一键下载 / 复制 / 同步到第三方 |

---

## 7. 功能需求

### F1 智能问答入口（首页对话框，P0）

**描述**：页面中央大对话框，占屏幕 60%，NLU 入口替代传统搜索框。

**用户故事**：

> 作为一名运营，**我想**用日常语言描述我想要的，**以便**不用先想清楚「我要找哪个分类」。

**前端组件**：`apps/web/components/chat-intent-input.tsx`

```tsx
<ChatIntentInput
  placeholder="描述您想解决的问题，我帮您找现成的 Skill..."
  examples={[
    "帮我把照片皮肤磨皮",
    "把本周飞书会议纪要同步到 Notion",
    "写一篇 618 母婴好物小红书",
  ]}
  onSubmit={async (query) => {
    // 前端先探测助手是否配置了 Key，未配置就提示去设置
    const helperStatus = await fetch('http://127.0.0.1:' + window.__SKILLHUB_HELPER_PORT__ + '/llm/status');
    if (!helperStatus.ok) {
      // 走启发式兜底，不阻塞用户
      showToast('未配置 LLM Key，将使用关键词匹配，结果可能不够精准');
    }
    const intent = await fetch('/api/v2/intent/parse', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
    return intent.json(); // IntentParseOutput
  }}
/>
```

**后端逻辑**：

```
POST /api/v2/intent/parse
Body: { query: string, client_context?: { detected_software?: string[] } }
↓
1. 校验登录态 + Redis 缓存查询（key = hash(query)）
2. 缓存命中 → 直接返回
3. 缓存未命中 → 通过助手本机 HTTP 调 LLM（POST http://127.0.0.1:{port}/llm/chat）
   ├─ 助手在线 + 已配 Key → 转发调用（用户自费）→ 拿到 LLM 输出
   ├─ 助手在线 + 未配 Key → 返回 503，前端降级
   ├─ 助手离线 → 后端直接降级到启发式
   └─ LLM 失败 / 超时（>3s） → 启发式兜底 + 异步回填缓存
4. 输出校验 schema → 写缓存 → 返回
↓
Response: IntentParseOutput
```

**后端 → 助手转发代码骨架**（核心模块 `apps/web/lib/services/LlmGateway.ts`，保留云端服务口占位）：

```typescript
// apps/web/lib/services/LlmGateway.ts (新增)
//
// ┌────────────────────────────────────────────────────────────────┐
// │ 占位说明 (2026-08 决策 D6)                                      │
// │ - 当前默认走「用户本地 Key + 助手转发」链路                       │
// │ - 本文件保留云端直连 hook，但默认抛 SERVICE_DISABLED             │
// │ - 未来若启用云端托管，把下方 useCloudFallback 改 true 即可       │
// └────────────────────────────────────────────────────────────────┘

export class LlmGateway {
  private useCloudFallback = false;  // 🔒 占位开关，默认 false

  async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
    // 1. 助手转发（默认路径）
    const helperPort = await this.getHelperPort();  // 从 window.__SKILLHUB_HELPER_PORT__ 或协议回调
    if (helperPort) {
      const res = await fetch(`http://127.0.0.1:${helperPort}/llm/chat`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
      if (res.ok) return await res.json();
    }

    // 2. 启发式兜底（始终可用）
    if (!this.useCloudFallback) return this.heuristicFallback(req);
    
    // 3. 云端直连（占位，默认不启用）
    // const cloudRes = await this.callCloudLlm(req);
    // return cloudRes;
    throw new Error('SERVICE_DISABLED: 云端 LLM 服务当前未启用，请配置桌面助手 LLM Key');
  }

  private heuristicFallback(req: LlmChatRequest): LlmChatResponse {
    // 关键词字典 + SQL LIKE 检索
    return { /* IntentParseOutput from dictionary */ };
  }
}
```

**Prompt 模板**：

```text
你是一个 Skill 分类器。给定用户的口语化需求，输出结构化 JSON。

可用软件标签：photoshop, vscode, blender, excel, feishu, notion, gmail, ...

可用意图标签：image-retouch, code-diagnose, doc-sync, content-write, ...

Skill 分类规则：
- A 类（环境依赖型）：必须配合已装软件才能用，如「PS 修图」「VSCode 调试」
- B 类（数据授权型）：需要连接第三方账号，如「飞书同步 Notion」「邮件归档」
- C 类（内容生成型）：在线直接出结果，如「写文案」「做 PPT」「会议纪要」

用户输入：「帮我把照片皮肤磨皮」

输出 JSON：
{
  "software_tags": ["photoshop"],
  "intent_tags": ["image-retouch"],
  "skill_category": "A",
  "confidence": 0.95
}
```

### F2 技能货架与软件过滤（P0）

**描述**：页面顶部显示常用软件图标，点击只显示适配该软件的 Skill。

**前端组件**：`apps/web/components/software-icon-bar.tsx`

```tsx
<SoftwareIconBar
  software={[
    { id: 'photoshop', icon: '🎨', name: 'Photoshop', count: 12 },
    { id: 'vscode', icon: '💻', name: 'VS Code', count: 28 },
    { id: 'excel', icon: '📊', name: 'Excel', count: 9 },
    { id: 'feishu', icon: '🪶', name: '飞书', count: 7 },
    { id: 'figma', icon: '🎯', name: 'Figma', count: 4 },
    { id: 'blender', icon: '🎬', name: 'Blender', count: 6 },
  ]}
  activeSoftwareId="photoshop"
  onSelect={(id) => router.push(`/?software=${id}`)}
/>
```

**后端**：`GET /api/v2/skills?software=photoshop&category=A`

**本机已装软件高亮**（来自 F14）：

```
Photoshop(12)  ← 用户本机已装，显示「已装」小绿点
VSCode(28)     ← 用户本机已装，显示「已装」小绿点
Excel(9)       ← 未装，正常显示
...
```

### F3 Skill 详情页（三形态差异化，P0）

**描述**：详情页根据 Skill 的 `category`（A/B/C）渲染完全不同的 UI。

**前端组件**：`apps/web/app/skills/[slug]/page.tsx`

```tsx
export default async function SkillDetailPage({ params }) {
  const skill = await getSkill(params.slug);
  
  return (
    <SkillDetailLayout>
      <SkillHeader skill={skill} />
      
      {skill.category === 'A' && <EnvironmentDeliverable skill={skill} />}
      {skill.category === 'B' && <OAuthDeliverable skill={skill} />}
      {skill.category === 'C' && <ContentDeliverable skill={skill} />}
      
      <SkillReviews skill={skill} />
    </SkillDetailLayout>
  );
}
```

**Skill 元数据必含字段**（AI Coding 可理解）：

```typescript
type SkillMetadata = {
  slug: string;
  name: string;
  description: string;
  category: 'A' | 'B' | 'C';           // 关键：决定交付物形态
  target_software?: string;            // A 类必填，如 "Adobe Photoshop 2024"
  install_type?: InstallType;          // A 类必填
  dependencies?: Dependency[];         // 如 python>=3.9, requests
  execution_commands?: ExecutionCommand[]; // 不同 OS 的安装命令
  oauth_providers?: OAuthProvider[];   // B 类必填
  llm_config?: LLMConfig;              // C 类必填
};

type InstallType = 'command_line' | 'copy_folder' | 'api_key' | 'plugin_market';

type ExecutionCommand = {
  os: 'windows' | 'macos' | 'linux';
  shell: 'cmd' | 'powershell' | 'bash' | 'zsh';
  commands: string[];                  // ["pip install xxx", "cp ./plugin /Applications/..."]
};

type OAuthProvider = {
  id: string;                          // e.g. "feishu"
  name: string;
  scopes: string[];
};

type LLMConfig = {
  model: string;
  temperature: number;
  input_schema: JSONSchema;            // 生成参数的结构化定义
  prompt_template: string;
};
```

### F4 安装执行（A 类，P0）

（与 v1.0 F1 一致，保留完整逻辑）

**A 类三按钮逻辑**：

| install_type | 用户操作 | 底层动作 |
|---|---|---|
| `plugin_market` (VSCode/.vsix) | 点击「一键安装」 | 助手拉 `.vsix` → 调用 VSCode `code --install-extension` |
| `copy_folder` (PS .8bf / Blender .py) | 点击「一键安装」 | 助手定位软件路径 → 拷贝文件 → 验证 |
| `command_line` (pip/npm) | 点击「自动配置环境」 | 助手检测运行时 → 缺失则静默装 → 执行命令 |
| `api_key` (OpenAI/Anthropic) | 点击「获取 Key 并注入」 | Web 引导输入 → 助手加密写入 `.env` |

### F5 OAuth 连接器（B 类，P0）

**描述**：B 类 Skill 的「安装」实际上是 OAuth 授权。

**状态机**：

```
INITIAL → OAUTH_PENDING (双 OAuth) → TEMPLATE_CONFIG → ACTIVE
   ↑                                                  │
   └────────────────── REVOKED ────────────────────────┘
```

**数据库字段**（`UserOAuthConnection`）：

```prisma
model UserOAuthConnection {
  id              String   @id @default(cuid())
  userId          String
  providerId      String                  // "feishu" | "notion" | ...
  accessToken      String   @db.Text        // AES 加密
  refreshToken    String?  @db.Text
  expiresAt       DateTime?
  scopes          String[]
  connectedAt     DateTime @default(now())
  
  @@unique([userId, providerId])
}
```

**前端组件**：`apps/web/components/oauth-connector.tsx`

```tsx
<OAuthConnector
  providers={[
    { id: 'feishu', name: '飞书', logo: '/logos/feishu.svg', status: 'pending' },
    { id: 'notion', name: 'Notion', logo: '/logos/notion.svg', status: 'connected' },
  ]}
  onAuthorize={async (providerId) => {
    // 1. 跳转到 OAuth 提供方
    const url = await fetch(`/api/v2/oauth/${providerId}/authorize`);
    window.location.href = url.authUrl;
  }}
  onAllConnected={() => router.push(`/skills/${slug}/configure`)}
/>
```

**后端路由**：

```
GET  /api/v2/oauth/[provider]/authorize   → 返回 authUrl
GET  /api/v2/oauth/[provider]/callback    → 处理回调，存储 token
GET  /api/v2/oauth/status                 → 查询当前用户所有 provider 连接状态
DELETE /api/v2/oauth/[provider]           → 撤销授权
```

### F6 即时生成（C 类，P0）

**描述**：C 类 Skill 直接在 Web 端生成结果，无安装。

**前端组件**：`apps/web/components/content-deliverable.tsx`

```tsx
<ContentDeliverable
  skill={skill}
  llmConfig={skill.llm_config}
  onGenerate={async (params) => {
    const res = await fetch(`/api/v2/skills/${skill.slug}/generate`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
    return res.json(); // { content: string, tokens_used: number }
  }}
  onSave={async (content) => {
    await fetch('/api/v2/user/saved-skills', {
      method: 'POST',
      body: JSON.stringify({ skillSlug: skill.slug, content })
    });
  }}
/>
```

**后端路由**：

```
POST /api/v2/skills/[slug]/generate
Body: { params: Record<string, any> }
↓
1. 加载 skill.llm_config
2. 用 params 填充 prompt_template
3. 通过助手转发调 LLM（同 F1 链路，流式 SSE 输出）
   - 助手未配 Key → 503，前端降级展示「请在 SkillHub Helper 设置中填入您的 LLM API Key」
4. 返回结果（含 token 用量统计，仅记录数字不存内容）
↓
Response: { content: string, tokens_used: number, duration_ms: number }
```

> **重要变更（D6）**：C 类 Skill **强依赖桌面助手**。Web 端不再直接调 LLM，所有调用都经助手转发。这是「C 类必装助手」的新约束。

### F7-F12：桌面助手、协议、软件扫描、剧本引擎、运行时、降级流程图

（与 v1.0 F2/F3/F4/F5/F6/F7 完全一致，本节简略，详见 [v1.0 §6-F2~F7](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md#6-功能需求)）

**调整点**：这些功能**只服务于 A 类 Skill**，不再覆盖所有 Skill。

### F13 环境检测（Web 端 + 桌面端，P0）

**描述**：检测用户本机已装软件，用于过滤栏高亮 + 个性化推荐。

#### F13.1 Web 端降级方案（**避免一开始就强制下载助手**）

```
首页右上角：「我有这些软件」多选框
   [ ☑ Photoshop ]
   [ ☑ VS Code ]
   [ ☐ Excel  ]
   [ ☐ 飞书   ]
   [ ☐ Figma  ]
   [ ☐ Blender]
   [ + 自定义 ]
```

#### F13.2 桌面端升级（如果已装助手）

```
"🎉 检测到您已安装 SkillHub Helper，正在识别本地软件..."
Photoshop ✓  VSCode ✓  Excel ✓  Figma ✗  Blender ✗
   ↓
自动勾选「我有这些软件」多选框对应项
```

### F14 本地软件清单上报 + 反向推送（P1）

**描述**：助手扫描到本机软件后，主动上报给后端，用于：
1. 顶部软件过滤栏显示「已装」标识
2. 新 Skill 发布时，反向推送给有这个软件的用户

**数据流**：

```
Helper 启动
  ↓
扫描本机软件列表 [ps, vscode, blender]
  ↓
POST /api/v2/helper/heartbeat { installed_software: [...] }
  ↓
后端存到 UserInstalledSoftware 表
  ↓
定时任务：检查每个用户「已装软件 × 新发布 Skill」匹配
  ↓
匹配上 → 推 Web 通知 + 邮件（可选）
```

**前端组件**：`apps/web/components/software-icon-bar.tsx` 高亮已装项 + 红点徽章（新匹配）

```tsx
<SoftwareIconBar
  software={[
    { id: 'photoshop', icon: '🎨', name: 'Photoshop', count: 12, installed: true, newCount: 2 },
    { id: 'vscode', icon: '💻', name: 'VS Code', count: 28, installed: true },
    { id: 'excel', icon: '📊', name: 'Excel', count: 9, installed: false },
    ...
  ]}
/>
```

### F15 安装埋点与遥测（P0）

**保留 v1.0 F8 全部事件**，**新增**：

| event_name | 触发时机 | 关键字段 |
|---|---|---|
| `intent_parsed` | LLM 解析用户 query | `query_hash`, `category`, `confidence`, `cache_hit` |
| `deliverable_rendered` | 三类交付物渲染 | `skill_category`, `skill_slug` |
| `oauth_started` | 用户点 OAuth 授权 | `provider_id` |
| `oauth_completed` | OAuth 回调成功 | `provider_id`, `duration_ms` |
| `content_generated` | C 类生成完成 | `skill_slug`, `tokens_used`, `satisfaction_mark` |
| `software_installed_reported` | 助手上报本机软件 | `software`, `count` |
| `reverse_push_delivered` | 反向推送触达 | `user_id`, `matched_skills[]` |

---

## 8. 非功能需求

（与 v1.0 §7 几乎一致，新增 LLM 响应时长约束）

| 指标 | 目标 |
|---|---|
| 首页对话框 LLM 解析端到端 | ≤ 2s（缓存命中 ≤ 200ms）|
| 内容生成型端到端 | ≤ 8s |
| 一键安装端到端（A 类，不含运行时） | ≤ 60s |
| 助手冷启动到空闲 | ≤ 800ms |
| 协议唤起到助手窗口显示 | ≤ 500ms |
| 助手续期内存（空闲） | ≤ 30MB |
| SSE 端到端延迟 | ≤ 1s |
| Helper 安装包 | ≤ 2MB（不含运行时）|

---

## 9. 技术架构

### 9.1 全局组件图（v2.0 重大调整）

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Web (apps/web)                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  首页                                                        │    │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐    │    │
│  │  │ ChatIntentInput (60%)   │  │ SoftwareIconBar (顶部)   │    │    │
│  │  │ - NLU 入口               │  │ - 软件过滤              │    │    │
│  │  │ - 调用 LLM 解析          │    │ - 已装高亮（小红点）     │    │    │
│  │  └─────────────────────────┘  └─────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  详情页（三形态路由）                                          │    │
│  │  - EnvironmentDeliverable (A 类) → 操作指令包 + 助手唤起       │    │
│  │  - OAuthDeliverable (B 类)      → OAuth 跳转 + 模板配置       │    │
│  │  - ContentDeliverable (C 类)     → 立即生成 + 调参数          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          ↕ fetch / SSE / WebSocket                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  API Routes                                                  │    │
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐   │    │
│  │  │ /intent/parse  │ │ /oauth/*       │ │ /skills/*      │   │    │
│  │  │ (LLM 调用)      │ │ (OAuth 流程)   │ │ /generate      │   │    │
│  │  └────────────────┘ └────────────────┘ └────────────────┘   │    │
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐   │    │
│  │  │ /install/jobs  │ │ /helper/*      │ │ /user/*        │   │    │
│  │  │ (A 类 SSE)     │ │ (心跳 + 上报)  │ │ (已装软件)     │   │    │
│  │  └────────────────┘ └────────────────┘ └────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          ↕ Prisma + Redis                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL                                                  │    │
│  │  - Skill (含 category 字段), IntentTag, SoftwareTag          │    │
│  │  - InstallJob, PlaybookDefinition, UserInstalledSoftware     │    │
│  │  - UserOAuthConnection, OAuthTemplate                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          ↕                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  LLM Gateway (新增)                                          │    │
│  │  - 默认走「助手转发」：Web → 助手本机 HTTP → LLM Provider     │    │
│  │  - 云端直连占位（useCloudFallback=false），未来托管可启用     │    │
│  │  - 启发式兜底（关键词字典 + SQL LIKE）                        │    │
│  │  - Redis TTL 24h 缓存                                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↕ skillhub://install/xxx
┌─────────────────────────────────────────────────────────────────────┐
│              Desktop Helper (apps/helper) — 仅服务 A 类            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Rust Backend                                                │    │
│  │  - protocol.rs / scanner.rs / env.rs                         │    │
│  │  - playbook.rs (剧本引擎)                                     │    │
│  │  - progress.rs (SSE 上报)                                    │    │
│  │  - reporter.rs (新增：本机软件清单上报)                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              ↕ OAuth 重定向
┌─────────────────────────────────────────────────────────────────────┐
│         第三方 Provider（飞书/Notion/Gmail/...）                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 模块依赖

```
apps/web ─────► packages/skill-validator (校验 SKILL.md 含 category/install_type)
   │
   ├────► LLM Gateway (apps/web/lib/services/LlmGateway.ts)
   │         └─→ 转发到 apps/helper 本机 HTTP（用户本地 Key）
   │
   ├────► packages/skill-test-harness (CI 中 dry-run 剧本 + 校验 llm_config)
   │
   └────► apps/cli (复用流程图命令生成)

apps/helper (独立 Tauri 工程，不在 monorepo build)
   │
   ├─→ llm_proxy.rs (本机 HTTP 服务，转发到用户配置的 LLM Provider)
   ├─→ reporter.rs (本机软件清单上报)
   └─→ Key 存 .data/llm-keys.json (AES 加密)

apps/helper (独立 Tauri 工程，不在 monorepo build)
```

---

## 10. 数据模型

新增 / 修改 Prisma 表：

```prisma
// 1. 修改 Skill 表，增加 category 字段
model Skill {
  id              String   @id @default(cuid())
  slug            String   @unique
  name            String
  description     String
  category        SkillCategory         // 【新增】A | B | C
  target_software String?               // A 类必填
  install_type    InstallType?          // A 类必填
  dependencies    Json?                 // A 类
  execution_commands Json?              // A 类
  oauth_providers Json?                 // B 类
  llm_config      Json?                 // C 类
  // ... 其他字段保持不变
}

enum SkillCategory {
  ENVIRONMENT_DEPENDENT  // A
  OAUTH_AUTHORIZED        // B
  CONTENT_GENERATION      // C
}

enum InstallType {
  COMMAND_LINE
  COPY_FOLDER
  PLUGIN_MARKET
  API_KEY
}

// 2. 新增 IntentTag / SoftwareTag（多对多关联）
model IntentTag {
  id      String @id
  name    String @unique             // "image-retouch", "code-diagnose"
  skills  Skill[]                    // 多对多
}

model SoftwareTag {
  id      String @id
  name    String @unique             // "photoshop", "vscode"
  icon    String?
  skills  Skill[]
}

// 3. 新增用户已装软件（来自助手上报或 Web 多选）
model UserInstalledSoftware {
  id          String   @id @default(cuid())
  userId      String
  softwareId  String                 // "photoshop"
  source      SoftwareSource         // WEB_CHECKBOX | HELPER_SCAN
  version     String?
  lastSeenAt  DateTime @default(now())
  
  @@unique([userId, softwareId])
}

enum SoftwareSource {
  WEB_CHECKBOX
  HELPER_SCAN
}

// 4. 新增 OAuth 连接
model UserOAuthConnection {
  id           String   @id @default(cuid())
  userId       String
  providerId   String                 // "feishu"
  accessToken  String   @db.Text       // AES 加密
  refreshToken String?  @db.Text
  expiresAt    DateTime?
  scopes       String[]
  connectedAt  DateTime @default(now())
  
  @@unique([userId, providerId])
}

// 5. 新增 OAuth 模板（B 类 Skill 复用）
model OAuthTemplate {
  id          String   @id @default(cuid())
  userId      String
  skillSlug   String
  name        String
  config      Json                    // 字段映射、同步规则等
  createdAt   DateTime @default(now())
}

// 6. InstallJob, InstallEvent, PlaybookDefinition, UserSoftwarePath（保留 v1.0 定义）
```

---

## 11. 剧本 DSL

（与 v1.0 §10 完全一致，仅服务 A 类 Skill，详见 [v1.0](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md#10-剧本-dslplaybook-spec)）

---

## 12. API 契约

### 12.1 意图解析（**新增**）

```
POST /api/v2/intent/parse
Body: {
  "query": "帮我把照片皮肤磨皮",
  "client_context": {
    "detected_software": ["photoshop", "vscode"]   // 来自 F13
  }
}
→ 200 OK
{
  "software_tags": ["photoshop"],
  "intent_tags": ["image-retouch"],
  "skill_category": "A",
  "confidence": 0.95,
  "matched_skills": [
    { "slug": "photoshop-skin-smoother", "name": "PS 磨皮 Skill", "score": 0.92 },
    { "slug": "photoshop-portrait-enhancer", "name": "人像精修", "score": 0.85 }
  ],
  "cached": false,
  "duration_ms": 1240,
  "llm_path": "helper"            // 【新增】标记走了哪条路径：helper | cloud(占位) | heuristic
}
```

**响应中的 `llm_path` 字段**（用于埋点分析）：

| 取值 | 含义 |
|---|---|
| `helper` | 助手转发成功（最常见，用户自费） |
| `cache` | Redis 命中（24h 内同 query） |
| `heuristic` | 助手离线 / 未配 Key / LLM 失败降级到关键词字典 |
| `cloud` | 云端直连（**当前不启用**，仅占位） |

### 12.2 内容生成（**新增**）

```
POST /api/v2/skills/[slug]/generate
Body: { "params": { "topic": "618 母婴", "tone": "活泼", "length": "中等" } }
→ 200 OK (or SSE 流式)
{
  "content": "宝妈必囤！618 这 5 款...",
  "tokens_used": 380,
  "duration_ms": 6200
}
```

### 12.3 OAuth 流程（**新增**）

```
GET  /api/v2/oauth/[provider]/authorize?skill=<slug>  → 302 redirect to provider
GET  /api/v2/oauth/[provider]/callback?code=xxx       → 存储 token, 302 redirect to /skills/[slug]/configure
GET  /api/v2/oauth/status?skill=<slug>                → { feishu: 'connected', notion: 'pending' }
DELETE /api/v2/oauth/[provider]                       → 撤销
```

### 12.4 助手心跳（新增 software 字段）

```
GET /api/v2/helper/heartbeat
→ 200 OK
{
  "alive": true,
  "version": "1.0.0",
  "supported_playbook_versions": ["v1"],
  "installed_software": ["photoshop", "vscode", "blender"],   // 【新增】
  "default_software_paths": { "photoshop": "C:\\..." }
}
```

### 12.5 安装任务、剧本、埋点、降级流程图

（与 v1.0 §11 一致，详见 [v1.0](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md#11-api-契约)）

---

## 13. 安全与权限模型

（与 v1.0 §12 一致，新增 OAuth 相关）

### 13.1 OAuth Token 存储

- AES 加密存储在 `UserOAuthConnection.accessToken`
- 加密密钥从用户 session 派生（PBKDF2 / HKDF）
- 不写入日志、不上报埋点

### 13.2 反向推送隐私

- 用户可关闭「软件清单上报」（助手设置）
- 反向推送的匹配规则公开（避免「黑盒推荐」）

---

## 14. 实施路线图与里程碑

### 14.1 总览：3 个里程碑，12 周

```
M1 (W1-W5)   ──►  助手 MVP + C 类 + NLU 入口（必须同时上线）
M2 (W6-W9)   ──►  A 类（协议 + 剧本 + 内置 5 个剧本）
M3 (W10-W12) ──►  B 类（OAuth）+ 反向推送 + 运行时嵌入
```

> **理由（v2.0.2 调整）**：D6 决策后，**C 类强依赖桌面助手**——Web 端不再直接调 LLM。所以助手必须 M1 同步上线，不能再延后到 M2。M1 任务量更紧：5 周内既要做助手最小骨架（含 LLM 转发），又要跑通 C 类全链路。

### M1：助手 MVP + 内容生成 + 智能入口（W1-W5）

| 任务 | 工期 |
|---|---|
| 数据库：Skill 表加 `category` 字段 + IntentTag/SoftwareTag 表 + migration | 2d |
| **【M1 新增】** `apps/helper` Tauri 骨架 + 协议注册（仅 Windows/Mac 注册表基础） | 2d |
| **【M1 新增】** `llm_proxy.rs`：助手本机 HTTP 服务 + Key AES 加解密 + 多 Provider 适配（DeepSeek/OpenAI/GLM） | 3d |
| **【M1 新增】** `LlmGateway.ts`：默认助手转发 + 占位云端 hook（`useCloudFallback=false`） + 启发式兜底 | 2d |
| **【M1 新增】** 助手设置页 UI：填 Key、切换 Provider、Test Key | 1.5d |
| `POST /api/v2/intent/parse` 端到端（含 Prompt 模板 + 助手转发） | 2d |
| 首页 `ChatIntentInput` 组件（占屏 60% 大对话框） | 2d |
| `SoftwareIconBar` 顶部软件过滤 | 1d |
| Skill 详情页骨架（三形态路由壳） | 2d |
| **C 类详情页**：`ContentDeliverable` + 调参数 + 重生成 | 3d |
| `POST /api/v2/skills/[slug]/generate`（流式 SSE，经助手转发） | 2d |
| **环境检测 Web 端降级**：右上角「我有这些软件」多选框 + 「检测助手 Key」按钮 | 1d |
| 改造现有 5 个 Skill 为 C 类（写文案/做 PPT/纪要） | 1d |
| **【M1 新增】** Onboarding：首次访问引导「安装助手 + 填 Key」 | 1d |
| 联调：5 个 beta 用户走完 C 类旅程 | 2d |

**M1 验收**：
- C 类 SFTSR ≥ 70%（C 类子指标）
- LLM 解析平均 ≤ 2s（助手转发 + 启发式兜底双路径走通）
- 助手能成功装好 + 配置 Key + 转发 LLM 调用

### M2：环境依赖型 + 助手扩展（W6-W9）

> M2 接力 M1 的助手骨架，扩展为完整的 A 类安装器。

| 任务 | 工期 |
|---|---|
| `scanner.rs` 完整版（识别 5 个目标软件 + 手动补位 UI） | 2d |
| `playbook.rs` 完整版（http/extract/copy/move/command/pip-install/npm-install/file-exists） | 3d |
| 内置剧本：photoshop/vscode/blender/excel/ppt 共 5 个 | 3d |
| Web 端 `InstallButton` + `/api/v2/helper/heartbeat` + `/api/v2/install/jobs` | 2d |
| SSE 进度通道（A 类安装专用） | 2d |
| **A 类详情页**：`EnvironmentDeliverable` + 操作指令包 + GIF 演示 | 3d |
| Prisma migration（InstallJob, InstallEvent, PlaybookDefinition, UserSoftwarePath） | 1d |
| 半自动降级流程图组件 + 3 个 GIF 录制 | 2d |
| 助手埋点上报（本机软件清单到 `UserInstalledSoftware`） | 1d |
| 联调：5 个 A 类 Skill 跑通 | 3d |

**M2 验收**：A 类 OISR ≥ 70%；5 个内置剧本都能装。

### M3：OAuth + 反向推送 + 运行时嵌入（W10-W12）

| 任务 | 工期 |
|---|---|
| OAuth 抽象层（飞书/Notion/Gmail 三家适配） | 5d |
| `POST /api/v2/oauth/*` 全套路由 | 2d |
| `UserOAuthConnection` / `OAuthTemplate` migration | 1d |
| **B 类详情页**：`OAuthDeliverable` + 模板配置页 | 3d |
| 助手「本机软件清单上报」扩展（`reporter.rs` + `/api/v2/helper/heartbeat` 新字段） | 1d |
| Web 端「已装软件」高亮 + 新匹配徽章 | 2d |
| 反向推送：定时检查「新 Skill × 用户已装软件」 | 3d |
| Python 3.11 embed win64 / macOS 嵌入 | 3d |
| Node 20 LTS 嵌入 | 2d |
| 助手代码签名 + macOS notarization | 2d |
| 灰度发布 | 2d |

**M3 验收**：B 类 OAuth 完成率 ≥ 75%；整体 SFTSR ≥ 85%。

---

## 15. 风险与开放问题

### 15.1 风险表（v2.0 新增 / 调整）

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | 杀毒软件拦截助手 | 高 | 高 | 代码签名 + 上报白名单（沿用 v1.0） |
| R2 | macOS Gatekeeper | 高 | 高 | Notarization（沿用 v1.0） |
| R3 | 用户用绿色版软件 | 高 | 中 | 手动补位 UI（沿用 v1.0） |
| R4 | **新增**：DeepSeek 解析错误（误判 A/B/C 类） | 中 | 高 | 缓存 + 启发式兜底 + 用户反馈纠错 + 收集 100 条后微调 prompt |
| R5 | **v2.0.2 调整**：用户自费 LLM Key，无平台成本风险；改为「用户 Key 被滥用 / 配额耗尽」 | 中 | 中 | 助手侧展示 Key 余额 / 配额；高频调用降级到启发式；用户主动刷新 Key 可恢复 |
| R6 | **新增**：OAuth 提供方变更接口 | 中 | 中 | 适配层隔离 + 监控告警 |
| R7 | **新增**：内容生成触发内容安全审核 | 中 | 高 | 接入 DeepSeek `safety_check` + 关键词黑名单二次过滤 |
| R8 | 发布者写恶意剧本 | 低 | 极高 | dry-run + 白名单 + 审计（沿用 v1.0） |
| R9 | **新增**：反向推送被用户视为骚扰 | 中 | 中 | 默认关闭，首次开启需用户主动 |
| R10 | **v2.0.2 新增**：C 类用户没装助手就无法体验（首页对话框会降级到启发式，效果差） | 高 | 中 | M1 加 Onboarding 引导「装助手 + 填 Key」；首页对话框弱化展示「试一下再说」按钮，先让用户尝到甜头 |
| R11 | **v2.0.2 新增**：助手本机 HTTP 端口被其他进程占用或防火墙拦截 | 中 | 高 | 助手启动时检测端口冲突自动顺延；首次安装时引导用户放行防火墙 |

### 15.2 开放问题

| # | 问题 | 建议 |
|---|---|---|
| ~~Q1~~ | ~~LLM 解析用 OpenAI 还是 GLM？~~ | **✅ 已决策（2026-08）：DeepSeek（`deepseek-chat`）**，理由见 §6 D6 |
| Q2 | 反向推送渠道（站内信 / 邮件 / 推送） | M3 决策；建议先站内信 |
| Q3 | B 类 Skill 的 OAuth Provider 谁来开发适配？ | 平台官方适配主流 5 家；长尾由发布者自行实现并审核 |
| Q4 | C 类 Skill 的执行是否需要「试运行」？ | F9 在线预览（V3 路线）实现后接入 |
| Q5 | 三交付物是否有必要统一成同一组件骨架？ | 不建议强制统一，会破坏每类的 UX |
| Q6 | **v2.0.2 调整**：原 DeepSeek 60 RPM 限流不再适用（用户自费 Key，受用户配额限制）；改为「用户 Key 配额触顶时降级还是排队？」 | **建议**：助手侧实时读 Key 余额，触顶时降级到启发式 + 弹窗「您的 Key 余额不足，请充值或更换 Key」 |
| Q7 | **v2.0.2 新增**：未装助手的 C 类用户首次体验如何最小化摩擦？ | **建议**：M1 上线「免 Key 试生成」（仅 1 次，平台埋单），让用户先尝到甜头，再引导装助手 |

---

## 16. 验收标准

### 16.1 M1 验收

- [ ] 助手可在 Win/Mac 安装、启动、注册协议（基础版）
- [ ] 助手设置页可填 DeepSeek/OpenAI/GLM Key，AES 本地加密存储
- [ ] 助手本机 HTTP 服务（`llm_proxy.rs`）启动成功，端口可被 Web 发现
- [ ] 首页大对话框可用，输入 query 后 2 秒内返回 Top 3 匹配
- [ ] 顶部软件过滤可用，点击图标只显示该软件的 Skill
- [ ] C 类详情页可生成、复制、重生成、调参数
- [ ] C 类生成走助手转发链路，助手未配 Key 时降级到启发式
- [ ] 「我有这些软件」多选框可用且持久化
- [ ] Onboarding 引导「装助手 + 填 Key」流程转化率 ≥ 50%
- [ ] LLM 缓存命中率 ≥ 30%
- [ ] SFTSR（C 类）≥ 70%
- [ ] LLM 解析平均耗时 ≤ 2s
- [ ] `llm_path` 埋点能区分 `helper | cache | heuristic | cloud`

### 16.2 M2 验收

- [ ] 助手可在 Win/Mac 安装、启动、注册协议
- [ ] 5 个 A 类 Skill 一键安装全部跑通
- [ ] 操作指令包含 GIF + 一键复制 + 关键引导语
- [ ] 半自动降级流程图可用，未装助手用户能完成至少 1 个安装
- [ ] OISR（A 类）≥ 70%
- [ ] 助手内存 ≤ 50MB（空闲）

### 16.3 M3 验收

- [ ] 飞书/Notion/Gmail 三家 OAuth 全流程跑通
- [ ] B 类详情页 OAuth 完成后跳转模板配置
- [ ] 助手上报本机软件，Web 端「已装」标识正确高亮
- [ ] 反向推送：新 Skill 发布后，已装该软件的用户收到推送
- [ ] Python/Node 嵌入版可静默安装
- [ ] 助手有 Authenticode / Notarization 签名
- [ ] SFTSR（整体）≥ 85%
- [ ] 零安全事故

---

## 17. 附录

### 17.1 相关文档

| 文档 | 关系 |
|---|---|
| [ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md) | **v1.0 归档**，技术细节（剧本 DSL/扫描规则） |
| [SKILLHUB_V3_UPGRADE_REQUIREMENTS.md](./SKILLHUB_V3_UPGRADE_REQUIREMENTS.md) | 平行路线 |
| [DUAL_MODE_ARCHITECTURE.md](./DUAL_MODE_ARCHITECTURE.md) | 自主管理 vs 全网搜索 |
| [AGENTS.md](../../AGENTS.md) | 仓库根入口 |

### 17.2 关键术语

| 术语 | 定义 |
|---|---|
| **Skill Category** | A（环境依赖）/ B（数据授权）/ C（内容生成）三分类 |
| **Deliverable** | 交付物：A=操作指令包 / B=OAuth 连接器 / C=最终结果 |
| **Helper** | 桌面助手（Tauri），**仅服务 A 类** |
| **Playbook** | 安装剧本 |
| **SFTSR** | Skill First-Try Success Rate，北极星指标 |
| **OISR** | One-Click Install Success Rate，A 类子指标 |
| **Intent Tag** | LLM 解析出的功能意图标签 |
| **Software Tag** | 软件标签 |

### 17.3 参考项目

- [Raycast Store](https://raycast.com) —— A 类参考（插件安装流程）
- [Zapier](https://zapier.com) —— B 类参考（OAuth + 模板配置）
- [ChatGPT Custom GPTs](https://chat.openai.com/gpts) —— C 类参考（立即生成）
- [Linear App](https://linear.app) —— 首页对话框 UX 参考
- [Anthropic Agent Skills](https://agentskills.io)
- [MCP Registry](https://registry.modelcontextprotocol.io)

### 17.4 待补充内容（v2.1）

- [ ] 首页对话框 UI 详细线框图
- [ ] 三类详情页的视觉规范
- [ ] OAuth 适配器实现细节（飞书/Notion/Gmail）
- [ ] LLM Prompt 模板 v1（基于首批 30 个真实 query 调优）
- [ ] 隐私协议 / 用户协议文案
- [ ] A/B 测试方案（首页对话框 vs 传统搜索框）

---

> **下一步**：本文档通过审核后，按 [§14 实施路线图](#14-实施路线图与里程碑) 启动 M1。**M1 优先做 C 类 + NLU 入口**（不需要装任何东西的 Skill），最快速度拿到 SFTSR 反馈。