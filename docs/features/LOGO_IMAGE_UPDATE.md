# Logo 图片更新记录

## 📋 更新信息

**最后更新**: 2026年（最新一次）
**状态**: ✅ 已完成

### 更新策略

`apps/web/scripts/update-logo.mjs` 提供一行命令从单一源 PNG（默认 `skillhub-logo.png`）同步全栈 logo + favicon 资源，保证视觉一致性。脚本会同时清理根目录冗余副本（`logo2.png` / `logo.jpeg` / 旧 `skillhub.png`），与 [`docs/deployment/DEPLOYMENT_CLEANUP_GUIDE.md`](../deployment/DEPLOYMENT_CLEANUP_GUIDE.md) 和 `scripts/cleanup-before-deploy.{sh,bat}` 保持一致。

```bash
# 从 apps/web/ 执行；--root 同步根目录 logo.png 并删除旧副本
node scripts/update-logo.mjs --root
```

## 📊 当前资源清单

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `apps/web/public/skillhub.png` | 1200×1200 | OG / Twitter 卡片、`/login` 等页面 `<img src="/skillhub.png">`、json-ld publisher.logo |
| `apps/web/public/logo.png` | 512×512 | A2A Agent Card `iconUrl` |
| `apps/web/public/icon.png` | 512×512 | 通用 fallback（Next metadata `icons.icon`） |
| `apps/web/public/apple-touch-icon.png` | 180×180 | iOS 主屏图标（Apple HIG 要求） |
| `apps/web/public/favicon.ico` | 多尺寸 16/32/48 PNG-in-ICO | 浏览器标签页 / PWA |
| `apps/web/app/icon.png` | 512×512 | Next.js App Router icon route（自动被 `<head>` 注入） |
| `logo.png`（仓库根） | 512×512 | 与部署清理脚本对齐的规范副本 |

## 🎯 影响范围（自动覆盖）

### 元数据与社交卡片
- `apps/web/app/layout.tsx`：`metadata.icons.{icon,apple}` + `openGraph.images[0]` + `twitter.images[0]` + json-ld `publisher.logo.url`
- `apps/web/lib/a2a/agent-card.ts`：A2A `AgentCard.iconUrl = ${BASE_URL}/logo.png`
- `docs/integration/A2A_INTEGRATION_GUIDE.md` 示例 `iconUrl`

### 页面 `<img>` 引用
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/app/dashboard/layout.tsx`
- `apps/web/app/skills/PublicSkillsClient.tsx`（页面顶部 + 列表项）
- `apps/web/app/sdk/page.tsx`
- `apps/web/app/widget-demo/page.tsx`
- `apps/web/app/opensource/dsh/page.tsx`
- `apps/web/app/bounties/page.tsx`
- `apps/web/app/skills/[slug]/page.tsx`（`generateMetadata` 的 `openGraph.images` + `twitter.images`）

## ⚠️ 注意事项

### 现有图片命名一致性
所有页面统一使用 `/skillhub.png`（与 `metadata.icons` 解耦），`/logo.png` 仅用于 A2A 协议 Agent Card。`docs/features/LOGO_IMAGE_UPDATE.md` 历史版本提到的"register/forgot-password/reset-password 仍用 logo.png"已不再准确——这些页面在最新代码里均已切换或不再保留独立引用。

### 测试断言
- `apps/web/tests/password-login.spec.ts`：`img[alt="Skill Hub Logo"]` 的 `src` 必须为 `/skillhub.png`，与新资源一致。

## 🔍 验证步骤

### 1. 重新构建并刷新浏览器
```bash
pnpm --filter @skillhub/web run dev
# 按 F12 → 右键刷新 → "清空缓存并硬性重新加载"
```

### 2. 视觉检查
- [ ] 浏览器标签页 favicon 显示新 logo
- [ ] 登录页 / 仪表盘 logo 显示新 logo
- [ ] iOS Safari "添加到主屏幕" → 图标为新 logo（180×180 圆角效果）
- [ ] 社交卡片（Facebook / Twitter 调试器）显示新 logo
- [ ] 暗色模式 / 高 DPI 设备清晰

### 3. 自动化检查
```bash
pnpm --filter @skillhub/web run typecheck
pnpm --filter @skillhub/web run test -- --testPathPattern=password-login
```

## 🔄 后续操作

如未来再次更换 logo，只需：
1. 把新源文件放到仓库根（或传入 `--source` 参数）覆盖 `skillhub-logo.png`
2. 在 `apps/web/` 执行 `node scripts/update-logo.mjs --root`
3. 提交 `apps/web/public/*`、`apps/web/app/icon.png`、`logo.png`，无需改任何 TSX / MD

## 🔗 相关文档

- [`docs/deployment/DEPLOYMENT_CLEANUP_GUIDE.md`](../deployment/DEPLOYMENT_CLEANUP_GUIDE.md)
- [`scripts/cleanup-before-deploy.sh`](../../scripts/cleanup-before-deploy.sh) / [`scripts/cleanup-before-deploy.bat`](../../scripts/cleanup-before-deploy.bat)
- [`docs/integration/A2A_INTEGRATION_GUIDE.md`](../integration/A2A_INTEGRATION_GUIDE.md)