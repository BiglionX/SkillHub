import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-config';

export const metadata: Metadata = {
  title: 'SkillHub — 开源 AI 技能桌面助手',
  description:
    '下载 SkillHub 开源桌面助手，把你自己的 LLM Key 放进本地保险箱，一句话发现并安装 AI 技能。支持 Windows / macOS / Linux。',
  openGraph: {
    title: 'SkillHub — 开源 AI 技能桌面助手',
    description: '本地优先的 AI 技能市场：你的 Key 留在本机，技能一键安装。',
  },
};

const DOWNLOAD_URL = 'https://github.com/BigLionX/SkillHub/releases/latest';
const REPO_URL = 'https://github.com/BigLionX/SkillHub';

const steps = [
  {
    step: '01',
    title: '下载并安装助手',
    desc: '一个不到 8MB 的桌面应用，无需配置 Python 或 Node 环境，开箱即用。',
  },
  {
    step: '02',
    title: '填入你自己的 Key',
    desc: '在设置页粘贴 DeepSeek / OpenAI / 智谱的 Key，AES 加密保存在本机，不上传服务器。',
  },
  {
    step: '03',
    title: '说出你的需求',
    desc: '用自然语言描述任务，助手自动匹配技能、安装依赖并完成执行。',
  },
];

const features = [
  {
    title: '本地 Key 保险箱',
    desc: '云端不持有任何 LLM Key。你的配额、你的账单、你的数据，全部留在本地。',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    ),
  },
  {
    title: '5 大工作台',
    desc: '首页、探索、我的技能、用量看板、设置——从发现到结算的完整闭环都在一个客户端里。',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    ),
  },
  {
    title: '用量与成本透明',
    desc: '本地 SQLite 记录每一次调用，按模型与时间聚合，随时导出 CSV。花了多少，一目了然。',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
  },
  {
    title: '完全开源',
    desc: 'Apache-2.0 许可证，源码公开可审计。技能包遵循 Agent Skills 标准，不被平台锁定。',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    ),
  },
];

/**
 * 首页（v2.1 下载助手定位）：
 *   - 未登录 → 下载助手落地页（桌面端为主，在线浏览降为次级入口）
 *   - 已登录 → /dashboard/usage（个人用量中心）
 *
 * 原 NLU 搜索入口保留在 /skills，canonical tag 也落在 /skills（见 app/skills/page.tsx）。
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard/usage');
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src="/skillhub.png" alt="SkillHub" className="h-9 w-auto object-contain" />
            <span className="text-lg font-bold tracking-tight">SkillHub</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/skills" className="text-slate-300 hover:text-white transition-colors">
              在线技能库
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white transition-colors"
            >
              GitHub
            </a>
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg border border-white/20 text-slate-200 hover:bg-white/10 transition-colors"
            >
              登录
            </Link>
            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 font-medium transition-colors"
            >
              下载助手
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.5),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-sm mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            开源 · Apache-2.0 · 本地优先
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            把 AI 技能，装进你的
            <span className="bg-linear-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              日常软件
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed mb-10">
            一句话描述任务，桌面助手自动发现、安装并运行合适的技能。
            你自己的 LLM Key 加密保存在本机——不上云，不共享，不失控。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-semibold text-lg shadow-lg shadow-indigo-900/40 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下载桌面助手
            </a>
            <Link
              href="/skills"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-slate-100 hover:bg-white/10 font-medium text-lg transition-colors"
            >
              先逛逛在线技能库
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <p className="mt-6 text-sm text-slate-500">支持 Windows · macOS · Linux | 安装包 ≤ 8MB | 无需配置运行环境</p>
        </div>
      </section>

      {/* 三步上手 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">三步开始</h2>
          <p className="text-slate-400">从下载到跑通第一个技能，不需要一分钟</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((item) => (
            <div
              key={item.step}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 hover:border-indigo-400/40 transition-colors"
            >
              <div className="text-4xl font-extrabold text-indigo-400/40 mb-4">{item.step}</div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 核心特性 */}
      <section className="border-y border-white/10 bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">为什么选择本地助手</h2>
            <p className="text-slate-400">技能市场在云端，控制权在你手里</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-4 rounded-xl border border-white/5 bg-white/5 p-6">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-300">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {feature.icon}
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-4">准备好接管你的 AI 工作流了吗？</h2>
        <p className="text-slate-400 mb-8">完全开源，免费使用，随时可以卸载。</p>
        <a
          href={DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 font-semibold transition-colors"
        >
          前往 GitHub 下载
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
      </section>

      {/* 页脚 */}
      <footer className="border-t border-white/10 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <img src="/skillhub.png" alt="SkillHub" className="h-8 w-auto object-contain" />
            <span>© {new Date().getFullYear()} SkillHub · Apache-2.0</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/skills" className="hover:text-white transition-colors">技能库</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">反馈</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
