import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Settings from './pages/Settings';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { StatusBadge, ToastCard } from './components/StatusBadge';
import { COLORS } from './tokens';

type Tab = 'settings' | 'about';

interface HelperInfo {
  version: string;
  name: string;
  helper_port?: number;
  protocol_registered?: boolean;
  /// A 轮修复 #A1：key_store 数据目录是否 fallback 到临时目录
  key_store_fallback?: boolean;
  key_store_fallback_reason?: string | null;
}

/// A 轮 #P1-22：Web 端 OIDC session 快照，有 token 时表示已绑定具体用户。
interface SessionInfo {
  has_token: boolean;
  user_id?: string | null;
  user_email?: string | null;
  bound_at?: number | null;
}

interface KeyStatus {
  active: string;
  providers: Record<string, boolean>;
}

interface InstallProgress {
  job_id: string;
  step: number;
  total_steps: number;
  elapsed_ms: number;
  event?: { kind?: string; message?: string };
}

interface InstallComplete {
  job_id: string;
  result: 'success' | 'failed';
  error?: string | null;
  message?: string;
  /// A 轮 #Q2：CTA 字段（lib.rs 已在 payload 中发出但 v2.0.5 前端未消费）
  cta?: { label?: string; action?: string } | null;
}

interface InstalledSkill {
  slug: string;
  name: string;
  software: string;
  version?: string;
  installedAt: Date;
  jobId: string;
}

// v2.0.5：失败态独立 state
interface InstallFailure {
  jobId: string;
  skillName: string;
  error: string;
}

// A 轮 #A3：单数 installProgress / installFailure 重构为按 jobId 的状态机。
// 同一时刻可有多任务并发；UI 按完成时间倒序堆叠展示。
type JobPhase = 'running' | 'failed' | 'succeeded';

interface InstallJob {
  jobId: string;
  slug: string;
  name: string;
  software: string;
  version?: string;
  phase: JobPhase;
  progress?: InstallProgress;
  failure?: InstallFailure;
  completed?: InstalledSkill;
  cta?: { label?: string; action?: string } | null;
  notifiedAt?: number;
}

const PERSIST_KEY = 'skillhub-helper-installed-skills';
const PERSIST_SCHEMA_VERSION = 1;
const MAX_INSTALLED_AGE_MS = 365 * 24 * 60 * 60 * 1000; // A 轮 #B4：超过 365 天的已装记录视为过期

/**
 * A 轮 #B4：解析持久化的已装 Skills。
 * 验证：
 * - JSON 可解析
 * - schemaVersion 匹配（未来 schema 变化时可加 migration）
 * - 每条记录有 slug / name / software / jobId 等必填字段
 * - installedAt 是有效 Date 且不早于 365 天前
 *   失效 / 过期的项会被丢弃、会在 console.warn 报告。
 */
function parseInstalledSkills(raw: string | null): InstalledSkill[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('[B4] persisted installed skills JSON 损坏，已丢弃', e);
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as { schemaVersion?: unknown; items?: unknown };
  if (obj.schemaVersion !== PERSIST_SCHEMA_VERSION) {
    console.warn(
      `[B4] persisted installed skills schema 版本不匹配（期望 ${PERSIST_SCHEMA_VERSION}，实得 ${obj.schemaVersion}），已丢弃`,
    );
    return [];
  }
  if (!Array.isArray(obj.items)) return [];

  const valid: InstalledSkill[] = [];
  for (const item of obj.items) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<InstalledSkill>;
    if (typeof r.slug !== 'string' || typeof r.name !== 'string' ||
        typeof r.software !== 'string' || typeof r.jobId !== 'string') {
      console.warn('[B4] 已跳过缺的字段的项', item);
      continue;
    }
    let installedAt: Date;
    if (typeof r.installedAt === 'string' || typeof r.installedAt === 'number') {
      installedAt = new Date(r.installedAt);
    } else {
      installedAt = new Date();
    }
    if (Number.isNaN(installedAt.getTime())) {
      console.warn('[B4] 已跳过 installedAt 不可解析的项', item);
      continue;
    }
    const age = Date.now() - installedAt.getTime();
    if (age > MAX_INSTALLED_AGE_MS) {
      console.warn(`[B4] 已跳过过期 ${Math.round(age / (24 * 60 * 60 * 1000))} 天的项：${r.slug}`);
      continue;
    }
    valid.push({
      slug: r.slug,
      name: r.name,
      software: r.software,
      jobId: r.jobId,
      version: typeof r.version === 'string' ? r.version : undefined,
      installedAt,
    });
  }
  return valid;
}

