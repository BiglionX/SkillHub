'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { llmGateway } from '@/lib/services/LlmGateway';

interface MatchedSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl?: string | null;
  category?: string;
  deliveryCategory?: 'ENVIRONMENT_DEPENDENT' | 'OAUTH_AUTHORIZED' | 'CONTENT_GENERATION' | null;
  downloadCount: number;
  rating: number;
  score: number;
}

interface IntentResponse {
  software_tags: string[];
  intent_tags: string[];
  skill_category?: 'A' | 'B' | 'C';
  confidence: number;
  matched_skills: MatchedSkill[];
  cached: boolean;
  llm_path: 'helper' | 'cloud' | 'heuristic' | 'cache';
  duration_ms: number;
  reasoning?: string;
}

const EXAMPLES = [
  '帮我把照片皮肤磨皮',
  '把本周飞书会议纪要同步到 Notion',
  '写一篇 618 母婴好物小红书',
  '给 Excel 加一个智能填色助手',
];

export default function ChatIntentInput() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<IntentResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const [helperStatus, setHelperStatus] = useState<{
    online: boolean;
    hasKey: boolean;
  } | null>(null);

  // 进入页面时探测助手
  useEffect(() => {
    llmGateway.probeHelper().then(setHelperStatus).catch(() => setHelperStatus(null));
  }, []);

  const handleSubmit = (q: string = query) => {
    if (!q.trim()) return;
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/v2/intent/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: IntentResponse = await res.json();
        setResult(data);
      } catch (err) {
        setResult({
          software_tags: [],
          intent_tags: [],
          confidence: 0,
          matched_skills: [],
          cached: false,
          llm_path: 'heuristic',
          duration_ms: 0,
          reasoning: `请求失败：${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12">
      {/* 大对话框 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-white">
          描述您想解决的问题
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          我帮您找现成的 Skill —— 不需要懂代码，直接说就行。
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：帮我把照片皮肤磨皮"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !query.trim()}
            className="rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? '寻找中…' : '找 Skill'}
          </button>
        </form>

        {/* 示例 chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => handleSubmit(ex)}
              disabled={isPending}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* 助手状态条 */}
        {helperStatus && !helperStatus.online && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
            💡 桌面助手未运行。结果基于关键词匹配（准确率有限）。
            <a
              href="/helper/download"
              className="ml-2 font-medium text-amber-900 underline dark:text-amber-100"
            >
              下载助手 →
            </a>
          </div>
        )}
        {helperStatus && helperStatus.online && !helperStatus.hasKey && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-200">
            💡 助手已运行但未配置 LLM Key。
            <a href="/helper/settings" className="ml-2 font-medium underline">
              去设置 →
            </a>
          </div>
        )}
      </div>

      {/* 结果区 */}
      {result && (
        <div className="mt-8">
          {/* 元信息 */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {result.skill_category && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                {result.skill_category === 'A' && '🛠 环境依赖型'}
                {result.skill_category === 'B' && '🔗 数据授权型'}
                {result.skill_category === 'C' && '✍️ 内容生成型'}
              </span>
            )}
            <span>置信度 {(result.confidence * 100).toFixed(0)}%</span>
            <span>·</span>
            <span>
              {result.llm_path === 'cache' && '⚡ 缓存命中'}
              {result.llm_path === 'helper' && '🤖 助手转发'}
              {result.llm_path === 'cloud' && '☁️ 云端 LLM'}
              {result.llm_path === 'heuristic' && '📚 关键词匹配'}
            </span>
            <span>·</span>
            <span>{result.duration_ms}ms</span>
          </div>

          {result.reasoning && (
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {result.reasoning}
            </p>
          )}

          {/* 匹配结果 */}
          {result.matched_skills.length > 0 ? (
            <div className="space-y-3">
              {result.matched_skills.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/skills/${s.slug}`)}
                  className="flex w-full items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl dark:bg-slate-800">
                    {s.iconUrl ? (
                      <img src={s.iconUrl} alt="" className="h-10 w-10 rounded" />
                    ) : (
                      '🧩'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-slate-900 dark:text-white">
                        {s.name}
                      </h3>
                      <span className="text-xs text-slate-400">
                        评分 {s.score.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                      {s.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-slate-400">→</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              没有匹配的 Skill。试试点上面的示例，或换个说法。
            </div>
          )}

          {/* 关键引导语（PRD §2.3） */}
          {result.skill_category && result.matched_skills.length > 0 && (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              选一个 Skill 进去看看，我准备了操作步骤 + 视频演示 + 一键复制。
            </p>
          )}
        </div>
      )}
    </section>
  );
}