---
name: skill-smoke-test
description: 技能包冒烟测试。当需要验证一个技能包（SKILL.md）在真实 Agent 环境中能否安装并正确执行时使用——在沙箱工作区加载技能、运行代表性任务、检查输出并生成测试报告。发布审核与质量评分的运行时验证环节。
---

# 技能包冒烟测试 (skill-smoke-test)

本技能指导 Agent 在**隔离沙箱**中对技能包做运行时冒烟测试。目标：确认 SKILL.md 能被 Agent 正确加载，且技能在代表性任务上产生预期输出。

## 何时使用

- 发布前运行时验证（配合 skill-package-validator 的静态校验）
- 审核第三方/爬取来的技能包（GitHub 全球搜索入库前）
- 复现用户报告的"技能不工作"问题

## 工作流程

### 1. 准备沙箱工作区
- 创建临时目录（如 `.tmp-smoke/<skill-name>-<ts>`），不得污染仓库
- 将技能包完整复制进去（SKILL.md + scripts/ + assets/）
- 确认沙箱无网络敏感操作（如需联网，记录并限制超时）

### 2. 加载技能
- 把 SKILL.md 作为技能目录加载进 Agent harness（DSH / DeerFlow / Claude Code 均可）
- 确认 frontmatter 解析成功（name/description 正确呈现）

### 3. 设计代表性任务（1-3 个）
- 从 description 与正文提取技能的典型使用场景
- 任务要可判定：有明确期望输出（文件生成/答案正确/格式合规）
- 至少 1 个**边界/异常**任务（缺输入、非法参数）

### 4. 执行
- 逐个任务运行，记录：命令/提示、超时、退出码、输出摘要
- 注意资源占用（CPU/内存/磁盘）与权限越界（禁止写仓库外路径、禁止删除）

### 5. 检查与报告
- 对照期望输出判定 PASS/FAIL
- 生成报告（markdown）：

```
# 冒烟测试报告: <skill-name>@<version>
- 环境: <harness+模型>
- 任务1: PASS/FAIL (期望 vs 实际)
- 任务2: ...
- 异常/安全观察: ...
- 结论: 可用 / 需修复 (建议)
```

## 安全底线

- 只在沙箱目录内写文件；技能脚本若尝试越界 → 立即终止并标记"危险"
- 长任务设超时；循环/无限等待直接 kill
- 不把技能的真实凭据/密钥带入测试环境

## 参考

- 模式参考：`deer-flow/.agent/skills/smoke-test/`（vendored DeerFlow 的冒烟技能，含报告模板）
- 技能规范：Agent Skills 标准（SKILL.md frontmatter + 正文）
