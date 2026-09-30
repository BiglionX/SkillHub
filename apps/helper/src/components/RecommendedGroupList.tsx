/**
 * RecommendedGroupList — Home Tab 推荐 Skill 的按软件分组 + 折叠列表
 *
 * 设计思路(来自用户 ASCII 线框图):
 *
 *   ┌──────────────────────────────────────────┐
 *   │ Photoshop            推荐 3   已装 1  [↓]│  ← 分组胶囊(可点击折叠)
 *   ├──────────────────────────────────────────┤
 *   │ 批量改尺寸          ps-batch-resize [安装]│  ← 每个 Skill 一行
 *   │ 一键批量改尺寸 + 导出                     │
 *   │ ★★★★☆  123,344 次安装                   │
 *   ├──────────────────────────────────────────┤
 *   │ 人像磨皮            ps-skin-smooth  [安装]│
 *   └──────────────────────────────────────────┘
 *
 * 为什么不用 SkillCard 网格:
 * - SkillCard 是「单个 Skill 的详细卡片」,grid 布局把所有 Skill 平铺成一坨,
 *   非技术用户看不出它们之间按软件分组的关联。
 * - 分组折叠后,顶部展开自己关心的软件,其余折叠,信息密度更高。
 *
 * 折叠动画(2026-09 v2.0.7+):
 * - 用 max-height + opacity 过渡(250ms ease),内容从「header 下方」向下展开 / 向上收起,
 *   而 header 始终保持锚定在顶部,用户感知是「下方收缩」。
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Check, Star } from 'lucide-react';

export interface RecommendedSkillLite {
  slug: string;
  name: string;
  /// 软件 tag 列表(从 Web API 拿,可能多个,取第一个作为分组依据)
  tags?: string[];
  /// 兜底:seed-skills.json 走的本地 software tag
  software?: string;
  /// 一句话功能描述
  blurb?: string;
  /// 详细描述(Web API 才有)
  description?: string;
  /// 安装量(Web API `downloadCount`)
  installCount?: number;
  /// 评分 0-5(Web API `rating`)
  rating?: number;
  /// 评论数(Web API `reviewCount`)
  reviewCount?: number;
  /// Skill 分类(A 环境依赖型 / B 数据授权型 / C 内容生成型)
  category?: 'A' | 'B' | 'C';
}

/// 软件 tag → 友好显示名(非技术用户视角)
/// 与 seed-skills.json 顶层 key 对应
const SOFTWARE_FRIENDLY: Record<string, string> = {
  photoshop: 'Photoshop',
  ps: 'Photoshop',
  vscode: 'VS Code',
  blender: 'Blender',
  excel: 'Excel',
  word: 'Word',
  powerpoint: 'PowerPoint',
  figma: 'Figma',
  premiere: 'Premiere Pro',
  after_effects: 'After Effects',
  davinci: 'DaVinci Resolve',
  obs: 'OBS Studio',
  unity: 'Unity',
  unreal: 'Unreal Engine',
  godot: 'Godot',
  maya: 'Maya',
  c4d: 'Cinema 4D',
  ae: 'After Effects',
  zbrush: 'ZBrush',
  substance: 'Substance Painter',
  protools: 'Pro Tools',
  logic: 'Logic Pro',
  ableton: 'Ableton Live',
};

/// slug → 友好名兜底。Web API 会返回 `name` 字段,优先用那个;本地 seed-skills 走这个映射。
const SLUG_FRIENDLY: Record<string, string> = {
  // Photoshop
  'ps-batch-resize': '批量改尺寸',
  'ps-skin-smooth': '人像磨皮',
  'ps-color-grading-presets': '调色预设',
  // VS Code
  'vscode-error-translator': '报错翻译',
  'vscode-git-graph-explainer': 'Git 历史图形化',
  'vscode-snippet-library': '代码片段库',
  // Blender
  'blender-render-farm-helper': '渲染调度',
  'blender-material-presets': '材质预设',
  // Excel
  'excel-vlookup-wizard': '公式生成',
  'excel-pivot-suggest': '透视表建议',
  'excel-chart-from-table': '一句话生成图表',
};

/**
 * slug 转友好名。优先查映射表;否则把首段(软件 tag)去掉,
 * 剩下用空格连接做粗略兜底,保证一定显示人话。
 */
function friendlySlugFallback(slug: string): string {
  if (SLUG_FRIENDLY[slug]) return SLUG_FRIENDLY[slug];
  const parts = slug.split('-');
  if (parts.length <= 1) return slug;
  return parts.slice(1).join(' ');
}

/**
 * 取 skill 的「主显示名」。
 * 优先顺序:Web API 返回的 `name`(可能是友好中文名) > slug 映射兜底 > slug 原样。
 */
function displayName(skill: RecommendedSkillLite): string {
  if (skill.name && skill.name !== skill.slug) return skill.name;
  return friendlySlugFallback(skill.slug);
}

/**
 * 取 skill 所属软件 tag(用于分组)。
 * 优先 tags[0](Web API),fallback 到 software(seed-skills 本地),再 fallback '其他'。
 */
function softwareOf(skill: RecommendedSkillLite): string {
  if (skill.tags && skill.tags.length > 0) return skill.tags[0];
  if (skill.software) return skill.software;
  return '其他';
}

/**
 * 把 installCount 数字格式化成易读中文格式:1234 → 1,234;12345 → 1.2 万。
 */
function formatInstallCount(n: number): string {
  if (n >= 10000) {
    const wan = (n / 10000).toFixed(n >= 100000 ? 0 : 1);
    return `${wan} 万`;
  }
  return n.toLocaleString();
}

/**
 * 评分 0-5 → 5 个 ★/☆。
 */
