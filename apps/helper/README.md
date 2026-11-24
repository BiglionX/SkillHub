# SkillHub Helper（桌面助手）

> Tauri + Rust 桌面客户端。已纳入 pnpm workspace（`@skillhub/helper`），
> 但因依赖 Rust 工具链与 Tauri 系统库，不由 turbo 统一构建；CI 单独 job 跑前端 vitest + `cargo test`（见 `.github/workflows/ci-cd.yml`）。

## 职责（v2.1 决策 D6 + D8）

**v2.1 起为「主客户端」**，覆盖 A/B/C 三类 Skill 全闭环浏览 / 详情 / 安装 / 使用 / 用量查看：

- 注册 `skillhub://` 协议
- 扫描本机已装软件
- 安装剧本（Playbook）执行（A 类）
- **本机 HTTP 服务，转发 Web 端 LLM 调用**（用户本地 Key）—— A/C/B 类共用
- 软件清单上报 + 接收反向推送
- **v2.1 新增**：5-Tab React 前端（Home / Explore / My / Usage / Settings）
- **v2.1 新增**：本地用量 SQLite 存储（90 天滚动清理）
- **v2.1 新增**：游客模式（不登录也能用 C 类，限制 50 次/天）

> **v2.0 → v2.1 重大变化**：v2.0 §5.2 把桌面端定位为「协议唤起器 + Key 保险箱 + 扫描仪」；v2.1 升级为「主客户端」（详见 [PRD §5.3](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md) + [改造计划](../.qoder/plans/桌面端主客户端化改造方案_a99a4d27.md)）。

## 5-Tab 体系（v2.1 起）

| Tab | 路由 | 内容 | 主要组件 |
|---|---|---|---|
| **Home** | `tab=home` | NLU 搜索框 + 「为你推荐」（基于本机软件） | `<HomePage>` / `<NluSearchBox>` / `<RecommendedForYou>` |
| **Explore** | `tab=explore` | 顶部软件过滤 + Skill 列表 | `<ExplorePage>` / `<SoftwareIconBar>` / `<SkillCard>` |
| **My** | `tab=my` | 已装 Skills + 用量小卡 + 卸载 | `<MySkillsPage>` / `<UsageMiniCard>` |
| **Usage** | `tab=usage` | 用量 Dashboard（日/周/月 + 按 Skill + 估算费用 + 导出 CSV） | `<UsagePage>` / `<UsageDashboard>` |
| **Settings** | `tab=settings` | LLM Key + 本机软件 + 诊断 + 关于 | `<Settings>`（保留并扩展现有） |

**顶栏右侧**始终显示：LLM Key 状态徽章 + 登录徽章。

**键盘导航**：Home / End 在 Tab 间跳，← → 在 Tab 内焦点移动，Enter 触发。

## M1~M3 范围（已落地）

| 任务 | 状态 |
|---|---|
| Tauri 工程骨架 | ✅ |
| `llm_proxy.rs` 本机 HTTP 服务（ `/llm/chat` `/llm/status` `/llm/keys/test` ） | ✅ |
| `key_store.rs` AES 加解密用户 Key，存 `.data/llm-keys.json` | ✅ |
| `provider/` DeepSeek / OpenAI / GLM 三家适配 | ✅ |
| `protocol.rs` Windows 注册表 + Mac Info.plist 注册 `skillhub://` | ✅ |
| 助手设置页 React UI（填 Key / 切换 Provider / Test Key） | ✅ |

## M4 范围（v2.1 新增，已落地）

> 2026-11 投产审计后全部接线完成：`get_installed_skills` / `pick_export_path` / `get_proxy_token`
> 三个 invoke 已注册，MySkills 页面与 CSV 导出可用；启动自动执行 90 天清理。

| 任务 | 工期 |
|---|---|
| `usage_store.rs` SQLite 本地用量存储 + 90 天滚动清理 | 2d |
| `llm_proxy.rs::handle_chat` 成功后同步记账 | 1d |
| `handle_record_usage` / `handle_usage_summary` 端点 | 1d |
| App.tsx Tab 联合类型从 2 Tab 升级为 5 Tab | 1d |
| `pages/Home.tsx` / `pages/Explore.tsx` / `pages/MySkills.tsx` / `pages/Usage.tsx` 4 个新页面 | 14d |
| `<SkillDetailDialog>` 三形态差异化（A/B/C） | 3d |
| `<UsageDashboard>` 图表 + `<UsageMiniCard>` | 4d |
| `ensure_guest_session` 游客会话 + 机器指纹 | 1d |
| 未配 LLM Key 时点 C 类 Skill 拦截弹窗 | 2d |

详细任务见 [PRD §14.4 M4 里程碑](./ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD.md) + [HELPER_USAGE_DASHBOARD.md](./HELPER_USAGE_DASHBOARD.md) + [改造计划](../.qoder/plans/桌面端主客户端化改造方案_a99a4d27.md)。

## 目录结构

