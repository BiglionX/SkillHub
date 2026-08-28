'use client';

/**
 * ContentDeliverable — C 类（内容生成型）Skill 的交付物组件
 *
 * 行为：
 *   - 用户调参数（主题、语气、长度...）
 *   - 点 [立即生成] → POST /api/v2/skills/[slug]/generate（SSE 流式）
 *   - 流式渲染结果（typewriter 效果）
 *   - 调参数 / 重生成 / 复制 / 保存
 *
 * 强依赖：桌面助手（v2.0.2 D6 决策）
 */

import { useState } from 'react';

interface InputParam {
  name: string;
  label: string;
  type: 'text' | 'select' | 'textarea';
  default?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
}

interface LlmConfig {
  model?: string;
  system_prompt?: string;
  input_schema?: {
    params?: InputParam[];
  };
}

interface Props {
  slug: string;
  skillName: string;
  llmConfig: LlmConfig;
}

const DEFAULT_PARAMS: InputParam[] = [
  { name: 'topic', label: '主题', type: 'text', required: true, placeholder: '如：618 母婴好物' },
  {
    name: 'tone',
    label: '语气',
    type: 'select',
    default: '活泼',
    options: [
      { value: '活泼', label: '活泼' },
      { value: '专业', label: '专业' },
      { value: '幽默', label: '幽默' },
      { value: '文艺', label: '文艺' },
    ],
  },
  {
    name: 'length',
    label: '长度',
    type: 'select',
    default: '中等',
    options: [
      { value: '短', label: '短（200字以内）' },
      { value: '中等', label: '中等（200-500字）' },
      { value: '长', label: '长（500+字）' },
    ],
  },
];

export default function ContentDeliverable({ slug, skillName: _skillName, llmConfig }: Props) {
  const params = llmConfig.input_schema?.params || DEFAULT_PARAMS;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const p of params) {
      if (p.default) v[p.name] = p.default;
    }
    return v;
  });

  const [result, setResult] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setResult('');
    setError(null);
    setStreaming(true);
    try {
      const res = await fetch(`/api/v2/skills/${slug}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: values }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (!res.body) {
        const data = await res.json();
        setResult(data.content || '');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let aborted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // SSE 格式：data: {...}\n\n
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6);
            try {
              const obj = JSON.parse(payload);
              if (obj.delta) {
                accumulated += obj.delta;
                setResult(accumulated);
              } else if (obj.error) {
                // 助手未配 Key 等：转成友好提示
                if (obj.error === 'NEED_HELPER_KEY') {
                  setError('NEED_HELPER_KEY');
                  aborted = true;
                  break;
                }
                throw new Error(typeof obj.error === 'string' ? obj.error : '生成失败');
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
        if (aborted) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const canSubmit = params.filter((p) => p.required).every((p) => values[p.name]?.trim());

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">✨ 立即生成</h2>
        <span className="text-xs text-slate-400">由 {llmConfig.model || 'deepseek-chat'} 提供</span>
      </header>

      {/* 参数表单 */}
      <div className="space-y-4">
        {params.map((p) => (
          <div key={p.name}>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {p.label}
              {p.required && <span className="ml-1 text-red-500">*</span>}
            </label>
            {p.type === 'select' ? (
              <select
                value={values[p.name] || p.default || ''}
                onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {p.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : p.type === 'textarea' ? (
              <textarea
                value={values[p.name] || ''}
                onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
                placeholder={p.placeholder}
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            ) : (
              <input
                type="text"
                value={values[p.name] || ''}
                onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
                placeholder={p.placeholder}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            )}
          </div>
        ))}

        <button
          onClick={handleGenerate}
          disabled={streaming || !canSubmit}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {streaming ? '生成中…' : result ? '🔄 不满意？重生成' : '✨ 立即生成'}
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-200">
          {error.includes('helper_no_key') || error.includes('SERVICE_DISABLED') ? (
            <div>
              💡 需要桌面助手且已配置 LLM Key 才能生成。
              <a href="/helper/download" className="ml-2 font-medium underline">
                下载助手 →
              </a>
            </div>
          ) : (
            <>生成失败：{error}</>
          )}
        </div>
      )}

      {/* 结果区 */}
      {result && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">生成结果</h3>
            <button
              onClick={handleCopy}
              className="rounded bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              {copied ? '✓ 已复制' : '📋 复制'}
            </button>
          </div>
          <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {result}
            {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
          </div>
        </div>
      )}
    </div>
  );
}