'use client';

import { useEffect, useState } from 'react';
import { llmGateway } from '@/lib/services/LlmGateway';

/**
 * Onboarding 引导组件
 * 检测助手状态，首次访问时引导「装助手 + 填 Key」
 *
 * 触发条件：
 *   - 用户首次访问（localStorage 标记）
 *   - 助手未运行 或 助手未配 Key
 *   - 当前页面有 C 类交互需求（如使用了 ChatIntentInput）
 */
export default function OnboardingHelperPrompt() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // 已关闭过就不弹
    if (localStorage.getItem('helper-onboarding-dismissed') === '1') return;

    // 探测助手
    llmGateway
      .probeHelper()
      .then((status) => {
        if (!status.online || !status.hasKey) {
          setShow(true);
          setDismissed(false);
        }
      })
      .catch(() => {
        setShow(true);
        setDismissed(false);
      });
  }, []);

  const dismiss = () => {
    localStorage.setItem('helper-onboarding-dismissed', '1');
    setDismissed(true);
    setShow(false);
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-blue-200 bg-white p-5 shadow-2xl dark:border-blue-800/40 dark:bg-slate-900">
      <button
        onClick={dismiss}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
        aria-label="关闭"
      >
        ✕
      </button>
      <div className="mb-3 text-3xl">🛠️</div>
      <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">
        想用 AI 生成内容？
      </h3>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        下载 SkillHub 桌面助手（2MB），
        填上您自己的 LLM Key，就能直接生成文案、纪要、PPT。
        整个过程您的数据不上云。
      </p>
      <div className="flex gap-2">
        <a
          href="/helper/download"
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          下载助手（Win/Mac）
        </a>
        <button
          onClick={dismiss}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          稍后
        </button>
      </div>
    </div>
  );
}