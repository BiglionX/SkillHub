/**
 * TabSkeleton — M6 加载骨架屏（React.lazy + Suspense 配套）
 *
 * 设计：每个 Tab 在 Suspense 边界里展示一份与真实 UI 形状一致的骨架屏，避免
 * 「白屏闪一下 → 真实内容」的视觉割裂。所有骨架都走 helper-glass.css 的
 * .glass-skeleton* 系列（cyan shimmer 扫光 + 深色玻璃色），与玻璃化主题统一。
 *
 * 5 套独立骨架（按 Tab 维度划分，匹配各页真实结构）：
 * - HomeSkeleton：大对话框（NLU 输入）+ 推荐分组列表
 * - ExploreSkeleton：搜索栏 + Skill 卡片网格（3 列）
 * - MySkillsSkeleton：已装 Skill 卡片列表
 * - UsageSkeleton：4 个指标卡 + 2 张图表占位
 * - SettingsSkeleton：4 个 Section 卡（LLM Key / 本机软件 / 已装 Skills / 诊断）
 *
 * 不用真实字号/边距字面量，避免与 Tab page 的实现细节脱钩；只用宽高比与
 * 组件形状（卡片、胶囊、圆形）。
 */

import type { CSSProperties } from 'react';

export type TabSkeletonKind = 'home' | 'explore' | 'my' | 'usage' | 'settings';

interface TabSkeletonProps {
  kind: TabSkeletonKind;
}

/** 单个 shimmer 块封装（避免每个地方写 className 双词）。 */
function Sk({ style, className = '' }: { style?: CSSProperties; className?: string }) {
  return <div className={`glass-skeleton ${className}`} style={style} aria-hidden />;
}

/** Home：大对话框（NLU 输入框 + 按钮）+ 分组列表 */
export function HomeSkeleton() {
  return (
    <div className="glass-canvas px-6 py-6 glass-scroll" aria-busy="true" aria-label="加载首页">
      <div style={{ maxWidth: 768, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* 标题区 */}
        <header className="home-title-bar" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <Sk style={{ width: 120, height: 28, borderRadius: 8 }} />
          <Sk style={{ width: 60, height: 12 }} />
        </header>
        {/* NLU 输入框卡片 */}
        <div className="glass-card p-5">
          <div className="glass-top-bar" />
          <Sk style={{ width: '100%', height: 36, marginBottom: 12 }} />
          <Sk style={{ width: '100%', height: 96, marginBottom: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Sk style={{ width: 96, height: 32, borderRadius: 8 }} />
          </div>
        </div>
        {/* 推荐分组 */}
        <section>
          <Sk style={{ width: 200, height: 14, marginBottom: 12 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Sk className="glass-skeleton-card" style={{ height: 56 }} />
            <Sk className="glass-skeleton-card" style={{ height: 56 }} />
            <Sk className="glass-skeleton-card" style={{ height: 56 }} />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Explore：搜索栏 + 卡片网格（3 列 × 2 行 = 6 张） */
export function ExploreSkeleton() {
  return (
    <div className="glass-canvas px-6 py-6 glass-scroll" aria-busy="true" aria-label="加载探索">
      <div className="mx-auto max-w-4xl flex flex-col gap-5">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Sk style={{ width: 24, height: 24, borderRadius: 6 }} />
          <Sk style={{ width: 80, height: 22 }} />
        </header>
        {/* 搜索栏 */}
        <div className="glass-card-soft p-3" style={{ display: 'flex', gap: 8 }}>
          <Sk style={{ width: '100%', height: 28 }} />
          <Sk style={{ width: 100, height: 28 }} />
        </div>
        {/* 3 列网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Sk key={i} className="glass-skeleton-card" style={{ height: 140 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** MySkills：已装 Skill 卡片（2 列 × 2 行 = 4 张） */
export function MySkillsSkeleton() {
  return (
    <div className="glass-canvas px-6 py-6 glass-scroll" aria-busy="true" aria-label="加载我的 Skills">
      <div className="mx-auto max-w-4xl flex flex-col gap-5">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Sk style={{ width: 24, height: 24, borderRadius: 6 }} />
          <Sk style={{ width: 120, height: 22 }} />
          <Sk className="glass-skeleton-pill" style={{ width: 36 }} />
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Sk key={i} className="glass-skeleton-card" style={{ height: 160 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Usage：4 个指标卡 + 2 张图表 */
export function UsageSkeleton() {
  return (
    <div className="glass-canvas px-6 py-6 glass-scroll" aria-busy="true" aria-label="加载用量">
      <div className="mx-auto max-w-4xl flex flex-col gap-5">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Sk style={{ width: 24, height: 24, borderRadius: 6 }} />
            <Sk style={{ width: 80, height: 22 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Sk className="glass-skeleton-pill" style={{ width: 56 }} />
            <Sk className="glass-skeleton-pill" style={{ width: 56 }} />
            <Sk className="glass-skeleton-pill" style={{ width: 56 }} />
          </div>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Sk key={i} className="glass-skeleton-card" style={{ height: 84 }} />
          ))}
        </div>
        <Sk className="glass-skeleton-card" style={{ height: 220 }} />
        <Sk className="glass-skeleton-card" style={{ height: 220 }} />
      </div>
    </div>
  );
}

/** Settings：4 个 Section 卡（LLM Key / 本机软件 / 已装 Skills / 诊断） */
export function SettingsSkeleton() {
  return (
    <div className="glass-canvas px-6 py-6 glass-scroll" aria-busy="true" aria-label="加载设置">
      <div className="mx-auto max-w-xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Sk key={i} className="glass-skeleton-card" style={{ height: 100 + i * 10 }} />
        ))}
      </div>
    </div>
  );
}

/** 统一入口：kind → 对应骨架。Suspense fallback 调用此组件即可。 */
export function TabSkeleton({ kind }: TabSkeletonProps) {
  switch (kind) {
    case 'home':
      return <HomeSkeleton />;
    case 'explore':
      return <ExploreSkeleton />;
    case 'my':
      return <MySkillsSkeleton />;
    case 'usage':
      return <UsageSkeleton />;
    case 'settings':
      return <SettingsSkeleton />;
  }
}