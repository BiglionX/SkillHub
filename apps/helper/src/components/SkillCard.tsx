/**
 * SkillCard — Skill 推荐卡（M4 · t08 + F20）
 *
 * 设计：
 * - 推荐 Skill 列表项 / Explore Tab 用
 * - 含推荐理由（来自 recommended_for / seed-skills.json 的 blurb）
 * - 「安装」按钮调 invoke('install_skill')
 * - 玻璃化：与 Settings 同源风格
 *
 * F20（P0）：当 category === 'C' 且未配 LLM Key 时，点 [安装] 先弹 Dialog
 * 「此 Skill 需要大模型（约 30 秒配好）」，用户点 [现在配] 才跳设置。
 * - category undefined 兜底按 C 类处理（最严防漏）
 * - hasKey === undefined 兜底按未配处理
 * - onNeedKey 可选；不传时 [现在配] 仍能关闭 Dialog 但不会跳转
 *
 * 用法：
 *   <SkillCard
 *     skill={{ slug, name, software, blurb, recommendedReason, category }}
 *     installed={false}
 *     hasKey={hasKey}
 *     onNeedKey={() => { setTab('settings'); }}
 *     onInstall={(slug) => invoke('install_skill', ...)}
 *   />
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Check } from 'lucide-react';

export interface SkillCardProps {
  skill: {
    slug: string;
    name: string;
    /// 适用软件（来自 Web API / seed-skills.json，可能缺失）
    software?: string;
    blurb?: string;
    /// 推荐理由（M4 推荐 API 返回的字段；fallback 走 blurb）
    recommendedReason?: string;
    /// F20：Skill 分类（A 环境依赖型 / B 数据授权型 / C 内容生成型），仅 C 类在未配 Key 时触发拦截
    category?: 'A' | 'B' | 'C';
  };
  installed: boolean;
  /// F20：当前是否已配 LLM Key（来自 App.tsx 的 hasKey state）
  hasKey?: boolean;
  /// F20：用户在 Dialog 中点 [现在配] 时回调，App.tsx 负责跳 Settings Tab + 自动展开 Key 面板
  onNeedKey?: () => void;
  onInstall: (slug: string) => void;
}

export default function SkillCard({
  skill,
  installed,
  hasKey,
  onNeedKey,
  onInstall,
}: SkillCardProps) {
  const reason = skill.recommendedReason ?? skill.blurb ?? '';
  // F20：拦截 Dialog 开关
  const [guardOpen, setGuardOpen] = useState(false);

  // F20：拦截判断（C 类 + 未配 Key 才弹 Dialog）
  const handleInstallClick = () => {
    const isCClass = (skill.category ?? 'C') === 'C';
    const keyMissing = hasKey !== true;
    if (isCClass && keyMissing) {
      setGuardOpen(true);
      return;
    }
    onInstall(skill.slug);
  };

  // F20：Dialog 打开时按 Esc 关闭
  useEffect(() => {
    if (!guardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuardOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guardOpen]);

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
            onClick={handleInstallClick}
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

      {/* F20：C 类未配 Key 时的拦截 Dialog */}
      {guardOpen && (
        <div
          className="glass-modal-backdrop"
          onClick={() => setGuardOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guard-title"
            onClick={(e) => e.stopPropagation()}
            className="glass-modal flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} aria-hidden className="text-warning-inline" />
              <h3 id="guard-title" className="glass-modal-title">
                此 Skill 需要大模型
              </h3>
            </div>
            <p className="text-[12px] text-muted leading-relaxed">
              「{skill.name}」是 C 类内容生成型 Skill，需先配置 LLM Key 即可使用（约 30 秒）。
              <br />
              所有 Key AES 加密存储在本机，不会上传任何服务器。
            </p>
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setGuardOpen(false)}
                className="glow-btn-ghost text-[12px]"
              >
                稍后
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuardOpen(false);
                  onNeedKey?.();
                }}
                className="glow-btn-primary text-[12px]"
              >
                现在配
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}