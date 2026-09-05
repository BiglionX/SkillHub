/**
 * NluSearchBox — Home Tab 主输入组件（M4 · t07）
 *
 * v2.0.7+ 重构布局：
 * - 顶部「热门软件」下拉选择框 + 可输入（用 <datalist> 实现）
 * - 下面是需求说明 textarea（占位符改为「请输入你想实现的功能…」）
 * - 发送按钮放进 textarea 内部右下角
 * - 删除 Skill 胶囊与「问问 SkillHub」标题
 *
 * 设计：
 * - 受控输入 + 400ms 防抖（避免每个字符都触发 LLM）
 * - Enter 立即提交（不防抖）
 * - 调 `LlmGateway.chat({ skillSlug?, anonymousId?, clientRecordId? })`
 * - 成功后调 invoke('record_usage', rec) 写 SQLite（M4 · t04 双保险）
 * - 结果用 `onResult(parsed, raw)` 回调给 Home.tsx 渲染
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { llmGateway, type LlmChatOk } from '../lib/LlmGateway';

export interface Skill {
  slug: string;
  name: string;
  blurb?: string;
}

/// v2.0.7+：与 seed-skills.json 顶层字段一一对应，热门软件下拉选项
const HOT_SOFTWARES: { value: string; label: string }[] = [
  { value: 'photoshop', label: 'Photoshop' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'blender', label: 'Blender' },
  { value: 'excel', label: 'Excel' },
  { value: 'powerpoint', label: 'PowerPoint' },
  { value: 'figma', label: 'Figma' },
  { value: 'feishu', label: '飞书' },
  { value: 'notion', label: 'Notion' },
  { value: 'word', label: 'Word' },
  { value: 'webstorm', label: 'WebStorm' },
  { value: 'intellij', label: 'IntelliJ IDEA' },
  { value: 'pycharm', label: 'PyCharm' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'chrome', label: 'Chrome' },
];

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
  systemPrompt,
  onResult,
}: NluSearchBoxProps) {
  const [software, setSoftware] = useState<string>('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 自动聚焦
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // v2.0.7+：用户选的软件 → 注入到 detectedSoftware 一起传给 LLM
  const mergedDetected = useMemo(() => {
    const set = new Set(detectedSoftware);
    if (software.trim()) set.add(software.trim().toLowerCase());
    return Array.from(set);
  }, [detectedSoftware, software]);

  const runChat = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await llmGateway.chat({
      systemPrompt,
      userMessage: text,
      jsonMode: true,
      detectedSoftware: mergedDetected,
      skillSlug: software.trim() ? software.trim().toLowerCase() : undefined,
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
          skill_slug: software.trim() ? software.trim().toLowerCase() : 'general',
          provider_id: 'unknown',
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
      {/* v2.0.7+：顶部热门软件下拉选择框（可输入）。用 <datalist> 实现：
          · 点击触发原生下拉选项
          · 用户可直接输入软件名（包括列表外）
          · 不再是「问问 SkillHub」标题 + Skill 胶囊
      */}
      <div className="mb-3">
        <input
          list="hot-software-list"
          value={software}
          onChange={(e) => setSoftware(e.target.value)}
          placeholder="热门软件（可选，如 Photoshop / Excel）"
          aria-label="热门软件"
          className="w-full glass-input text-[13px]"
          style={{ height: 36 }}
        />
        <datalist id="hot-software-list">
          {HOT_SOFTWARES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </datalist>
      </div>
      {/* 需求说明框 + 内部右下角发送按钮 */}
      <div style={{ position: 'relative' }}>
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
          placeholder="请输入你想实现的功能，搜一搜看看有没有能实现的 Skills"
          aria-label="需求说明"
          className="w-full glass-input text-[13px]"
          style={{ paddingRight: 96, paddingBottom: 44 }}
        />
        <button
          type="button"
          onClick={() => void runChat(value)}
          disabled={!value.trim() || busy}
          className="glow-btn-primary text-[12px]"
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            height: 32,
            padding: '0 14px',
          }}
        >
          {busy ? '搜一搜中…' : '搜一搜'}
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