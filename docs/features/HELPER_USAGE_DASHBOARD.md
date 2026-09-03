# Helper 用量 Dashboard 设计文档（M4，F18）

> **文档版本**: v0.1（初稿，2026-09）
> **关联文档**: [ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md §5.3 / §14.4 / F18](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md)
> **改造计划总纲**: [.qoder/plans/桌面端主客户端化改造方案_a99a4d27.md](../../.qoder/plans/桌面端主客户端化改造方案_a99a4d27.md)

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [数据流与存储](#2-数据流与存储)
3. [桌面端 Usage Tab](#3-桌面端-usage-tab)
4. [Web 端「我的用量」页](#4-web-端我的用量页)
5. [费用估算与币种](#5-费用估算与币种)
6. [隐私与限流](#6-隐私与限流)
7. [API 契约](#7-api-契约)
8. [Rust 模块设计](#8-rust-模块设计)
9. [埋点与验收](#9-埋点与验收)
10. [开放问题](#10-开放问题)

---

## 1. 背景与目标

### 1.1 三痛点之一

PRD §5.3 列出的三痛点：

| 痛点 | 解决位置 |
|---|---|
| ③ **看到自己已装 Skill 的 token 消耗** | 桌面端新增 Usage Tab + Web 端「我的用量」页 |

用户**自费 LLM Key**（D6 决策）后，必然想知道「我今天花了多少钱」「哪个 Skill 最烧 token」。但当前桌面端没有用量查询入口——用户必须到 LLM Provider 后台查，体验断层。

### 1.2 目标

- **桌面端 Usage Tab**：今日 / 本周 / 本月用量 Dashboard（按 Skill + 按 Provider + 估算费用 + 导出 CSV）
- **Web 端「我的用量」页**：`/dashboard/usage`，登录用户 / 游客均可用
- **本地为主 + 用户手动同步**：默认本地 SQLite 存储，用户手动触发同步到云端（降低隐私顾虑）
- **C 类 Skill 点击立即生效**：调用成功后 ≤ 1s 在 Usage Tab 可见

### 1.3 不在本文档范围

- LLM Provider 内部账单对账（用户需自行登录 Provider 后台查）
- 退款/申诉流程
- 多币种自动换算（v2.1 锁定 CNY，详见 §5）

---

## 2. 数据流与存储

### 2.1 端到端数据流

```
LLM 调用成功
  ↓
llm_proxy.rs::handle_chat 调 LlmProvider::chat
  ↓
拿到 resp.tokens_used { prompt_tokens, completion_tokens }
  ↓
usage_store.rs.record({
  skill_slug, provider_id, model,
  tokens_in, tokens_out,
  duration_ms,
  cost_estimate,        // ← 由 provider_pricing 查表计算
  source: "HELPER_PROXY"
})
  ↓
记账失败 → log::warn（不影响 LLM 响应，不向用户报错）
  ↓
桌面端 Usage Tab：GET /llm/usage/summary?range=week
  ↓
桌面端 UsageDashboard 渲染
```

### 2.2 桌面端 SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_record_id TEXT UNIQUE NOT NULL,    -- UUID v4（幂等键，重复插入会被 UNIQUE 约束拒绝）
  skill_slug TEXT NOT NULL,
  provider_id TEXT NOT NULL,                -- "deepseek" / "openai" / "glm"
  model TEXT NOT NULL,                      -- "deepseek-chat"
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  cost_estimate REAL,                       -- CNY，可空
  source TEXT NOT NULL DEFAULT 'HELPER_PROXY',
  occurred_at INTEGER NOT NULL,             -- Unix ms（LLM 响应时刻）
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_usage_occurred_at ON usage_records(occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_skill_slug ON usage_records(skill_slug);
CREATE INDEX IF NOT EXISTS idx_usage_provider_id ON usage_records(provider_id);

-- 90 天滚动清理（每日首次启动时执行一次）
DELETE FROM usage_records WHERE occurred_at < strftime('%s','now') * 1000 - 90 * 86400 * 1000;
```

### 2.3 云端 Prisma Schema

```prisma
model GuestSession {
  id          String   @id @default(cuid())
  anonymousId String   @unique
  fingerprint String
  createdAt   DateTime @default(now())
  upgradedAt  DateTime?
  userId      String?  @unique
  user        User?    @relation(fields: [userId], references: [id])
  // 反向：UsageRecord.anonymousId 关联
}

model UsageRecord {
  id              String   @id @default(cuid())
  userId          String?
  anonymousId     String?
  skillSlug       String
  providerId      String
  model           String
  tokensIn        Int
  tokensOut       Int
  durationMs      Int
  costEstimate    Decimal? @db.Decimal(12, 8)
  source          UsageSource
  clientRecordId  String?  @unique            // ← 幂等键：与桌面端 SQLite 的 client_record_id 对应
  createdAt        DateTime @default(now())

  @@index([userId, createdAt])
  @@index([anonymousId, createdAt])
  @@index([skillSlug, createdAt])
  @@index([providerId, createdAt])
}

enum UsageSource {
  HELPER_PROXY
  WEB_DIRECT
}

model ProviderPricing {
  id          String   @id @default(cuid())
  providerId  String
  model       String
  inputPrice  Decimal  @db.Decimal(12, 8)
  outputPrice Decimal  @db.Decimal(12, 8)
  currency    String   @default("CNY")
  updatedAt   DateTime @updatedAt

  @@unique([providerId, model])
}
```

### 2.4 幂等去重

`client_record_id`（桌面端生成的 UUID v4）作为幂等键：

- 桌面端本地 SQLite：`client_record_id` UNIQUE → 同一次调用的多次 `record()` 写入会被 UNIQUE 约束拒绝
- 云端 `UsageRecord.clientRecordId` UNIQUE → `/api/v2/usage/sync` 重复上报返回 `deduped` 计数

---

## 3. 桌面端 Usage Tab

### 3.1 页面布局（ASCII Wireframe）

```
┌─────────────────────────────────────────────────────────────────┐
│ SkillHub Helper                              🔑 已就绪  👤 已登录 │
├─────────────────────────────────────────────────────────────────┤
│ Home  Explore  My  [Usage]  Settings                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 时间范围：[今日] [本周] [本月]            [↻ 刷新] [↓ CSV]│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │ 总用量概览            │  │ 按 Skill Top 5                   │   │
│  │                      │  │                                  │   │
│  │ Input   12,500 tok   │  │ xiaohongshu-copy   ████████ 8.2K│   │
│  │ Output   8,200 tok   │  │ meeting-summary    ██████   6.1K│   │
│  │ Total   20,700 tok   │  │ ppt-outline        ████     3.4K│   │
│  │                      │  │ code-review        ██       1.8K│   │
│  │ 估算费用  ¥0.42       │  │ email-reply        █        1.2K│   │
│  │ 按 DeepSeek 国内定价  │  │                                  │   │
│  └─────────────────────┘  └─────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 按 Provider 占比                                          │   │
│  │                                                          │   │
│  │ DeepSeek  ████████████████████  82% (¥0.34)             │   │
│  │ OpenAI    ████                12% (¥0.05)               │   │
│  │ GLM       ██                  6%  (¥0.03)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  按 D6 决策，费用为估算值。点击查看 [按用量校准]                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 关键交互

| 元素 | 行为 |
|---|---|
| 时间范围切换 | 切换后立即拉 `/llm/usage/summary?range=today\|week\|month`，loading 状态 ≤ 300ms |
| 估算费用下「按用量校准」入口 | 跳转到 Provider 官方后台（`tauri-plugin-opener` 打开系统浏览器） |
| 导出 CSV | 调 `export_usage_csv` invoke，下载到 `Downloads/SkillHub-Usage-YYYY-MM-DD.csv` |
| 估算费用旁「?」 | Tooltip 说明"估算，按 Provider 官方单价"，避免投诉（R16） |

### 3.3 CSV 导出格式

```csv
occurred_at,skill_slug,provider_id,model,tokens_in,tokens_out,cost_estimate,duration_ms,source
2026-09-03T08:30:00Z,xiaohongshu-copy,deepseek,deepseek-chat,800,600,0.025,5200,HELPER_PROXY
2026-09-03T09:15:23Z,meeting-summary,openai,gpt-4o-mini,1200,800,0.012,3400,HELPER_PROXY
...
```

### 3.4 `<UsageMiniCard>`（嵌入 My Tab）

```
┌─────────────────────────────────────┐
│ 📊 xiaohongshu-copy                  │
│ 本周消耗：1,200 input + 800 output │
│ 估算费用：¥0.025                     │
│                          [详情 →]  │
└─────────────────────────────────────┘
```

点击「详情 →」切到 Usage Tab 并预过滤该 Skill。

---

## 4. Web 端「我的用量」页

### 4.1 路由

- `/dashboard/usage` —— 登录用户 + 游客均可用（按 session 或 X-Anonymous-Id 区分）
- `<UsageDashboard />` 组件复用桌面端逻辑（同一份 React 组件 + 适配器）

### 4.2 关键能力

| 能力 | 数据源 |
|---|---|
| 总用量概览（按今日/本周/本月） | `GET /api/v2/user/usage?range=...&group=total` |
| 按 Skill Top 5 | `GET /api/v2/user/usage?group=skill` |
| 按 Provider 占比 | `GET /api/v2/user/usage?group=provider` |
| 「立即同步桌面端用量」按钮 | `POST /api/v2/usage/sync` 批量上报 |
| 时间切换 | 同桌面端 |

### 4.3 与桌面端的差异

| 项 | 桌面端 | Web 端 |
|---|---|---|
| 数据源 | 本地 SQLite（直接查） | 云端 PostgreSQL（聚合） |
| 实时性 | 调用成功后立即可见 | 取决于同步时机（手动或心跳） |
| 「同步」按钮 | 无需（本地就是主源） | 提供「立即同步桌面端用量」按钮 |
| 未配 Key 兜底 | 桌面端实时检测 hasKey | Web 不感知（只显示已记账的） |

---

## 5. 费用估算与币种

### 5.1 推荐方案

- **币种**：CNY（人民币，按 DeepSeek / OpenAI / GLM 国内定价）
- **数据源**：`ProviderPricing` 表（云端）/ 桌面端启动时拉一次缓存到内存
- **更新频率**：Web 后端定时任务每周从 Provider 官网/官方 API 拉取最新价目（v2.1 暂人工维护，M4-W18 之后再加自动化）

### 5.2 估算公式

```
cost = (tokens_in / 1_000_000) × provider_price.input
     + (tokens_out / 1_000_000) × provider_price.output
```

单位：元（CNY），保留 8 位小数（`Decimal(12, 8)`）。

### 5.3 初始 ProviderPricing 数据（示例）

```typescript
[
  { provider_id: 'deepseek', model: 'deepseek-chat', input_price: 1.0,  output_price: 2.0,  currency: 'CNY' },
  { provider_id: 'deepseek', model: 'deepseek-reasoner', input_price: 4.0,  output_price: 16.0, currency: 'CNY' },
  { provider_id: 'openai',   model: 'gpt-4o-mini',    input_price: 0.15, output_price: 0.6,  currency: 'CNY' },
  { provider_id: 'openai',   model: 'gpt-4o',         input_price: 18.0, output_price: 72.0, currency: 'CNY' },
  { provider_id: 'glm',      model: 'glm-4-flash',    input_price: 0.1,  output_price: 0.1,  currency: 'CNY' },
  { provider_id: 'glm',      model: 'glm-4-plus',     input_price: 50.0, output_price: 50.0, currency: 'CNY' },
]
```

> **真实价目以 Provider 官网为准**，表格仅作 M4 开发参考。

### 5.4 UI 标注（应对 R16 估算不准）

所有费用展示都包含：
- 「估算，按 Provider 官方单价」
- 「按用量校准」入口 → 跳 Provider 官方后台

---

## 6. 隐私与限流

### 6.1 用量数据隐私（PRD §13.4）

- `UsageRecord` **仅记录 token 用量 + 最小元数据**：`skill_slug` / `provider_id` / `model` / `tokens_in/out` / `duration_ms` / `cost_estimate`
- **不记录**：输入内容、输出内容、提示词、调用参数细节
- Web 端 `/dashboard/usage` 页面顶部明确标注：「本页仅展示用量统计，不含 Skill 调用内容」
- 桌面端 `export_usage_csv` 导出同上原则

### 6.2 游客模式限流（推荐 50 次/天）

- 客户端：本地 SQLite 计数 `usage_records` 中 `occurred_at >= today_0am` 的条数，超过 50 次弹引导
- 云端：`/api/v2/usage/sync` 上报时校验，单机 50 次/天（基于 `anonymousId + fingerprint` 联合）
- 双层防御：即使客户端被破解，云端也兜底

### 6.3 匿名 ID 隐私（PRD §13.3）

- `anonymousId` 可出现在业务日志（仅挂账），**不能**出现在产品分析 / 营销埋点 / 跨设备指纹库
- `fingerprint` 仅在 `/api/v2/auth/bind-guest` 请求中携带，其他请求不传

---

## 7. API 契约

### 7.1 桌面端本机 HTTP（llm_proxy.rs）

```
POST /llm/usage/record
Body: {
  skill_slug, provider_id, model,
  tokens_in, tokens_out,
  duration_ms,
  cost_estimate?,
  source: "HELPER_PROXY",
  client_record_id: "<uuid>",
  occurred_at: "2026-09-03T08:30:00Z"
}
→ 200 OK { "ok": true }

GET /llm/usage/summary?range=today|week|month
→ 200 OK UsageSummary {
  total_tokens_in, total_tokens_out, total_cost,
  by_skill: [{ key, tokens_in, tokens_out, cost, count }],
  by_provider: [{ key, tokens_in, tokens_out, cost, count }]
}

GET /llm/usage/export?range=today|week|month
→ 200 OK text/csv（直接下载）
```

### 7.2 桌面端 invoke（lib.rs）

```rust
#[tauri::command]
async fn record_usage(state: State<UsageStore>, rec: UsageRecord) -> Result<(), String>;

#[tauri::command]
async fn get_local_usage_summary(state: State<UsageStore>, range: String) -> Result<UsageSummary, String>;

#[tauri::command]
async fn export_usage_csv(state: State<UsageStore>, range: String) -> Result<String, String>;
```

### 7.3 Web 端 API（apps/web/app/api/v2/...）

```
GET    /api/v2/user/usage?range=today|week|month&group=skill|provider|total
POST   /api/v2/usage/sync
GET    /api/v2/provider-pricing
POST   /api/v2/auth/bind-guest
```

完整契约详见 [PRD §12.6](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md)。

---

## 8. Rust 模块设计

### 8.1 `usage_store.rs` 接口

```rust
// apps/helper/src-tauri/src/usage_store.rs
use rusqlite::{params, Connection};
use std::sync::Mutex;
use anyhow::Result;
use serde::{Deserialize, Serialize};

pub struct UsageStore {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRecord {
    pub client_record_id: String,   // UUID v4（幂等键）
    pub skill_slug: String,
    pub provider_id: String,
    pub model: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub duration_ms: u32,
    pub cost_estimate: Option<f64>,
    pub source: String,             // "HELPER_PROXY"
    pub occurred_at_ms: i64,        // Unix ms
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageSummary {
    pub total_tokens_in: u32,
    pub total_tokens_out: u32,
    pub total_cost: f64,
    pub by_skill: Vec<UsageGroup>,
    pub by_provider: Vec<UsageGroup>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageGroup {
    pub key: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub cost: f64,
    pub count: u32,
}

impl UsageStore {
    /// 打开或 fallback：data_dir 不存在 → fallback 到 in-memory
    pub fn open_or_fallback(data_dir: &Path) -> Self { ... }

    /// 记账（幂等，重复 client_record_id 会被 UNIQUE 约束拒绝）
    pub fn record(&self, rec: UsageRecord) -> Result<()> { ... }

    /// 按时间范围聚合
    pub fn summarize(&self, range: DateRange) -> Result<UsageSummary> { ... }

    /// 90 天滚动清理
    pub fn prune_older_than(&self, days: u32) -> Result<()> { ... }

    /// 导出 CSV
    pub fn export_csv(&self, range: DateRange) -> Result<String> { ... }
}
```

### 8.2 `lib.rs` 集成

```rust
mod usage_store;
use usage_store::{UsageStore, UsageRecord, UsageSummary};

// run() 内：
let data_dir = key_store.data_dir();
let usage_store = Arc::new(UsageStore::open_or_fallback(&data_dir));
let proxy_state = LlmProxyState {
    key_store: key_store.clone(),
    usage_store: usage_store.clone(),
};
app.manage(UsageStoreHandle(usage_store));

// invoke 注册
.invoke_handler(tauri::generate_handler![
    // ... 已有
    record_usage,
    get_local_usage_summary,
    export_usage_csv,
    ensure_guest_session,
    get_recommended_for_local_software,
    get_helper_status,
])
```

### 8.3 `llm_proxy.rs` 修改

在 `handle_chat` 成功时（即 `LlmProvider::chat` 返回 Ok 时），同步记录 UsageRecord：

```rust
async fn handle_chat(
    State(state): State<Arc<LlmProxyState>>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    // 1. 调 LLM
    let resp = state.provider.chat(req).await;

    // 2. 成功后记账（失败不回滚 LLM 响应）
    if let Ok(ref ok) = resp {
        let usage = UsageRecord {
            client_record_id: uuid::Uuid::new_v4().to_string(),
            skill_slug: req.skill_slug.unwrap_or_default(),
            provider_id: state.provider.id().to_string(),
            model: ok.model.clone(),
            tokens_in: ok.tokens_used.prompt_tokens,
            tokens_out: ok.tokens_used.completion_tokens,
            duration_ms: started_at.elapsed().as_millis() as u32,
            cost_estimate: compute_cost(...),
            source: "HELPER_PROXY".to_string(),
            occurred_at_ms: now_ms(),
        };
        if let Err(e) = state.usage_store.record(usage) {
            log::warn!("usage record failed: {e:?}");
        }
    }

    // 3. 返回 LLM 响应（不阻塞记账）
    (StatusCode::OK, Json(resp))
}
```

---

## 9. 埋点与验收

### 9.1 埋点事件（PRD F15 v2.1 新增）

| event_name | 触发时机 | 关键字段 |
|---|---|---|
| `usage_recorded` | 助手本地记账成功 | `skill_slug`, `tokens_in`, `tokens_out`, `source`, `record_id` |
| `usage_record_failed` | 助手本地记账失败 | `error_class`, `skill_slug` |
| `usage_synced_to_web` | 用户手动同步 | `record_count`, `deduped`, `duration_ms` |
| `usage_dashboard_viewed` | 用户进入 Usage Tab 或 `/dashboard/usage` | `range`, `source`（helper / web） |
| `usage_csv_exported` | 用户导出 CSV | `range`, `record_count`, `file_size_bytes` |
| `guest_upgrade_prompt_shown` | 游客用满 50 次 | `trigger_count` |

### 9.2 验收标准（PRD §16.4 M4）

- [ ] 用户生成 1 次 C 类 Skill 后 Usage Tab 立即显示（≤ 1s）
- [ ] 时间切换（今日/本周/本月）正确
- [ ] 按 Skill Top 5 / 按 Provider 占比 排序正确
- [ ] 估算费用 = `Σ(provider_price.input × tokens_in/1M + provider_price.output × tokens_out/1M)`
- [ ] 导出 CSV 文件可被 Excel/Numbers 正常打开
- [ ] Web 端 `/dashboard/usage` 显示数据与桌面端同步后一致
- [ ] 90 天滚动清理生效（手动构造 91 天前的记录 → 启动后自动删除）
- [ ] 用量数据**不包含**输入内容 / 输出内容（隐私合规）
- [ ] `usage_record_failed` 埋点正确触发（手动制造 SQLite 写入失败）
- [ ] 资源指标：助手内存空闲 ≤ 80MB，安装包 ≤ 8MB，冷启动 ≤ 1500ms

---

## 10. 开放问题

| # | 问题 | 建议 |
|---|---|---|
| Q1 | 桌面端 SQLite 与云端 PostgreSQL 数据冲突解决（用户在多设备同步） | **v2.1 简化**：桌面端是主源，云端只是镜像；冲突时以桌面端为准，登录后从云端拉合并 |
| Q2 | 用量数据保留期 | **v2.1**：桌面端 90 天滚动；云端永久（用户主动清空可删） |
| Q3 | `cost_estimate` 是否需要 Provider 实际响应中的 `cost` 字段？ | **v2.1 否**：仅本地估算（Provider 响应通常不含成本） |
| Q4 | 用户切换 Provider 后历史用量如何展示？ | 按调用时刻的 Provider 归类（`UsageRecord.providerId` 是当时的，不是当前） |
| Q5 | 多 Provider 混合使用时如何展示费用汇总？ | `total_cost = Σ by_provider.cost`（按 ProviderPricing 单价分别算） |
| Q6 | 是否需要「按 Skill 维度成本预警」（如某 Skill 单价高于阈值弹窗） | **v2.1 不做**（M5 评估） |
| Q7 | 是否需要 RAG / Embedding 的用量 | **v2.1 否**：仅生成式 LLM 调用计入；Embedding 走云端 Embedding 服务（D6 已说明） |

---

---

## 11. v0.2 实施同步（2026-09-03）

> **对照实施代码，本文与最终落地的差异**。以下 4 个 schema 与原 v0.1 草稿不同，实施代码以本节为准。

### 11.1 桌面端 SQLite `usage_records`（v0.2 实测）

实际表结构（[apps/helper/src-tauri/src/usage_store.rs:122-141](file:///d:/BigLionX/SkillHub/apps/helper/src-tauri/src/usage_store.rs)）：

```sql
CREATE TABLE IF NOT EXISTS usage_records (
    client_record_id TEXT PRIMARY KEY,        -- 幂等键（UUID v4）
    created_at_ms     INTEGER NOT NULL,
    skill_slug        TEXT    NOT NULL,
    provider_id       TEXT    NOT NULL,
    model             TEXT    NOT NULL,
    tokens_in         INTEGER NOT NULL,
    tokens_out        INTEGER NOT NULL,
    duration_ms       INTEGER NOT NULL,
    cost_estimate     REAL,
    source            TEXT    NOT NULL,      -- 'LOCAL_DESKTOP' | 'WEB_DIRECT' | 'GUEST_TEST'
    session_kind      TEXT    NOT NULL,      -- 'user' | 'guest'
    session_id        TEXT                   -- 可选：登录 userId 或 游客 anonymous_id
);
```

**v0.2 差异**：

- §2.2 原稿未列出 `source` / `session_kind` / `session_id` 三个字段；v0.2 必须有这三个才能区分调用来源 + 支持游客会话
- `cost_estimate` 单位为 CNY，前端按 `/api/v2/provider-pricing` 单价算好后传入

### 11.2 云端 Prisma Schema（v0.2 实测）

实际落地的 [apps/web/prisma/schema.prisma](file:///d:/BigLionX/SkillHub/apps/web/prisma/schema.prisma) 与 §2.3 原稿差异：

#### 11.2.1 `GuestSession`

| 字段 | v0.1 原稿 | v0.2 实际 | 差异原因 |
|---|---|---|---|
| `id` | `@id @default(cuid())` | 同 | — |
| `anonymousId` | `String @unique` | 同 | — |
| `fingerprint` / `machineFingerprint` | `fingerprint: String` | `machineFingerprint: String?` | 实际可空（首条 sync 不强制带指纹） |
| `createdAt` / `firstSeenAt` | `createdAt DateTime @default(now())` | `firstSeenAt DateTime @default(now())` | 改名区分首见 / 最近 |
| `lastSeenAt` | 无 | **新增** | 每次 heartbeat / sync 更新 |
| `upgradedAt` / `bindAt` | `upgradedAt DateTime?` | `bindAt DateTime?` | 改名（语义更明确） |
| `userId` | `String? @unique` | `String?`（**非 unique**） | 同一用户可绑定多个游客会话（如换设备）；unique 改放 User 侧或加 `(userId, anonymousId)` 复合约束 |
| 反关联 | 无 | `User.guestSessions GuestSession[]` | User 模型加反向关联 |

#### 11.2.2 `UsageRecord`

| 字段 | v0.1 原稿 | v0.2 实际 | 差异原因 |
|---|---|---|---|
| `id` | `String @id @default(uuid())` | `@id @default(cuid())` | 与全库一致 |
| `userId` | `String?` | `String?` | — |
| `anonymousId` | `String?`（独立列） | **改为** `guestSessionId String?`（FK 关联 GuestSession.id） | 匿名维度走 GuestSession，更一致 |
| `skillSlug` | `String` | `**String?`** | Home / Explore 搜索调用时无关联 Skill，允许为空 |
| `providerId` / `provider` | `providerId: String` | `**provider: String**` | 字段名对齐 UserInstalledSoftware.source 风格 |
| `model` | `String` | 同 | — |
| `tokensIn` / `tokensOut` | 同 | 同 | — |
| `durationMs` | `Int` | `Int?` | 实际允许空（极少数情况） |
| `costEstimate` / `costCny` | `Decimal(12, 8)` | `**Decimal(10, 6)**` + 改名 | 6 位足够（金额不会超过 999999 元 / 1k tokens） |
| `source` | `UsageSource enum`（HELPER_PROXY / WEB_DIRECT） | **`path String?`** | 实际是路由路径（helper / cache / cloud / heuristic），不是来源；来源靠 `guestSessionId` vs `userId` 区分 |
| `clientRecordId` | `String? @unique` | `**String? @unique`** | 同 |
| `createdAt` / `occurredAt` | `createdAt` | **`occurredAt`** + `createdAt`（两个时间） | 区分调用时间与入库时间（断网 / 批量上报场景） |

#### 11.2.3 `ProviderPricing`

| 字段 | v0.1 原稿 | v0.2 实际 | 差异原因 |
|---|---|---|---|
| `providerId` / `provider` | `providerId: String` | `**provider: String**` | 字段名对齐 |
| `inputPrice` / `inputPer1k` | `inputPrice: Decimal(12, 8)` | `**inputPer1k: Decimal(10, 6)**` | 明确"每 1K tokens"，避免误读 |
| `outputPrice` / `outputPer1k` | `outputPrice: Decimal(12, 8)` | `**outputPer1k: Decimal(10, 6)**` | 同上 |
| `currency` | `String @default('CNY')` | 同 | — |
| `updatedAt` / `effectiveAt` | `updatedAt @updatedAt` | **`effectiveAt DateTime @default(now())`** | 改为"生效时间"语义，支持历史快照 |
| `@@unique` | `[providerId, model]` | **`[provider, model, effectiveAt]`** | 同 (provider, model) 可有多条历史快照 |

### 11.3 桌面端 Rust `UsageRecordInput`（v0.2 实测）

```rust
// apps/helper/src-tauri/src/usage_store.rs
pub struct UsageRecordInput {
    pub client_record_id: String,
    pub created_at_ms: i64,        // Unix 毫秒
    pub skill_slug: String,
    pub provider_id: String,
    pub model: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub duration_ms: u64,
    pub cost_estimate: Option<f64>,
    pub source: String,            // 'LOCAL_DESKTOP' | 'WEB_DIRECT' | 'GUEST_TEST'
    pub session_kind: String,      // 'user' | 'guest'
    pub session_id: Option<String>,
}
```

`UsageSummary` 输出比 §7.1 多两个字段：

```rust
pub struct UsageSummary {
    pub total_calls: u64,           // 补：实际调用次数
    pub total_tokens_in: u64,
    pub total_tokens_out: u64,
    pub total_cost: f64,
    pub range: String,              // 补：透传范围参数
    pub by_skill: Vec<UsageByKey>,
    pub by_provider: Vec<UsageByKey>,
    pub daily: Vec<UsageDaily>,     // 补：按天序列
}
```

### 11.4 `lib.rs` 注册 invoke（v0.2 实测）

实际注册的 invoke 命令（[apps/helper/src-tauri/src/lib.rs](file:///d:/BigLionX/SkillHub/apps/helper/src-tauri/src/lib.rs)）：

| invoke | 用途 |
|---|---|
| `record_usage` | 写入 SQLite（幂等） |
| `get_local_usage_summary` | 按范围聚合 |
| `export_usage_csv` | 导出 CSV（含 UTF-8 BOM，Excel 直接打开） |
| `ensure_guest_session` | 游客首次启动生成 UUID v4 + 写文件 |
| `get_recommended_for_local_software` | Home 推荐位 |
| `get_helper_status` | 设置页显示 LLM Key / Provider 状态 |
| `prune_local_usage` | 手动 90 天清理（Settings 按钮） |

**v0.2 差异**：原稿 §8.2 只列前 3 个；M4 实际加了后 4 个。`get_recommended_for_local_software` 与用量无直接关系，但共用 helper 启动 lifecycle。

### 11.5 §6.2 游客 50 次/天强制限流

v0.1 建议「客户端 + 云端双层强制 50 次/天」。

v0.2 实施状态：

- ✅ 客户端：`UsageStore` 提供 `count_today_guest()` 框架（注释提到，但未在 `handle_chat` 调用）
- ❌ 桌面端 `handle_chat`：未在 LLM 调用前检查今日次数，超额也只是提示
- ❌ 云端 `/api/v2/usage/sync`：未校验 `anonymousId + fingerprint` 当日累计

**建议**：M5（v2.1）补全：客户端在 LLM 调用前 `count_today_guest() >= 50` 时直接返 `guest_over_limit` 503；云端 sync 时按 `occurredAt >= today` 聚合，超过 50 写 `overage=true` 标记并允许上报但前端不再展示。

### 11.6 §7.3 Web API 完整契约（v0.2 补全）

v0.1 只列端点名。v0.2 实际契约：

#### 11.6.1 `GET /api/v2/provider-pricing`（公开）

```
Response:
{
  pricing: [
    { provider: 'deepseek', model: 'deepseek-chat', inputPer1k: 0.001, outputPer1k: 0.002, currency: 'CNY', effectiveAt: '...' }
    ...
  ],
  updated_at: '2026-09-03T...',
  cached: boolean  // true = Redis 命中
}
```

Redis 缓存键 `provider-pricing:latest`，TTL 1 小时；桌面端 LlmGateway 在第一次 `/llm/chat` 时拉取，本地再缓存 1 小时。

#### 11.6.2 `POST /api/v2/usage/sync`（匿名 + 登录均可）

```
Request Body:
{
  anonymous_id: 'uuid-v4',
  machine_fingerprint?: 'sha256:...',
  helper_version?: '0.3.05',
  os_version?: 'Windows 11 23H2',
  records: [
    {
      client_record_id: 'uuid-v4',   // 必填，幂等 key
      skill_slug?: 'ps-skin-retouch',
      provider: 'deepseek',
      model: 'deepseek-chat',
      tokens_in: 256,
      tokens_out: 128,
      duration_ms?: 1234,
      occurred_at?: '2026-09-03T10:00:00Z',
      path?: 'helper' | 'cache' | 'cloud' | 'heuristic'
    }
    ...
  ]
}

Response: { ok: true, synced: number, deduped: number, total: number, session_id: 'cuid' }
```

实现要点：

- `clientRecordId` 是 `String? @unique`，重复 client_record_id 跳过（计入 `deduped`）
- 按 `(provider, model, effectiveAt desc)` 取最新单价，公式 `(tokensIn/1000)*inputPer1k + (tokensOut/1000)*outputPer1k` 回填 `costCny`，精度 6 位
- 单次最多 1000 条 records（`413 Payload Too Large`）

#### 11.6.3 `GET /api/v2/user/usage`（必登录）

```
Query: ?range=7d | 30d | 90d（默认 30d）

Response:
{
  range: '30d',
  since: '2026-08-04T...',
  totals: { calls, tokensIn, tokensOut, costCny, distinct_skills, distinct_providers },
  by_day:      [{ date: '2026-09-01', calls, tokensIn, tokensOut, costCny }, ...],
  by_provider: [{ provider, calls, tokensIn, tokensOut, costCny, sharePct }, ...],
  by_skill:    [{ skillSlug, calls, tokensIn, tokensOut, costCny }, ...]  // Top 10
}
```

实现要点：

- `by_day` 用原生 SQL `DATE_TRUNC('day', "occurredAt") GROUP BY day`
- `by_skill` 限 Top 10，skillSlug 为 null 归到 `'(未关联)'`
- `sharePct` = 该 provider 调用数 / 总调用数 * 100，保留 2 位

#### 11.6.4 `POST /api/v2/auth/bind-guest`（必登录）

```
Request Body:
{
  anonymous_id: 'uuid-v4',
  machine_fingerprint?: 'sha256:...',
  helper_version?: '0.3.05',
  os_version?: 'Windows 11 23H2',
  merge_records?: boolean  // 默认 true
}

Response: { ok: true, merged_records: number, session: { anonymous_id, last_seen_at, bind_at } }
```

行为：

1. `prisma.guestSession.upsert` by `anonymousId`，写 `userId` + `bindAt`
2. 默认 `merge_records=true`：把该 anonymousId 下 `userId is null` 的 UsageRecord.userId 也一起改成当前 user

---

> **下一步**：M4 全部 22 步实施完成。待 M5 补 50 次/天强制 + bind 后前端刷新用量页 + 桌面端实时检测 hasKey 在 Usage Tab 的显式标注。