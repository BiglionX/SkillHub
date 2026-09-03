'use client';

import Link from 'next/link';

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  return (
    // v2.0.7+：plan §3.3 + glass.css。整页用深色玻璃画布 glass-canvas-bg；
    // 中心卡片用 glass-card-elevated + 顶部 cyan→magenta 渐变装饰条（glass-top-bar-wide）。
    // 标题走 .gradient-text；按钮走 .glow-btn-primary。与 PR 1-4 视觉一致但来源改为 glass.css。
    <div className="glass-canvas-bg min-h-screen flex items-center justify-center p-4">
      <div className="relative max-w-md w-full">
        <div className="glass-card-elevated relative p-8 md:p-10">
          <div className="glass-top-bar-wide" />

          {/* Logo 和标题 */}
          <div className="text-center">
            <Link href="/" className="inline-block group">
              <div className="mx-auto h-60 w-60 flex items-center justify-center mb-4 transition-transform group-hover:scale-105">
                <img src="/skillhub.png" alt="Skill Hub Logo" className="w-full h-full object-contain" />
              </div>
            </Link>
            <h2 className="mt-2 text-3xl font-bold gradient-text">
              欢迎使用 Skill Hub
            </h2>
            <p className="mt-2 text-sm text-glass-text-secondary">
              AI Agent 技能注册中心
            </p>
            <Link
              href="/"
              className="inline-flex items-center mt-4 text-sm text-glass-text-link hover:opacity-80 transition-opacity"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回首页
            </Link>
          </div>

          {/* 统一登录按钮：glass.css 的 cyan→magenta 渐变 + 发光（与 helper 端对齐） */}
          <div className="mt-8">
            <button
              onClick={handleLogin}
              className="glow-btn glow-btn-primary glow-btn-lg glow-btn-full"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              使用 ProClaw 账号登录
            </button>
            <p className="mt-4 text-center text-sm text-glass-text-muted">
              通过 ProClaw 统一账号系统登录，无需单独注册
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}