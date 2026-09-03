'use client';

/**
 * InstallProgressDialog — 安装进度弹窗（订阅 SSE）
 */
import { useEffect, useState } from 'react';

interface Props {
  jobId: string;
  skillName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProgressStep {
  id?: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
}

export default function InstallProgressDialog({ jobId, skillName, onClose, onSuccess }: Props) {
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [status, setStatus] = useState<'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'>('RUNNING');
  const [message, setMessage] = useState('助手正在安装…');
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch(`/api/v2/install/jobs/${jobId}/cancel`, { method: 'POST' });
      setStatus('CANCELLED');
      setMessage('已取消');
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/v2/install/jobs/${jobId}/retry`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // 关闭当前 dialog，重新唤起新任务
        onClose();
        // 跳转到新任务的 deep_link
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = data.deep_link;
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 3000);
      }
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    const es = new EventSource(`/api/v2/install/jobs/${jobId}/events`);

    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'live' && data.step_id) {
          setSteps((prev) => {
            const idx = prev.findIndex((s) => s.id === data.step_id);
            const next = [...prev];
            const eventType = data.event_type;
            const newStep: ProgressStep = {
              id: data.step_id,
              description: data.payload?.description,
              status: eventType === 'step_started' ? 'running' : eventType === 'step_completed' ? 'completed' : 'failed',
              durationMs: data.payload?.duration_ms,
            };
            if (idx === -1) {
              next.push(newStep);
            } else {
              next[idx] = { ...next[idx], ...newStep };
            }
            return next;
          });
          if (data.event_type === 'step_started') {
            setMessage(data.payload?.description || data.step_id);
          }
        }
        if (data.type === 'closed') {
          setStatus(data.status);
          if (data.status === 'SUCCEEDED') {
            setMessage('安装成功！');
            setTimeout(onSuccess, 1500);
          } else if (data.status === 'FAILED') {
            setMessage('安装失败');
          }
          es.close();
        }
      } catch {
        // ignore: 关闭 EventSource 失败时静默忽略
      }
    });

    es.onerror = () => {
      // 关闭时不报错
    };

    return () => es.close();
  }, [jobId, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">正在安装</h3>
        <p className="mb-4 text-sm text-slate-500">{skillName}</p>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            {status === 'RUNNING' && <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />}
            {status === 'SUCCEEDED' && <div className="h-3 w-3 rounded-full bg-green-500" />}
            {status === 'FAILED' && <div className="h-3 w-3 rounded-full bg-red-500" />}
            <p className="text-sm font-medium text-slate-900 dark:text-white">{message}</p>
          </div>
        </div>

        {steps.length > 0 && (
          <div className="mb-4 space-y-2">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                {s.status === 'completed' && <span className="text-green-500">✓</span>}
                {s.status === 'running' && <span className="animate-pulse text-blue-500">●</span>}
                {s.status === 'failed' && <span className="text-red-500">✗</span>}
                {s.status === 'pending' && <span className="text-slate-400">○</span>}
                <span className="text-slate-700 dark:text-slate-300">
                  {s.description || s.id}
                  {s.durationMs && ` (${(s.durationMs / 1000).toFixed(1)}s)`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {(status === 'RUNNING' || (status as string) === 'PENDING') && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
            >
              {cancelling ? '取消中…' : '取消安装'}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            {status === 'RUNNING' ? '后台运行' : '关闭'}
          </button>
          {(status === 'FAILED' || status === 'CANCELLED') && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {retrying ? '重试中…' : '重试'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}