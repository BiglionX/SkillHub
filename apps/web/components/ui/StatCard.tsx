'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { GLASS_PILL, WEB_TOP_BAR, WEB_ICON_BG, WEB_ICON_COLOR, type GlassTone } from '@skillhub/ui';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label: string;
    isPositive?: boolean;
  };
  /**
   * accent tone：决定图标背景玻璃 + 顶部装饰条的颜色。
   * v2.0.7+：与 glass.css 的 glass-pill-* / glass-card-hover tone 对齐。
   */
  color?: GlassTone;
  isLoading?: boolean;
}

/**
 * v2.0.7+：玻璃化 StatCard（plan §3.4 仪表盘）
 *
 * 主体用 .glass-card + 顶部 64px 装饰渐变条；图标背景用 tone 对应的玻璃色。
 * 标题/数值走 dark-on-glass 文字色，trend 沿用 lucide-react TrendingUp/Down/Minus。
 */
export function StatCard({
  title,
  value,
  icon,
  trend,
  color = 'cyan',
  isLoading = false,
}: StatCardProps) {
  const accent = {
    pill: GLASS_PILL[color],
    iconBg: WEB_ICON_BG[color],
    iconColor: WEB_ICON_COLOR[color],
    topBar: WEB_TOP_BAR[color],
  };

  if (isLoading) {
    return (
      <div className="glass-card animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-4 bg-glass-surface-strong rounded w-24 mb-2" />
            <div className="h-8 bg-glass-surface-strong rounded w-16" />
          </div>
          <div className="h-12 w-12 bg-glass-surface-strong rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card glass-card-hover relative">
      <div
        aria-hidden
        className="absolute top-0 left-6 h-0.5 w-16 rounded-b"
        style={{ background: accent.topBar }}
      />
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {/* 标题 */}
          <p className="text-sm font-medium text-glass-text-secondary mb-1">{title}</p>

          {/* 数值 */}
          <p className="text-3xl font-bold text-glass-text-primary">{value}</p>

          {/* 趋势 */}
          {trend && (
            <div className="flex items-center mt-2 space-x-1">
              {trend.isPositive ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : trend.isPositive === false ? (
                <TrendingDown className="w-4 h-4 text-red-400" />
              ) : (
                <Minus className="w-4 h-4 text-glass-text-muted" />
              )}
              <span
                className={`text-sm font-medium ${
                  trend.isPositive
                    ? 'text-emerald-400'
                    : trend.isPositive === false
                    ? 'text-red-400'
                    : 'text-glass-text-secondary'
                }`}
              >
                {trend.value > 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-glass-text-muted">{trend.label}</span>
            </div>
          )}
        </div>

        {/* 图标 */}
        {icon && (
          <div className={`p-3 rounded-full ${accent.iconBg}`}>
            <div className={accent.iconColor}>{icon}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 统计卡片网格布局组件
 */
interface StatsGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
}

export function StatsGrid({ children, columns = 3 }: StatsGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-6`}>
      {children}
    </div>
  );
}