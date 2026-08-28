'use client';

/**
 * SoftwarePickerDialog — 已装软件多选对话框
 *
 * 触发场景：
 *   - 用户首次访问（localStorage 标记）
 *   - 助手上报本机软件后
 *   - 用户主动打开
 *
 * 用户体验：打勾就行，不强制安装桌面助手
 */
import { useEffect, useState } from 'react';

interface SoftwareTag {
  id: string;
  name: string;
  labelZh: string;
  icon?: string | null;
}

export default function SoftwarePickerDialog() {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<SoftwareTag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem('software-picker-dismissed') === '1') {
      setDismissed(true);
      return;
    }
    setDismissed(false);
    setOpen(true);

    Promise.all([
      fetch('/api/v2/software-tags').then((r) => (r.ok ? r.json() : { tags: [] })),
      fetch('/api/v2/user/installed-software', { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : { installed: [] }
      ),
    ])
      .then(([tagsRes, installedRes]) => {
        setTags(tagsRes.tags || []);
        const installed = installedRes.installed || [];
        const tagIds = installed.map((s: { softwareTagId: string }) => s.softwareTagId);
        setSelected(new Set(tagIds));

        // 如果是助手上报的，自动提示
        if (installed.length > 0 && installed[0].source === 'HELPER_SCAN') {
          setHint(`我们从您的桌面助手识别到 ${installed.length} 个已装软件。`);
        }
      })
      .catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/v2/user/installed-software', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Array.from(selected).map((id) => ({ softwareTagId: id })),
        }),
      });
      localStorage.setItem('software-picker-dismissed', '1');
      setDismissed(true);
      setOpen(false);
    } catch {
      // 静默失败
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('software-picker-dismissed', '1');
    setDismissed(true);
    setOpen(false);
  };

  if (dismissed || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="mb-1 text-xl font-semibold text-slate-900 dark:text-white">
          📦 您装了哪些软件？
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          勾选您电脑上的常用软件，我们为您智能匹配 Skill，并优先推荐支持您已装软件的 Skill。
          <span className="ml-1 text-slate-400">（不勾选也行，可随时在「设置」里改）</span>
        </p>
        {hint && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/30 dark:text-blue-200">
            🤖 {hint}
          </div>
        )}

        <div className="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
          {tags.map((t) => (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 transition ${
                selected.has(t.id)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <span className="text-3xl">{t.icon || '📦'}</span>
              <span className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.labelZh}
              </span>
              {selected.has(t.id) && (
                <span className="absolute mt-[-20px] ml-[40px] text-blue-500">✓</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            稍后再说
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : `保存（已选 ${selected.size} 项）`}
          </button>
        </div>
      </div>
    </div>
  );
}