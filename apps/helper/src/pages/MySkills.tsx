/**
 * MySkills Tab — 已装 Skill 列表（M4 · t09）
 *
 * 设计：
 * - 已装 Skill 网格
 * - 每个卡显示单 Skill 用量小卡（本周 / 总 / 成本）
 * - 卸载按钮 → 调 invoke('uninstall_skill')
 *
 * 用量数据来源：get_local_usage_summary({ range: '7d' }) → by_skill
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PackageOpen, Trash2 } from 'lucide-react';
import ProviderPriceBadge from '../components/ProviderPriceBadge';

interface InstalledSkill {
  slug: string;
  name: string;
  software: string;
  installedAt: Date;
  version?: string;
}

interface UsageByKey {
  key: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost: number;
}

interface UsageSummary {
  by_skill: UsageByKey[];
}

export default function MySkills() {
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const list = await invoke<InstalledSkill[]>('get_installed_skills').catch(() => []);
      setInstalled(list);
      const sum = await invoke<UsageSummary>('get_local_usage_summary', { range: '7d' }).catch(() => null);
      if (sum) setUsage(sum);
    })();
  }, []);

  const usageByKey = new Map<string, UsageByKey>();
  usage?.by_skill.forEach((u) => usageByKey.set(u.key, u));

  const handleUninstall = async (slug: string) => {
    if (busy) return;
    setBusy(slug);
    try {
      await invoke('uninstall_skill', { slug });
      setInstalled((prev) => prev.filter((s) => s.slug !== slug));
    } catch (e) {
      console.warn('uninstall_skill 失败', e);
    } finally {
      setBusy(null);
    }
  };

  if (installed.length === 0) {
    return (
      <div className="glass-canvas px-6 py-6 glass-scroll">
        <div className="mx-auto max-w-3xl">
          <header className="flex items-center gap-3 mb-5">
            <PackageOpen size={20} aria-hidden className="text-cyan-300" />
            <h1 className="text-xl font-bold gradient-text-h">我的 Skills</h1>
          </header>
          <div className="glass-card-soft p-6 text-center text-[13px] text-muted">
            还没有安装任何 Skill，去「探索」Tab 选一个吧。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-canvas px-6 py-6 glass-scroll">
      <div className="mx-auto max-w-4xl flex flex-col gap-5">
        <header className="flex items-center gap-3">
          <PackageOpen size={20} aria-hidden className="text-cyan-300" />
          <h1 className="text-xl font-bold gradient-text-h">我的 Skills</h1>
          <span className="glass-pill glass-pill-neutral text-[11px] ml-2">
            {installed.length} 个
          </span>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {installed.map((s) => {
            const u = usageByKey.get(s.slug);
            return (
              <div key={s.slug} className="glass-card-soft p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold text-primary">{s.name}</div>
                    <code className="text-[11px] font-mono text-muted">{s.slug}</code>
                    {s.version && (
                      <span className="text-[11px] text-muted ml-2">v{s.version}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUninstall(s.slug)}
                    disabled={busy === s.slug}
                    className="glow-btn-ghost text-[11px]"
                    aria-label={`卸载 ${s.name}`}
                  >
                    <Trash2 size={11} aria-hidden />
                    {busy === s.slug ? '卸载中…' : '卸载'}
                  </button>
                </div>
                <div className="text-[11px] text-muted">
                  适用：<code className="font-mono">{s.software}</code>
                </div>
                {/* 单卡用量 */}
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div className="text-center">
                    <div className="text-[18px] font-bold text-cyan-300">
                      {u?.calls ?? 0}
                    </div>
                    <div className="text-[10px] text-muted">7 日调用</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[18px] font-bold text-cyan-300">
                      {((u?.tokens_in ?? 0) + (u?.tokens_out ?? 0)).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted">7 日 token</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[18px] font-bold text-cyan-300">
                      ¥{(u?.cost ?? 0).toFixed(4)}
                    </div>
                    <div className="text-[10px] text-muted">7 日成本</div>
                  </div>
                </div>
                {u && u.calls > 0 && (
                  <ProviderPriceBadge providerId="deepseek" model="deepseek-chat" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
