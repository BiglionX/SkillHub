# 桌面端 Skills 冷启动种子（v2.0.6，2026-09-01）

## 背景

桌面助手 v2.0.5 的 Settings → Section 2（本机软件）扫到 Photoshop / VSCode 等已装软件
后，只显示一个绿色对勾和路径，**没有任何下一步引导**——用户必须切到 Web 端手动搜索
「对 Photoshop 有用的 Skill」，存在「0 价值真空区」。

PRD [§5.2](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md) 已明确划线：
> ❌ 助手中的「技能商店浏览」（助手只做执行）

所以本特性必须以**推荐跳转**而非**内置完整浏览器式列表**形式实现。

## 决策

在 [`apps/helper/resources/seed-skills.json`](../../apps/helper/resources/seed-skills.json)
内置 `software_tag → 推荐 Skill 摘要` 索引。`Settings.tsx` Section 2 每个扫描到的软件条目
右侧，按 `software_tag` 命中后显示一个「查看 N 个推荐 Skill →」按钮，点击调
`openUrl('https://skillhub.proclaw.cc/?installed=<tag>')` 把用户带回 Web 端完成
查找 / 安装。

## 边界（红线）

1. **只放链接不放内容**：种子只存 `slug + blurb`，不存 SKILL.md、不存下载 URL。
2. **永远不做技能商店的列表 / 详情渲染**：跳转是唯一交互路径。
3. **不缓存 / 不离线浏览**：`openUrl` 失败走剪贴板 fallback，不在助手内做兜底浏览。
4. **不抢 Web 端的 Skill 排序权**：摘要平铺、不打分、不按「平台热度」排序。
5. **不擅自触发安装**：本特性只到「打开 Web 端对应列表页」为止；安装仍必须走
   `skillhub://` 协议或 Web 端「一键安装」按钮。

## Schema

```ts
// 顶层：元信息
{
  schemaVersion: number;     // 当前写 1
  generatedAt: string;       // ISO 日期
  baseUrl: string;           // Web 端入口；解析失败回退到 https://skillhub.proclaw.cc
  note?: string;             // 维护说明
}

// 业务条目：按 software_tag 一份
{
  "<software_tag>": {
    recommended: Array<{
      slug: string;          // 不带 ?installed=
      blurb: string;         // 一句话中文描述
    }>;
  };
}
```

定位 `software_tag` 时与 [`apps/helper/resources/scanner-rules.yml`](../../apps/helper/resources/scanner-rules.yml)
的 `software_tag` 对齐。扩展 scanner-rules 时**必须同步**给 seed-skills 加条目
（或者显式让 Section 2 不显示按钮——保持现有空态即可）。

## 实现要点

- **前端入口**：`Settings.tsx` 通过 Vite 的 JSON import 把 seed-skills.json 直接打进
  bundle（`resolveJsonModule: true` 已在 `apps/helper/tsconfig.json` 中开启）。
- **Rust 端零改动**：不新增 invoke 命令，`scanner.rs` / `lib.rs` 不动。
- **协议零改动**：`skillhub://` 不参与；本特性只走 `https URL + openUrl`。
- **状态独立**：`seedError` 独立于 `docsError`，不与 Provider / Docs 共享状态空间——
  避免切换 Provider 时把上次的"链接复制成功"提示意外清空（v2.0.5 修复的同类坑）。

## 维护流程

### v2.0.6（当前 · 手工）

1. 用户在 Web 后台上传新 Skill（`/api/v2/skills`）→ 平台审核 → 上线
2. 维护者按需手动编辑 `apps/helper/resources/seed-skills.json`，增删条目
3. 助手下次升级 / 重启生效

### M3（未来 · 自动化）

1. Web 端加 `GET /api/v2/popular?tags=<tag>&limit=5` 接口
   （按 `software_tag` 返回热门 Skill slug + blurb）
2. CI cron 每周从该接口拉数据 → 自动开 PR 更新 seed-skills.json
3. 助手升级内置新版种子

**v2.0.6 不引入自动化同步**——先把人工编辑流程跑通再谈自动化。

## 不在范围内（明确划线）

- ❌ 在桌面端渲染 Skill 详情页 / 评分 / 评论 / 截图
- ❌ 把种子换成完整 SKILL.md 包（体积、维护成本、过期风险都不可接受）
- ❌ 跨语言（v2.0.6 仅中文 blurb；i18n 留待 Settings i18n 阶段统一处理）
- ❌ 付费 / 订阅 Skill 的引导（V3 路线已有，不在助手职责）
- ❌ 助手内做 Skill 搜索框（直接破坏 PRD §5.2）

## v2.0.6 增量（2026-09-01 · 初版）

