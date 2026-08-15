import type { Metadata } from 'next';
import Link from 'next/link';
import { Cpu, GitFork, Rocket, BookOpen, ArrowRight, Terminal, Globe } from 'lucide-react';

export const metadata: Metadata = {
  title: '融合 DeepSeek Harness 开源技术 - SkillHub',
  description:
    'SkillHub 已融合 DeepSeek Harness（DSH）开源智能体框架技术：SKILL.md 标准技能包可被 DSH 直接加载执行，打通技能市场与 Agent 运行的闭环。',
  openGraph: {
    title: 'SkillHub × DeepSeek Harness 开源融合',
    description:
      'SKILL.md 标准技能包可被 DSH 直接加载执行，打通「技能市场 → Agent 运行」闭环',
    url: '/opensource/dsh',
  },
};

const significanceItems = [
  {
    icon: GitFork,
    title: '标准统一，零转换接入',
    description:
      'SkillHub 分发的每个技能包都遵循 Agent Skills 开放标准（SKILL.md + 资源目录）。DSH（DeepSeek Harness）作为开源智能体框架，原生支持该标准，技能包无需任何转换即可被 DSH 加载调用。',
  },
  {
    icon: Rocket,
    title: '打通「技能市场 → Agent 运行」闭环',
    description:
      '开发者可以在 SkillHub 浏览、发现并安装技能，然后在 DSH 中直接运行：发现技能、安装技能、加载执行，一条链路全部打通，让优质技能真正跑起来。',
  },
  {
    icon: Cpu,
    title: '开源共生，生态互惠',
    description:
      'SkillHub 基于 Apache-2.0 开源，DSH 同样是开源框架。双方基于同一套技能标准协作，DSH 为 SkillHub 提供标准化的运行时，SkillHub 为 DSH 生态持续供应高质量技能包。',
  },
  {
    icon: BookOpen,
    title: '开箱即用的内置技能',
    description:
      'SkillHub 仓库自带的 skills/ 目录（repo-dev、skill-package-validator、skill-smoke-test、code-review 等）遵循 Agent Skills 标准，可直接被 DSH、DeerFlow、Claude Code 等 harness 加载使用。',
  },
];

const usageSteps = [
  {
    title: '浏览与发现技能',
    description: '访问技能仓库首页，通过关键词搜索、分类筛选、质量评分与信任评分排序，找到适合你 Agent 任务的技能。',
    action: { label: '去技能库逛逛', href: '/skills' },
  },
  {
    title: '安装技能',
    description:
      '在技能详情页点击「复制安装命令」，或使用 SkillHub CLI 一键安装：',
    code: 'skillhub skill install <slug>',
  },
  {
    title: '在 DSH 中加载运行',
    description:
      '将技能目录（包含 SKILL.md 与资源文件）配置到 DSH 的技能加载路径。遵循 Agent Skills 标准，DSH 即可识别并调用该技能，为你的智能体赋能。',
    action: { label: '查看技能详情示例', href: '/skills' },
  },
  {
    title: '开发者 API 接入',
    description:
      '平台提供标准 API 端点，方便程序化接入：轻量发现端点 GET /api/v2/discovery 与标准 SKILL.md 下载 GET /api/v2/skills/{slug}/skill.md，可用于构建你自己的技能分发链路。',
    action: { label: '访问 OpenAPI 文档', href: '/api/openapi' },
  },
];

export default function DSHIntegrationPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 via-white to-gray-100">
      {/* 顶部导航（与首页一致的简约导航） */}
      <nav className="sticky top-0 z-50 w-full px-6 py-2 border-b border-gray-200 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center group">
            <img src="/skillhub.png" alt="Skill Hub Logo" className="h-12 w-auto object-contain transition-transform group-hover:scale-105" />
          </Link>
          <div className="flex items-center space-x-6">
            <Link href="/" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
              首页
            </Link>
            <Link
              href="/skills"
              className="px-4 py-2 text-sm font-medium text-white bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              浏览技能库
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero 声明区 */}
      <section className="relative overflow-hidden bg-linear-to-r from-cyan-700 via-blue-700 to-indigo-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDYwIEwgNjAgMCIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIGZpbGwtb3BhY2l0eT0iMC4zIiBzdHJva2Utb3BhY2l0eT0iMC4zIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Cpu className="w-4 h-4" />
            开源技术融合声明
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-6 tracking-tight">
            SkillHub × DeepSeek Harness（DSH）
          </h1>
          <p className="text-xl text-cyan-100 max-w-3xl mx-auto leading-relaxed">
            SkillHub 已融合 <span className="font-semibold text-white">DSH 开源智能体框架</span> 技术：
            SKILL.md 标准技能包可被 DSH 直接加载执行，实现「发现技能 → 安装技能 → Agent 运行」的完整闭环
          </p>
        </div>
      </section>

      {/* 融合意义 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">融合意义</h2>
        <p className="text-gray-500 text-center mb-12">
          为什么将 DSH 开源技术融入 SkillHub
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {significanceItems.map((item) => (
            <div
              key={item.title}
              className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/50 p-8 hover:shadow-xl transition-shadow"
            >
              <div className="w-12 h-12 mb-5 bg-linear-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <item.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-gray-600 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 使用方法 */}
      <section className="bg-white/70 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">使用方法</h2>
          <p className="text-gray-500 text-center mb-12">
            三步即可让 DSH 用上 SkillHub 的技能
          </p>

          <div className="max-w-4xl mx-auto space-y-6">
            {usageSteps.map((step, index) => (
              <div key={step.title} className="flex gap-6 bg-white rounded-2xl shadow-lg shadow-gray-200/50 p-8">
                <div className="shrink-0 w-12 h-12 rounded-full bg-linear-to-br from-blue-600 to-indigo-600 text-white font-bold text-lg flex items-center justify-center">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed mb-4">{step.description}</p>

                  {step.code && (
                    <div className="flex items-center gap-2 bg-gray-900 text-green-400 rounded-lg px-4 py-3 font-mono text-sm mb-4 overflow-x-auto">
                      <Terminal className="w-4 h-4 shrink-0 text-gray-400" />
                      <code>{step.code}</code>
                    </div>
                  )}

                  {step.action && (
                    <Link
                      href={step.action.href}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {step.action.label}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-14 text-center">
            <Link
              href="/skills"
              className="inline-flex items-center gap-2 px-8 py-4 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Globe className="w-5 h-5" />
              立即浏览技能库
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="mt-4 text-sm text-gray-500">
              想贡献技能？在 <Link href="/dashboard/skills/new" className="text-blue-600 hover:underline">发布中心</Link> 提交你的技能包，即可被 DSH 生态消费
            </p>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="bg-gray-900 text-gray-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-gray-500">
          <p>
            &copy; {new Date().getFullYear()} Skill Hub. 基于 Apache-2.0 许可证开源 · 融合 DeepSeek Harness（DSH）开源技术
          </p>
        </div>
      </footer>
    </div>
  );
}
