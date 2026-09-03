/**
 * StatusBadge 组件 + ToastCard 组件（v2.0.7+ 玻璃化）
 *
 * 设计 token 全部走 helper-glass.css 的 glass-pill-* 系列，避免 inline style 颜色字面量与
 * 全局深色玻璃主题漂移。phase → tone 的映射走 @skillhub/ui 的 GLASS_PILL 单一来源，
 * helper 与 web 同步维护（packages/ui/src/tokens/glass-classes.ts）。
 *
 * phase 与视觉映射：
 * - 'succeeded' → glass-pill-success（绿色：✓ + 边框绿）
 * - 'failed' → glass-pill-danger（红色：✗ + 边框红）
 * - 'running' → glass-pill-cyan（cyan 玻璃变体）
 * - 'pending' → glass-pill-neutral（灰色占位）
 *
 * Toast 边框变体走 @skillhub/ui 的 HELPER_TOAST_BORDER，物理 class 仍是
 * helper-glass.css 中的 `.glass-toast-{success,danger,running,pending}`。
 */

import { GLASS_PILL, HELPER_TOAST_BORDER, type GlassTone } from '@skillhub/ui';

export type StatusPhase = 'succeeded' | 'failed' | 'running' | 'pending';

interface StatusBadgeProps {
  phase: StatusPhase;
  children?: React.ReactNode;
  /// 显示在徽章前的图标（emoji 或字符）。如果不传按 phase 自动选
  icon?: string;
  /// 是否用紧凑模式（更小 padding）
  compact?: boolean;
}

const PHASE_ICON: Record<StatusPhase, string> = {
  succeeded: '✓',
  failed: '✗',
  running: '⟳',
  pending: '○',
};

/**
 * phase → tone 映射
 * - running 走 cyan（helper 端 glass-pill-cyan，对应 running/running）
 * - succeeded / failed / pending 直接对应 success / danger / neutral
 */
const PHASE_TO_TONE: Record<StatusPhase, GlassTone> = {
  succeeded: 'success',
  failed: 'danger',
  running: 'cyan',
  pending: 'neutral',
};

/// 紧凑模式 class（不使用 Tailwind arbitrary value，AGENTS.md 桌面端禁用 Tailwind）
const COMPACT_CLASS = 'glass-pill-compact';

export function StatusBadge({ phase, children, icon, compact = false }: StatusBadgeProps) {
  const showIcon = icon ?? PHASE_ICON[phase];
  const tone = PHASE_TO_TONE[phase];
  return (
    <span
      role="status"
      aria-label={`${phase}${children ? `：${typeof children === 'string' ? children : ''}` : ''}`}
      className={`${GLASS_PILL[tone]} ${compact ? COMPACT_CLASS : ''}`}
    >
      <span aria-hidden style={{ fontWeight: 600 }}>
        {showIcon}
      </span>
      {children}
    </span>
  );
}

interface ToastCardProps {
  /// border tone 与 Phase 一致
  borderTone: StatusPhase;
  children: React.ReactNode;
  width?: number;
  ariaRole?: 'status' | 'alert';
  ariaLive?: 'polite' | 'assertive';
}

/// v2.0.7+：toast 外壳走 glass-card-soft（深色玻璃），叠加 glass-toast-* 边框区分 phase
const PHASE_TO_BORDER_TONE: Record<StatusPhase, keyof typeof HELPER_TOAST_BORDER> = {
  succeeded: 'success',
  failed: 'danger',
  running: 'running',
  pending: 'pending',
};

export function ToastCard({
  borderTone,
  children,
  width = 340,
  ariaRole = 'status',
  ariaLive = 'polite',
}: ToastCardProps) {
  return (
    <div
      role={ariaRole}
      aria-live={ariaLive}
      style={{ width }}
      className={`glass-card-soft p-3.5 ${HELPER_TOAST_BORDER[PHASE_TO_BORDER_TONE[borderTone]]}`}
    >
      {children}
    </div>
  );
}