/**
 * Trust Score 徽章组件
 *
 * 根据 Trust Score 显示不同颜色和等级的徽章：
 * - A+ (90+): 绿色 + Verified 标识
 * - A (80+):  蓝色 + Verified 标识
 * - B (60+):  黄色
 * - C (40+):  橙色
 * - D (<40):  灰色
 */

'use client';

import { useState } from 'react';

export interface TrustScoreBadgeProps {
  /** Trust Score 0-100 */
  score: number;
  /** 等级（可选，默认根据 score 计算） */
  grade?: 'A+' | 'A' | 'B' | 'C' | 'D';
  /** 是否 Verified（可选，默认 score >= 80） */
  verified?: boolean;
  /** 徽章变体 */
  variant?: 'compact' | 'detailed' | 'minimal';
  /** 显示模式 */
  showLabel?: boolean;
  className?: string;
}

const GRADE_STYLES = {
  'A+': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', icon: '🛡️' },
  'A': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: '✓' },
  'B': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', icon: '★' },
  'C': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: '!' },
  'D': { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: '?' },
} as const;

function getGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export default function TrustScoreBadge({
  score,
  grade,
  verified,
  variant = 'compact',
  showLabel = true,
  className = '',
}: TrustScoreBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const computedGrade = grade ?? getGrade(score);
  const computedVerified = verified ?? score >= 80;
  const style = GRADE_STYLES[computedGrade];

  // Minimal 变体：仅图标
  if (variant === 'minimal') {
    return (
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${style.bg} ${style.text} text-xs font-bold ${className}`}
        title={`Trust Score: ${score}/100`}
        aria-label={`Trust Score: ${score} of 100`}
      >
        {computedGrade}
      </span>
    );
  }

  // Compact 变体：徽章 + 评分
  if (variant === 'compact') {
    return (
      <span
        className={`relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${style.border} ${className}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span aria-hidden>{style.icon}</span>
        <span className="font-bold">{score}</span>
        {showLabel && <span>Trust</span>}
        {computedVerified && (
          <span
            aria-label="Verified"
            title="Verified Skill"
            className="ml-0.5 inline-flex items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white"
          >
            ✓
          </span>
        )}
        {showTooltip && (
          <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg">
            Trust Score: {score}/100 (Grade {computedGrade})
          </span>
        )}
      </span>
    );
  }

  // Detailed 变体：完整卡片
  return (
    <div
      className={`inline-flex flex-col items-start gap-1 rounded-lg border ${style.border} ${style.bg} p-3 ${className}`}
      role="status"
      aria-label={`Trust Score: ${score} of 100, Grade ${computedGrade}${computedVerified ? ', Verified' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`flex h-10 w-10 items-center justify-center rounded-full ${style.bg} ${style.text} text-lg font-bold ring-2 ring-white`}
        >
          {computedGrade}
        </span>
        <div>
          <div className={`text-2xl font-bold ${style.text}`}>{score}</div>
          <div className="text-xs text-gray-500">/ 100</div>
        </div>
        {computedVerified && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">
            <span aria-hidden>✓</span>
            Verified
          </span>
        )}
      </div>
      {showLabel && (
        <div className={`text-xs ${style.text}`}>
          Trust Score · Grade {computedGrade}
        </div>
      )}
    </div>
  );
}