/**
 * A 轮 #B4：打包已装 Skills 持久化 payload，带 schemaVersion 便于以后做迁移。
 */
function serializeInstalledSkills(items: InstalledSkill[]): string {
  return JSON.stringify({ schemaVersion: PERSIST_SCHEMA_VERSION, items });
}

export default function App() {
  const [tab, setTab] = useState<Tab>('settings');
  const [info, setInfo] = useState<HelperInfo | null>(null);
  const [hasKey, setHasKey] = useState(false);
  // A 轮 #P1-22：Web 端 session 绑定状态
  const [session, setSession] = useState<SessionInfo | null>(null);

  // A 轮 #H1：让 TabButton 的键盘导航回调用，把焦点交给指定 id 的 tab button。
  const focusTabById = useCallback((tabId: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`${tabId}-tab`);
      (el as HTMLButtonElement | null)?.focus();
    });
  }, []);

  // 启动时拉基本信息
  useEffect(() => {
    invoke<HelperInfo>('get_helper_info').then(setInfo).catch(() => {});
    invoke<KeyStatus>('get_provider_keys_status')
      .then((s) => setHasKey(Object.values(s.providers).some(Boolean)))
      .catch(() => {});
    // P1-22：拉 session 快照，知道是否绑定 Web 账号
    invoke<SessionInfo>('get_session_info')
      .then((s) => setSession(s))
      .catch(() => {});
  }, []);

  return (
    <div>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }} role="tablist" aria-label="主导航">
          {/* A 轮 #H1：tabOrder 给键盘导航用；focusTabById 给子组件回调用 */}
          {(['settings', 'about'] as Tab[]).map((t) => (
            <TabButton
              key={t}
              active={tab === t}
              onClick={() => setTab(t)}
              tabId={t}
              tabOrder={['settings', 'about']}
              onFocusTab={focusTabById}
            >
              {t === 'settings' ? 'LLM Key 设置' : '关于'}
            </TabButton>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* A 轮 #G1：Key 状态（圆点 + 文字）。逻辑复制不动，只调样式让它和右边徽章在视觉上拉开。 */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: hasKey ? '#16a34a' : '#6b7280',
            }}
            aria-label={hasKey ? 'LLM Key 已配置' : 'LLM Key 未配置'}
          >
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
            {hasKey ? `已就绪 · 端口 ${info?.helper_port ?? '…'}` : '未配置'}
          </span>
          {/* A 轮 #G1：session 绑定徽章独立为一组，加视觉边界。 */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid',
              ...(session?.has_token
                ? { background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' }
                : { background: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' }),
            }}
            title={
              session?.has_token
                ? `绑定于 ${session.user_email ?? session.user_id ?? '已绑定 Web 账号'}`
                : '心跳上报为匿名状态。绑定后可启用反向推送 / 个人化推荐'
            }
          >
            <span aria-hidden>{session?.has_token ? '🔗' : '○'}</span>
            {session?.has_token ? '已绑定 Web 账号' : '未绑定'}
          </span>
        </div>
      </nav>

      <main>
        {/* A 轮 #H2：Tab panel 语义化。aria-labelledby 指向 tab id 让屏幕阅读器知道面板归属。 */}
        <div
          role="tabpanel"
          id="settings-panel"
          aria-labelledby="settings-tab"
          tabIndex={0}
          hidden={tab !== 'settings'}
        >
          {tab === 'settings' && (
            <AppJobsBridge
              onNavigateToSettings={() => setTab('settings')}
            />
          )}
        </div>
        <div
          role="tabpanel"
          id="about-panel"
          aria-labelledby="about-tab"
          tabIndex={0}
          hidden={tab !== 'about'}
        >
          {tab === 'about' && <About />}
        </div>
      </main>

      {/* A 轮 #G1：fallback 警示从顶栏搬到主区域顶部 banner，更显眼且不挤徽章。
          原只埋在 Section 4「诊断」卡里，可发现性太差。 */}
      {info &&
        info.key_store_fallback && (
          <div
            role="alert"
            aria-label="KeyStore 数据未持久化"
            style={{
              padding: '8px 16px',
              background: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>
              ⚠ <strong>数据未持久化</strong>
              {' '}— KeyStore 已 fallback 到临时目录，{info.key_store_fallback_reason ? `原因：${info.key_store_fallback_reason}` : '重启后丢失'}
            </span>
          </div>
        )}
      {/* A 轮 #B6：协议未注册时，在主区域顶部显眼的 banner 提示 + 一键修复。
          原只埋在 Section 4「诊断」卡里，可发现性太差。 */}
      {info &&
        info.protocol_registered === false &&
        info.helper_port !== undefined && (
          <div
            role="alert"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              padding: '8px 16px',
              background: '#fef3c7',
              borderBottom: '1px solid #f59e0b',
              color: '#92400e',
              fontSize: 13,
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <span>
              ⚠ <strong>skillhub:// 协议未注册</strong>
              {' '}— Web 端可能无法唤起助手。
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await invoke<{ ok: boolean; status?: string; message?: string }>(
                    'ensure_protocol_registered',
                  );
                  if (r.ok) {
                    setInfo((prev) =>
                      prev
                        ? {
                            ...prev,
                            protocol_registered: r.status !== 'not_registered' && r.status !== 'unsupported',
                          }
                        : prev,
                    );
                  }
                } catch (e) {
                  console.warn('ensure_protocol_registered failed', e);
                }
              }}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              重新注册
            </button>
          </div>
        )}
    </div>
  );
}

