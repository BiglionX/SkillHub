/**
 * SkillCard — Skill 推荐卡（M4 · t08）
 *
 * 设计：
 * - 推荐 Skill 列表项 / Explore Tab 用
 * - 含推荐理由（来自 recommended_for / seed-skills.json 的 blurb）
 * - 「安装」按钮调 invoke('install_skill')
 * - 玻璃化：与 Settings 同源风格
 *
 * 用法：
 *   <SkillCard
 *     skill={{ slug, name, software, blurb, recommendedReason }}
 *     installed={false}
 *     onInstall={(slug) => invoke('install_skill', ...)}
 *   />
 */

import { Download, Check } from 'lucide-react';

export interface SkillCardProps {
  skill: {
    slug: string;
    name: string;
    /// 适用软件（来自 Web API / seed-skills.json，可能缺失）
    software?: string;
    blurb?: string;
    /// 推荐理由（M4 推荐 API 返回的字段；fallback 走 blurb）
    recommendedReason?: string;
  };
  installed: boolean;
  onInstall: (slug: string) => void;
}

export default function SkillCard({ skill, installed, onInstall }: SkillCardProps) {
  const reason = skill.recommendedReason ?? skill.blurb ?? '';
  return (
    <div className="glass-card-soft p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-primary">{skill.name}</div>
          <code className="text-[11px] font-mono text-muted">{skill.slug}</code>
        </div>
        {installed ? (
          <span className="glass-pill glass-pill-success text-[11px]">
            <Check size={11} aria-hidden />
            已装
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onInstall(skill.slug)}
            className="glow-btn-primary text-[11px]"
          >
            <Download size={11} aria-hidden />
            安装
          </button>
        )}
      </div>
      <div className="text-[12px] text-secondary leading-relaxed">{reason}</div>
      <div className="text-[11px] text-muted">
        适用软件：<code className="font-mono">{skill.software ?? '通用'}</code>
      </div>
    </div>
  );
}
