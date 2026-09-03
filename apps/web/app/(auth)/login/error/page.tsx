'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case 'Verification':
        return '验证链接已过期或无效，请重新发送验证邮件';
      case 'EmailSignin':
        return '邮箱登录失败，请稍后重试';
      case 'CredentialsSignin':
        return '邮箱或密码错误，请检查后重试';
      case 'Configuration':
        return '系统配置错误，请联系管理员';
      default:
        return '登录过程中发生错误，请重试';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 p-4">
      <div className="relative max-w-md w-full">
        {/* 顶部 cyan→magenta 装饰线（PR 1-4 标准元素） */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-1 w-24 bg-gradient-to-r from-cyan-400 to-magenta-500 rounded-full" />

        <div className="space-y-8 p-8 md:p-10 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl shadow-gray-200/40">
          {/* 错误图标 + 标题 */}
          <div className="text-center">
            {/* 错误图标保留红色语义，但用 magenta→pink 渐变与系统一致 */}
            <div className="mx-auto h-20 w-20 bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/30 ring-1 ring-white/40">
              <svg
                className="h-12 w-12 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="mt-6 text-3xl font-bold gradient-text">
              登录失败
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              发生了一些问题
            </p>
          </div>

          {/* 错误信息卡片（保留红色语义，但用 backdrop-blur 强化玻璃感） */}
          <div className="mt-8 space-y-6">
            <div className="bg-rose-50/80 backdrop-blur-md border border-rose-200/70 rounded-xl p-6 shadow-sm">
              <div className="flex items-start">
                <div className="shrink-0">
                  <svg
                    className="h-6 w-6 text-rose-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-semibold text-rose-900">
                    错误详情
                  </h3>
                  <div className="mt-2 text-sm text-rose-700">
                    <p>{getErrorMessage(error)}</p>
                    {error === 'CredentialsSignin' && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-rose-600">
                          💡 提示：为了保障账户安全，我们不会明确提示是邮箱未注册还是密码错误。
                        </p>
                        <ul className="text-xs text-rose-600 list-disc list-inside space-y-1">
                          <li>请检查邮箱地址是否正确</li>
                          <li>请确认密码输入无误（注意大小写）</li>
                          <li>如果忘记密码，可以使用“忘记密码”功能重置</li>
                          <li>如果还未注册，请先注册账号</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 操作按钮：主按钮 cyan→magenta 渐变 + 次按钮 ghost */}
            <div className="space-y-3">
              <Link
                href="/login"
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-semibold rounded-xl text-white bg-gradient-to-r from-cyan-500 to-magenta-500 shadow-lg shadow-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/50 hover:-translate-y-0.5 hover:saturate-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-all duration-200"
              >
                返回登录页面
              </Link>

              <Link
                href="/"
                className="w-full flex items-center justify-center px-4 py-3 border border-white/70 text-base font-medium rounded-xl text-gray-700 bg-white/60 backdrop-blur-md hover:bg-white/80 hover:border-cyan-200/80 hover:shadow-md hover:shadow-cyan-200/30 hover:text-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-all duration-200"
              >
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