// A 轮 #A3 重构：把"install jobs 状态机 + 监听 + 暴露 window bridge + 持久化"
// 全部收敛到 AppJobsBridge 一个组件，让 Settings 通过 prop 接收 jobs + installedSkills。
function AppJobsBridge({ onNavigateToSettings }: { onNavigateToSettings?: () => void }) {
  // jobs：按 jobId 索引，生命周期 running → succeeded/failed
  const [jobs, setJobs] = useState<Record<string, InstallJob>>({});
  const [, setTick] = useState(0); // 用于触发已装 Skills 列表的 export-ready 状态
  const [pendingConfirmInstall, setPendingConfirmInstall] = useState<{
    slug: string;
    name: string;
    software: string;
    source: 'window-bridge' | 'url-event';
  } | null>(null);

  // jobId → {slug, name, software}
  const pendingMetaRef = useRef<Record<string, { slug: string; name: string; software: string; version?: string }>>(
    {},
  );

  // A 轮 #P1-21：协议唤起可能传 version/用 slug 作 key 暂存，invoke 后取出。
  // 这样 install_skill 收到的 skill 对象能带上 version，最终体现到已装列表里。
  const pendingVersionBySlugRef = useRef<Record<string, string>>({});

  // A 轮 #B2 buffer：缓存 React listener 挂上之前的 install 事件，避免 cold-start race
  const bufferRef = useRef<{
    progress: InstallProgress[];
    complete: InstallComplete[];
    flushed: boolean;
  }>({ progress: [], complete: [], flushed: false });
  const flushBuffer = () => {
    const buf = bufferRef.current;
    if (buf.flushed) return;
    buf.flushed = true;
    // 把 buffer 中累积的事件应用到 jobs
    buf.progress.forEach(applyProgress);
    buf.complete.forEach(applyComplete);
    buf.progress = [];
    buf.complete = [];
  };
  const applyProgress = (p: InstallProgress) => {
    setJobs((prev) => {
      const job = prev[p.job_id];
      if (!job) return prev;
      return { ...prev, [p.job_id]: { ...job, progress: p } };
    });
  };
  const applyComplete = (c: InstallComplete) => {
    const meta = pendingMetaRef.current[c.job_id];
    if (meta) delete pendingMetaRef.current[c.job_id];
    setJobs((prev) => {
      const job = prev[c.job_id];
      if (!job) return prev;
      if (c.result === 'success') {
        const meta = pendingMetaRef.current[c.job_id];
        const skill: InstalledSkill = {
          slug: job.slug,
          name: job.name,
          software: job.software,
          installedAt: new Date(),
          jobId: c.job_id,
          version: meta?.version ?? job.version,
        };
        return {
          ...prev,
          [c.job_id]: {
            ...job,
            phase: 'succeeded',
            progress: undefined,
            completed: skill,
            cta: c.cta ?? null,
            notifiedAt: Date.now(),
          },
        };
      } else {
        return {
          ...prev,
          [c.job_id]: {
            ...job,
            phase: 'failed',
            progress: undefined,
            failure: {
              jobId: c.job_id,
              skillName: job.name,
              error: c.error ?? c.message ?? '未知错误',
            },
            notifiedAt: Date.now(),
          },
        };
      }
    });
  };

  // 监听 install-progress / install-complete（B2 buffer）
  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];
    (async () => {
      unlistenFns.push(
        await listen<InstallProgress>('install-progress', (e) => {
          if (bufferRef.current.flushed) applyProgress(e.payload);
          else bufferRef.current.progress.push(e.payload);
        }),
      );
      unlistenFns.push(
        await listen<InstallComplete>('install-complete', (c) => {
          if (bufferRef.current.flushed) applyComplete(c.payload);
          else bufferRef.current.complete.push(c.payload);
        }),
      );
      // 让 React 先渲染一次再 flush
      setTimeout(flushBuffer, 0);
    })();
    return () => unlistenFns.forEach((fn) => fn());
  }, []);

  // 暴露给 window：方便 Web 端协议唤起时调 install_skill
  // A 轮 #D1：在 invoke 之前弹确认 modal
  useEffect(() => {
    (window as unknown as {
      __skillhubInstallSkill?: (
        skill: { slug: string; name?: string; software?: string[] },
      ) => Promise<void>;
      __skillhubConfirmInstall?: () => void;
      __skillhubCancelInstall?: () => void;
    }).__skillhubConfirmInstall = () => {
      const pending = pendingConfirmInstall;
      if (!pending) return;
      pendingConfirmInstallSettableRef.current = null;
      setPendingConfirmInstall(null);
      reallyStartInstall(pending.slug, pending.name, pending.software);
    };
    (window as unknown as {
      __skillhubCancelInstall?: () => void;
    }).__skillhubCancelInstall = () => {
      pendingConfirmInstallSettableRef.current = null;
      setPendingConfirmInstall(null);
    };
    pendingConfirmInstallSettableRef.current = (slug, name, software, source) =>
      setPendingConfirmInstall({ slug, name, software, source });

    (window as unknown as {
      __skillhubInstallSkill?: (
        skill: { slug: string; name?: string; software?: string[] },
      ) => Promise<void>;
    }).__skillhubInstallSkill = async (skill) => {
      const tags = (skill.software ?? []) as string[];
      const software = tags[0] ?? 'unknown';
      const name = skill.name ?? skill.slug;
      // 安全 modal：让用户在 invoke 之前确认
      pendingConfirmInstallSettableRef.current?.(skill.slug, name, software, 'window-bridge');
    };
  }, []);

  // 监听协议唤起（外部浏览器调 skillhub:// 后，Rust 端 emit 这个事件）
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    (async () => {
      unlisten = await listen<{
        slug: string;
        name?: string;
        software?: string;
        version?: string;
        jobId?: string;
      }>('install-from-url', (e) => {
        // A 轮 #P1-21：先把 version 暂存，reallyStartInstall 会用取它
        if (e.payload.version) {
          pendingVersionBySlugRef.current[e.payload.slug] = e.payload.version;
        }
        // A 轮 #D1：协议唤起也走 modal 确认
        pendingConfirmInstallSettableRef.current?.(
          e.payload.slug,
          e.payload.name ?? e.payload.slug,
          e.payload.software ?? 'unknown',
          'url-event',
        );
        // v2.0.5 修复：仅在 About Tab 时切回 Settings
        onNavigateToSettings?.();
      });
    })();
    return () => unlisten?.();
  }, []);

  // === 实际 invoke install_skill（modal 确认后才走） ===
  const pendingConfirmInstallSettableRef = useRef<
    | ((
        slug: string,
        name: string,
        software: string,
        source: 'window-bridge' | 'url-event',
      ) => void)
    | null
  >(null);
  const reallyStartInstall = async (slug: string, name: string, software: string) => {
    // A 轮 #P1-21：从 protocol URL 暂存的版本里取，取完即清除
    const version = pendingVersionBySlugRef.current[slug];
    if (version) delete pendingVersionBySlugRef.current[slug];
    try {
      const jobId = await invoke<string>('install_skill', {
        slug,
        skill: { slug, name, software, version },
      });
      pendingMetaRef.current[jobId] = { slug, name, software, version };
      setJobs((prev) => ({
        ...prev,
        [jobId]: { jobId, slug, name, software, version, phase: 'running' },
      }));
    } catch (e) {
      // install 完全没起：补一个 failed job 弹窗
      const syntheticJobId = `failed-${Date.now()}`;
      setJobs((prev) => ({
        ...prev,
        [syntheticJobId]: {
          jobId: syntheticJobId,
          slug,
          name,
          software,
          phase: 'failed',
          failure: {
            jobId: syntheticJobId,
            skillName: name,
            error: typeof e === 'string' ? e : '调起安装失败，请重试',
          },
          notifiedAt: Date.now(),
        },
      }));
    }
  };

  // ===== 计算已装 Skills（A 轮 #F1 + #F2 + 去重） =====
  const installedSkills: InstalledSkill[] = Object.values(jobs)
    .filter((j) => j.phase === 'succeeded' && j.completed)
    .map((j) => j.completed as InstalledSkill);

  // A 轮 #F1：localStorage 持久化
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw && Object.keys(jobs).length === 0) {
        const parsed = parseInstalledSkills(raw);
        if (parsed.length > 0) {
          const restored: Record<string, InstallJob> = {};
          parsed.forEach((s) => {
            restored[s.jobId] = {
              jobId: s.jobId,
              slug: s.slug,
              name: s.name,
              software: s.software,
              version: s.version,
              phase: 'succeeded',
              completed: s,
              notifiedAt: Date.now(),
            };
          });
          setJobs(restored);
        }
      }
    } catch {
      /* ignore */
    }
    // 只在挂载时跑一次
  }, []);

  useEffect(() => {
    if (installedSkills.length > 0) {
      try {
        localStorage.setItem(PERSIST_KEY, serializeInstalledSkills(installedSkills));
      } catch {
        /* ignore */
      }
    }
    setTick((t) => t + 1);
  }, [installedSkills]);

  return (
    <>
      <Settings
        installedSkills={dedupeInstalledBySlug(installedSkills)}
        onUninstallSkill={(slug) => {
          // A 轮 #B3：从所有 jobs 中找出该 slug 下的所有 completed entries 并移除
          setJobs((prev) => {
            const next: Record<string, InstallJob> = {};
            for (const [id, j] of Object.entries(prev)) {
              if (j.slug === slug && j.phase === 'succeeded') continue;
              next[id] = j;
            }
            return next;
          });
        }}
      />

      {/* A 轮 #A3 浮窗层：按 phase + 时间堆叠。最多同时展示 3 个，剩余折叠进"+N 后台" */}
      <InstallJobsStack
        jobs={jobs}
        onCloseFailure={(jobId) => {
          setJobs((prev) => {
            const j = prev[jobId];
            if (!j || j.phase !== 'failed') return prev;
            const { [jobId]: _omit, ...rest } = prev;
            return rest;
          });
        }}
        onDismissSuccess={(jobId) => {
          // 成功后保留在 installed 列表，但浮窗 2 秒后自动收起
          setJobs((prev) => {
            const j = prev[jobId];
            if (!j) return prev;
            return { ...prev, [jobId]: { ...j, notifiedAt: Date.now() } };
          });
        }}
      />

      {/* A 轮 #D1：安全 modal（协议唤起 / window.bridge 触发） */}
      {pendingConfirmInstall && (
        <ConfirmInstallModal
          pending={pendingConfirmInstall}
          onConfirm={() => {
            (window as unknown as { __skillhubConfirmInstall?: () => void }).__skillhubConfirmInstall?.();
          }}
          onCancel={() => {
            (window as unknown as { __skillhubCancelInstall?: () => void }).__skillhubCancelInstall?.();
          }}
        />
      )}
    </>
  );
}

