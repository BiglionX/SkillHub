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

interface InstalledSkill {
  slug: string;
}

export default function Explore() {
  const [softwareFilter, setSoftwareFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<CatalogSkill[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const installedList = await invoke<InstalledSkill[]>('get_installed_skills').catch(() => []);
        setInstalled(new Set(installedList.map((s) => s.slug)));
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
      }
    })();
  }, []);

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
          <div className="text-[12px] text-muted text-center py-8">没有匹配的 Skill</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <SkillCard
                key={s.slug}
                skill={s}
                installed={installed.has(s.slug)}
                onInstall={() =>
                  invoke('install_skill', { slug: s.slug, skill: s }).catch(() => {})
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
