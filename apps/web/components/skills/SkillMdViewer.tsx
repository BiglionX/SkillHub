/**
 * Skill 详情页 SKILL.md 渲染组件
 *
 * 依据 Agent Skills 开放标准（https://agentskills.io）：
 * - 突出展示 frontmatter（name + description）
 * - 自动识别版本徽章
 * - 支持渐进式披露（折叠大文件）
 */

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface SkillMdViewerProps {
  skillMdContent: string;
  frontmatter: {
    name?: string;
    description?: string;
    [key: string]: unknown;
  };
  agentSkillsVersion?: string | null;
  slug: string;
}

export default function SkillMdViewer({
  skillMdContent,
  frontmatter,
  agentSkillsVersion,
  slug,
}: SkillMdViewerProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // 复制标准 URL（Agent 可直接安装）
  const standardUrl = `https://skillhub.proclaw.cc/api/v2/skills/${slug}/skill.md`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(standardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="skill-md-viewer rounded-lg border border-gray-200 bg-white">
      {/* Frontmatter 头部 */}
      <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
            Agent Skills Standard
          </span>
          {agentSkillsVersion && (
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-blue-600 border border-blue-200">
              v{agentSkillsVersion}
            </span>
          )}
        </div>

        {frontmatter.name && (
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            {String(frontmatter.name)}
          </h1>
        )}

        {frontmatter.description && (
          <p className="text-base text-gray-700">
            {String(frontmatter.description)}
          </p>
        )}

        {/* 标准下载链接 */}
        <div className="mt-4 flex items-center gap-2 rounded-md bg-white p-2 border border-gray-200">
          <code className="flex-1 text-xs text-gray-600 truncate">
            {standardUrl}
          </code>
          <button
            onClick={handleCopy}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-2">
        <div className="text-xs text-gray-500">
          兼容 Anthropic Claude / Cursor / Windsurf / DeerFlow 等 40+ AI 工具
        </div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showRaw ? '查看渲染' : '查看源文件'}
        </button>
      </div>

      {/* 内容区 */}
      <div className="p-6">
        {showRaw ? (
          <pre className="overflow-x-auto rounded bg-gray-50 p-4 text-xs">
            <code>{skillMdContent}</code>
          </pre>
        ) : (
          <article className="prose prose-slate max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
                  const { children, className, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...rest}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {stripFrontmatter(skillMdContent)}
            </ReactMarkdown>
          </article>
        )}
      </div>

      {/* 渐进式披露提示 */}
      <details className="border-t border-gray-200 px-6 py-3 text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">
          如何在 AI Agent 中使用此 Skill？
        </summary>
        <div className="mt-3 space-y-2">
          <p>
            <strong>Claude Code / Cursor / Windsurf：</strong>
            直接将上述 URL 添加到 Agent 的 Skills 目录。
          </p>
          <p>
            <strong>自定义 Agent：</strong>
          </p>
          <pre className="rounded bg-gray-50 p-2">
            {`curl ${standardUrl}`}
          </pre>
          <p>
            <strong>通过 CLI：</strong>
          </p>
          <pre className="rounded bg-gray-50 p-2">
            {`skillhub skill install ${slug}`}
          </pre>
        </div>
      </details>
    </div>
  );
}

/**
 * 移除 SKILL.md 开头的 frontmatter（已单独展示）
 */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (match) {
    return content.slice(match[0].length).trim();
  }
  return content;
}