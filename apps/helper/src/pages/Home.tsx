/**
 * Home Tab — NLU 主页（M4 · t07）
 *
 * 设计：
 * - 顶部：NluSearchBox 大对话框
 * - 中部：推荐 Skill 横滑卡（来自 get_recommended_for_local_software）
 * - 底部：最近 3 条用量记录（来自 get_local_usage_summary）
 * - LLM 调通后结果显示在对话框下方
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import NluSearchBox from '../components/NluSearchBox';
import RecommendedGroupList from '../components/RecommendedGroupList';
import type { LlmChatOk } from '../lib/LlmGateway';
import seedSkillsData from '../../resources/seed-skills.json';

interface InstalledSkill {
  slug: string;
  name: string;
  software: string;
}

/// M4：推荐 Skill 走 RecommendedGroupList（按软件分组 + 可折叠列表）。
/// v2.0.7+：扩展字段安装量 / 评分 / 评论数 / 描述，以便在卡片里以「热度」+「安装量」展示。
type RecommendedSkill = {
  slug: string;
  name: string;
  software: string;
  tags?: string[];
  blurb?: string;
  description?: string;
  category?: 'A' | 'B' | 'C';
  installCount?: number;
  rating?: number;
  reviewCount?: number;
};

/// v2.0.7+：seed-skills.json 本地兑底用。
/// v2 schema：每个 skill 现在带 name / installCount / rating / reviewCount / description / tags，
/// 与 Web API 返回字段对齐。本地兑底也能完整展示星级 / 安装量。
interface SeedCatalogEntry {
  recommended: SeedSkill[];
}
interface SeedSkill {
  slug: string;
  name?: string;
  blurb?: string;
  description?: string;
  installCount?: number;
  rating?: number;
  reviewCount?: number;
  tags?: string[];
}
const SEED_SKILLS = seedSkillsData as { [tag: string]: SeedCatalogEntry | unknown };
const SEED_META_KEYS = new Set(['schemaVersion', 'generatedAt', 'baseUrl', 'note']);

/**
 * v2.0.7+：从本地 seed-skills.json 取推荐 Skill。
 * 返回所有条目（由调用者按 limit 拆分），保持元数据完整传递。
 * 云端返回 [] 时作为兑底；云端有数据时作为补充填充。
 */
