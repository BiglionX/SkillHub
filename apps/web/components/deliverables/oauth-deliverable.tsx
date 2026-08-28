'use client';

/**
 * OAuthDeliverable — B 类（数据授权型）Skill 占位
 * M3 接力：OAuth 跳转 + 模板配置
 */
import Link from 'next/link';

interface Props {
  slug: string;
  skillName: string;
  oauthProviders?: Array<{ id: string; name: string; logo?: string }>;
}

export default function OAuthDeliverable({ slug: _slug, skillName, oauthProviders }: Props) {
  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50/30 p-6 dark:border-purple-800/40 dark:bg-purple-900/10">
      <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
        🔗 {skillName} · OAuth 连接器
      </h2>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        M3 占位：B 类 Skill 的 OAuth 授权 + 模板配置将在 M3 上线。当前您可以：
      </p>
      {oauthProviders && oauthProviders.length > 0 && (
        <div className="space-y-2">
          {oauthProviders.map((p) => (
            <button
              key={p.id}
              disabled
              className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
            >
              <span>🔐 {p.name}</span>
              <span className="text-xs">未启用（M3）</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
        ⏳ OAuth 连接器将在 M3 上线。
      </div>
      <Link
        href="/skills"
        className="mt-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← 返回技能列表
      </Link>
    </div>
  );
}