function dedupeInstalledBySlug(list: InstalledSkill[]): InstalledSkill[] {
  const m = new Map<string, InstalledSkill>();
  for (const s of list) {
    const ex = m.get(s.slug);
    if (!ex || ex.installedAt.getTime() < s.installedAt.getTime()) {
      m.set(s.slug, s);
    }
  }
  return Array.from(m.values()).sort((a, b) => b.installedAt.getTime() - a.installedAt.getTime());
}

// A 轮 #D1 modal
// A 轮 #H3：补 Escape 关闭、自动 focus cancel（避免误触发安装）+ aria-describedby。
function ConfirmInstallModal({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: { slug: string; name: string; software: string; source: 'window-bridge' | 'url-event' };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // A 轮 #H3：modal 打开默认 focus 在「取消」按钮上，防止用户按 Enter 直接确认安装。
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-install-title"
      aria-describedby="confirm-install-desc"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={(e) => {
        // A 轮 #H3：点击背景蒙层关闭（点 dialog 内部不冒泡关闭）。
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          width: 420,
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <h2 id="confirm-install-title" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          ⚠ 即将安装 Skill
        </h2>
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <strong>Skill：</strong>
            <code style={{ color: '#1e40af' }}>{pending.slug}</code>
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>适用软件：</strong>
            <code>{pending.software}</code>
          </div>
          <div>
            <strong>触发：</strong>
            {pending.source === 'url-event' ? 'skillhub:// 协议唤起' : 'Web 端 window 桥接'}
          </div>
        </div>
        <p id="confirm-install-desc" style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
          如果这不是你主动触发的，请点取消。恶意 Web 页面可能通过此路径诱导安装。
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            取消（Esc）
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            确认安装
          </button>
        </div>
      </div>
    </div>
  );
}

// A 轮 #A3 堆叠浮窗
function InstallJobsStack({
  jobs,
  onCloseFailure,
  onDismissSuccess,
}: {
  jobs: Record<string, InstallJob>;
  onCloseFailure: (jobId: string) => void;
  onDismissSuccess: (jobId: string) => void;
}) {
  const list = Object.values(jobs).filter(
    (j) => j.phase === 'running' || (j.phase === 'failed' && j.failure) || (j.phase === 'succeeded' && j.completed),
  );
  // 排序：按 notifiedAt 倒序（最近活跃在前）
  list.sort((a, b) => (b.notifiedAt ?? 0) - (a.notifiedAt ?? 0));

  // 成功的浮窗 2 秒后自动收起（移出 jobs state key）
  useEffect(() => {
    const timers = list
      .filter((j) => j.phase === 'succeeded')
      .map((j) =>
        setTimeout(() => {
          onDismissSuccess(j.jobId);
        }, 2000),
      );
    return () => timers.forEach(clearTimeout);
  }, [list.map((j) => `${j.jobId}:${j.phase}`).join(','), onDismissSuccess]);

  const MAX_VISIBLE = 3;
  const visible = list.slice(0, MAX_VISIBLE);
  const hidden = list.slice(MAX_VISIBLE);

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
      }}
    >
      {hidden.length > 0 && (
        <div
          style={{
            padding: '6px 10px',
            background: '#1e293b',
            color: '#fff',
            borderRadius: 8,
            fontSize: 11,
            alignSelf: 'flex-end',
          }}
        >
          + {hidden.length} 个后台运行
        </div>
      )}
      {visible.map((job) => (
        <InstallJobToast
          key={job.jobId}
          job={job}
          onCloseFailure={() => onCloseFailure(job.jobId)}
        />
      ))}
    </div>
  );
}

