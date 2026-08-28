# SkillHub Helper（桌面助手）

> 独立 Tauri + Rust 桌面客户端。
> **不入 pnpm workspace，不参与 turbo build。** 单独 CI job 构建（参考 PRD §9.2 模块依赖图）。

## 职责（v2.0.2 决策 D6）

- 注册 `skillhub://` 协议
- 扫描本机已装软件
- 安装剧本（Playbook）执行
- **本机 HTTP 服务，转发 Web 端 LLM 调用**（用户本地 Key）
- 软件清单上报 + 接收反向推送

## M1 范围

W1-W5 实现最小可跑通版本：
- [x] Tauri 工程骨架（本文档）
- [ ] `llm_proxy.rs`：本机 HTTP 服务 `/llm/chat` `/llm/status` `/llm/keys/test`
- [x] `key_store.rs`：AES 加解密用户 Key，存 `.data/llm-keys.json`
- [x] `provider/`：DeepSeek / OpenAI / GLM 三家适配
- [ ] `protocol.rs`：Windows 注册表 + Mac Info.plist 注册 `skillhub://`（M2 接力）
- [x] 助手设置页 React UI（填 Key / 切换 Provider / Test Key）

## 目录结构

```
apps/helper/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs           # 入口、托盘、单实例
│       ├── llm_proxy.rs      # 本机 HTTP 服务（M1 核心）
│       ├── key_store.rs      # AES Key 存储
│       ├── provider/         # LLM Provider 适配
│       │   ├── mod.rs
│       │   ├── deepseek.rs
│       │   ├── openai.rs
│       │   └── glm.rs
│       ├── protocol.rs       # 协议注册（M2 扩展）
│       └── scanner.rs        # 软件扫描（M2 扩展）
├── src/                       # React 前端（助手内嵌窗口）
│   ├── App.tsx
│   └── pages/
│       ├── Settings.tsx       # Key 配置页（M1）
│       └── Onboarding.tsx    # 首次启动引导（M1）
├── resources/
│   ├── icons/
│   └── playbooks/            # 内置剧本（M2）
└── package.json
```

## 与 Web 集成

通过两个机制：
1. **协议唤起**：`skillhub://install/{slug}?version={v}&job={jobId}` → 唤起助手窗口
2. **本机 HTTP 转发**：助手启动后监听 `127.0.0.1:{random_port}`，Web 通过 `window.__SKILLHUB_HELPER_PORT__` 拿到端口调 `/llm/chat`

## 开发命令

```bash
# 安装依赖
cd apps/helper
pnpm install

# 开发模式
pnpm tauri dev

# 构建
pnpm tauri build
```