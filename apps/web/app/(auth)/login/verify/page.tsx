import { redirect } from 'next/navigation';

/**
 * /login/verify - 旧邮箱验证回调的兼容入口。
 *
 * 历史背景：早期使用邮箱密码登录时，NextAuth 的 Email Provider 会把验证链接
 * 发到 `/login/verify?token=...`，由 NextAuth 处理后跳转。
 *
 * v2.0.6+ 已切换到 NvwaX OIDC（无邮箱密码流程），但邮箱验证链接仍可能命中此 URL，
 * 因此保留为重定向到 account.proclaw.cc/login 的兼容兜底。
 *
 * PR 5.4：加入 loading 占位 UI，避免重定向过程出现白屏闪烁。
 */
export default function VerifyPage() {
  // 服务端立即重定向到 ProClaw 统一登录页
  redirect('https://account.proclaw.cc/login');

  // 理论上不会执行到这里（redirect 抛 NEXT_REDIRECT），但保留 fallback UI
  // 以防浏览器忽略 redirect 时给用户一个明确提示
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 p-4">
      <div className="relative max-w-md w-full">
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-1 w-24 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full" />
        <div className="space-y-6 p-8 md:p-10 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl shadow-gray-200/40 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-br from-cyan-500 to-magenta-500 flex items-center justify-center shadow-lg shadow-cyan-500/30 animate-pulse">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold gradient-text">正在跳转登录页…</h2>
          <p className="text-sm text-gray-500">
            如果浏览器没有自动跳转，请
            <a
              href="https://account.proclaw.cc/login"
              className="ml-1 text-cyan-700 hover:text-cyan-600 underline underline-offset-2"
            >
              点击此处
            </a>
            。
          </p>
        </div>
      </div>
    </div>
  );
}