function pickLocalFallbackSkills(limit: number): RecommendedSkill[] {
  const out: RecommendedSkill[] = [];
  for (const [tag, val] of Object.entries(SEED_SKILLS)) {
    if (SEED_META_KEYS.has(tag)) continue;
    const entry = val as SeedCatalogEntry;
    if (!entry?.recommended) continue;
    for (const r of entry.recommended) {
      out.push({
        slug: r.slug,
        name: r.name ?? r.slug,
        software: tag,
        tags: r.tags ?? [tag],
        blurb: r.blurb,
        description: r.description,
        category: 'A',
        installCount: r.installCount,
        rating: r.rating,
        reviewCount: r.reviewCount,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

interface UsageSummary {
  by_skill: { key: string; calls: number; tokens_in: number; tokens_out: number; cost: number }[];
}

const DEFAULT_SYSTEM_PROMPT =
  '你是 SkillHub 意图解析器。读取用户输入后，输出 JSON：' +
  '{ "software_tags": [...], "intent_tags": [...], "skill_category": "A"|"B"|"C", "confidence": 0..1 }';

export interface HomeProps {
  /// v2.0.7+：从 App.tsx 透传的助手版本号（用于 header 显示「v2.0.7」）。
  version: string;
  /// F20：当前是否已配 LLM Key（从 App.tsx 透传）
  hasKey?: boolean;
  /// F20：用户在 SkillCard Dialog 点 [现在配] 时回调
  onNeedKey?: () => void;
}

export default function Home({ version, hasKey: _hasKey, onNeedKey: _onNeedKey }: HomeProps = { version: '2.0.7' }) {
  const [detectedSoftware, setDetectedSoftware] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<RecommendedSkill[]>([]);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<{ ok: LlmChatOk; q: string } | null>(null);
  const [recentSkills, setRecentSkills] = useState<{ key: string; calls: number }[]>([]);
  /// v2.0.7+：推荐列表来源状态机（三态，不再二态）。
  /// - 'success'：扫描成功 + 服务器返回了本机软件对应的推荐（不一定有数据）
  /// - 'empty'   ：扫描成功但本机没装扫描规则中的任何软件
  /// - 'failed'  ：扫描失败 / 服务器拉取失败 → 走本地冷启动 seed-skills.json
  const [recommendState, setRecommendState] = useState<
    'success' | 'empty' | 'failed'
  >('failed');

  useEffect(() => {
    void (async () => {
      // v2.0.7+：扫描本机软件分三档：成功+有软件 / 成功+本机没装 / 扫描失败。
      // 前面用 .catch(() => []) 会把“失败”和“空”合并为同一档——本次重构明确区分，
      // UI 能针对不同情况展示不同文案。
      let scanOk = false;
      let sw: { software_tag: string }[] = [];
      try {
        sw = await invoke<{ software_tag: string }[]>('scan_installed_software');
        scanOk = true;
      } catch {
        scanOk = false;
        sw = [];
      }
      setDetectedSoftware(sw.map((s) => s.software_tag));
      // 已装 Skill（用 .catch 兑底：仅在 Tab 启动期获取本机状态）
      const installed = await invoke<InstalledSkill[]>('get_installed_skills').catch(() => []);
      setInstalledSlugs(new Set(installed.map((s) => s.slug)));

      // v2.0.7+：推荐 Skill 三路状态机。
      // 1. scan 成功 + sw 非空 → 调 get_recommended_for_local_software 拉对应软件推荐
      // 2. scan 成功 + sw 为空 → 不调 API（Rust 端会短路返回空）；空状态交 UI 引导
      // 3. scan 失败 → 走本地 seed-skills.json 冷启动
      // 4. scan 成功 + API 调取失败 → 走本地冷启动 + state=failed
      let finalRecommended: RecommendedSkill[] = [];
      let state: 'success' | 'empty' | 'failed' = 'failed';
      if (scanOk && sw.length > 0) {
        try {
          const skills = await invoke<
            Array<{
              slug: string;
              name: string;
              software?: string;
              tags?: string[];
              blurb?: string;
              description?: string;
              category?: 'A' | 'B' | 'C';
              installCount?: number;
              rating?: number;
              reviewCount?: number;
            }>
          >('get_recommended_for_local_software', {
            installed: sw.map((s) => s.software_tag),
            limit: 24,
          });
          finalRecommended = skills.map((s) => ({
            slug: s.slug,
            name: s.name,
            software: s.software ?? s.tags?.[0] ?? '',
            tags: s.tags,
            blurb: s.blurb,
            description: s.description,
            category: s.category,
            installCount: s.installCount,
            rating: s.rating,
            reviewCount: s.reviewCount,
          }));
          // scan 成功 + 调了 API 拿到结果（可能为空）都算 success。
          // “本机装了软件但服务器没返回”也算 success，只是列表为空。
          state = 'success';
        } catch {
          // 服务器拉取失败 → 走本地冷启动（提示文案说“兑底”）
          finalRecommended = pickLocalFallbackSkills(100);
          state = 'failed';
        }
      } else if (scanOk && sw.length === 0) {
        // scan 成功但本机未装扫描规则中的任何软件
        finalRecommended = [];
        state = 'empty';
      } else {
        // scan 失败
        finalRecommended = pickLocalFallbackSkills(100);
        state = 'failed';
      }
      setRecommended(finalRecommended);
      setRecommendState(state);
      // 最近 3 条用量
      const sum = await invoke<UsageSummary>('get_local_usage_summary', { range: '7d' }).catch(() => null);
      if (sum) {
        setRecentSkills(sum.by_skill.slice(0, 3));
      }
    })();
  }, []);

  return (
    <div className="glass-canvas px-6 py-6 glass-scroll">
      {/* v2.0.7+：主区上下间距统一为 24px，section 内部独立控制间距。
          使用 inline style 享底，避免依赖桌面端不生效的 Tailwind utility（gap-6 / max-w-3xl 等）。
          之前 gap-6 / max-w-3xl 在 styles.css 中未定义，导致卡片之间完全没有间距。 */}
      <div style={{ maxWidth: 768, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* v2.0.7+：首页顶部标题「SkillHub」大号渐变 + 版本号小字贴在右侧底部对齐。
            .home-title-version 单独控制版本号样式（font-size 13px + align-self flex-end），
            避免依赖 desktop 端不生效的 Tailwind 任意值类（text-[13px] / items-end 等）。
            v2.0.7+：header 改为 sticky，钉在 main 顶部 drag bar 下方（top: 32px），
            这样拖动窗口时仍能拖；滚动时不动、始终看到品牌。 */}
        <header className="home-title-bar">
          <h1
            className="text-2xl font-bold gradient-text-h"
            style={{ margin: 0, lineHeight: 1 }}
          >
            SkillHub
          </h1>
          <span
            style={{
              fontSize: 13,
              fontFamily: '"Menlo", "Consolas", monospace',
              color: 'var(--g-text-muted)',
              lineHeight: 1,
              flexShrink: 0,
              whiteSpace: 'nowrap',
              transform: 'translateY(2px)',
            }}
          >
            v{version}
          </span>
        </header>

        <NluSearchBox
          detectedSoftware={detectedSoftware}
          skills={recommended}
          systemPrompt={DEFAULT_SYSTEM_PROMPT}
          onResult={(ok, q) => setLastResult({ ok, q })}
        />

        {lastResult && (
          <div className="glass-card-soft p-4">
            <div className="text-[11px] text-muted mb-2">最近一次解析</div>
            <div className="text-[13px] text-primary mb-2">
              <strong>问：</strong>
              {lastResult.q}
            </div>
            <pre className="text-[11px] font-mono text-secondary whitespace-pre-wrap break-all bg-black/30 rounded p-2">
              {JSON.stringify(lastResult.ok.parsed ?? lastResult.ok.content ?? {}, null, 2)}
            </pre>
            <div className="text-[10px] text-muted mt-2">
              {lastResult.ok.tokensIn ?? '?'} / {lastResult.ok.tokensOut ?? '?'} token ·{' '}
              {lastResult.ok.durationMs ?? '?'}ms
            </div>
          </div>
        )}

        {/* v2.0.7+：推荐 Skill 按三路状态机渲染。
            - 'success'：根据本机已装软件拉取的推荐（扫了装了），“推荐 Skill（基于本机已装软件）”
            - 'empty'   ：扫了但本机未装扫描规则中的任何软件；空状态 + 引导装 Photoshop / VSCode / Blender
            - 'failed'  ：扫描失败 / 服务器拉取失败；兑底到本地 seed-skills.json。
              标题改为“热门 Skill 推荐（冷启动兑底）”，不再误传“本机未检测到”。 */}
        {recommendState === 'empty' ? (
          <section>
            <div className="text-[13px] font-semibold text-primary mb-3">
              暂未检测到扫描规则中的常用软件
            </div>
            <div className="text-[11px] text-muted leading-relaxed">
              本机已扫描，但未发现 Photoshop / VSCode / Blender 等支持 Skill 的软件。
              装好其中任意一个后，这里会自动按你装的软件推荐对应的 Skills。
            </div>
          </section>
        ) : (
          <section>
            <div className="text-[13px] font-semibold text-primary mb-3">
              {recommendState === 'failed'
                ? '热门 Skill 推荐（冷启动兑底）'
                : '推荐 Skill（基于本机已装软件）'}
            </div>
            {recommendState === 'failed' && (
              <div className="text-[11px] text-muted mb-3 leading-relaxed">
                本机扫描或服务器拉取失败，先看几个本地预置的热门 Skills。可在「设置」页重试扫描。
              </div>
            )}
            {recommendState === 'success' && recommended.length === 0 && (
              <div className="text-[11px] text-muted mb-3 leading-relaxed">
                本机已装 {detectedSoftware.length} 个软件（{detectedSoftware.slice(0, 3).join(' / ')}
                {detectedSoftware.length > 3 ? ' 等' : ''}），但服务器暂未返回对应推荐 Skills。
              </div>
            )}
            {recommended.length > 0 && (
              <RecommendedGroupList
                skills={recommended.slice(0, 24)}
                installed={installedSlugs}
                onInstall={(slug) =>
                  invoke('install_skill', { slug, skill: recommended.find((r) => r.slug === slug) }).catch(
                    () => {},
                  )
                }
              />
            )}
          </section>
        )}

        {recentSkills.length > 0 && (
          <section>
            <div className="text-[13px] font-semibold text-primary mb-3">最近调用</div>
            <div className="glass-card-soft p-3 flex flex-col gap-1.5">
              {recentSkills.map((r) => (
                <div key={r.key} className="text-[12px] text-secondary flex justify-between">
                  <code className="font-mono">{r.key}</code>
                  <span className="text-muted">{r.calls} 次</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
