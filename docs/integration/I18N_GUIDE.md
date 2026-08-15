# SkillHub 多语言（i18n）集成指南

> **版本**: SkillHub v3.0+
> **支持语言**: 简体中文 (zh-CN) / English (en-US) / 日本語 (ja-JP) / 한국어 (ko-KR)

## 1. 概述

SkillHub v3.0 完整支持 4 种语言的 UI 和内容。本指南说明：

1. 用户如何切换语言
2. 开发者如何扩展字典
3. API 如何获取多语言内容

## 2. 用户使用

### 2.1 语言切换器

在 UI 上方找到语言切换按钮：
- 🇨🇳 简体中文（默认）
- 🇺🇸 English
- 🇯🇵 日本語
- 🇰🇷 한국어

切换后语言偏好会保存在 Cookie（一年有效期），下次访问自动应用。

### 2.2 浏览器自动协商

首次访问时，SkillHub 会根据浏览器 `Accept-Language` 头自动选择最匹配的语言：

```
Accept-Language: zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7
       ↓
协商结果: zh-CN（精确匹配）
```

如果未匹配，回退到默认语言 `zh-CN`。

## 3. 开发者指南

### 3.1 在服务端组件中使用

```tsx
// app/example/page.tsx
import { getServerTranslations } from '@/lib/i18n/server';

export default async function Page() {
  const { t, locale } = await getServerTranslations();
  return (
    <div>
      <h1>{t('common.appName')}</h1>
      <p>{t('skills.installDescription')}</p>
      <small>Locale: {locale}</small>
    </div>
  );
}
```

### 3.2 在客户端组件中使用

```tsx
'use client';
import { useI18n } from '@/lib/i18n/I18nProvider';

export default function MyComponent() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div>
      <h1>{t('common.appName')}</h1>
      <p>{t('skills.installDescription')}</p>
      <button onClick={() => setLocale('en-US')}>English</button>
    </div>
  );
}
```

### 3.3 使用语言切换器组件

```tsx
import LocaleSwitcher from '@/components/i18n/LocaleSwitcher';

// 三种变体
<LocaleSwitcher variant="dropdown" />     // 默认下拉
<LocaleSwitcher variant="inline" />       // 横向列表
<LocaleSwitcher variant="icon" />         // 紧凑图标
```

### 3.4 使用语言切换面板

```tsx
import LocalePanel from '@/components/i18n/LocalePanel';

<LocalePanel
  title="选择语言"
  showCompletion
/>
```

## 4. 添加新翻译

### 4.1 修改现有翻译

编辑 4 个字典文件：
- `apps/web/i18n/dictionaries/zh-CN.ts`
- `apps/web/i18n/dictionaries/en-US.ts`
- `apps/web/i18n/dictionaries/ja-JP.ts`
- `apps/web/i18n/dictionaries/ko-KR.ts`

```typescript
export const zhCN = {
  common: {
    // 添加新键
    welcome: '欢迎使用 SkillHub',
  },
  // ...
};
```

### 4.2 添加新语言（如 zh-TW）

1. **更新配置** `apps/web/i18n/config.ts`：

```typescript
export const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'] as const;

export const localeMeta = {
  // ... 现有 locales
  'zh-TW': {
    code: 'zh-TW',
    nativeName: '繁體中文',
    englishName: 'Traditional Chinese',
    chineseName: '繁体中文',
    flag: '🇹🇼',
    dir: 'ltr',
  },
};
```

2. **创建字典** `apps/web/i18n/dictionaries/zh-TW.ts`：

```typescript
export const zhTW = {
  common: { /* ... 同 zh-CN 结构 */ },
  skills: { /* ... */ },
  errors: { /* ... */ },
  api: { /* ... */ },
} as const;
```

3. **注册字典** `apps/web/i18n/dictionaries/index.ts`：

```typescript
import { zhTW } from './zh-TW';

const dictionaries: Record<Locale, Dictionary> = {
  // ...
  'zh-TW': zhTW as unknown as Dictionary,
};
```

4. **更新 fallback chain** `apps/web/i18n/config.ts`：

```typescript
export const localeFallbackChain: Record<Locale, Locale[]> = {
  // ...
  'zh-TW': ['zh-TW', 'zh-CN', 'en-US'],
};
```