function InstallJobToast({
  job,
  onCloseFailure,
}: {
  job: InstallJob;
  onCloseFailure: () => void;
}) {
  if (job.phase === 'succeeded' && job.completed) {
    return (
      <ToastCard borderTone="succeeded">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusBadge phase="succeeded" icon="✓" compact>
            {job.name}
          </StatusBadge>
          {job.cta?.action && (
            <button
              type="button"
              onClick={() => {
                const action = job.cta?.action ?? '';
                const url = action.startsWith('open-path:')
                  ? `file://${action.slice('open-path:'.length)}`
                  : action;
                invoke('plugin:opener|open_url', { url })
                  .catch(() => import('@tauri-apps/plugin-opener').then((m) => m.openUrl(url)))
                  .catch(() => {});
              }}
              className="text-xs hover:underline"
              style={{ color: COLORS.text.link }}
            >
              {job.cta?.label ?? '打开'}
            </button>
          )}
        </div>
      </ToastCard>
    );
  }
  if (job.phase === 'failed' && job.failure) {
    return (
      <ToastCard borderTone="failed" ariaRole="alert" ariaLive="assertive">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <StatusBadge phase="failed" icon="✗" compact>
            安装失败 · {job.failure.skillName}
          </StatusBadge>
          <button
            type="button"
            onClick={onCloseFailure}
            aria-label="关闭"
            className="bg-transparent border-none text-base leading-none cursor-pointer px-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{ color: COLORS.status.neutralText }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: COLORS.status.dangerMuted,
            background: COLORS.status.dangerBg,
            padding: 6,
            borderRadius: 6,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            maxHeight: 96,
            overflow: 'auto',
          }}
        >
          {job.failure.error}
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(job.failure?.error ?? '')}
          className="mt-2 text-xs hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ color: COLORS.text.muted }}
        >
          复制错误详情
        </button>
      </ToastCard>
    );
  }
  // running
  const pct =
    job.progress && job.progress.total_steps > 0
      ? (job.progress.step / job.progress.total_steps) * 100
      : 0;
  const msg = job.progress?.event?.message ?? job.progress?.event?.kind ?? '';
  return (
    <ToastCard borderTone="running">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.status.infoText }}>
          正在安装 {job.name}
        </span>
        <span style={{ fontSize: 11, color: COLORS.status.infoAccent, fontFamily: 'monospace' }}>
          {job.progress ? `${job.progress.step}/${job.progress.total_steps}` : '0/0'} ·{' '}
          {job.progress ? (job.progress.elapsed_ms / 1000).toFixed(1) : '0.0'}s
        </span>
      </div>
      {/* A 轮 #H2：进度条给屏幕阅读器可读，加 role="progressbar" + aria-valuenow。 */}
      <div
        role="progressbar"
        aria-label={`安装进度 ${job.name}`}
        aria-valuemin={0}
        aria-valuemax={Math.max(job.progress?.total_steps ?? 0, 1)}
        aria-valuenow={job.progress?.step ?? 0}
        aria-valuetext={
          job.progress
            ? `第 ${job.progress.step} 步，共 ${job.progress.total_steps} 步`
            : '准备中'
        }
        style={{
          height: 6,
          width: '100%',
          background: COLORS.status.infoBg,
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: msg ? 6 : 0,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: COLORS.brand.primary,
            transition: 'width 200ms ease',
          }}
        />
      </div>
      {msg && (
        <div
          style={{
            fontSize: 11,
            color: COLORS.text.linkMuted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {msg}
        </div>
      )}
    </ToastCard>
  );
}

