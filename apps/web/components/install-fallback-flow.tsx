'use client';

/**
 * InstallFallbackFlow — 降级流程图（无助手时的"半自动"）
 *
 * 决策路径（D3 决策：未装助手时强推助手 + 5 秒后展开流程图）：
 *   1. 顶部强推「下载助手」按钮
 *   2. 5 秒后自动展开下面的步骤图
 *   3. 用户可主动关闭流程图
 *
 * 实现方式：内联步骤（每个软件固定一套），不依赖后端生成。
 * M2 简化：先做 PS / VSCode / Blender / PowerPoint 四套。
 */
import { useState, useEffect } from 'react';

interface Props {
  slug: string;
  skillName: string;
  softwareName?: string;
  onDismiss: () => void;
}

const STEPS_BY_SOFTWARE: Record<string, Array<{ icon: string; caption: string; command?: string; hint?: string }>> = {
  photoshop: [
    {
      icon: '📥',
      caption: '下载 skill 文件',
      hint: '如果浏览器没自动下载，点击下方按钮',
    },
    {
      icon: '📂',
      caption: '打开 Photoshop 插件目录',
      command: 'Win: C:\\Program Files\\Adobe\\Adobe Photoshop\\Plug-ins\\\nMac: /Applications/Adobe Photoshop/Plug-ins/',
    },
    { icon: '📋', caption: '把 .8bf 文件复制到上一步目录' },
    { icon: '🔄', caption: '重启 Photoshop，在「滤镜」菜单中找到新插件' },
  ],
  vscode: [
    { icon: '⌨️', caption: '打开 VSCode 命令面板（Ctrl+Shift+P 或 Cmd+Shift+P）' },
    { icon: '🔍', caption: '输入 Extensions: Install from VSIX' },
    { icon: '📂', caption: '选择刚才下载的 .vsix 文件' },
    { icon: '✅', caption: '等待安装完成，重启 VSCode 生效' },
  ],
  blender: [
    {
      icon: '⚙️',
      caption: '打开 Blender 脚本目录',
      command: 'Edit > Preferences > File Paths > Script Files 即可看到路径',
    },
    { icon: '📋', caption: '把 .py 加载项解压到 scripts/addons/' },
    { icon: '✅', caption: '重启 Blender，在 Edit > Preferences > Add-ons 启用' },
  ],
  excel: [
    { icon: '📊', caption: '打开 Excel「文件 > 选项 > 加载项」' },
    { icon: '👇', caption: '点击「管理：Excel 加载项」下方的「转到」' },
    { icon: '📂', caption: '点击「浏览」，选择 .xlam 文件' },
    { icon: '✅', caption: '勾选启用，重启 Excel' },
  ],
  powerpoint: [
    {
      icon: '📁',
      caption: '打开 PowerPoint 模板目录',
      command: 'Win: C:\\Users\\<用户名>\\Documents\\自定义 Office 模板\\\nMac: ~/Library/Group Containers/UBF8T346G9.Office/User Content.localized/Templates.localized/',
    },
    { icon: '📋', caption: '把 .potx 文件复制到上一步目录' },
    { icon: '✅', caption: '重启 PowerPoint，在「文件 > 新建 > 个人」中找到模板' },
  ],
};

export default function InstallFallbackFlow({ slug: _slug, skillName, softwareName, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  const steps = softwareName ? STEPS_BY_SOFTWARE[softwareName.toLowerCase()] || [] : [];

  useEffect(() => {
    const t = setTimeout(() => setExpanded(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const handleCopy = (cmd: string | undefined, idx: number) => {
    if (!cmd) return;
    void navigator.clipboard.writeText(cmd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8 sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              想 1 键搞定「装？🛠
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {skillName}（助手可以让这变简单）
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 主推：助手 */}
        <div className="mb-4 rounded-xl border-2 border-blue-500 bg-blue-50 p-4 dark:bg-blue-900/30">
          <p className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
            💡 强烈推荐下载 SkillHub 助手（仅 2MB）
          </p>
          <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            助手会让安装像点按钮一样简单。全程无黑框、无命令行。
          </p>
          <a
            href="/helper/download"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            下载助手（Win/Mac）
          </a>
        </div>

        {/* 降级流程图 */}
        {expanded && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              不想装助手？按以下步骤手动安装：
            </p>
            {steps.length > 0 ? (
              <ol className="space-y-3">
                {steps.map((s, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm text-white shadow-md">
                      {s.icon || idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{s.caption}</p>
                      {s.hint && <p className="mt-0.5 text-xs text-slate-500">{s.hint}</p>}
                      {s.command && (
                        <div className="mt-2 flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
                          <pre className="flex-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">{s.command}</pre>
                          <button
                            onClick={() => handleCopy(s.command, idx)}
                            className="flex-shrink-0 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                          >
                            {copiedIdx === idx ? '✓ 已复制' : '复制'}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">
                该软件暂未配置流程图，请参考 README文档。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}