## 5. Skill 多语言内容

### 5.1 API 端点

```
GET /api/v2/skills/{slug}/i18n?locale=ja-JP
```

**响应示例**：

```json
{
  "slug": "pdf-tools",
  "locale": "zh-CN",
  "requestedLocale": "ja-JP",
  "name": "PDF 工具",
  "description": "生成、编辑、分析 PDF 文档",
  "skillMd": "---\nname: PDF 工具\n...",
  "fallbackChain": ["ja-JP", "en-US", "zh-CN"],
  "isFallback": true,
  "originalLocale": "zh-CN"
}
```

- `locale`: 实际返回的语言（可能是 fallback）
- `requestedLocale`: 用户请求的语言
- `isFallback`: 是否触发了 fallback
- `fallbackChain`: fallback 顺序

### 5.2 列出所有语言

```
GET /api/v2/locales
```

**响应**：

```json
{
  "version": "1.0",
  "defaultLocale": "zh-CN",
  "count": 4,
  "locales": [
    {
      "code": "zh-CN",
      "nativeName": "简体中文",
      "englishName": "Simplified Chinese",
      "chineseName": "简体中文",
      "flag": "🇨🇳",
      "dir": "ltr",
      "isDefault": true
    },
    // ...
  ]
}
```

## 6. Fallback 策略

当 Skill 没有目标 locale 的翻译时，按 fallback chain 顺序查找：

| 请求 locale | Fallback 顺序 |
|---|---|
| zh-CN | zh-CN → en-US |
| en-US | en-US → zh-CN |
| ja-JP | ja-JP → en-US → zh-CN |
| ko-KR | ko-KR → en-US → zh-CN |

## 7. 最佳实践

### 7.1 命名空间组织

将翻译按功能分组：

```typescript
export const zhCN = {
  common: { /* 通用 UI */ },
  skills: { /* Skills 相关 */ },
  errors: { /* 错误信息 */ },
  api: { /* API 文档 */ },
  auth: { /* 认证流程 */ },  // 可扩展
  settings: { /* 设置页 */ }, // 可扩展
};
```

### 7.2 避免硬编码

❌ **不要**：
```tsx
<h1>欢迎</h1>
```

✅ **应该**：
```tsx
<h1>{t('common.welcome')}</h1>
```

### 7.3 复数处理

i18n 当前为简化实现，未来可扩展：

```typescript
// 未来扩展（待实现）
t('skills.downloads', { count: 100 });  // "100 downloads" / "100 次下载"
```

### 7.4 变量插值

字典中可使用 `{varName}` 占位符：

```typescript
{
  rateLimitNotice: 'API rate limit: {limit} req/min',
}
```

代码替换：
```typescript
const message = dict.api.rateLimitNotice.replace('{limit}', '60');
```

## 8. 缓存策略

- `GET /api/v2/locales`：CDN 缓存 1 小时
- `GET /api/v2/skills/{slug}/i18n`：CDN 缓存 5 分钟 + Vary: Accept-Language
- 字典静态导入：构建时打包，无运行时开销

## 9. 数据库迁移

使用 Prisma Migrate 创建翻译表：

```bash
cd apps/web
npx prisma migrate dev --name add_skill_translations
```

**表结构**：`skill_translations`
- `id`: 主键 UUID
- `skillId`: 关联到 `skills.id`
- `locale`: 语言代码 (zh-CN, en-US, ja-JP, ko-KR)
- `name`: 翻译后的名称（可选）
- `description`: 翻译后的描述（可选）
- `skillMdContent`: 翻译后的 SKILL.md 内容（可选）
- `createdAt`/`updatedAt`: 时间戳

唯一约束：`@@unique([skillId, locale])`

## 10. 已知限制

- 不支持 RTL 语言（如阿拉伯语、希伯来语）的复杂布局
- 无运行时动态字典加载（字典在构建时打包）

## 11. 路线图

- [x] SkillTranslation 多语言翻译表 ✅
- [ ] RTL 语言支持
- [ ] 复数形式处理
- [ ] ICU MessageFormat
- [ ] 翻译管理后台

---

参考：
- [Agent Skills 开放标准](https://agentskills.io)
- [Next.js 国际化](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
