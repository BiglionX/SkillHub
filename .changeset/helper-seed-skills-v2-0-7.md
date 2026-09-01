---
"@skillhub/helper": patch
---

桌面端 Skills 冷启动种子 v2.0.7：

- 新增 `apps/helper/resources/seed-skills.json`，内置 8 + 6 = 14 个 software_tag 的 Skill 摘要种子
- 扩 `apps/helper/resources/scanner-rules.yml`：从 8 个 software_tag 扩到 23 个
- `Settings.tsx` Section 2（本机软件）每个扫描到的软件条目右侧新增「查看 N 个推荐 Skill →」按钮，点击跳转 Web 端查找安装
- 详阅 docs/features/SEED_SKILLS_COLD_START.md