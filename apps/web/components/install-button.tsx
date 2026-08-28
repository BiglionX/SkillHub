'use client';

/**
 * InstallButton — A 类 Skill「一键安装」按钮
 *
 * 决策路径（M2 + PRD §2.4 D3）：
 *   1. 探测助手（probeHelper）
 *   2. 已装 → 调 /api/v2/install/jobs 拿到 deep_link → iframe 唤起 → 监听 SSE 进度
 *   3. 未装 → 弹「下载助手」+ 5 秒后展开 InstallFallbackFlow
 *   4. 唤起超时（>3s 无响应） → 自动 fallback
 */
import { useState } from 'react';
import { llmGateway } from '@/lib/services/LlmGateway';
import InstallProgressDialog from './install-progress-dialog';
import InstallFallbackFlow from './install-fallback-flow';

interface Props {
  slug: string;
  version?: string;
  skillName: string;
  softwareName?: string;
  installType?: string;
}

type State = 'idle' | 'checking' | 'launching' | 'progress' | 'fallback' | 'success' | 'failed';

export default function InstallButton({ slug, version = '1.0.0', skillName, softwareName }: Props) {
  const [state, setState] = useState<State>('idle');
  const [showOfflineChoice, setShowOfflineChoice] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setError(null);
    setState('checking');

    // 1. 探测助手
    const helper = await llmGateway.probeHelper();

    if (!helper.online) {
      // 助手离线 → 提示用户，可选"重试 / 直接看流程图 / 跳过助手"
      setShowOfflineChoice(true);
      return;
    }

    // 2. 调 API 创建任务
    try {
      const res = await fetch('/api/v2/install/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, version }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const job = await res.json();
      setJobId(job.job_id);

      // 同步端口发现：把助手的端口号缓存到 localStorage
      // 让后续 LlmGateway.discoverHelperPort() 能跨页面找到
      const probe = await llmGateway.probeHelper();
      if (probe.online && probe.port) {
        localStorage.setItem('skillhub-helper-port', String(probe.port));
      }

      // 4. iframe 唤起协议
      setState('launching');
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = job.deep_link;
      document.body.appendChild(iframe);

      // 5. 3 秒后检测是否进 progress
      setTimeout(() => {
        iframe.remove();
        if (state === 'launching') {
          setState('progress');
        }
      }, 3000);

      // 6. 也尝试 navigate（部分浏览器支持）
      try {
        window.location.href = job.deep_link;
      } catch {
        // ignore: navigate 不支持时静默忽略
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('failed');
    }
  };

  return (
    <>
      <button
        onClick={handleInstall}
        disabled={state === 'checking' || state === 'launching'}
        className="w-full rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {state === 'idle' && '🛠 一键安装'}
        {state === 'checking' && '🔍 检测助手中…'}
        {state === 'launching' && '🚀 唤起助手…'}
        {state === 'progress' && '⏳ 安装进行中…'}
        {state === 'fallback' && '📋 查看操作步骤'}
        {state === 'success' && '✅ 安装成功'}
        {state === 'failed' && '❌ 安装失败，重试'}
      </button>

      {/* 助手离线时的选择（M2 增强） */}
      {showOfflineChoice && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="mb-2 text-amber-800 dark:text-amber-200">
            ⚠️ 未检测到 SkillHub 助手运行
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowOfflineChoice(false);
                handleInstall();
              }}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
            >
              🔄 重试探测
            </button>
            <button
              onClick={() => {
                setShowOfflineChoice(false);
                setState('fallback');
              }}
              className="rounded bg-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
            >
              📋 直接看操作步骤
            </button>
            <a
              href="/helper/download"
              className="rounded border border-blue-300 px-3 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
            >
              ⬇ 下载助手
            </a>
          </div>
        </div>
      )}

      {/* 跳过助手：单独的小按钮（M2 增强） */}
      {state === 'idle' && (
        <button
          onClick={() => setState('fallback')}
          className="mt-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          不想装助手？直接看操作步骤 →
        </button>
      )}

      {state === 'progress' && jobId && (
        <InstallProgressDialog jobId={jobId} skillName={skillName} onClose={() => setState('idle')} onSuccess={() => { setState('success'); setTimeout(() => setState('idle'), 3000); }} />
      )}

      {state === 'fallback' && (
        <InstallFallbackFlow
          slug={slug}
          skillName={skillName}
          softwareName={softwareName}
          onDismiss={() => setState('idle')}
        />
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">⚠️ {error}</p>
      )}
    </>
  );
}