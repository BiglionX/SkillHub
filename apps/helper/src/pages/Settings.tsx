/**
 * SkillHub Helper 设置页（v2.0.5 UX 审计修复）
 *
 * v2.0.5 关键改动（基于桌面端 UX 审计报告）：
 *   - Onboarding 不再"跳过即永久失联"：改用 dismissUntil 时间戳，7 天后引导自动重现
 *   - Onboarding 表单补 Test 按钮（与主控台一致），避免首次配 Key 盲存验证
 *   - savedTick 按 Provider 分桶，切换 Provider 不再误显"已保存"
 *   - Section 3 空状态文案去除 skillhub:// 内部协议术语
 *   - Section 4 由"关于"改为"诊断 / 故障排查"卡片（端口号、协议注册状态、日志路径）
 *
 * 主控台 4 个 section：
 *   1. LLM Key 配置（紧凑：已配/未配 → 可展开编辑）
 *   2. 本机软件（扫描 + 列表 + 上次扫描时间）
 *   3. 已安装 Skills（Web 端走 skillhub:// 唤起助手安装后累加）
 *   4. 诊断 / 故障排查（端口号、协议状态、日志路径）
 *
 * Onboarding（首次启动无 Key 或 dismissUntil 过期）：
 *   ① 填 LLM Key（M1）—— 现在可直接 Test Key 再保存
 *   ② 扫描本机软件（M2 · F9）—— 由主控台 Section 2 自动完成
 *   ③ 提示去 Web 端用 NLU 搜索 Skills —— 桌面端不负责推荐/选择
 *
 * 安装进度通过 Tauri event `install-progress` / `install-complete`
 * 在 App.tsx 顶层弹窗展示（覆盖 installSuccess / installFailure）。
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Download, Trash2 } from 'lucide-react';
import { Wrench } from 'lucide-react';
import seedSkillsData from '../../resources/seed-skills.json';

interface HelperInfo {
  version: string;
  name: string;
  helper_port?: number;
  protocol_registered?: boolean;
  /// A 轮修复 #A1：key_store 数据目录是否 fallback 到临时目录（true=数据不会持久化）
  key_store_fallback?: boolean;
  key_store_fallback_reason?: string | null;
}

type Provider = 'deepseek' | 'openai' | 'glm' | 'custom';

interface ProviderSpec {
  id: Provider;
  label: string;
  placeholder: string;
  docsUrl: string;
  defaultBaseUrl?: string;
  defaultModel: string;
}

const PROVIDERS: ProviderSpec[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'glm',
    label: '智谱 GLM',
    placeholder: 'your-zhipu-key',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
  },
  {
    id: 'custom',
    label: '自定义（自托管）',
    placeholder: 'your-key',
    docsUrl: '',
    defaultModel: '',
  },
];

type Stage = 'onboarding' | 'console' | 'error'; // A 轮 #A1：加 'error' 表示无法读取本机 Key 状态

interface TestResult {
  ok: boolean;
  model?: string;
  error?: string;
  reason?: string;
}

interface KeyStatus {
  active: string;
  providers: Record<Provider, boolean>;
}

interface ScannedSoftware {
  software_tag: string;
  display_name: string;
  path: string;
  version?: string;
  source: 'registry' | 'bundle_id' | 'common_path' | 'manual';
}

interface InstalledSkill {
  slug: string;
  name: string;
  software: string;
  installedAt: Date;
  jobId: string;
}

// v2.0.6：种子推荐摘要——仅 slug + blurb，不挂 SKILL.md 全文。
// 边界遵循 ONE_CLICK_INSTALL_DESKTOP_HELPER_PRD §5.2「助手只做执行」。
interface SeedSkillRef {
  slug: string;
  blurb: string;
}
interface SeedCatalogEntry {
  recommended: SeedSkillRef[];
}
interface SeedCatalog {
  schemaVersion: number;
  generatedAt: string;
  baseUrl: string;
  note?: string;
  [softwareTag: string]: SeedCatalogEntry | number | string | undefined;
}
const SEED_SKILLS = seedSkillsData as unknown as SeedCatalog;
const SEED_META_KEYS = new Set(['schemaVersion', 'generatedAt', 'baseUrl', 'note']);

// v2.0.5：dismissUntil 时间戳常量（7 天）
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'skillhub-helper-dismissed-until';

// A 轮 #G2：相对时间格式。把“2026/8/15 14:30:25”这类绝对时间改成
// “刚刚 / 3 分钟前 / 2 小时前 / 昨天 / 3 天前 / 2026/8/15”这种人性化格式。
// 超过 7 天才退回绝对日期；title 提供绝对时间。
function formatRelative(date: Date): { text: string; title: string } {
  const now = Date.now();
  const ts = date.getTime();
  const diff = now - ts;
  const absTitle = date.toLocaleString('zh-CN');
  if (Number.isNaN(ts)) return { text: '未知时间', title: absTitle };
  if (diff < 0) return { text: '刚刚', title: absTitle }; // 未来时间（时钟不准）走刚刚
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return { text: '刚刚', title: absTitle };
  const min = Math.floor(sec / 60);
  if (min < 60) return { text: `${min} 分钟前`, title: absTitle };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { text: `${hr} 小时前`, title: absTitle };
  const day = Math.floor(hr / 24);
  if (day === 1) return { text: '昨天', title: absTitle };
  if (day < 7) return { text: `${day} 天前`, title: absTitle };
  // 7 天以上退回绝对日期（包含年份）
  return {
    text: `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`,
    title: absTitle,
  };
}

export default function Settings({
  installedSkills,
  onUninstallSkill,
}: {
  installedSkills: InstalledSkill[];
  onUninstallSkill?: (slug: string) => void;
}) {
  const [info, setInfo] = useState<HelperInfo | null>(null);
  const [stage, setStage] = useState<Stage>('console'); // useEffect 内覆盖
  // A 轮 #A1：启动 KeyStore 错误信息
  const [loadError, setLoadError] = useState<string | null>(null);

  // ==== LLM Key ====
  const [keyExpanded, setKeyExpanded] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider>('deepseek');
  const [providerHasKey, setProviderHasKey] = useState<Record<Provider, boolean>>({
    deepseek: false,
    openai: false,
    glm: false,
    custom: false,
  });
  const [keys, setKeys] = useState<Record<Provider, string>>({
    deepseek: '',
    openai: '',
    glm: '',
    custom: '',
  });
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  // A 轮 #PR-4：startup 时拉所有 Provider 的 base_url 回填
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // v2.0.5：按 Provider 分桶，避免切换 Provider 后仍显示上一次的"已保存"
  const [savedTick, setSavedTick] = useState<Record<Provider, number>>({
    deepseek: 0,
    openai: 0,
    glm: 0,
    custom: 0,
  });
  const [openingDocs, setOpeningDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // v2.0.6：种子推荐跳转失败提示（独立维度，不受 Provider 切换影响）
  const [seedError, setSeedError] = useState<string | null>(null);

  // 验收 UX-P0-C：卸载 Skill 后弹 modal 展示 manual_steps。
  // 原 v2.0.5 用 `window.confirm` 一步吃完，前后端不约定 manual_steps 是否展示；
  // 现在明确为软卸载：modal 告知「在 X 软件里手动卸载插件」的清单 + 写明不是硬卸载。
  const [uninstallModal, setUninstallModal] = useState<{
    skill: InstalledSkill;
    manual_steps: string[];
    isError: boolean;
  } | null>(null);

  // ==== 本机软件 ====
  const [scanned, setScanned] = useState<ScannedSoftware[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanAt, setScanAt] = useState<Date | null>(null);

  // 启动时拉数据
  useEffect(() => {
    (async () => {
      try {
        const i = await invoke<HelperInfo>('get_helper_info');
        setInfo(i);
      } catch {
        /* ignore */
      }
      // A 轮 #PR-4：拉 base_url 映射 — 主要给 custom provider 在启动时回填
      try {
        const urls = await invoke<Record<string, string>>('get_all_provider_base_urls');
        setBaseUrls(urls ?? {});
        const custom = urls?.['custom'] ?? '';
        if (custom) setCustomBaseUrl(custom);
      } catch {
        /* ignore */
      }
      try {
        const status = await invoke<KeyStatus>('get_provider_keys_status');
        setActiveProvider(status.active as Provider);
        setProviderHasKey(status.providers);
        const anyHasKey = Object.values(status.providers).some(Boolean);
        // v2.0.5：改 7 天可恢复的 dismissUntil 时间戳
        // 旧版一次性 localStorage 标志→用户一旦跳过就永远失去引导回归路径
        const dismissedUntilRaw =
          typeof window !== 'undefined' ? window.localStorage.getItem(DISMISS_KEY) : null;
        const dismissedUntil = dismissedUntilRaw ? parseInt(dismissedUntilRaw, 10) : 0;
        const dismissedNow = dismissedUntil > Date.now();
        if (!anyHasKey && !dismissedNow) {
          setStage('onboarding');
        } else {
          setStage('console');
        }
      } catch (e) {
        // A 轮修复 #A1：原代码静默 `setStage('console')`，与 v2.0.5「失败不能被吞」相违背。
        // 新增 `stage='error'`：明确告知无法读取本机 Key 状态。
        setLoadError(typeof e === 'string' ? e : '未知错误');
        setStage('error');
        return; // 不再跳到 console、不进 onboarding
      }
      // 自动扫一次
      await handleScan();
    })();
    // handleScan 是 useCallback，依赖 [scanning]，稳定
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await invoke<KeyStatus>('get_provider_keys_status');
      setActiveProvider(status.active as Provider);
      setProviderHasKey(status.providers);
    } catch {
      /* ignore */
    }
  }, []);

  // 切换 Provider 时清掉上一个的测试结果 / 保存提示
  useEffect(() => {
    setTestResult(null);
    setSaveError(null);
  }, [activeProvider]);

  useEffect(() => {
    setOpeningDocs(false);
    setDocsError(null);
  }, [activeProvider]);

  // A 轮 #PR-4：切到 custom provider 时回填上次的 base_url（避免每次重输）
  useEffect(() => {
    if (activeProvider === 'custom' && baseUrls['custom']) {
      setCustomBaseUrl(baseUrls['custom']);
    }
  }, [activeProvider]);

  // 扫描本机软件
  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      const list = await invoke<ScannedSoftware[]>('trigger_software_scan');
      setScanned(list);
      setScanAt(new Date());
    } catch (e) {
      console.error('扫描失败', e);
    } finally {
      setScanning(false);
    }
  }, []);

  const currentProvider = PROVIDERS.find((p) => p.id === activeProvider) ?? PROVIDERS[0];

  const handleOpenDocs = async (url: string) => {
    setDocsError(null);
    setOpeningDocs(true);
    try {
      await openUrl(url);
    } catch {
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }
      setDocsError(
        copied
          ? `未能调起默认浏览器，链接已复制到剪贴板：${url}`
          : `未能打开链接且剪贴板不可用，请手动复制：${url}`,
      );
    } finally {
      setOpeningDocs(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<{
        ok: boolean;
        models?: string[];
        error?: string;
        message?: string;
        reason?: string;
      }>('test_provider_key', {
        provider: activeProvider,
        apiKey: keys[activeProvider],
        baseUrl:
          activeProvider === 'custom' ? customBaseUrl : currentProvider.defaultBaseUrl,
      });
      if (result.ok) {
        const model = result.models?.[0] ?? currentProvider.defaultModel;
        setTestResult({ ok: true, model });
      } else {
        const reason = result.reason ?? '';
        const raw = result.error || result.message || '';
        let hint = '请检查 Key 是否正确';
        if (reason === 'provider_error' || /401|403|invalid|unauthor/i.test(raw)) {
          hint = 'Key 不正确或已过期，请到对应平台重新生成';
        } else if (/timeout|network|fetch|connect/i.test(raw)) {
          // A 轮 #B1：细化网络错误提示，针对代理 / VPN 场景
          hint =
            '网络不通。常见原因：① 公司网络 / VPN 下需要配置 HTTP_PROXY 环境变量 ② 防火墙/代理拦截 ③ 临时离网';
        } else if (activeProvider === 'custom' && /base_url|404/i.test(raw)) {
          hint = 'Base URL 不正确，请检查服务地址';
        }
        setTestResult({
          ok: false,
          error: raw ? `${hint}（${raw.slice(0, 120)}）` : hint,
          reason,
        });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        error: `请求失败：${typeof e === 'string' ? e : '未知错误'}`,
        reason: 'exception',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const key = keys[activeProvider].trim();
    if (!key) {
      setSaveError('请先填写 Key');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await invoke('save_provider_key', { provider: activeProvider, apiKey: key });
      // A 轮 #PR-4：custom provider 时一并持久化 base_url
      if (activeProvider === 'custom' && customBaseUrl.trim()) {
        try {
          await invoke('save_provider_base_url', {
            provider: activeProvider,
            baseUrl: customBaseUrl.trim(),
          });
          setBaseUrls((prev) => ({ ...prev, [activeProvider]: customBaseUrl.trim() }));
        } catch (e) {
          // base_url 保存失败但 Key 已存——给出警告但不阻塞
          console.warn('save_provider_base_url failed', e);
        }
      }
      await invoke('set_active_provider', { provider: activeProvider });
      await refreshStatus();
      setSavedTick((prev) => ({ ...prev, [activeProvider]: prev[activeProvider] + 1 }));
      setKeyExpanded(false);
      // v2.0.5：仅清掉 dismissUntil，让已完成配 Key 的用户不再被引导骚扰
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(DISMISS_KEY);
      }
      // 如果当前在 onboarding，配完 key 后跳主控台
      if (stage === 'onboarding') {
        setStage('console');
      }
    } catch (e) {
      setSaveError(`保存失败：${typeof e === 'string' ? e : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!providerHasKey[activeProvider]) return;
    const confirmed = window.confirm(`确定要删除 ${currentProvider.label} 的 Key 吗？`);
    if (!confirmed) return;
    try {
      await invoke('delete_provider_key', { provider: activeProvider });
      await refreshStatus();
      setKeyExpanded(true);
    } catch (e) {
      setSaveError(`删除失败：${typeof e === 'string' ? e : '未知错误'}`);
    }
  };

  const handleOpenWeb = async () => {
    try {
      await openUrl('https://skillhub.proclaw.cc');
    } catch {
      try {
        await navigator.clipboard.writeText(
          `https://skillhub.proclaw.cc  (助手端口：${info?.helper_port ?? '?'})`,
        );
      } catch {
        /* ignore */
      }
    }
  };

  // 验收 UX-P0-C：卸载 Skill 后展示 manual_steps。
  // - 成功：调 `uninstall_skill` 拿 manual_steps → 弹 modal → 提示用户在目标软件内完成剩余卸载
  // - 失败：invok 抛错不走「骗用户已卸」→ 也弹 modal，告知失败原因 + 后端返回的 manual_steps 仍有指导价值
  // modal 关闭后才通知父组件从 jobs 中移除
  const handleUninstall = async (s: InstalledSkill) => {
    try {
      const result = await invoke<{
        slug: string;
        kind?: string;
        message?: string;
        manual_steps?: string[];
      }>('uninstall_skill', { slug: s.slug, skill: s });
      setUninstallModal({
        skill: s,
        manual_steps: result.manual_steps ?? [],
        isError: false,
      });
    } catch (e) {
      // invoke 报错仍弹 modal，但标记为 isError，给用户明确的失败提示
      setUninstallModal({
        skill: s,
        manual_steps: [
          `卸载指令未送达助手。可手动尝试：\n①  在 ${s.software} 中查找插件/扩展管理页并卸载\n②  删除 ~/.skillhub-helper/.data 下该 Skill 的目录\n③  重启助手`,'[错误：'+ (typeof e === 'string' ? e : '未知错误') +']',
        ],
        isError: true,
      });
    }
  };

  // v2.0.6：基于内置 seed-skills.json 构建 software_tag → 推荐列表索引。
  // 仅索引「形如 { recommended: [...] }」的业务条目，跳过顶层 schemaVersion 等元字段。
  const seedByTag = useMemo(() => {
    const m = new Map<string, SeedSkillRef[]>();
    for (const [key, val] of Object.entries(SEED_SKILLS)) {
      if (SEED_META_KEYS.has(key)) continue;
      if (val && Array.isArray((val as SeedCatalogEntry).recommended)) {
        m.set(key, (val as SeedCatalogEntry).recommended);
      }
    }
    return m;
  }, []);

  // v2.0.6：种子推荐 Skill → 跳 Web 端（不破坏 PRD §5.2「助手只做执行」）
  const handleOpenSeed = async (softwareTag: string) => {
    const base = SEED_SKILLS.baseUrl ?? 'https://skillhub.proclaw.cc';
    const url = `${base}/?installed=${encodeURIComponent(softwareTag)}`;
    setSeedError(null);
    try {
      await openUrl(url);
      return;
    } catch {
      /* fall through to clipboard fallback */
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      /* ignore */
    }
    setSeedError(
      copied
        ? `未能调起默认浏览器，链接已复制到剪贴板：${url}`
        : `未能打开链接且剪贴板不可用，请手动复制：${url}`,
    );
  };

  // ================== Onboarding 全屏引导 ==================
  // v2.0.5：保留全屏体验但允许"7 天可恢复"的暂时忽略
  if (stage === 'onboarding') {
    return (
      // v2.0.7+：Onboarding 玻璃化
      <div className="glass-canvas px-6 py-10 glass-scroll">
        <div className="mx-auto max-w-xl">
          <div className="glass-card-elevated relative">
            <div className="glass-top-bar-wide" />
            {/* v2.0.7+：Onboarding 顶部 icon 走 lucide（之前用 🔧 surrogate pair，深色玻璃对比差） */}
            <div className="mb-4 text-cyan-400">
              <Wrench size={48} strokeWidth={1.5} />
            </div>
            <h1 className="mb-2 text-2xl font-bold gradient-text-h">欢迎使用 SkillHub Helper</h1>
            <p className="text-muted mb-6 text-sm leading-relaxed">
              桌面助手负责三件事：① 转发 LLM 调用 ② 扫描你装了哪些软件 ③ 推荐并一键安装适用 Skills。
              <br />
              您的 API Key 仅 AES 加密存储在本机，<strong>不会上传到任何服务器</strong>。
            </p>
            <ol className="mb-6 space-y-3">
              <li className="flex items-start gap-3 glass-card-soft mb-0">
                <span className="glass-step-num">1</span>
                <div>
                  <div className="text-primary font-medium">填入 LLM Key</div>
                  <div className="text-muted text-xs">推荐 DeepSeek（价格低、中文强）</div>
                </div>
              </li>
              <li className="flex items-start gap-3 glass-card-soft mb-0">
                <span className="glass-step-num">2</span>
                <div>
                  <div className="text-primary font-medium">扫描本机软件</div>
                  <div className="text-muted text-xs">
                    保存 Key 后自动触发 · 检测你装了哪些 Photoshop / VSCode / Blender 等
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3 glass-card-soft mb-0">
                <span className="glass-step-num">3</span>
                <div>
                  <div className="text-primary font-medium">去 Web 端找 Skills</div>
                  <div className="text-muted mb-2 text-xs">
                    桌面端不负责推荐/选择，到 skillhub.proclaw.cc 用对话框描述需求
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenWeb()}
                    className="glow-btn-ghost px-3 py-1 text-xs"
                  >
                    打开 Web 端 →
                  </button>
                </div>
              </li>
            </ol>
            <p className="glass-hint-warning mb-4">
              <strong>职责边界</strong>：本助手仅负责①转发 LLM Key、②扫描本机软件、③上报清单、④跑安装剧本。
              推荐 &amp; 选择安装在 <strong>Web 端</strong>完成——这是设计选择，不是在桌面端做不了。
            </p>

            {/* Onboarding 阶段直接展示 Key 编辑表单，让用户一口气填完 */}
            <div className="glass-card-soft mb-4">
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={activeProvider}
                  onChange={(e) => setActiveProvider(e.target.value as Provider)}
                  className="flex-1 glass-select text-sm"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {currentProvider.docsUrl && (
                  <button
                    type="button"
                    onClick={() => handleOpenDocs(currentProvider.docsUrl)}
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    {openingDocs ? '打开中…' : '获取 Key →'}
                  </button>
                )}
              </div>
              <input
                type="password"
                placeholder={currentProvider.placeholder}
                value={keys[activeProvider]}
                onChange={(e) => setKeys({ ...keys, [activeProvider]: e.target.value })}
                className="glass-input mb-2 text-sm"
              />
              {docsError && (
                <p className="glass-hint-warning mb-2 text-xs">{docsError}</p>
              )}
              {saveError && (
                <p className="glass-hint-danger mb-2 text-xs">{saveError}</p>
              )}
              {/* v2.0.5：补 Test 反馈（与主控台一致），避免首次配 Key 盲存验证不生效 */}
              {testResult?.ok && (
                <div className="mb-2 flex items-center gap-2 text-xs text-green-700">
                  <span>✓ Key 有效</span>
                  {testResult.model && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 font-mono text-[11px]">
                      将使用 model: {testResult.model}
                    </span>
                  )}
                </div>
              )}
              {testResult && !testResult.ok && (
                <p className="glass-hint-danger mb-2 text-xs">✗ {testResult.error}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleTest}
                  disabled={!keys[activeProvider] || testing}
                  className="glow-btn-ghost w-16 shrink-0"
                >
                  {testing ? '测试中…' : 'Test'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !keys[activeProvider]}
                  className="flex-1 glow-btn-primary"
                >
                  {saving ? '保存中…' : `保存 ${currentProvider.label} Key 并开始扫描 →`}
                </button>
              </div>
            </div>

            {/* A 轮修复 #A4：dismiss 按钮层级与文案
                原：「稍后再配置（7 天内不再提醒）→」 — 括号里 7 天让人误以为是"7 天后回来"。
                文案改明确表达"7 天后再提醒"语义。同时去掉「→」避免被误读为链接，
                改成中性文本按钮，而不是接近主表单的层次。 */}
            <div className="mt-2 border-t border-gray-200 pt-4 text-center">
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(
                      DISMISS_KEY,
                      String(Date.now() + SEVEN_DAYS_MS),
                    );
                  }
                  setStage('console');
                }}
                className="text-xs text-faint hover:text-secondary focus:outline-none rounded px-2 py-1"
              >
                我稍后再配（7 天后再提醒）
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ================== 启动错误态 (A 轮 #A1) ==================
  if (stage === 'error') {
    return (
      <div className="glass-canvas px-6 py-10 glass-scroll">
        <div className="mx-auto max-w-xl">
          <div className="glass-card-elevated relative">
            <div className="glass-top-bar-wide" />
            <div className="mb-4 text-5xl">{"\u26A0\uFE0F"}</div>
            <h1 className="mb-2 text-2xl font-bold gradient-text-h">无法读取本机配置</h1>
            <p className="text-muted mb-4 text-sm leading-relaxed">
              助手启动时无法读取你的 LLM Key 配置。可能原因：数据目录无写权限、
              配置文件损坏、防病毒软件拦截。
            </p>
            <div className="glass-hint-danger mb-6 text-xs">
              <div className="mb-1 font-semibold">错误详情</div>
              <code className="break-all">{loadError ?? '未知错误'}</code>
            </div>
            <p className="text-muted mb-4 text-xs">
              预期路径：<code className="font-mono">%APPDATA%\skillhub-helper\.data\llm-keys.json</code>
            </p>
            <button
              onClick={() => window.location.reload()}
              className="glow-btn-danger w-full"
            >
              重试
            </button>
            <p className="text-muted mt-3 text-center text-xs">
              如重复出现，请尝试重启电脑 / 重新安装助手。
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ================== 主控台 ==================
  const currentLabel =
    PROVIDERS.find((p) => p.id === activeProvider)?.label ?? activeProvider;
  const configured = Object.entries(providerHasKey)
    .filter(([, v]) => v)
    .map(([k]) => PROVIDERS.find((p) => p.id === k)?.label ?? k);
  const hasKey = configured.length > 0;

  return (
    // v2.0.7+：主控台玻璃化（cyan→magenta 渐变 + backdrop-blur 卡片）
    // PR-2.1.4：移除主区域顶部冗余 header——品牌名 + 版本号已由左侧 sidebar 承担。
    // 保留 max-w-xl（576px）：sidebar 220px + 主区 576px + 内边距 ≈ 844px，
    // 在 Tauri 桌面助手默认窗口宽度（800-960px）下居中自然、不顶满右栏，
    // 表单/卡片阅读体验最佳。
    <div className="glass-canvas px-6 py-6 glass-scroll">
      <div className="mx-auto max-w-xl space-y-4">
        {/* ========== Section 1: LLM Key ========== */}
        <section className="glass-card">
          <div className="glass-top-bar" />
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={hasKey ? 'status-dot-success' : 'status-dot-neutral'}
                style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%' }}
              />
              <h2 className="text-primary text-base font-semibold">LLM Key</h2>
            </div>
            {!keyExpanded && (
              <button
                onClick={() => setKeyExpanded(true)}
                className="text-xs text-cyan-400 hover:underline"
              >
                {hasKey ? '修改' : '配置'}
              </button>
            )}
          </div>
          {!keyExpanded && hasKey && (
            <p className="text-secondary text-sm">
              已配：<span className="font-mono">{currentLabel}</span>
              {configured.length > 1 && ` · 共 ${configured.length} 个`}
            </p>
          )}
          {!keyExpanded && !hasKey && (
            <p className="text-muted text-xs">未配置 LLM Key · 推荐下方按钮立刻配置</p>
          )}

          {keyExpanded && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <select
                  value={activeProvider}
                  onChange={(e) => setActiveProvider(e.target.value as Provider)}
                  className="flex-1 glass-select text-sm"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {providerHasKey[p.id] ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                {currentProvider.docsUrl && (
                  <button
                    type="button"
                    onClick={() => handleOpenDocs(currentProvider.docsUrl)}
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    {openingDocs ? '打开中…' : '获取 Key →'}
                  </button>
                )}
              </div>

              {activeProvider === 'custom' && (
                <input
                  type="text"
                  placeholder="Base URL，如 https://your-vllm.com/v1"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  className="glass-input mb-2 text-sm"
                />
              )}

              {docsError && (
                <p className="glass-hint-warning mb-2 break-all text-xs">
                  {docsError}
                </p>
              )}

              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={currentProvider.placeholder}
                  value={keys[activeProvider]}
                  onChange={(e) => setKeys({ ...keys, [activeProvider]: e.target.value })}
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={handleTest}
                  disabled={!keys[activeProvider] || testing}
                  className="w-16 shrink-0 glow-btn-ghost"
                >
                  {testing ? '测试中…' : 'Test'}
                </button>
              </div>

              {testResult?.ok && (
                <div className="glass-hint-success mt-2 flex items-center gap-2 text-xs">
                  <span>✓ Key 有效</span>
                  {testResult.model && (
                    <span className="glass-chip">
                      将使用 model: {testResult.model}
                    </span>
                  )}
                </div>
              )}
              {testResult && !testResult.ok && (
                <div className="glass-hint-danger mt-2 text-xs">
                  ✗ {testResult.error}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || !keys[activeProvider]}
                className="glow-btn-primary mt-3 w-full"
              >
                {saving ? '保存中…' : '保存 Key'}
              </button>

              {saveError && (
                <p className="glass-hint-danger mt-2 text-xs">
                  {saveError}
                </p>
              )}
              {savedTick[activeProvider] > 0 && !saveError && (
                <p className="glass-hint-success mt-2 text-xs">✓ 已保存到本机</p>
              )}

              {providerHasKey[activeProvider] && (
                <button
                  onClick={handleDelete}
                  className="mt-3 w-full text-xs text-danger-600 hover:text-danger-700 hover:underline"
                >
                  删除 {currentProvider.label} 的 Key
                </button>
              )}

              <button
                onClick={() => setKeyExpanded(false)}
                className="mt-3 w-full text-xs text-muted hover:text-secondary"
              >
                收起
              </button>
            </>
          )}
        </section>

        {/* ========== Section 2: 本机软件 ========== */}
        <section className="glass-card">
          <div className="glass-top-bar" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-primary text-base font-semibold">本机软件</h2>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="glow-btn-ghost px-3 py-1 text-xs"
            >
              {scanning ? '扫描中…' : '重新扫描'}
            </button>
          </div>

          {scanAt && (
            // A 轮 #G2：上次扫描时间也走相对时间格式
            <p className="text-muted mb-2 text-xs" title={formatRelative(scanAt).title}>
              上次扫描：{formatRelative(scanAt).text} · 检测到 {scanned.length} 个
            </p>
          )}

          {scanned.length === 0 && !scanning && (
            <p className="text-muted text-xs">未检测到任何已配置软件（Photoshop / VSCode / Blender / Excel / PowerPoint / Figma / 飞书 / Notion）</p>
          )}

          {seedError && (
            <p className="glass-hint-warning mb-2 break-all text-xs">
              {seedError}
            </p>
          )}

          {scanned.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {scanned.map((s) => {
                const recommended = seedByTag.get(s.software_tag);
                return (
                  <li
                    key={s.software_tag}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-success-700">✓</span>
                        <span className="text-primary text-sm font-medium">{s.display_name}</span>
                      </div>
                      <p className="text-muted mt-0.5 truncate font-mono text-[11px]" title={s.path}>
                        {s.path}
                      </p>
                    </div>
                    {recommended && recommended.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenSeed(s.software_tag)}
                        className="ml-3 shrink-0 glow-btn-ghost px-2 py-1 text-xs"
                        aria-label={`查看 ${s.display_name} 的 ${recommended.length} 个推荐 Skill`}
                        title={`跳转 Web 端查看 ${s.display_name} 的推荐 Skill`}
                      >
                        查看 {recommended.length} 个推荐 Skill →
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ========== Section 3: 已安装 Skills ========== */}
        {/* 由 Web 端走 skillhub:// 唤起助手 → 跑完剧本后的产物（App.tsx 顶层维护状态，通过 prop 传入）。
            PRD §7 设计：桌面端不负责推荐，只负责安装 + 汇总。
            installProgress 走 App.tsx 顶层浮窗（覆盖任何 Tab）。 */}
        <section className="glass-card">
          <div className="glass-top-bar" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-primary text-base font-semibold">已安装 Skills</h2>
            <span className="text-xs text-faint">{installedSkills.length} 个</span>
          </div>

          {installedSkills.length === 0 && (
            <div className="text-muted text-xs leading-relaxed">
              {/* v2.0.5：移除 skillhub:// 内部协议术语，普通用户不需要知道 */}
              还没有装过 Skills。请到{' '}
              <a
                href="https://skillhub.proclaw.cc"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl('https://skillhub.proclaw.cc');
                }}
                className="text-cyan-400 hover:underline"
              >
                SkillHub Web 端
              </a>
              {' '}搜索你想做的事，挑好后点「一键安装」即可。
            </div>
          )}

          {installedSkills.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {installedSkills.slice().reverse().map((s) => (
                <li key={s.slug} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-success-700">✓</span>
                      <span className="text-primary text-sm font-medium">{s.name}</span>
                      <span className="glass-chip">
                        {s.software}
                      </span>
                    </div>
                    {/* A 轮 #G2：相对时间 + title 给绝对时间。 */}
                    <p className="text-muted mt-0.5 text-[11px]" title={formatRelative(s.installedAt).title}>
                      {formatRelative(s.installedAt).text} ·{' '}
                      <span className="font-mono">{s.slug}</span>
                    </p>
                  </div>
                  {/* 验收 UX-P0-C：卸载入口改为「先弹 modal」，不再走 window.confirm。
                      - modal 展示后端返回的 manual_steps（下一步该去哪几个软件/路径卸插件）
                      - modal 「完成」点击后才调 onUninstallSkill 从 jobs 中移除
                      原实现 ignore 了 manual_steps，仅 invoke 成功就 UI 移除，用户被骗以为已卸。 */}
                  {onUninstallSkill && (
                    <button
                      type="button"
                      onClick={() => handleUninstall(s)}
                      aria-label={`卸载 ${s.name}，查看手动卸载步骤`}
                      className="ml-2 shrink-0 glow-btn-danger px-2 py-1 text-xs"
                    >
                      卸载
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ========== Section 4: 诊断 / 故障排查 ========== */}
        {/* v2.0.5：原"关于"Section 改诊断卡片——端口号、协议状态、日志路径
            （顶部 About Tab 仍保留对外说明，本卡片专注"出了事怎么查"） */}
        <section className="glass-card">
          <div className="glass-top-bar" />
          <h2 className="text-primary mb-3 text-base font-semibold">诊断 / 故障排查</h2>
          <dl className="space-y-2 text-xs text-secondary">
            <div className="flex items-center justify-between">
              <dt className="text-muted">本机 HTTP 端口</dt>
              <dd className="font-mono">
                {info?.helper_port ?? '…'}{' '}
                {info?.helper_port && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(String(info.helper_port))}
                    className="text-cyan-400 ml-1 hover:underline"
                    title="复制端口号（Web 端探测助手时使用）"
                  >
                    复制
                  </button>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">skillhub:// 协议</dt>
              <dd>
                {info?.protocol_registered ? (
                  <span className="text-success-700">✓ 已注册</span>
                ) : (
                  <span className="text-amber-700">未注册 · Web 端可能唤不起助手</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">数据目录</dt>
              <dd className="font-mono text-[11px] text-muted">
                %APPDATA%\skillhub-helper\.data
              </dd>
            </div>
          </dl>
          <p className="text-muted mt-3 text-[11px] leading-relaxed">
            您的 API Key 永远不会上传到服务器。Web 端访问{' '}
            <button
              type="button"
              onClick={handleOpenWeb}
              className="text-cyan-400 hover:underline"
            >
              skillhub.proclaw.cc
            </button>{' '}
            即可连上本助手。
          </p>
        </section>

        {/* ========== Section 5: 用量与隐私（M4 · t11） ========== */}
        {/* M4：导出 CSV / 手动清理 / 90 天滚动开关 */}
        <section className="glass-card">
          <div className="glass-top-bar" />
          <h2 className="text-primary mb-3 text-base font-semibold">用量与隐私</h2>
          <p className="text-secondary text-[13px] leading-relaxed mb-3">
            您的调用记录仅存储在本机 SQLite
            （<code className="font-mono text-[11px]">%APPDATA%\skillhub-helper\.data\usage.db</code>
            ），不会自动上传云端。
          </p>
          <UsagePrivacyControls />
        </section>

        {/* 验收 UX-P0-C：卸载 modal。展示后端返回的 manual_steps + 区分 error / success。
            - 成功（isError=false）：标题「请完成 X 的手动卸载」，说明桌面助手只负责发卸载指令，
              真正卸载得用户在目标软件里点一下。点击「已完成手动卸载」才调 onUninstallSkill 从 jobs 中移除。
            - 失败（isError=true）：invok 报错，告知用户失败原因 + 兜底的手动步骤。点遮罩关闭。
            - z-index=1100 比 InstallJobToast(1000) 高，避免被 toast 盖住。
            - 点遮罩 = 关闭（视为「我再想想」），不调 onUninstallSkill。 */}
        {uninstallModal && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="uninstall-modal-title"
            aria-describedby="uninstall-modal-desc"
            onClick={() => setUninstallModal(null)}
            className="glass-modal-backdrop"
          >
            <div onClick={(e) => e.stopPropagation()} className="glass-modal relative">
              <div className="glass-top-bar-wide" />
              <h2
                id="uninstall-modal-title"
                className={uninstallModal.isError ? 'text-danger-700' : 'glass-modal-title'}
              >
                {uninstallModal.isError
                  ? `卸载 ${uninstallModal.skill.name} 未完成`
                  : `请完成 ${uninstallModal.skill.name} 的手动卸载`}
              </h2>
              <p
                id="uninstall-modal-desc"
                className="text-secondary my-3 text-[13px] leading-relaxed"
              >
                {uninstallModal.isError
                  ? '桌面助手没有收到卸载指令。请按下方步骤手动卸载，或稍后重试：'
                  : '桌面助手已记录卸载请求。由于不同软件卸载方式不同，请在对应软件里完成最后一步：'}
              </p>
              {uninstallModal.manual_steps.length > 0 && (
                <ol
                  className={
                    uninstallModal.isError
                      ? 'glass-hint-danger m-0 text-[13px] leading-relaxed'
                      : 'glass-card-soft m-0 text-[13px] leading-relaxed'
                  }
                >
                  {uninstallModal.manual_steps.map((step, idx) => (
                    <li key={idx} style={{ whiteSpace: 'pre-wrap' }}>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUninstallModal(null)}
                  className="glow-btn-ghost"
                >
                  我再想想
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // 关键：必须 modal 关闭时才调 onUninstallSkill，
                    // 不能在 handleUninstall 里就调，否则用户在 modal 里看到 manual_steps 之前
                    // 已装列表就已移除，会被骗以为「已经卸了」。
                    onUninstallSkill?.(uninstallModal.skill.slug);
                    setUninstallModal(null);
                  }}
                  className={uninstallModal.isError ? 'glow-btn-danger' : 'glow-btn-primary'}
                >
                  {uninstallModal.isError ? '知道了' : '已完成手动卸载'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * UsagePrivacyControls — M4 · t11「用量与隐私」分区子组件
 *
 * 提供三个操作：
 * 1. 导出 CSV（export_usage_csv invoke）
 * 2. 手动清理（prune_local_usage invoke，默认 90 天）
 * 3. 90 天滚动开关（仅 UI 状态，M4 默认开）
 */
function UsagePrivacyControls() {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);
  const [pruneMsg, setPruneMsg] = useState<string | null>(null);
  const [rolling90, setRolling90] = useState(true);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const path = `~/Downloads/skillhub-usage-${Date.now()}.csv`;
      const n = await invoke<number>('export_usage_csv', { path });
      setExportMsg(`已导出 ${n} 条记录到 ${path}`);
    } catch (e) {
      setExportMsg(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const handlePrune = async () => {
    if (pruning) return;
    if (!confirm('确定清理 90 天前的本地用量记录？此操作不可撤销。')) return;
    setPruning(true);
    setPruneMsg(null);
    try {
      const n = await invoke<number>('prune_local_usage', { days: 90 });
      setPruneMsg(`已清理 ${n} 条过期记录`);
    } catch (e) {
      setPruneMsg(`清理失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPruning(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="glow-btn-ghost text-[12px]"
        >
          <Download size={12} aria-hidden />
          {exporting ? '导出中…' : '导出 CSV'}
        </button>
        <button
          type="button"
          onClick={() => void handlePrune()}
          disabled={pruning}
          className="glow-btn-ghost text-[12px]"
        >
          <Trash2 size={12} aria-hidden />
          {pruning ? '清理中…' : '手动清理 90 天前'}
        </button>
        <label className="flex items-center gap-2 text-[12px] text-secondary ml-auto">
          <input
            type="checkbox"
            checked={rolling90}
            onChange={(e) => setRolling90(e.target.checked)}
            aria-label="90 天滚动清理"
          />
          启动时自动清理 90 天前
        </label>
      </div>
      {exportMsg && (
        <div className="text-[11px] text-muted">{exportMsg}</div>
      )}
      {pruneMsg && (
        <div className="text-[11px] text-muted">{pruneMsg}</div>
      )}
      <p className="text-[11px] text-muted leading-relaxed">
        助手上不会同步任何记录到云端，除非您主动点击「同步到云端」。
        CSV 文件含 UTF-8 BOM，Excel 可直接打开。
      </p>
    </div>
  );
}
