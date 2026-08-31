# SkillHub 版号规则（Versioning Rule）

> 本规则适用于 SkillHub 全仓库的所有发版产物（`package.json`、`Cargo.toml`、`tauri.conf.json` 的 `version` 字段）。

## 1. 版号格式

**`<X>.<Y>.<Z>`** 三段式，其中：

| 段 | 名称 | 范围 | 说明 |
|---|---|---|---|
| `X` | 主版本 | 整数 ≥ 0 | 重大架构变更、breaking change |
| `Y` | 次版本 | 0–99 | 模块级迭代、阶段性发布 |
| `Z` | 尾数 | **00–99（百进制，必补零）** | 每次发版 +1 |

## 2. 推进规则

1. 每次发版，**只动 `Z`**：`Z + 1`
2. **`Z` 满百进位**（`99 → 100`）：`Z = 0`，`Y + 1`
3. **`Y` 满百进位**（`99 → 100`）：`Y = 0`，`X + 1`

## 3. 格式约定

- `Z` 永远两位数（`00`–`99`），不满补零
- `Y` 在 `< 10` 时不补零，便于阅读（`0.1.00` 而不是 `0.01.00`）
- `X` 不补零

## 4. 起始版号

新包首次发版：**`0.1.00`**

## 5. 推进示例

```
0.1.00 → 0.1.01 → ... → 0.1.99 → 0.2.00 → ... → 0.9.99 → 0.10.00
0.99.99 → 1.0.00 → ... → 1.0.99 → 1.1.00 → ... → 99.99.99 → 100.0.00
```

## 6. 工具脚本

[`scripts/bump-version.py`](../../scripts/bump-version.py) 自动读 → bump → 写，**避免手改多个 version 字段出错**。

### 用法

```bash
# 1. 给单个文件 +1（默认 auto 识别文件类型）
python scripts/bump-version.py --file apps/helper/package.json

# 2. 预览不写
python scripts/bump-version.py --file apps/helper/package.json --dry-run

# 3. 新包首次发版：重置为 0.1.00
python scripts/bump-version.py --file packages/new-thing/package.json --start

# 4. 显式跳到指定版本（手动跨级）
python scripts/bump-version.py --file apps/helper/package.json --set 0.3.05
```

### 支持的文件类型

| 文件 | 字段 | auto 识别 |
|---|---|---|
| `package.json` | `"version"` | ✓ |
| `Cargo.toml` | `[package].version` | ✓ |
| `tauri.conf.json` | `"version"` | ✓ |

## 7. 已发版产物的处理原则

- **已发版到 npm / crates.io 的版本不可重置**（破坏依赖链）
- 规则适用于"下一次发版"开始；旧版本按原语义保留
- 新建包用 `--start` 落到 `0.1.00`

## 8. 与 changesets 的关系

本仓库已配置 [Changesets](../../.changeset/config.json) 用于自动发版 CHANGELOG。`bump-version.py` 与 changesets 不冲突：
- `bump-version.py`：手动修改源码 `version` 字段（开发期）
- Changesets：在合并 PR 时由 CI 触发，生成 CHANGELOG + 自动 bump
- 发版前手动 `bump` 是允许的；CI 触发的 changesets bot 会跳过已 bump 过的版本
