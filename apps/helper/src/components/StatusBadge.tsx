/**
 * A 轮 #G3：StatusBadge 组件 + ToastCard 组件。
 *
 * 原代码 toast 三态（succeeded / failed / running）各自写一份 inline style，
 * 颜色字面量直接复制粘贴。改造：
 * 1. 抽 StatusBadge 组件：phase + 子内容，内部按 phase 选 token
 * 2. 抽 ToastCard 组件：toast 外壳（圆角 + 边框 + 阴影 + 内边距）
 * 3. 颜色全部走 tokens.COLORS 不再 hardcode
 *
 * phase 与视觉映射：
 * - 'succeeded' → 绿色（✓ + 边框绿）
 * - 'failed' → 红色（✗ + 边框红）
 * - 'running' → 蓝色（progress + 边框蓝）
 * - 'pending' → 灰色（占位 / 未开始）
 */

import { COLORS } from '../tokens';

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

const PHASE_STYLE: Record<
  StatusPhase,
  { text: string; bg: string; border: string; icon: string }
> = {
  succeeded: {
    text: COLORS.status.successText,
    bg: COLORS.status.successBg,
    border: COLORS.status.successBorder,
    icon: COLORS.status.successIcon,
  },
  failed: {
    text: COLORS.status.dangerText,
    bg: COLORS.status.dangerBg,
    border: COLORS.status.dangerBorder,
    icon: COLORS.status.dangerText,
  },
  running: {
    text: COLORS.status.infoText,
    bg: COLORS.status.infoBg,
    border: COLORS.status.infoBorder,
    icon: COLORS.status.infoAccent,
  },
  pending: {
    text: COLORS.status.neutralText,
    bg: COLORS.status.neutralBg,
    border: COLORS.status.neutralBorder,
    icon: COLORS.status.neutralMuted,
  },
};

export function StatusBadge({ phase, children, icon, compact = false }: StatusBadgeProps) {
  const s = PHASE_STYLE[phase];
  const showIcon = icon ?? PHASE_ICON[phase];
  return (
    <span
      role="status"
      aria-label={`${phase}${children ? `：${typeof children === 'string' ? children : ''}` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: compact ? '1px 6px' : '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ color: s.icon, fontWeight: 600 }}>
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

const BORDER_COLOR: Record<StatusPhase, string> = {
  succeeded: COLORS.status.successBorder,
  failed: COLORS.status.dangerBorder,
  running: COLORS.status.infoBorder,
  pending: COLORS.status.neutralBorder,
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
      style={{
        width,
        padding: 14,
        background: COLORS.surface.card,
        border: `1px solid ${BORDER_COLOR[borderTone]}`,
        borderRadius: 12,
        boxShadow: COLORS.shadow.card,
      }}
    >
      {children}
    </div>
  );
}