function RatingStars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  const full = Math.round(v);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={10}
          aria-hidden
          fill={i < full ? 'currentColor' : 'none'}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

export interface RecommendedGroupListProps {
  /// 推荐 Skill 列表(已包含 software/tags 字段)
  skills: RecommendedSkillLite[];
  /// 已装 slug 集合(用于显示「已装」状态)
  installed: Set<string>;
  /// 安装回调
  onInstall?: (slug: string) => void;
}

export default function RecommendedGroupList({
  skills,
  installed,
  onInstall,
}: RecommendedGroupListProps) {
  /// 按 software 分组,保持原顺序
  const grouped = useMemo(() => {
    const map = new Map<string, RecommendedSkillLite[]>();
    for (const s of skills) {
      const tag = softwareOf(s);
      const list = map.get(tag);
      if (list) list.push(s);
      else map.set(tag, [s]);
    }
    return Array.from(map.entries());
  }, [skills]);

  if (grouped.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {grouped.map(([tag, items]) => (
        <SkillGroup
          key={tag}
          software={tag}
          skills={items}
          installed={installed}
          onInstall={onInstall}
        />
      ))}
    </div>
  );
}

interface SkillGroupProps {
  software: string;
  skills: RecommendedSkillLite[];
  installed: Set<string>;
  onInstall?: (slug: string) => void;
}

function SkillGroup({ software, skills, installed, onInstall }: SkillGroupProps) {
  // v2.0.7+：默认折叠。首页默认全部收起，用户点 header 才展开特定软件。
  // 避免一打开就被 30+ 个 Skill 压顶。
  const [expanded, setExpanded] = useState(false);
  const friendly = SOFTWARE_FRIENDLY[software] || software;
  const installedCount = skills.filter((s) => installed.has(s.slug)).length;

  return (
    <div className="glass-card-soft" style={{ overflow: 'hidden', padding: 0 }}>
      {/* 分组胶囊(可点击折叠) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <span style={{ color: 'var(--g-text-primary)' }}>{friendly}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--g-text-muted)',
          }}
        >
          <span>
            推荐 {skills.length} · 已装 {installedCount}
          </span>
          {expanded ? (
            <ChevronDown size={16} aria-hidden />
          ) : (
            <ChevronRight size={16} aria-hidden />
          )}
        </span>
      </button>

      {/* Skill 列表 — 用 max-height + opacity 过渡实现「下方收缩」效果。
         top 锚定(贴在 header 下方),高度从 N 缩到 0 时,内容向上靠拢,
         视觉上 header 不动,内容向「下方塌陷」。 */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: expanded ? '2400px' : '0',
          opacity: expanded ? 1 : 0,
          transition: 'max-height 250ms ease, opacity 200ms ease',
        }}
      >
        {skills.map((s, idx) => (
          <SkillRow
            key={s.slug}
            skill={s}
            isInstalled={installed.has(s.slug)}
            onInstall={onInstall}
            isLast={idx === skills.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

interface SkillRowProps {
  skill: RecommendedSkillLite;
  isInstalled: boolean;
  onInstall?: (slug: string) => void;
  isLast: boolean;
}

function SkillRow({ skill, isInstalled, onInstall }: SkillRowProps) {
  const name = displayName(skill);
  const blurb = skill.blurb || skill.description || '暂未提供说明';
  const hasRating = typeof skill.rating === 'number' && skill.rating > 0;
  const hasInstall = typeof skill.installCount === 'number' && skill.installCount > 0;
  const hasDescription = skill.description && skill.description !== skill.blurb;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderTop: '1px solid var(--g-border)',
      }}
    >
      {/* 左:信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--g-text-primary)',
            }}
          >
            {name}
          </span>
          <code
            style={{
              fontSize: 10,
              color: 'var(--g-text-faint)',
              fontFamily: 'Menlo, Consolas, monospace',
            }}
          >
            {skill.slug}
          </code>
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--g-text-secondary)',
            lineHeight: 1.5,
            marginBottom: 4,
          }}
        >
          {blurb}
        </div>
        {/* 元数据条:热度 + 安装量 + 简短简介(若不同于 blurb) */}
        {(hasRating || hasInstall || hasDescription) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 11,
              color: 'var(--g-text-muted)',
              marginTop: 4,
              flexWrap: 'wrap',
            }}
          >
            {hasRating && skill.rating !== undefined && (() => {
              const r: number = skill.rating;
              return (
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  title={`${r.toFixed(1)} / 5`}
                >
                  <RatingStars value={r} />
                  <span>{r.toFixed(1)}</span>
                </span>
              );
            })()}
            {hasInstall && skill.installCount !== undefined && (() => {
              const n: number = skill.installCount;
              return <span>安装 {formatInstallCount(n)} 次</span>;
            })()}
            {skill.reviewCount !== undefined && skill.reviewCount > 0 && (
              <span>{skill.reviewCount} 条评论</span>
            )}
          </div>
        )}
        {hasDescription && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--g-text-faint)',
              lineHeight: 1.5,
              marginTop: 6,
              fontStyle: 'italic',
            }}
          >
            {skill.description}
          </div>
        )}
      </div>

      {/* 右:安装按钮 */}
      {isInstalled ? (
        <span
          className="glass-pill glass-pill-success"
          style={{ fontSize: 11, flexShrink: 0, alignSelf: 'center' }}
        >
          <Check size={11} aria-hidden />
          已装
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onInstall?.(skill.slug)}
          className="glow-btn-primary"
          style={{
            fontSize: 11,
            padding: '6px 14px',
            flexShrink: 0,
            alignSelf: 'center',
          }}
        >
          <Download size={11} aria-hidden />
          安装
        </button>
      )}
    </div>
  );
}
