/**
 * NluSearchBox — Home Tab 主输入组件（M4 · t07）
 *
 * 设计：
 * - 受控输入 + 400ms 防抖（避免每个字符都触发 LLM）
 * - Enter 立即提交（不防抖）
 * - 调 `LlmGateway.chat({ skillSlug?, anonymousId?, clientRecordId? })`
 * - 成功后调 invoke('record_usage', rec) 写 SQLite（M4 · t04 双保险）
 * - 结果用 `onResult(parsed, raw)` 回调给 Home.tsx 渲染
 *
 * UX：
 * - 玻璃化 textarea（与 Settings 同源风格）
 * - 顶部 Skill 标签按钮（命中后置高）
 * - 提交中禁用按钮 + 转圈
 * - 错误 inline 显示，不弹窗
 */

import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search } from 'lucide-react';
import { llmGateway, type LlmChatOk } from '../lib/LlmGateway';

export interface Skill {
  slug: string;
  name: string;
  blurb?: string;
}

export interface NluSearchBoxProps {
  detectedSoftware: string[];
  /// 推荐 Skill 候选（点一下就把 slug 填进去）
  skills: Skill[];
  /// 默认 System Prompt：可由 Settings 里改（M4 不做 UI，仅接 prop）
  systemPrompt: string;
  /// LLM 调通后回调
  onResult: (ok: LlmChatOk, userMessage: string) => void;
}

const DEBOUNCE_MS = 400;

export default function NluSearchBox({
  detectedSoftware,
  skills,
  systemPrompt,
  onResult,
}: NluSearchBoxProps) {
  const [value, setValue] = useState('');
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 自动聚焦
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const runChat = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await llmGateway.chat({
      systemPrompt,
      userMessage: text,
      jsonMode: true,
      detectedSoftware,
      skillSlug: activeSkill ?? undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // 双保险：客户端再写一条 record_usage（Rust 端已经在 /llm/chat 里写过一条，
    // 这里通过 clientRecordId 幂等去重不会产生重复）
    try {
      await invoke('record_usage', {
        rec: {
          client_record_id: result.recordId,
          created_at_ms: Date.now(),
          skill_slug: activeSkill ?? 'general',
          provider_id: 'unknown', // /llm/chat 响应里没回 provider，前端不重复记账
          model: 'unknown',
          tokens_in: result.tokensIn ?? 0,
          tokens_out: result.tokensOut ?? 0,
          duration_ms: result.durationMs ?? 0,
          cost_estimate: null,
          source: 'LOCAL_DESKTOP',
          session_kind: 'user',
          session_id: null,
        },
      });
    } catch {
      /* 记账失败不影响主流程 */
    }
    onResult(result, text);
  };

  // 400ms 防抖自动提交（仅对长文本）
  useEffect(() => {
    if (!value.trim()) return;
    const t = setTimeout(() => {
      if (value.trim().length >= 6) {
        void runChat(value);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="glass-card p-5">
      <div className="glass-top-bar" />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Search size={16} aria-hidden className="text-cyan-300" />
        <span className="text-[13px] font-semibold gradient-text-h">
          问问 SkillHub
        </span>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {skills.slice(0, 6).map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => {
                  setActiveSkill(activeSkill === s.slug ? null : s.slug);
                  textareaRef.current?.focus();
                }}
                className={
                  activeSkill === s.slug
                    ? 'glass-pill glass-pill-cyan text-[11px]'
                    : 'glass-pill glass-pill-neutral text-[11px]'
                }
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
            e.preventDefault();
            void runChat(value);
          }
        }}
        rows={4}
        placeholder="例如：把这段视频压成适合微信发的小文件 / 给这段文案配 3 张配图思路"
        aria-label="NLU 输入框"
        className="w-full glass-input resize-y text-[13px]"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted">
          {activeSkill
            ? `将调用 Skill：${activeSkill}`
            : '未绑定 Skill，按通用意图解析'}
        </span>
        <button
          type="button"
          onClick={() => void runChat(value)}
          disabled={!value.trim() || busy}
          className="glow-btn-primary text-[12px]"
        >
          {busy ? '解析中…' : '发送（Enter）'}
        </button>
      </div>
      {error && (
        <div role="alert" className="glass-hint-danger mt-3 text-[11px]">
          {error}
        </div>
      )}
    </div>
  );
}
