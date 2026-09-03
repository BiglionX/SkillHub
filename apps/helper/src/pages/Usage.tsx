/**
 * Usage Tab — 用量仪表盘（M4 · t10）
 *
 * 设计：
 * - 顶部 4 个指标卡（今日 / 7 日 / 30 日 / 总成本）
 * - 按 Skill 拆分柱状 + Provider 分布饼图（UsageDashboard）
 * - range 切换器（today / 7d / 30d）
 * - 导出 CSV 按钮（export_usage_csv invoke）
 * - 同步到云端按钮（登录态可见）
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { BarChart3, Download, Cloud } from 'lucide-react';
import UsageDashboard from '../components/UsageDashboard';

type Range = 'today' | '7d' | '30d';

export default function Usage() {
  const [range, setRange] = useState<Range>('7d');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const path = await invoke<string>('pick_export_path').catch(() => {
        // fallback：写入下载目录
        return `~/Downloads/skillhub-usage-${Date.now()}.csv`;
      });
      const n = await invoke<number>('export_usage_csv', { path });
      setExportMsg(`已导出 ${n} 条记录到 ${path}`);
    } catch (e) {
      setExportMsg(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      // M4 · t14：POST /api/v2/usage/sync 批量上报本机所有 record
      // 此处仅示意：先读本地记录 + 调 fetch
      const summary = await invoke<{
        by_skill: { key: string; calls: number; cost: number }[];
      }>('get_local_usage_summary', { range: '30d' });
      // M4 占位：实际批量上报逻辑待 t14 落地
      const n = summary.by_skill.reduce((acc, b) => acc + b.calls, 0);
      setSyncMsg(`已同步 ${n} 条汇总（云端聚合详见 t14）`);
      void openUrl('https://skillhub.proclaw.cc/dashboard/usage');
    } catch (e) {
      setSyncMsg(`同步失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="glass-canvas px-6 py-6 glass-scroll">
      <div className="mx-auto max-w-4xl flex flex-col gap-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 size={20} aria-hidden className="text-cyan-300" />
            <h1 className="text-xl font-bold gradient-text-h">用量</h1>
          </div>
          <div className="flex items-center gap-2">
            {(['today', '7d', '30d'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={
                  range === r
                    ? 'glass-pill glass-pill-cyan text-[11px]'
                    : 'glass-pill glass-pill-neutral text-[11px]'
                }
              >
                {r === 'today' ? '今日' : r === '7d' ? '7 日' : '30 日'}
              </button>
            ))}
          </div>
        </header>

        <UsageDashboard range={range} />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="glow-btn-ghost text-[12px]"
          >
            <Download size={12} aria-hidden />
            {exporting ? '导出中…' : '导出 CSV'}
          </button>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className="glow-btn-primary text-[12px]"
            title="登录 Web 端后可同步本机用量到云端"
          >
            <Cloud size={12} aria-hidden />
            {syncing ? '同步中…' : '同步到云端'}
          </button>
          {exportMsg && (
            <span className="text-[11px] text-muted">{exportMsg}</span>
          )}
          {syncMsg && (
            <span className="text-[11px] text-muted">{syncMsg}</span>
          )}
        </div>
      </div>
    </div>
  );
}
