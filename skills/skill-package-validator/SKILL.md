---
name: skill-package-validator
description: 技能包（Skill Package）校验。当需要验证一个 Agent Skills 标准技能包是否符合 SkillHub 发布规范时使用——检查 SKILL.md frontmatter、目录结构、manifest schema 与资源引用。也用于发布前审核与 CI 门禁。
---

# 技能包校验 (skill-package-validator)

本技能指导 Agent 对技能包做**发布前静态校验**。技能包是 SkillHub 分发的 Agent Skills 标准包，最小结构：

```
my-skill/
├── SKILL.md            # 必须：frontmatter + 技能指令正文
├── scripts/            # 可选：辅助脚本
├── assets/             # 可选：资源文件
└── package.json        # 可选：manifest（或 skill.json）
```

## 何时使用

- 审核/发布前校验技能包
- 复查 `skillhub publish` 的 `--dry-run` 结果
- 排查上传被拒的包

## 校验清单（按序执行）

### 1. 目录结构
- [ ] `SKILL.md` 存在（缺失 → 直接拒绝）
- [ ] 无 `node_modules/`、`.git/` 混入
- [ ] `scripts/`、`assets/` 若存在，内容有实际用途（非空）

### 2. SKILL.md frontmatter（YAML）
- [ ] YAML 语法合法（用 `gray-matter`/`js-yaml` 解析）
- [ ] 必填键：`name`（非空、slug 友好）、`description`（非空、简洁）
- [ ] 推荐键：`version`（`x.y.z` 语义化）、`allowed-tools`、`license`、`author`
- [ ] 正文有实际指令（非空、非占位符 lorem ipsum）
- [ ] 引用的工具/文件路径在包内存在

### 3. Manifest（package.json / skill.json）
- [ ] JSON 合法
- [ ] `name` 非空、`version` 匹配 `/^\d+\.\d+\.\d+$/`
- [ ] 与 SKILL.md frontmatter 的 name/version 一致（不一致 → 警告）

### 4. 资源引用
- [ ] 正文/脚本引用的相对路径（如 `scripts/foo.py`、`assets/logo.png`）实际存在
- [ ] 无对外部绝对路径的强依赖（若必须，记录到报告）

## 输出

生成结构化校验报告（markdown）：

```
# 校验报告: <skill-name>@<version>
- 结构: PASS/FAIL
- frontmatter: PASS/FAIL (错误列表)
- manifest: PASS/FAIL (错误列表)
- 资源: PASS/FAIL (警告列表)
- 结论: 通过 / 拒绝 (原因)
```

**任一 FAIL → 拒绝发布**；仅警告 → 可发布但记录。

## 实现参考

- web 端解析器：`apps/web/lib/skills/skill-md-parser.ts`（gray-matter + zod）
- CLI 端校验器：`apps/cli/src/utils/validator.ts`（zod schema）
- 本地试跑：`pnpm --filter @skillhub/cli` 后 `node apps/cli/dist/index.js publish <dir> --dry-run`
