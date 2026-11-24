/**
 * Explore Tab — 探索 Skill 列表（M4 · t08）
 *
 * 设计：
 * - 软件过滤下拉（从 scan_installed_software 拿）
 * - 关键词搜索（前端过滤，避免每字符 fetch）
 * - Skill 网格（SkillCard）
 * - 安装按钮触发 invoke('install_skill')
 */

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Compass, Search as SearchIcon } from 'lucide-react';
import SkillCard from '../components/SkillCard';

interface CatalogSkill {
  slug: string;
  name: string;
  software: string;
  blurb?: string;
  category?: 'A' | 'B' | 'C';
}

/// 与 App.tsx / Home / MySkills 保持一致的后端契约类型。
interface InstalledSkill {
  slug: string;
  name: string;
  software: string;
  installed_at_ms: number;
}

export interface ExploreProps {
  /// F20：当前是否已配 LLM Key（从 App.tsx 透传）
  hasKey?: boolean;
  /// F20：用户在 SkillCard Dialog 点 [现在配] 时回调
  onNeedKey?: () => void;
  /// 已装技能（App 顶层拉取，安装完成自动刷新）
  installedSkills?: InstalledSkill[];
}

export default function Explore({ hasKey, onNeedKey, installedSkills = [] }: ExploreProps = {}) {
  const [softwareFilter, setSoftwareFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [catalog, setCatalog] = useState<CatalogSkill[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // M6：启动加载态。catalog 数组 + err 都为空时显示骨架网格（避免「白屏 → 真数据」割裂）。
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        // 已装列表由 App 注入（installedSkills），本页不再 invoke 不存在的命令。
        const sw = await invoke<{ software_tag: string }[]>('scan_installed_software').catch(() => []);
        const tags = sw.map((s) => s.software_tag);
        // 用云端推荐 API（已过滤 installed 列表）
        const skills = await invoke<{ slug: string; name: string; software?: string; blurb?: string; category?: string }[]>(
          'get_recommended_for_local_software',
          { installed: tags, limit: 60 },
        ).catch(() => []);
        setCatalog(
          skills.map((s) => ({
            slug: s.slug,
            name: s.name,
            software: s.software ?? '通用',
            blurb: s.blurb,
            category: s.category as 'A' | 'B' | 'C' | undefined,
          })),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /// 已装 slug 集合由 App 注入的 props 派生；安装成功后 App 重拉 → 即时反映到卡片。
  const installed = useMemo(
    () => new Set(installedSkills.map((s) => s.slug)),
    [installedSkills],
  );

  const softwareTags = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((s) => set.add(s.software));
    return Array.from(set).sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    return catalog.filter((s) => {
      if (softwareFilter !== 'all' && s.software !== softwareFilter) return false;
      if (keyword.trim()) {
        const k = keyword.toLowerCase();
        return (
          s.name.toLowerCase().includes(k) ||
          s.slug.toLowerCase().includes(k) ||
          (s.blurb ?? '').toLowerCase().includes(k)
        );
      }
      return true;
    });
  }, [catalog, softwareFilter, keyword]);

  return (
    <div className="glass-canvas px-6 py-6 glass-scroll">
      <div className="mx-auto max-w-4xl flex flex-col gap-5">
        <header className="flex items-center gap-3">
          <Compass size={20} aria-hidden className="text-cyan-300" />
          <h1 className="text-xl font-bold gradient-text-h">探索</h1>
        </header>

        <div className="glass-card-soft p-3 flex flex-wrap items-center gap-2">
          <SearchIcon size={14} aria-hidden className="text-muted" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索 Skill"
            aria-label="搜索 Skill"
            className="glass-input flex-1 min-w-[180px] text-[13px]"
          />
          <select
            value={softwareFilter}
            onChange={(e) => setSoftwareFilter(e.target.value)}
            aria-label="按软件过滤"
            className="glass-input text-[13px]"
          >
            <option value="all">全部软件</option>
            {softwareTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {err && (
          <div role="alert" className="glass-hint-danger text-[12px]">
            {err}
          </div>
        )}

        {filtered.length === 0 ? (
          loaded ? (
            <div className="text-[12px] text-muted text-center py-8">没有匹配的 Skill</div>
          ) : (
            // M6：启动期骨架网格（避免空白闪一下）
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-skeleton-card" style={{ height: 140 }} aria-hidden />
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <SkillCard
                key={s.slug}
                skill={s}
                installed={installed.has(s.slug)}
                hasKey={hasKey}
                onNeedKey={onNeedKey}
                onInstall={() => {
                  // H4 修复：走 window.__skillhubUserInstallSkill，与 Home/协议唤起共用 jobs 状态机。
                  const fn = (window as unknown as {
                    __skillhubUserInstallSkill?: (
                      slug: string,
                      skill: { name?: string; software?: string | string[]; version?: string },
                    ) => Promise<void>;
                  }).__skillhubUserInstallSkill;
                  if (fn) {
                    void fn(s.slug, {
                      name: s.name,
                      software: s.software,
                    });
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
