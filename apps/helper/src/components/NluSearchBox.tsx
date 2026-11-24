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
import { openUrl } from '@tauri-apps/plugin-opener';
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
  /// M5 §6.2：游客用满次数时引导用户去 Settings Tab 配 Key 用。
  onNavigateSettings?: () => void;
}

const DEBOUNCE_MS = 400;

/**
 * F22 修复：从云端 ProviderPricing 接口拉单价，本地缓存 1 小时（同 ProviderPriceBadge）。
 * 拿到 active provider 的 input/output 单价后算 cost，回传给 Rust。
 * 调用者：runChat 成功后 fire-and-forget（不阻塞主流程）。
 */
const PRICING_API_BASE =
  (typeof window !== 'undefined' &&
    (window as unknown as { __SKILLHUB_API_BASE__?: string }).__SKILLHUB_API_BASE__) ||
  'https://skillhub.proclaw.cc';

let pricingCache: { payload: Record<string, { inputPrice: number; outputPrice: number }>; fetchedAt: number } | null = null;
const PRICING_CACHE_TTL = 60 * 60 * 1000;

interface ActiveProviderInfo {
  id: string;
  model: string;
}

const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  glm: 'glm-4-flash',
  custom: '',
};

async function fetchActiveProvider(): Promise<ActiveProviderInfo | null> {
  try {
    const status = await invoke<{ active: string }>('get_provider_keys_status');
    const id = status.active || 'deepseek';
    return { id, model: PROVIDER_DEFAULT_MODEL[id] ?? '' };
  } catch {
    return null;
  }
}

async function getPricingMap(): Promise<Record<string, { inputPrice: number; outputPrice: number }> | null> {
  if (pricingCache && Date.now() - pricingCache.fetchedAt < PRICING_CACHE_TTL) {
    return pricingCache.payload;
  }
  try {
    const resp = await fetch(`${PRICING_API_BASE}/api/v2/provider-pricing`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { prices: Record<string, { inputPrice: number; outputPrice: number }> };
    pricingCache = { payload: data.prices ?? {}, fetchedAt: Date.now() };
    return pricingCache.payload;
  } catch {
    return null;
  }
}

async function updateCostInBackground(recordId: string, tokensIn: number, tokensOut: number) {
  const provider = await fetchActiveProvider();
  if (!provider || !provider.model) return;
  const pricing = await getPricingMap();
  if (!pricing) return;
  const entry = pricing[`${provider.id}:${provider.model}`];
  if (!entry) return;
  // ProviderPricing 单价是 per 1M tokens；tokensIn/Out 是绝对值
  const cost =
    (tokensIn / 1_000_000) * entry.inputPrice + (tokensOut / 1_000_000) * entry.outputPrice;
  try {
    await invoke('update_usage_cost', { clientRecordId: recordId, cost });
  } catch {
    /* 回填失败不影响主流程 */
  }
}

export default function NluSearchBox({
  detectedSoftware,
  systemPrompt,
  onResult,
  onNavigateSettings,
}: NluSearchBoxProps) {
  const [software, setSoftware] = useState<string>('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // M5 §6.2：记录错误的 reason，让 error 区域能为 guest_over_limit 显示 CTA。
  const [errorKind, setErrorKind] = useState<
    | 'guest_over_limit'
    | 'helper_no_key'
    | 'provider_error'
    | 'helper_unreachable'
    | 'helper_timeout'
    | 'helper_no_port'
    | 'invalid_input'
    | 'unknown'
    | null
  >(null);
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
    // H1 修复：助手尚未注入端口时（启动首屏）禁止跑 chat，避免 race 时 400ms 后
    // 自动提交一个必然失败的请求，错误消息挂屏上。
    const port = (window as unknown as { __SKILLHUB_HELPER_PORT__?: number })
      .__SKILLHUB_HELPER_PORT__;
    if (typeof port !== 'number') {
      setError('助手正在启动，请稍候…');
      setErrorKind('helper_no_port');
      return;
    }
    setBusy(true);
    setError(null);
    setErrorKind(null);
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
      setErrorKind(result.reason);
      return;
    }
    // L5 修复：Rust 端 /llm/chat 内部已 record 一条完整记录（provider/model 都对）。
    // 前端再调 record_usage 会用 provider='unknown' / model='unknown' 试图 INSERT OR IGNORE
    // —— IGNORE 命中不会更新 cost 字段，但**两次 invoke 浪费时间**且代码误导。
    // 已删除二次 record_usage 调用。

    // F22 修复：按 ProviderPricing 单价算 cost，回传给 Rust 更新 SQLite。
    // Rust 端 cost 字段之前永远是 None（前端没回填）→ 用量看板"成本"卡永远是 ¥0。
    // 用 ProviderPriceBadge 的 fetch 缓存避免重复请求。
    if (result.recordId && result.tokensIn != null && result.tokensOut != null) {
      void updateCostInBackground(result.recordId, result.tokensIn, result.tokensOut);
    }
    onResult(result, text);
  };

  // 400ms 防抖自动提交（仅对长文本）。
  // M1 修复：去掉 eslint-disable；runChat 是当前组件作用域的稳定函数，
  // 把 mergedDetected 与 software 作为 deps，保证切换「热门软件」后下一次提交会带上新值。
  useEffect(() => {
    if (!value.trim()) return;
    const t = setTimeout(() => {
      if (value.trim().length >= 6) {
        void runChat(value);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, software, mergedDetected]);

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
          {/* M5 §6.2：游客用满 50 次/天后给两个 CTA：去 Web 端绑定账号 / 去设置配 Key */}
          {errorKind === 'guest_over_limit' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="glow-btn-ghost text-[11px]"
                onClick={() => void openUrl('https://skillhub.proclaw.cc/auth/bind-guest')}
              >
                绑定 Web 账号解锁 →
              </button>
              <button
                type="button"
                className="glow-btn-ghost text-[11px]"
                onClick={() => onNavigateSettings?.()}
              >
                配 API Key 解锁 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}