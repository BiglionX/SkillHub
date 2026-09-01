/**
 * A 轮 #G4：颜色 token 集中管理。
 *
 * 原代码颜色字面量散落在 14+ 处 inline style：
 * - '#86efac' (toast 成功边框) 出现 1 处
 * - '#991b1b' (toast 失败文字) 出现 2 处
 * - '#dbeafe' (蓝色徽章背景) 出现 2 处
 * - '#fef2f2' (红色 banner 背景) 出现 2 处
 * - '#6b7280' (灰色文字) 出现 2 处
 * 等等。改一个色值要全局搜，改一遍漏一处就出现色差。
 *
 * 这里把所有 UI 用到的 hex 集中到 COLORS 对象，按用途命名分组（status / surface / text）。
 * 后续 UI 调整只改这一处，避免 token 漂移。
 *
 * 设计原则：
 * 1. 命名按语义而非色相（status.success 而不是 green.500）
 * 2. 同色不同明度按明度命名（surface.canvas / surface.elevated / surface.subtle）
 * 3. 文字色统一按对比度分（text.primary / text.muted / text.inverse）
 */

export const COLORS = {
  // ===== 状态色：toast / banner / badge =====
  status: {
    // 成功（绿色）：toast 完成态、徽章 ✓
    successText: '#166534',
    successBorder: '#86efac',
    successBg: '#dcfce7',
    successIcon: '#16a34a',
    // 失败（红色）：toast 失败态、fallback banner
    dangerText: '#991b1b',
    dangerBorder: '#fca5a5',
    dangerBg: '#fef2f2',
    dangerMuted: '#7f1d1d',
    // 警告（黄色）：未注册协议 banner
    warnText: '#92400e',
    warnBg: '#fef3c7',
    warnBorder: '#f59e0b',
    // 信息（蓝色）：运行中 toast、绑定徽章
    infoText: '#1e3a8a',
    infoAccent: '#1d4ed8',
    infoBg: '#dbeafe',
    infoBorder: '#bfdbfe',
    infoBadgeBg: '#dbeafe',
    infoBadgeText: '#1e40af',
    infoBadgeBorder: '#93c5fd',
    // 未知 / 占位（灰色）：未绑定徽章
    neutralBg: '#f3f4f6',
    neutralText: '#6b7280',
    neutralBorder: '#e5e7eb',
    neutralMuted: '#9ca3af',
  },
  // ===== 表面色：背景 / 卡片 =====
  surface: {
    canvas: '#f8fafc',
    card: '#fff',
    subtle: '#f3f4f6',
    sunken: '#1e293b',
    backdrop: 'rgba(15, 23, 42, 0.5)',
  },
  // ===== 文字色：按对比度分 =====
  text: {
    primary: '#111827',
    secondary: '#374151',
    muted: '#6b7280',
    faint: '#9ca3af',
    inverse: '#fff',
    link: '#2563eb',
    linkMuted: '#475569',
  },
  // ===== 主色调：进度条 / Tab 高亮 =====
  brand: {
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryLight: '#60a5fa',
  },
  // ===== 阴影 =====
  shadow: {
    card: '0 10px 30px rgba(15, 23, 42, 0.12)',
    modal: '0 20px 60px rgba(0,0,0,0.25)',
  },
} as const;

export type ColorToken = typeof COLORS;