首次落地核心机制：

- ✅ 新增 [`apps/helper/resources/seed-skills.json`](../../apps/helper/resources/seed-skills.json)
- ✅ 修改 [`apps/helper/src/pages/Settings.tsx`](../../apps/helper/src/pages/Settings.tsx)（§Section 2 渲染增加“查看 N 个推荐 Skill →”按钮）
- ✅ Rust 零改动 / 协议零改动
- ✅ 包体增量 JSON ≈ 1.5 KB / gzipped < 1 KB

## v2.0.7 增量（2026-09-01 · 同日追加）

继初版后仅扫描到 8 个 software_tag 后、认为「覆盖是主要缺口」，本版以“以量取胜”思路动了 **scanner-rules.yml**，不再改 Settings.tsx（保持冷启动原则的零技术债变动）。

### v2.0.7 改动列表

| 文件 | 改动 |
|---|---|
| `apps/helper/resources/scanner-rules.yml` | +15 个 software_tag；覆盖 办公 / IDE / 浏览器 / 通讯 / 笔记 |
| `apps/helper/resources/seed-skills.json` | 同步给 6 个高把握 software_tag 加手工种子（word / webstorm / intellij / pycharm / cursor / chrome）；其余 9 个等 M3 |
| `apps/helper/src/pages/Settings.tsx` | 零变动（仅依赖 seed-skills.json 的 shape，不需要动代码） |
| `apps/helper/src-tauri/src/scanner.rs` | 零变动（`include_str!` 动态读取 yml，新增条目自动识别） |

**预期产出**：多数装机用户扫描后从「未检测到任何已配置软件」变为「检测到 6–10 个」，
转化漏斗开放。

### 新增 software_tag 明细（按意图分类）

| 类别 | software_tag | display_name | 是否手工加种子 | M3 后是否需 CI 填 |
|---|---|---|---|---|
| 办公 | `word` | Microsoft Word | ✅ 手工 + 2 条 | 是 |
| IDE | `webstorm` / `intellij` / `pycharm` / `cursor` / `vs` | 同名 | ✅ 手工 各 +2 条 | 是（还有 vs 待填） |
| 浏览器 | `chrome` / `edge` | 同名 | ✅ 手工 + 2 条 | 是（还有 edge 待填） |
| 通讯 | `slack` / `dingtalk` / `wecom` / `discord` / `zoom` | 同名 | ❌ 仅扫不挂种 | 是 |
| 笔记 | `obsidian` | 同名 | ❌ 仅扫不挂种 | 是 |
| 社交 | `wechat` | 微信 | ❌ 仅扫不挂种 | 是 |

**手工加种子 vs M3 自动同步**遵循以下原则：

1. 手工加种子的提投是「软件 + 该能力描述都是开发者+能力与社区已知高频需求」；
2. 手工不挂种的提投是「软件是真的使用习惯、但 Skill 描述需要产品 / 设计 / 营销多轮打磨」，等 M3 CI 同步保证质量。
3. 一旦 M3 CI 上线，那些 「仅扫不挂种」 的 9 个软件会被自动填上、并**不需手工 插手**。

## v2.0.7 跨越红线检查 ✅

- ❌ 未在桌面端渲染 Skill 列表 / 详情 / 评分
- ❌ 未将种子换成完整 SKILL.md
- ❌ 未新增 Skill 包安装调用
- ✅ 所有新 Slug 都是「手动选、有意图、可验证」三道防线后的产物

---

补充 v2.0.7 增量后，后续 v2.0.8+ 预计推进顺序（不在本 PR 范围内）：

1. **B.1** Web 端补 `GET /api/v2/popular?tags=&limit=15`（预计后端半天）
2. **B.2** `apps/helper/scripts/sync-seed-from-web.ts` 脚本（预计前端半天）
3. **B.3** `.github/workflows/seed-sync.yml` CI（预计 DevOps 半天）
4. **B.4** 种子什溯 / 真伪验证路线（预计 1-2 周，详见 [.qoder/plans/seed-skills-cold-start-phase-b.md](../seed-skills-cold-start-phase-b.md)）

## 关联文件

| 类别 | 路径 |
|---|---|
| 设计依据 | `docs/features/ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md` §5.2 / §6 D6 |
| 实施入口 | `apps/helper/src/pages/Settings.tsx`（Section 2 渲染） |
| 数据 | `apps/helper/resources/seed-skills.json` |
| 关联扫描规则 | `apps/helper/resources/scanner-rules.yml` |
| 关联剧本 | `apps/helper/resources/playbooks/*.yml`（按 software_tag 一一对应） |
| B 路径计划（未实施） | `.qoder/plans/seed-skills-cold-start-phase-b.md` |