function TabButton({
  active,
  onClick,
  children,
  tabId,
  tabOrder,
  onFocusTab,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tabId: string;
  /// A 轮 #H1：所有 tab 的 id 列表（按视觉顺序）+ 焦点跳转回调。
  /// 让键盘导航能基于索引计算 Home/End、ArrowLeft/Right，
  /// 避免硬编码只在两个 tab 间切换的限制。
  tabOrder: string[];
  onFocusTab: (tabId: string) => void;
}) {
  const idx = tabOrder.indexOf(tabId);
  const len = tabOrder.length;
  const focusByOffset = (offset: number) => {
    if (len === 0) return;
    const nextIdx = (idx + offset + len) % len;
    onFocusTab(tabOrder[nextIdx]);
  };
  const focusByIndex = (target: number) => {
    if (target < 0 || target >= len) return;
    onFocusTab(tabOrder[target]);
  };
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`${tabId}-panel`}
      id={`${tabId}-tab`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        // A 轮 #H1：基于 tabOrder 索引做键盘导航，支持 Home/End + ArrowLeft/Right。
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          focusByOffset(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          focusByOffset(-1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          focusByIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          focusByIndex(len - 1);
        }
      }}
      style={{
        minWidth: 112,
        padding: '14px 16px',
        background: 'transparent',
        color: active ? '#2563eb' : '#6b7280',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        border: 'none',
        borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
        transition: 'color 120ms ease, border-color 120ms ease',
      }}
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      {children}
    </button>
  );
}

