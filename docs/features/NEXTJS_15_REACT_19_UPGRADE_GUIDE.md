# Next.js 15 + React 19 升级指南

> SkillHub v3.0 - M3 任务 F5.1-F5.3
> 
> 升级日期：2026-06-24

## 升级内容

| 包 | 旧版本 | 新版本 |
|----|--------|--------|
| `next` | 14.2.35 | 15.5.4 |
| `react` | 18.3.1 | 19.2.0 |
| `react-dom` | 18.3.1 | 19.2.0 |
| `@types/react` | 18.3.0 | 19.2.0 |

## 主要破坏性变更

### 1. async `params` 和 `searchParams`（Next.js 15）

`params` 和 `searchParams` 现在是 Promise，必须 await。

```typescript
// ❌ Next.js 14
export default function Page({ params }: { params: { slug: string } }) {
  return <div>{params.slug}</div>;
}

// ✅ Next.js 15
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <div>{slug}</div>;
}
```

**本项目状态**：✅ 已适配（Week 2 实施时已采用 async params）

### 2. `fetch` 默认缓存策略

- **Next.js 14**：默认 `force-cache`
- **Next.js 15**：默认 `no-store`（GET 请求）

```typescript
// Next.js 15：需要显式缓存
fetch('https://api.example.com/data', { 
  next: { revalidate: 3600 } // 显式启用 ISR
});
```

**影响**：API 路由和 Server Components 中如需缓存需显式设置。

### 3. React 19 新特性

- `useActionState` 替代 `useFormState`
- `useFormStatus` 增强
- Server Actions 默认启用
- 新的 `use` API（实验性）

## 兼容性检查清单

### API 路由
- [x] `/api/v2/discovery` - 已使用 `NextRequest`/`NextResponse`
- [x] `/api/v2/skills/[slug]/skill.md` - 已使用 async params
- [x] `/api/v2/skills/[slug]/files/[...path]` - 已使用 async params
- [x] `/api/v2/skills/import` - POST 路由
- [x] `/api/mcp/tools` - MCP Server
- [x] `/api/mcp/client` - MCP Client（新增）

### 页面组件
- [x] `/skills/[slug]/page.tsx` - 已使用 async params
- [ ] `/dashboard/*` - 需要验证
- [ ] `/admin/*` - 需要验证

### 中间件
- [x] `middleware.ts` - 不依赖 params，无破坏性变更

## 验证步骤

```powershell
# 1. 清理依赖
cd d:\BigLionX\SkillHub
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue

# 2. 重新安装
cd apps\web
npm install --legacy-peer-deps

# 3. 类型检查
npx tsc --noEmit

# 4. 启动开发服务器
npm run dev

# 5. 测试关键路径
# - 访问 http://localhost:3000/skills
# - 访问 http://localhost:3000/api/v2/discovery
# - 访问 http://localhost:3000/api/mcp/tools
```

## 已知风险

1. **MUI v9 + React 19**：MUI v9 已支持 React 19，但部分组件可能需调整样式
2. **第三方库兼容**：部分老旧库可能未适配 React 19，必要时用 `--legacy-peer-deps`
3. **Turbopack**：暂不启用以避免与现有 webpack 插件冲突
4. **React Compiler**：暂不启用，先观察运行稳定性

## 回滚方案

如升级后出现严重问题：

```powershell
# 1. 回滚 package.json
git checkout HEAD~1 -- apps/web/package.json

# 2. 重新安装
npm install --legacy-peer-deps

# 3. 重启开发服务器
```

## 已识别的修复任务

| 优先级 | 文件 | 问题 | 状态 |
|--------|------|------|------|
| P0 | `next.config.js` | Turbopack 暂不启用 | ✅ |
| P1 | `app/dashboard/*` | 可能需要 params 适配 | 待验证 |
| P1 | `app/admin/*` | 可能需要 params 适配 | 待验证 |
| P2 | `eslint.config.js` | React 19 规则更新 | 待验证 |

## 升级后的新能力

1. **React Server Components** 默认启用，更好的流式渲染
2. **Server Actions** 简化表单处理
3. **typedRoutes**（开发模式）自动生成路由类型
4. **更快的 HMR** 和构建速度
5. **更好的错误覆盖** 和调试体验