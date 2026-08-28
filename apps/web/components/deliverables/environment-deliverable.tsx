'use client';

/**
 * EnvironmentDeliverable — A 类（环境依赖型）Skill 完整实现（M2）
 *
 * 决策路径（M2）：
 *   1. 顶部 [一键安装] 按钮 → 唤起助手 → SSE 进度
 *   2. 未装助手 → 自动 fallback 到 InstallFallbackFlow
 *   3. 底部操作指令包（图文步骤 + 一键复制 + GIF 演示占位）
 */
import Link from 'next/link';
import InstallButton from '@/components/install-button';

interface Props {
  slug: string;
  skillName: string;
  targetSoftware?: string;
  installType?: string;
  installCommand?: string;
}

export default function EnvironmentDeliverable({
  slug,
  skillName,
  targetSoftware,
  installType,
  installCommand,
}: Props) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-6 dark:border-blue-800/40 dark:bg-blue-900/10">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          🛠 {skillName} · 安装操作包
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          适用软件：{targetSoftware || '未指定'} · 安装方式：{installType || 'plugin_market'}
        </p>
      </header>

      {/* 主按钮 */}
      <InstallButton
        slug={slug}
        skillName={skillName}
        softwareName={targetSoftware}
        installType={installType}
      />

      {/* 操作指令包 */}
      <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">📋 操作步骤</h3>
        <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li>1. 安装桌面助手（如果浏览器没自动打开下载页面，点上面的"下载助手"按钮）</li>
          <li>2. 打开软件（{targetSoftware || '目标软件'}）</li>
          <li>3. 助手会自动完成所有操作，您只需要等待「安装成功」弹窗</li>
        </ol>

        {/* GIF 演示占位 */}
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-100 p-6 text-center text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-800">
          🎬 GIF 动图演示（M2 收尾时上传）
        </div>

        {/* 配置代码 */}
        {installCommand && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">配置代码</p>
              <CopyButton text={installCommand} />
            </div>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {installCommand}
            </pre>
          </div>
        )}
      </div>

      {/* 关键引导语（PRD §2.3） */}
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
        💡 这个 Skill 需要在「{targetSoftware || '目标软件'}」环境下使用。
        想要先看效果 Demo 再装？还是直接自动装？
      </div>

      <Link href="/skills" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
        ← 返回技能列表
      </Link>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        alert('已复制到剪贴板');
      }}
      className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
    >
      📋 一键复制
    </button>
  );
}