function About() {
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>关于 SkillHub Helper</h2>
      <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7 }}>
        SkillHub 桌面助手是 <strong>Skill 的执行载体</strong>，不负责浏览/推荐——那些都在
        <a href="https://skillhub.proclaw.cc" target="_blank" rel="noreferrer"> Web 端</a>完成。
        <br />
        <br />
        <strong>桌面端职责</strong>：
        <br />
        ① 转发 Web 端 LLM 调用到你本机的 API Key（<strong>不经过云端</strong>）
        <br />
        ② 扫描本机已装软件（M2 · F9）
        <br />
        ③ 上报软件清单给云端用于反向推送（M2 · F14）
        <br />
        ④ 执行 Web 端走 <code>skillhub://</code> 协议唤起的安装剧本（M2 · F4+F10）
        <br />
        <br />
        你的 API Key 仅 AES-256 加密存储在本机 <code>%APPDATA%\skillhub-helper\.data\llm-keys.json</code>，
        永远不会上传到 SkillHub 服务器。
        <br />
        <br />
        <strong>Web 端访问</strong> <a href="https://skillhub.proclaw.cc" target="_blank" rel="noreferrer">https://skillhub.proclaw.cc</a>{' '}
        即可自动连上本助手（首页对话框输入需求 → 选 Skill → 一键安装 → 自动唤起）。
      </p>
    </div>
  );
}
