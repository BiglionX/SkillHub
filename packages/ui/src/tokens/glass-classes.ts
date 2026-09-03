/**
 * @skillhub/ui · tokens/glass-classes
 *
 * v2.0.7+：glass class 名称常量，避免 string literal 散落导致拼写错误与漂移。
 *
 * 设计原则：
 * - 逻辑名（`tone`、`variant`）→ 物理 class string
 * - helper 与 web 共享同一个逻辑层；底层物理类名（.glass-pill-cyan vs .glass-pill-violet）
 *   已经统一，差异只存在于 web 端 Tailwind utility（bg-cyan-500/15）和 helper CSS 变量
 * - 这是「名字 + 颜色」二元组的封装，避免组件里散落 `'glass-pill glass-pill-cyan'` 拼接
 *
 * 单一来源原则：
 * - 若新增 class，请同时在 helper-glass.css 与 web glass.css 加
 * - 然后在下方添加对应常量
 */

/** tone：胶囊 / 卡片 / 顶部装饰条的语义色 */
export type GlassTone = 'cyan' | 'magenta' | 'violet' | 'amber' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/**
 * `.glass-pill` + tone 组合（统一 helper 与 web 命名）
 *
 * helper 端：`.glass-pill-violet` 用 violet 字面；web 端也兼容 `.glass-pill-violet`
 * （helper 端 magic — 但这里我们 map magenta → violet 以匹配已落地的 className）。
 */
export const GLASS_PILL: Record<GlassTone, string> = {
  cyan: 'glass-pill glass-pill-cyan',
  magenta: 'glass-pill glass-pill-violet',
  violet: 'glass-pill glass-pill-violet',
  amber: 'glass-pill glass-pill-amber',
  success: 'glass-pill glass-pill-success',
  warning: 'glass-pill glass-pill-warning',
  danger: 'glass-pill glass-pill-danger',
  info: 'glass-pill glass-pill-cyan',
  neutral: 'glass-pill glass-pill-neutral',
};

/**
 * 玻璃卡片 tone 变体（用于 `.glass-card glass-card-hover` 后追加 tone）
 *
 * web glass.css 已有 `.glass-cyan / .glass-magenta / .glass-amber / .glass-info / .glass-warning / .glass-danger / .glass-success / .glass-neutral`
 * helper 端通过 1px 边框色差异实现，等价 class 见 helper-glass.css。
 */
export const GLASS_CARD_TONE: Record<GlassTone, string> = {
  cyan: 'glass-card glass-card-hover glass-cyan',
  magenta: 'glass-card glass-card-hover glass-magenta',
  violet: 'glass-card glass-card-hover glass-magenta',
  amber: 'glass-card glass-card-hover glass-amber',
  success: 'glass-card glass-card-hover glass-success',
  warning: 'glass-card glass-card-hover glass-warning',
  danger: 'glass-card glass-card-hover glass-danger',
  info: 'glass-card glass-card-hover glass-info',
  neutral: 'glass-card glass-card-hover glass-neutral',
};

/**
 * 顶部装饰渐变条（StatCard 等组件使用）
 * - helper 端使用 `--g-*` CSS 变量
 * - web 端使用 `--color-glass-*` CSS 变量
 *
 * 这里返回 CSS gradient 字符串（inline style 用），其中 CSS var 名两端命名差异
 * 由消费方决定；helper 用 helperGradient，web 用 webGradient。
 */
export const HELPER_TOP_BAR: Record<GlassTone, string> = {
  cyan: 'linear-gradient(90deg, var(--g-cyan-400) 0%, var(--g-cyan-500) 100%)',
  magenta: 'linear-gradient(90deg, var(--g-violet-400) 0%, var(--g-violet-500) 100%)',
  violet: 'linear-gradient(90deg, var(--g-violet-400) 0%, var(--g-violet-500) 100%)',
  amber: 'linear-gradient(90deg, var(--g-amber-400) 0%, var(--g-amber-500) 100%)',
  success: 'linear-gradient(90deg, var(--g-green-400) 0%, var(--g-green-500) 100%)',
  warning: 'linear-gradient(90deg, var(--g-amber-400) 0%, var(--g-amber-500) 100%)',
  danger: 'linear-gradient(90deg, var(--g-red-400) 0%, var(--g-red-500) 100%)',
  info: 'linear-gradient(90deg, var(--g-cyan-400) 0%, var(--g-blue-500) 100%)',
  neutral: 'linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
};

