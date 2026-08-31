/**
 * SkillHub Helper 设置页（v2.0.4 重构：主控台 + Onboarding）
 *
 * 主控台 3 个 section：
 *   1. LLM Key 配置（紧凑：已配/未配 → 可展开编辑）
 *   2. 本机软件（扫描 + 列表 + 上次扫描时间）
 *   3. 已安装 Skills（Web 端走 skillhub:// 唤起助手安装后累加）
 *
 * Onboarding（首次启动无 Key）：
 *   ① 填 LLM Key（M1）
 *   ② 扫描本机软件（M2 · F9）
 *   ③ 提示去 Web 端用 NLU 搜索 Skills —— 桌面端不负责推荐/选择（M1+M2）
 *
 * 安装进度通过 Tauri event `install-progress` / `install-complete`
 * 在 App.tsx 顶层弹窗展示。
 */
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

interface HelperInfo {
  version: string;
  name: string;
  helper_port?: number;
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

type Stage = 'onboarding' | 'console';

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

export default function Settings({ installedSkills }: { installedSkills: InstalledSkill[] }) {
  const [info, setInfo] = useState<HelperInfo | null>(null);
  const [stage, setStage] = useState<Stage>('console'); // useEffect 内覆盖

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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [openingDocs, setOpeningDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // ==== 本机软件 ====
  const [scanned, setScanned] = useState<ScannedSoftware[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanAt, setScanAt] = useState<Date | null>(null);

  // ==== 已安装 Skills（从 install-complete 事件累加，由 App.tsx 通过 prop 传入） ====
  // props.installedSkills 已是最终值

  // ==== 全局 install 进度（Web 端走 skillhub:// 唤起助手后，助手跑剧本） ====
  // 由 App.tsx 顶层维护 + 渲染全局浮窗；本组件不再监听

  // 启动时拉数据
  useEffect(() => {
    (async () => {
      try {
        const i = await invoke<HelperInfo>('get_helper_info');
        setInfo(i);
      } catch {
        /* ignore */
      }
      try {
        const status = await invoke<KeyStatus>('get_provider_keys_status');
        setActiveProvider(status.active as Provider);
        setProviderHasKey(status.providers);
        const anyHasKey = Object.values(status.providers).some(Boolean);
        const onboarded =
          typeof window !== 'undefined' &&
          window.localStorage.getItem('skillhub-helper-onboarded') === '1';
        if (!anyHasKey && !onboarded) {
          setStage('onboarding');
        } else {
          setStage('console');
        }
      } catch {
        setStage('console');
      }
      // 自动扫一次
      await handleScan();
    })();
    // handleScan 是 useCallback，依赖 [scanning]，稳定
  }, []);

  // 监听 install-progress / install-complete —— 已上提到 App.tsx（全局覆盖任何 Tab）

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

  // 一键安装 Skill（触发 install-progress 事件）—— 仅 Web 端走 skillhub:// 唤起时调
  // 注意：实际监听和状态维护已在 App.tsx 顶层完成。Settings 里不再做。

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
          hint = '网络不通，请检查代理 / 防火墙';
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
      await invoke('set_active_provider', { provider: activeProvider });
      await refreshStatus();
      setSavedTick((n) => n + 1);
      setKeyExpanded(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('skillhub-helper-onboarded', '1');
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

  // ================== Onboarding 全屏引导（4 步） ==================
  if (stage === 'onboarding') {
    return (
      <div className="min-h-screen bg-blue-50 px-6 py-10">
        <div className="mx-auto max-w-xl">
          <div className="rounded-xl border border-blue-200 bg-white p-8 shadow-sm">
            {/* surrogate pair: U+1F6E0 = 🔧 */}
            <div className="mb-4 text-5xl">{"\uD83D\uDEE0"}</div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">欢迎使用 SkillHub Helper</h1>
            <p className="mb-6 text-sm leading-relaxed text-gray-600">
              桌面助手负责三件事：① 转发 LLM 调用 ② 扫描你装了哪些软件 ③ 推荐并一键安装适用 Skills。
              <br />
              您的 API Key 仅 AES 加密存储在本机，<strong>不会上传到任何服务器</strong>。
            </p>
            <ol className="mb-6 space-y-3">
              <li className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">1</span>
                <div>
                  <div className="font-medium text-gray-900">填入 LLM Key</div>
                  <div className="text-xs text-gray-500">推荐 DeepSeek（价格低、中文强）</div>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">2</span>
                <div>
                  <div className="font-medium text-gray-900">扫描本机软件</div>
                  <div className="text-xs text-gray-500">检测你装了 Photoshop / VSCode / Blender 等</div>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">3</span>
                <div>
                  <div className="font-medium text-gray-900">去 Web 端找 Skills</div>
                  <div className="text-xs text-gray-500">桌面端不负责推荐/选择，到 skillhub.proclaw.cc 用对话框描述需求</div>
                </div>
              </li>
            </ol>
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>职责边界</strong>：本助手仅负责①转发 LLM Key、②扫描本机软件、③上报清单、④跑安装剧本。
              推荐 &amp; 选择安装在 <strong>Web 端</strong>完成——这是设计选择，不是在桌面端做不了。
            </p>

            {/* Onboarding 阶段直接展示 Key 编辑表单，让用户一口气填完 */}
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={activeProvider}
                  onChange={(e) => setActiveProvider(e.target.value as Provider)}
                  className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
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
                    className="text-xs text-blue-600 hover:underline"
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
                className="mb-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              {docsError && (
                <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  {docsError}
                </p>
              )}
              {saveError && (
                <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                  {saveError}
                </p>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !keys[activeProvider]}
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中…' : `保存 ${currentProvider.label} Key 并开始扫描 →`}
              </button>
            </div>

            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('skillhub-helper-onboarded', '1');
                }
                setStage('console');
              }}
              className="w-full text-xs text-gray-500 hover:text-gray-700"
            >
              稍后再配置 →
            </button>
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
    <div className="min-h-screen bg-gray-50 px-6 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <header>
          <h1 className="text-xl font-semibold text-gray-900">SkillHub Helper</h1>
          <p className="mt-1 text-xs text-gray-500">
            桌面助手配置 · 版本 {info?.version || '...'}
          </p>
        </header>

        {/* ========== Section 1: LLM Key ========== */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: hasKey ? '#16a34a' : '#d1d5db',
                }}
              />
              <h2 className="text-base font-semibold text-gray-900">LLM Key</h2>
            </div>
            {!keyExpanded && (
              <button
                onClick={() => setKeyExpanded(true)}
                className="text-xs text-blue-600 hover:underline"
              >
                {hasKey ? '修改' : '配置'}
              </button>
            )}
          </div>
          {!keyExpanded && hasKey && (
            <p className="text-sm text-gray-700">
              已配：<span className="font-mono">{currentLabel}</span>
              {configured.length > 1 && ` · 共 ${configured.length} 个`}
            </p>
          )}
          {!keyExpanded && !hasKey && (
            <p className="text-xs text-gray-500">未配置 LLM Key · 推荐下方按钮立刻配置</p>
          )}