```
apps/helper/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json        # ACL：3 个 Provider 文档域名 + skillhub.proclaw.cc（onboarding）
│   └── src/
│       ├── main.rs                      # 入口、托盘、单实例
│       ├── lib.rs                       # invoke 命令注册（含 M4 新增）
│       ├── llm_proxy.rs                 # 本机 HTTP 服务（M1 + M4 用量记录）
│       ├── key_store.rs                 # AES Key 存储
│       ├── usage_store.rs               # 【M4 新增】SQLite 本地用量存储
│       ├── provider/                    # LLM Provider 适配
│       │   ├── mod.rs
│       │   ├── deepseek.rs
│       │   ├── openai.rs
│       │   └── glm.rs
│       ├── protocol.rs                  # 协议注册
│       ├── scanner.rs                   # 软件扫描
│       ├── playbook.rs                  # 剧本引擎
│       ├── progress.rs                  # SSE 进度上报
│       └── reporter.rs                  # 本机软件清单上报
├── src/                                  # React 前端（v2.1 5-Tab）
│   ├── App.tsx                           # Tab 联合类型：home|explore|my|usage|settings
│   ├── pages/
│   │   ├── Home.tsx                     # 【M4 新增】NLU 搜索 + 推荐面板
│   │   ├── Explore.tsx                  # 【M4 新增】软件过滤 + Skill 列表
│   │   ├── MySkills.tsx                 # 【M4 新增】已装 Skills + 卸载
│   │   ├── Usage.tsx                    # 【M4 新增】用量 Dashboard
│   │   ├── Settings.tsx                 # LLM Key + 软件 + 诊断（v2.0 已有，M4 扩展）
│   │   └── Onboarding.tsx               # 首次启动引导
│   └── components/
│       ├── NluSearchBox.tsx             # 【M4 新增】
│       ├── RecommendedForYou.tsx        # 【M4 新增】
│       ├── SoftwareIconBar.tsx          # 【M4 新增】（从 Web 端 software-icon-bar.tsx 改写）
│       ├── SkillCard.tsx                # 【M4 新增】
│       ├── SkillDetailDialog.tsx        # 【M4 新增】三形态 A/B/C
│       ├── UsageDashboard.tsx           # 【M4 新增】
│       ├── UsageMiniCard.tsx            # 【M4 新增】
│       └── StatusBadge.tsx              # 顶栏徽章（v2.0 已有）
├── resources/
│   ├── icons/
│   └── playbooks/                        # 内置剧本
└── package.json
```

## 与 Web 集成

通过三个机制：

1. **协议唤起**：`skillhub://install/{slug}?version={v}&job={jobId}` → 唤起助手窗口
2. **本机 HTTP 转发**：助手启动后监听 `127.0.0.1:{random_port}`，Web 通过 `window.__SKILLHUB_HELPER_PORT__` 拿到端口调 `/llm/chat`。
   **除 `/llm/status`、`/llm/discover`、`/health` 外，所有端点（含 `/llm/usage/summary`）需带 `Authorization: Bearer <token>`**，token 由 `get_proxy_token` invoke 在启动时拉取（每次启动轮换、不落盘）；Origin 也做白名单校验。
3. **【M4 新增】匿名游客会话**：桌面端启动时调 `ensure_guest_session` 生成 anonymousId，用于 `/api/v2/intent/parse` / `/api/v2/skills/*/generate` 等 API 携带游客身份

## 资源约束（M4 调整后）

| 项 | v2.0 | v2.1 |
|---|---|---|
| 助手内存（空闲） | ≤ 30MB | **≤ 80MB** |
| 安装包 | ≤ 2MB | **≤ 8MB** |
| 冷启动到空闲 | ≤ 800ms | **≤ 1500ms** |
| 本机 HTTP 端口 | 1 个 | 1 个（不变） |
| 用量本地存储滚动清理 | — | **90 天** |

## 开发命令

```bash
# 安装依赖
cd apps/helper
pnpm install

# 开发模式
pnpm tauri dev

# 构建
pnpm tauri build

# 前端单元测试（vitest）
pnpm --filter @skillhub/helper run test

# Rust 单元测试（需 Rust 工具链；版本号先归一化以绕过前导零）
node scripts/normalize-tauri-version.mjs
cargo test --manifest-path apps/helper/src-tauri/Cargo.toml --lib

# 类型检查
pnpm --filter @skillhub/helper run typecheck
```

## 安全设计（2026-11 投产修复）

- LLM Key：AES-256-GCM 加密，密钥由机器指纹 + 当前用户派生（不落盘、无全零 fallback），密文文件 Unix 权限 0600；旧的明文 `.key` 会自动迁移后删除。
- 本机代理：Bearer token + Origin 白名单；内置 Provider 忽略前端传入的 base_url（防 SSRF），custom 走白名单校验。
- 安装剧本：Zip Slip 路径校验、SHA-256 前置校验、命令白名单 + 参数净化；Skill 元数据仅放行 6 个白名单字段。
- 游客限流：`guest_quota` 表按机器绑定的稳定 anonymous_id 原子计数（50 次/天），前端无法伪造 session_id 绕过。
- 隐私：上报云端的机器指纹为不可逆 SHA-256 哈希，不再上传原始硬件 ID。
- 签名：仓库为开源未签名发行，每个 release 附带 `SHA256SUMS.txt` 供完整性校验。
- CSP：生产构建用严格 CSP；`devCsp` 单独放行 Vite HMR 的 `ws://localhost:1420`，开发热更新不受影响。
- 剧本变量：`software.version` 由 Windows 注册表读取，供 `excel-automation` 定位 Office 注册表路径；`blender-addon` 使用无 `;` 的 Python 表达式以通过命令参数白名单。