export const WEB_TOP_BAR: Record<GlassTone, string> = {
  cyan: 'linear-gradient(90deg, var(--color-glass-cyan-400) 0%, var(--color-glass-cyan-500) 100%)',
  magenta: 'linear-gradient(90deg, var(--color-glass-magenta-400) 0%, var(--color-glass-magenta-500) 100%)',
  violet: 'linear-gradient(90deg, var(--color-glass-magenta-400) 0%, var(--color-glass-magenta-500) 100%)',
  amber: 'linear-gradient(90deg, rgb(251 191 36) 0%, rgb(245 158 11) 100%)',
  success: 'linear-gradient(90deg, rgb(74 222 128) 0%, rgb(34 197 94) 100%)',
  warning: 'linear-gradient(90deg, rgb(251 191 36) 0%, rgb(245 158 11) 100%)',
  danger: 'linear-gradient(90deg, rgb(248 113 113) 0%, rgb(239 68 68) 100%)',
  info: 'linear-gradient(90deg, rgb(96 165 250) 0%, rgb(59 130 246) 100%)',
  neutral: 'linear-gradient(90deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
};

/**
 * 图标背景 / 文字 tone（web 端 Tailwind 风格，bg-{tone}-500/15 + text-{tone}-300）
 */
export const WEB_ICON_BG: Record<GlassTone, string> = {
  cyan: 'bg-cyan-500/15',
  magenta: 'bg-magenta-500/15',
  violet: 'bg-violet-500/15',
  amber: 'bg-amber-500/15',
  success: 'bg-emerald-500/15',
  warning: 'bg-amber-500/15',
  danger: 'bg-red-500/15',
  info: 'bg-blue-500/15',
  neutral: 'bg-slate-500/15',
};

export const WEB_ICON_COLOR: Record<GlassTone, string> = {
  cyan: 'text-cyan-300',
  magenta: 'text-magenta-300',
  violet: 'text-violet-300',
  amber: 'text-amber-300',
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  danger: 'text-red-300',
  info: 'text-blue-300',
  neutral: 'text-slate-300',
};

/**
 * Toast 边框变体（helper 端专用，web 端用 .glass-* tone）
 */
export const HELPER_TOAST_BORDER: Record<'success' | 'danger' | 'running' | 'pending', string> = {
  success: 'glass-toast-success',
  danger: 'glass-toast-danger',
  running: 'glass-toast-running',
  pending: 'glass-toast-pending',
};

/**
 * hint 提示条（helper 端 .glass-hint-* / web 端 .glass-info / glass-warning / glass-danger / glass-success）
 */
export const HELPER_HINT: Record<'info' | 'warning' | 'danger' | 'success', string> = {
  info: 'glass-hint-info',
  warning: 'glass-hint-warning',
  danger: 'glass-hint-danger',
  success: 'glass-hint-success',
};

export const WEB_HINT: Record<'info' | 'warning' | 'danger' | 'success', string> = {
  info: 'glass-card glass-info',
  warning: 'glass-card glass-warning',
  danger: 'glass-card glass-danger',
  success: 'glass-card glass-success',
};

/**
 * 文字色（深色玻璃上）
 */
export const HELPER_TEXT: Record<'primary' | 'secondary' | 'muted' | 'faint' | 'cyan', string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  muted: 'text-muted',
  faint: 'text-faint',
  cyan: 'text-cyan',
};

export const WEB_TEXT: Record<'primary' | 'secondary' | 'muted' | 'faint' | 'link', string> = {
  primary: 'text-glass-text-primary',
  secondary: 'text-glass-text-secondary',
  muted: 'text-glass-text-muted',
  faint: 'text-glass-text-faint',
  link: 'text-glass-text-link',
};