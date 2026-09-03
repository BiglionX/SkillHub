/**
 * @skillhub/ui · tokens/colors
 *
 * v2.0.7+：apps/helper 与 apps/web 共享的玻璃拟态色板（TS 端 hex 值单一来源）。
 *
 * 设计原则：
 * 1. 命名按用途而非色相（brand / state / surface / text）
 * 2. 与 helper-glass.css `--g-*` 变量、web glass.css `--color-glass-*` 变量保持 hex 值一致
 * 3. CSS 端通过 helper-glass.css / glass.css 暴露同名变量；TS 端只导 hex，用于：
 *    - 组件 inline style（如渐变 topBar）
 *    - 测试 / 文档
 *    - 未来抽到 SSR theme
 */

export const COLORS = {
  /** 主品牌色：青蓝 cyan（与 helper `--g-cyan-*` / web `--color-glass-cyan-*` 一致） */
  brand: {
    cyan300: '#67e8f9',
    cyan400: '#22d3ee',
    cyan500: '#06b6d4',
    cyan600: '#0891b2',
    /** 点缀紫粉 magenta（web 端命名）/ violet（helper 端命名），hex 一致 */
    magenta300: '#d8b4fe',
    magenta400: '#c084fc',
    magenta500: '#a855f7',
    magenta600: '#9333ea',
    /** helper 端别名（保留以减少 PR diff） */
    violet400: '#c084fc',
    violet500: '#a855f7',
    pink500: '#ec4899',
    /** 强调色 amber */
    amber400: '#fbbf24',
    amber500: '#f59e0b',
    blue500: '#3b82f6',
  },
  /** 状态色（与 glass.css `--color-glass-status-*` / helper-glass.css `.glass-pill-*` 一致） */
  state: {
    successText: '#86efac',
    successBorder: 'rgba(34, 197, 94, 0.4)',
    successBg: 'rgba(34, 197, 94, 0.12)',
    successIcon: '#16a34a',
    successHex: '#22c55e',

    dangerText: '#fca5a5',
    dangerBorder: 'rgba(239, 68, 68, 0.4)',
    dangerBg: 'rgba(239, 68, 68, 0.12)',
    dangerMuted: '#7f1d1d',
    dangerHex: '#ef4444',

    warningText: '#fbbf24',
    warningBorder: 'rgba(245, 158, 11, 0.4)',
    warningBg: 'rgba(245, 158, 11, 0.12)',
    warningHex: '#f59e0b',

    infoText: '#93c5fd',
    infoBorder: 'rgba(59, 130, 246, 0.4)',
    infoBg: 'rgba(59, 130, 246, 0.12)',
    infoHex: '#3b82f6',

    neutralBg: 'rgba(148, 163, 184, 0.15)',
    neutralText: '#94a3b8',
    neutralBorder: 'rgba(148, 163, 184, 0.3)',
    neutralMuted: '#9ca3af',
    neutralHex: '#94a3b8',
  },
  /** 玻璃画布 / 表面（与 glass.css `--color-glass-surface*` 一致） */
  surface: {
    canvas: '#050816',
    canvasSoft: '#0a0f24',
    card: 'rgba(255, 255, 255, 0.05)',
    cardHover: 'rgba(255, 255, 255, 0.08)',
    cardSoft: 'rgba(255, 255, 255, 0.03)',
    elevated: 'rgba(255, 255, 255, 0.08)',
    surfaceStrong: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.15)',
    borderCyan: 'rgba(6, 182, 212, 0.4)',
  },
  /** 文字色（深色主题下） */
  text: {
    primary: '#f1f5f9',
    secondary: '#cbd5e1',
    muted: '#94a3b8',
    faint: '#64748b',
    inverse: '#fff',
    link: '#22d3ee',
    /** web glass.css 用 rgba 表示 */
    primaryRgba: 'rgba(255, 255, 255, 0.95)',
    secondaryRgba: 'rgba(255, 255, 255, 0.75)',
    mutedRgba: 'rgba(255, 255, 255, 0.55)',
    faintRgba: 'rgba(255, 255, 255, 0.4)',
    linkRgba: '#67e8f9',
  },
} as const;

export type ColorToken = typeof COLORS;