          {keyExpanded && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <select
                  value={activeProvider}
                  onChange={(e) => setActiveProvider(e.target.value as Provider)}
                  className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
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
                    className="text-xs text-blue-600 hover:underline"
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
                  className="mb-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              )}

              {docsError && (
                <p className="mb-2 break-all rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
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
                  className="w-16 shrink-0 rounded bg-gray-100 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  {testing ? '测试中...' : 'Test'}
                </button>
              </div>

              {testResult?.ok && (
                <div className="mt-2 flex items-center gap-2 text-xs text-green-700">
                  <span>✓ Key 有效</span>
                  {testResult.model && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 font-mono text-[11px]">
                      将使用 model: {testResult.model}
                    </span>
                  )}
                </div>
              )}
              {testResult && !testResult.ok && (
                <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                  ✗ {testResult.error}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || !keys[activeProvider]}
                className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存 Key'}
              </button>

              {saveError && (
                <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                  {saveError}
                </p>
              )}
              {savedTick > 0 && !saveError && (
                <p className="mt-2 text-xs text-green-700">✓ 已保存到本机</p>
              )}

              {providerHasKey[activeProvider] && (
                <button
                  onClick={handleDelete}
                  className="mt-3 w-full text-xs text-gray-500 hover:text-red-600 hover:underline"
                >
                  删除 {currentProvider.label} 的 Key
                </button>
              )}

              <button
                onClick={() => setKeyExpanded(false)}
                className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700"
              >
                收起
              </button>
            </>
          )}
        </section>

        {/* ========== Section 2: 本机软件 ========== */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">本机软件</h2>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {scanning ? '扫描中…' : '重新扫描'}
            </button>
          </div>

          {scanAt && (
            <p className="mb-2 text-xs text-gray-500">
              上次扫描：{scanAt.toLocaleTimeString('zh-CN')} · 检测到 {scanned.length} 个
            </p>
          )}

          {scanned.length === 0 && !scanning && (
            <p className="text-xs text-gray-500">未检测到任何已配置软件（Photoshop / VSCode / Blender / Excel / PowerPoint / Figma / 飞书 / Notion）</p>
          )}

          {scanned.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {scanned.map((s) => (
                <li key={s.software_tag} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">✓</span>
                      <span className="text-sm font-medium text-gray-900">{s.display_name}</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500" title={s.path}>
                      {s.path}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ========== Section 3: 已安装 Skills ========== */}
        {/* 由 Web 端走 skillhub:// 唤起助手 → 跑完剧本后的产物（App.tsx 顶层维护状态，通过 prop 传入）。
            PRD §7 设计：桌面端不负责推荐，只负责安装 + 汇总。
            installProgress 走 App.tsx 顶层浮窗（覆盖任何 Tab）。 */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">已安装 Skills</h2>
            <span className="text-xs text-gray-400">{installedSkills.length} 个</span>
          </div>

          {installedSkills.length === 0 && (
            <div className="text-xs leading-relaxed text-gray-500">
              还没有装过 Skills。请打开{' '}
              <a
                href="https://skillhub.proclaw.cc"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl('https://skillhub.proclaw.cc');
                }}
                className="text-blue-600 hover:underline"
              >
                SkillHub Web 端
              </a>
              ，在顶部搜索框或首页对话框里输入需求，选好 Skill 后点“一键安装”，
              Web 端会通过 <code className="font-mono">skillhub://</code> 协议自动唤起本助手执行剧本。
            </div>
          )}

          {installedSkills.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {installedSkills.slice().reverse().map((s) => (
                <li key={s.jobId} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">✓</span>
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                        {s.software}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {s.installedAt.toLocaleString('zh-CN')} ·{' '}
                      <span className="font-mono">{s.slug}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ========== Section 4: 关于 ========== */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-base font-semibold text-gray-900">关于</h2>
          <p className="text-xs leading-relaxed text-gray-500">
            本助手是 <strong>执行载体</strong>，不负责浏览/推荐 Skills——那些都在{' '}
            <a
              href="https://skillhub.proclaw.cc"
              onClick={(e) => {
                e.preventDefault();
                openUrl('https://skillhub.proclaw.cc');
              }}
              className="text-blue-600 hover:underline"
            >
              SkillHub Web 端
            </a>
            。本助手仅负责：转发 LLM 调用、扫描本机软件、上报清单用于反向推送、执行 Web 端发起的安装剧本。
            您的 API Key 永远不会上传到服务器。
            Web 端访问{' '}
            <button
              type="button"
              onClick={handleOpenWeb}
              className="text-blue-600 hover:underline"
            >
              https://skillhub.proclaw.cc
            </button>{' '}
            即可连上本助手。
          </p>
        </section>
      </div>
    </div>
  );
}
