import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '下载桌面助手 — SkillHub',
  description:
    '下载 SkillHub 桌面助手 v2.0.7：Windows MSI/EXE、macOS DMG（Apple Silicon / Intel）、Linux AppImage/DEB/RPM，安装包 ≤ 8MB。',
};

const RELEASE_TAG = 'v2.0.07';
const RELEASE_BASE = `https://github.com/BigLionX/SkillHub/releases/download/${RELEASE_TAG}`;
const RELEASES_LATEST = 'https://github.com/BigLionX/SkillHub/releases/latest';
const REPO_URL = 'https://github.com/BigLionX/SkillHub';

interface DownloadOption {
  label: string;
  file: string;
  primary?: boolean;
}

const platforms: { name: string; hint: string; options: DownloadOption[] }[] = [
  {
    name: 'Windows',
    hint: 'Windows 10/11 · x64',
    options: [
      { label: 'MSI 安装包（简体中文）', file: 'SkillHub_2.0.7_x64_zh-CN.msi', primary: true },
      { label: 'NSIS 安装包', file: 'SkillHub_2.0.7_x64-setup.exe' },
    ],
  },
  {
    name: 'macOS',
    hint: 'Apple Silicon 选 aarch64，Intel 选 x64',
    options: [
      { label: 'Apple Silicon (aarch64)', file: 'SkillHub_2.0.7_aarch64.dmg', primary: true },
      { label: 'Intel (x64)', file: 'SkillHub_2.0.7_x64.dmg' },
    ],
  },
  {
    name: 'Linux',
    hint: 'x86_64',
    options: [
      { label: 'AppImage（免安装）', file: 'SkillHub_2.0.7_amd64.AppImage', primary: true },
      { label: 'DEB 安装包', file: 'SkillHub_2.0.7_amd64.deb' },
      { label: 'RPM 安装包', file: 'SkillHub-2.0.7-1.x86_64.rpm' },
    ],
  },
];

export default function HelperDownloadPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <img src="/skillhub.png" alt="SkillHub" className="h-9 w-auto object-contain" />
            <span className="text-lg font-bold tracking-tight">SkillHub</span>
          </Link>
          <Link href="/skills" className="text-sm text-slate-300 transition-colors hover:text-white">
            在线技能库
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-14 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1.5 text-sm text-indigo-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            开源 · Apache-2.0 · 本地优先
          </div>
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">下载桌面助手</h1>
          <p className="text-slate-400">
            v2.0.7 · 支持 Windows / macOS / Linux · 安装包 ≤ 8MB · 无需配置运行环境
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {platforms.map((platform) => (
            <section
              key={platform.name}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <h2 className="mb-1 text-xl font-semibold">{platform.name}</h2>
              <p className="mb-6 text-sm text-slate-500">{platform.hint}</p>
              <div className="space-y-3">
                {platform.options.map((option) => (
                  <a
                    key={option.file}
                    href={`${RELEASE_BASE}/${option.file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block rounded-xl px-4 py-3 text-center text-sm font-medium transition-colors ${
                      option.primary
                        ? 'bg-linear-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-400 hover:to-indigo-500'
                        : 'border border-white/15 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {option.label}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-relaxed text-slate-400">
          <p className="mb-2 font-medium text-slate-200">安装提示</p>
          <p>
            开源版本未签名，首次运行时系统可能提示「来自未识别的开发者」。macOS 可在「系统设置 → 隐私与安全性」中允许，Windows 可选择「仍要运行」。
            每个安装包均在 GitHub Release 附带 SHA-256 校验和，建议下载后核对。
          </p>
          <div className="mt-4 flex flex-wrap gap-6">
            <a
              href={RELEASES_LATEST}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-300 hover:text-indigo-200"
            >
              查看全部版本与校验和 →
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-300 hover:text-indigo-200"
            >
              GitHub 仓库 →
            </a>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-slate-950/60">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} SkillHub · Apache-2.0
        </div>
      </footer>
    </div>
  );
}
