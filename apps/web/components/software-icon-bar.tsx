'use client';

/**
 * SoftwareIconBar — 顶部软件图标过滤栏
 *
 * 数据来源：/api/v2/software-tags
 * 状态：客户端拉取 → 渲染图标 → 点选跳转到 /skills?software={id}
 * 已装标记：来自 UserInstalledSoftware（在登录态下显示）
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SoftwareTag {
  id: string;
  name: string;
  labelZh: string;
  icon?: string | null;
  skillCount?: number;
}

interface Props {
  activeSoftwareName?: string;
}

export default function SoftwareIconBar({ activeSoftwareName }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<SoftwareTag[]>([]);
  const [installedSet, setInstalledSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch('/api/v2/software-tags')
        .then((r) => (r.ok ? r.json() : { tags: [] }))
        .catch(() => ({ tags: [] })),
      fetch('/api/v2/user/installed-software', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { installed: [] }))
        .catch(() => ({ installed: [] })),
    ])
      .then(([tagsRes, installedRes]) => {
        if (!mounted) return;
        setTags(tagsRes.tags || []);
        setInstalledSet(new Set((installedRes.installed || []).map((s: { softwareName: string }) => s.softwareName)));
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  if (loading || tags.length === 0) return null;

  return (
    <div className="sticky top-16 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => router.push('/skills')}
            className={`flex flex-shrink-0 flex-col items-center rounded-lg px-3 py-2 text-xs transition ${
              !activeSoftwareName
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
            }`}
          >
            <span className="text-xl">🌐</span>
            <span className="mt-1">全部</span>
          </button>
          {tags.map((t) => {
            const active = activeSoftwareName === t.name;
            const installed = installedSet.has(t.name);
            return (
              <button
                key={t.id}
                onClick={() => router.push(`/skills?software=${t.name}`)}
                className={`relative flex flex-shrink-0 flex-col items-center rounded-lg px-3 py-2 text-xs transition ${
                  active
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
                }`}
              >
                <span className="text-xl">{t.icon || '📦'}</span>
                <span className="mt-1">{t.labelZh}</span>
                {installed && (
                  <span
                    className="absolute right-1 top-1 h-2 w-2 rounded-full bg-green-500"
                    title="您已安装此软件"
                  />
                )}
                {t.skillCount !== undefined && (
                  <span className="mt-0.5 text-[10px] text-slate-400">{t.skillCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}