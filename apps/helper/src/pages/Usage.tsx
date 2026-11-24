/**
 * Usage Tab — 用量仪表盘（M4 · t10 + M5）
 *
 * 设计：
 * - 顶部 4 个指标卡（今日 / 7 日 / 30 日 / 总成本）
 * - 按 Skill 拆分柱状 + Provider 分布饼图（UsageDashboard）
 * - range 切换器（today / 7d / 30d）
 * - 导出 CSV 按钮（export_usage_csv invoke）
 * - M5 §7.3：同步到云端按钮（usage_sync_to_cloud invoke）
 *
 * H3 + M5 闭环：原本假"同步到云端"按钮现在真正接通到 /api/v2/usage/sync。
 * 失败的 429/5xx 在按钮旁显示提示，不丢数据（下次重试）。
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { BarChart3, Download, Cloud, ExternalLink } from 'lucide-react';
import UsageDashboard from '../components/UsageDashboard';

type Range = 'today' | '7d' | '30d';

interface UsageSyncResult {
  ok: boolean;
  synced: number;
  deduped: number;
  total: number;
  session_id: string;
  retry_after_seconds: number | null;
  message: string;
}

const ANON_ID_KEY = 'helper.anonymous_id';

function getAnonymousId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ANON_ID_KEY);
}

export default function Usage() {
  const [range, setRange] = useState<Range>('7d');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  // M5：同步状态机（独立于 export）
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<UsageSyncResult | null>(null);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      // 后端 pick_export_path 返回平台下载目录下的绝对路径（含文件名），失败直接抛错由下方 catch 处理
      const path = await invoke<string>('pick_export_path');
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
    const anonId = getAnonymousId();
    if (!anonId) {
      setSyncMsg('未拿到匿名 ID，请重启助手');
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      // M5 §7.3：调 usage_sync_to_cloud 命令；Rust 端处理 HTTP + 标记 synced
      const result = await invoke<UsageSyncResult>('usage_sync_to_cloud', {
        anonymousId: anonId,
      });
      setLastSync(result);
      setSyncMsg(result.message);
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
            title="把本机未同步的用量记录批量上报到云端"
          >
            <Cloud size={12} aria-hidden />
            {syncing ? '同步中…' : '同步到云端'}
          </button>
          <button
            type="button"
            onClick={() => void openUrl('https://skillhub.proclaw.cc/dashboard/usage')}
            className="glow-btn-ghost text-[12px]"
            title="登录 Web 端查看跨设备汇总"
          >
            <ExternalLink size={12} aria-hidden />
            Web 端用量看板
          </button>
          {(exportMsg || syncMsg) && (
            <span
              className={`text-[11px] ${
                lastSync && !lastSync.ok ? 'text-warning-inline' : 'text-muted'
              }`}
            >
              {exportMsg || syncMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
