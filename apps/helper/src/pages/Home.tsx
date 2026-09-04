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
import { Home as HomeIcon } from 'lucide-react';
import NluSearchBox from '../components/NluSearchBox';
import SkillCard, { type SkillCardProps } from '../components/SkillCard';
import type { LlmChatOk } from '../lib/LlmGateway';
import seedSkillsData from '../../resources/seed-skills.json';

interface InstalledSkill {
  slug: string;
  name: string;
  software: string;
}

/// M4：推荐 Skill 与 SkillCard 共用同一形状，避免字段不一致
type RecommendedSkill = SkillCardProps['skill'];

/// v2.0.7+：seed-skills.json 本地兑底用。
/// 与 Settings.tsx 中 SEED_SKILLS 处理逻辑一致（跳过顶层元字段）。
interface SeedCatalogEntry {
  recommended: { slug: string; blurb: string }[];
}
const SEED_SKILLS = seedSkillsData as { [tag: string]: SeedCatalogEntry | unknown };
const SEED_META_KEYS = new Set(['schemaVersion', 'generatedAt', 'baseUrl', 'note']);

/**
 * v2.0.7+：从本地 seed-skills.json 取前 N 条作为兑底推荐。
 * 仅在云端 API 返回 [] 且本机未扫到任何软件时调用。
 * 每条仍是「查看 Web 端 →」跳转，不在助手内渲染 Skill 详情——不破坏 PRD §5.2 红线。
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
        name: r.slug,
        software: tag,
        blurb: r.blurb,
        category: 'A',
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
  /// F20：当前是否已配 LLM Key（从 App.tsx 透传）
  hasKey?: boolean;
  /// F20：用户在 SkillCard Dialog 点 [现在配] 时回调
  onNeedKey?: () => void;
}

export default function Home({ hasKey, onNeedKey }: HomeProps = {}) {
  const [detectedSoftware, setDetectedSoftware] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<RecommendedSkill[]>([]);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<{ ok: LlmChatOk; q: string } | null>(null);
  const [recentSkills, setRecentSkills] = useState<{ key: string; calls: number }[]>([]);
  /// v2.0.7+：推荐列表来源标记。true=本地 seed-skills.json 兑底，false=云端 API。
  /// 渲染时据此切换标题文案。
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        // 已装软件 + 已装 Skill
        const sw = await invoke<{ software_tag: string }[]>('scan_installed_software').catch(() => []);
        setDetectedSoftware(sw.map((s) => s.software_tag));
        const installed = await invoke<InstalledSkill[]>('get_installed_skills').catch(() => []);
        setInstalledSlugs(new Set(installed.map((s) => s.slug)));
        // 推荐 Skill（云端优先；本地兑底仅在云端返回 [] 且本机未扫到任何软件时启用）
        const skills = await invoke<{ slug: string; name: string; software?: string; blurb?: string; category?: 'A' | 'B' | 'C' }[]>(
          'get_recommended_for_local_software',
          {
            installed: sw.map((s) => s.software_tag),
            limit: 12,
          },
        ).catch(() => [] as { slug: string; name: string; software?: string; blurb?: string; category?: 'A' | 'B' | 'C' }[]);
        const recommendedFromApi: RecommendedSkill[] = skills.map((s) => ({
          slug: s.slug,
          name: s.name,
          software: s.software ?? '',
          blurb: s.blurb,
          category: s.category,
        }));
        // v2.0.7+：云端空 + 本机没扫到软件 → 用本地 seed-skills.json 兑底
        // （scanner-rules.yml 里 21 个 software_tag 用户都没装的情况下）。
        let finalRecommended = recommendedFromApi;
        let fallback = false;
        if (recommendedFromApi.length === 0) {
          finalRecommended = pickLocalFallbackSkills(6);
          fallback = true;
        }
        setRecommended(finalRecommended);
        setUsingFallback(fallback);
        // 最近 3 条用量
        const sum = await invoke<UsageSummary>('get_local_usage_summary', { range: '7d' }).catch(() => null);
        if (sum) {
          setRecentSkills(sum.by_skill.slice(0, 3));
        }
      } catch {
        /* 启动期 invoke 失败不致命 */
      }
    })();
  }, []);

  return (
    <div className="glass-canvas px-6 py-6 glass-scroll">
      <div className="mx-auto max-w-3xl flex flex-col gap-5">
        <header className="flex items-center gap-3">
          <HomeIcon size={20} aria-hidden className="text-cyan-300" />
          <h1 className="text-xl font-bold gradient-text-h">首页</h1>
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

        {recommended.length > 0 && (
          <section>
            <div className="text-[13px] font-semibold text-primary mb-1">
              {usingFallback ? '热门 Skill 推荐' : '推荐 Skill（基于本机已装软件）'}
            </div>
            {/* v2.0.7+：兑底时说明一句本地未装什么。避免用户误以为“扫描出错”。 */}
            {usingFallback ? (
              <div className="text-[11px] text-muted mb-3 leading-relaxed">
                本机未检测到扫描规则中的常用软件，先看几个热门 Skill。
                装好 Photoshop / VSCode / Blender 后这里会自动按你装的软件推荐。
              </div>
            ) : (
              <div className="mb-3" />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recommended.slice(0, 6).map((s) => (
                <SkillCard
                  key={s.slug}
                  skill={s}
                  installed={installedSlugs.has(s.slug)}
                  hasKey={hasKey}
                  onNeedKey={onNeedKey}
                  onInstall={() => invoke('install_skill', { slug: s.slug, skill: s }).catch(() => {})}
                />
              ))}
            </div>
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
