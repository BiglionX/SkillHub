import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Home from './pages/Home';
import Explore from './pages/Explore';
import MySkills from './pages/MySkills';
import Usage from './pages/Usage';
import Settings from './pages/Settings';
import { setHelperPort, setAnonymousId } from './lib/LlmGateway';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { StatusBadge, ToastCard } from './components/StatusBadge';
import {
  AlertTriangle,
  Brain,
  Compass,
  Minus,
  PackageOpen,
  BarChart3,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/// M4 + v2.0.7+：侧边栏只显示图标，home 不再列在 Tab 中，改由顶部 logo 点击进入。
/// 剩余 4 个 Tab：explore / my / usage / settings。
type Tab = 'home' | 'explore' | 'my' | 'usage' | 'settings';
/// v2.0.7+：侧边栏渲染顺序不含 home（home 由 logo 点击）
const SIDEBAR_TABS: Tab[] = ['explore', 'my', 'usage', 'settings'];
const TAB_LABELS: Record<Tab, string> = {
  home: '首页',
  explore: '探索',
  my: '我的 Skills',
  usage: '用量',
  settings: '设置',
};

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

/**
 * 验收 UX-P0-D：把本机路径拼成 RFC 8089 规范的 file:// URL。
 * 原实现 `file://${path}` 在 Windows 下会拼出 `file://C:\Users\foo\bar`（缺第三个斜杠 + 反斜杠），
 * 多数 opener（包括 tauri-plugin-opener）在 Windows 上会拒绝解析。
 * - Windows：反斜杠 → 正斜杠，盘符前补一个斜杠得 `file:///C:/Users/foo/bar`
 * - 其他平台：保留前导斜杠得 `file:///home/user/bar`
 * - encodeURI 转义空格 / 中文 / `#` 等保留字符。
 */
function pathToFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const withScheme =
    /^[a-z]:/i.test(normalized)
      ? `file:///${normalized}`
      : `file://${normalized}`;
  return encodeURI(withScheme);
}

/**
 * 验收 UX-P0-D：解析 CTA action 为可调起的 URL。
 * 仅识别 `open-path:<本机路径>`；其他（http(s) / skillhub:// / 原始 URL）原样透传。
 */
function resolveCtaUrl(action: string): string {
  const PREFIX = 'open-path:';
  if (action.startsWith(PREFIX)) {
    return pathToFileUrl(action.slice(PREFIX.length));
  }
  return action;
}

/**
 * v2.0.7+：右上角三个窗口控制按钮（最小化 / 最大化 / 关闭）。
 * 走 Tauri 2 的 @tauri-apps/api/window 提供的 getCurrentWindow() 调起窗口动作。
 * web 端（非 Tauri）调 .minimize()/.toggleMaximize()/.close() 会抛错，所以包了 .catch 静默。
 */
function WindowControls() {
  const onMinimize = () => {
    getCurrentWindow()
      .minimize()
      .catch(() => {
        /* 非 Tauri 环境 / 调用失败：静默 */
      });
  };
  const onToggleMaximize = () => {
    getCurrentWindow()
      .toggleMaximize()
      .catch(() => {});
  };
  const onClose = () => {
    getCurrentWindow()
      .close()
      .catch(() => {});
  };
  return (
    // v2.0.7+：Tauri 禁用了 OS 装饰栏后，父 .glass-drag-bar 是 -webkit-app-region: drag。
    // 这里要 no-drag 覆盖，否则点击会变拖窗。
    <div className="glass-window-controls" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        type="button"
        onClick={onMinimize}
        aria-label="最小化"
        title="最小化"
      >
        <Minus size={14} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onToggleMaximize}
        aria-label="最大化"
        title="最大化/还原"
      >
        <Square size={11} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="danger"
        aria-label="关闭"
        title="关闭"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [info, setInfo] = useState<HelperInfo | null>(null);
  const [hasKey, setHasKey] = useState(false);
  // A 轮 #P1-22：Web 端 session 绑定状态
  const [session, setSession] = useState<SessionInfo | null>(null);
  // v2.0.7+：主区 ref + 滚动中状态。滚动停止 800ms 后 is-scrolling class 移除。
  // 配合 helper-glass.css .glass-main.is-scrolling::-webkit-scrollbar-thumb
  // 实现“鼠标上下滚动时才出现”的半透明黑色滚动条。
  const mainRef = useRef<HTMLElement | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let timer: number | undefined;
    const onScroll = () => {
      setIsScrolling(true);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsScrolling(false), 800);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // A 轮 #H1：让 TabButton 的键盘导航回调用，把焦点交给指定 id 的 tab button。
  const focusTabById = useCallback((tabId: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`${tabId}-tab`);
      (el as HTMLButtonElement | null)?.focus();
    });
  }, []);

  // 启动时拉基本信息 + LlmGateway 注入（端口 / 游客 ID）
  useEffect(() => {
    invoke<HelperInfo>('get_helper_info').then((i) => {
      setInfo(i);
      // M4：把端口注入 LlmGateway（fetch /llm/chat 时用）
      if (typeof i.helper_port === 'number') {
        setHelperPort(i.helper_port);
        (window as unknown as { __SKILLHUB_HELPER_PORT__?: number }).__SKILLHUB_HELPER_PORT__ =
          i.helper_port;
      }
    }).catch(() => {});
    invoke<KeyStatus>('get_provider_keys_status')
      .then((s) => setHasKey(Object.values(s.providers).some(Boolean)))
      .catch(() => {});
    // P1-22：拉 session 快照，知道是否绑定 Web 账号
    invoke<SessionInfo>('get_session_info')
      .then((s) => {
        setSession(s);
        // M4：把 userId/anonymousId 注入 LlmGateway（用于 /llm/chat session_id）
        const id = s.user_id ?? null;
        setAnonymousId(id);
      })
      .catch(() => {});
    // M4：首次启动拿游客 anonymous_id
    // MEDIUM #1（CodeReview 2026-09）：后端 ensure_guest_session 每次返回新 UUID v4，
    // 云端 GuestSession 表会堆积 machineFingerprint 相同但 anonymousId 全不相同的“僵尸行”。
    // 修复：前端用 localStorage 缓存 anonymous_id，同一台机器仅首次启动调一次。
    // 仅在匿名（未绑定 Web 账号）时需要这个 ID；已绑定时以 userId 为主。
    const ANON_ID_KEY = 'helper.anonymous_id';
    const cachedAnonId =
      typeof window !== 'undefined' ? window.localStorage.getItem(ANON_ID_KEY) : null;
    if (cachedAnonId && !session?.user_id) {
      setAnonymousId(cachedAnonId);
    } else {
      invoke<{ anonymous_id: string }>('ensure_guest_session')
        .then((g) => {
          if (g?.anonymous_id && !session?.user_id) {
            setAnonymousId(g.anonymous_id);
            try {
              window.localStorage.setItem(ANON_ID_KEY, g.anonymous_id);
            } catch {
              // localStorage 被禁用 / 容量满：仅本次会话有效，下次启动重试
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // F20：C 类 Skill 未配 Key 时点 [现在配] 的回调——跳 Settings Tab + 写 hash
  // 让 Settings.tsx 里的 useEffect 监听到后自动展开 Key 编辑面板。
  // 仅在未配 Key 时写 hash，避免覆盖用户自己设置的 hash。
  const handleNeedKey = useCallback(() => {
    setTab('settings');
    if (!hasKey && typeof window !== 'undefined') {
      window.location.hash = 'llm-key-section';
    }
  }, [hasKey]);

  // M4 + v2.0.7+：键盘快捷键 Cmd/Ctrl + 1..4 切换侧边栏 Tab（home 不在计数中）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const n = parseInt(e.key, 10);
      if (Number.isNaN(n)) return;
      const idx = n - 1;
      if (idx >= 0 && idx < SIDEBAR_TABS.length) {
        e.preventDefault();
        setTab(SIDEBAR_TABS[idx]);
        focusTabById(SIDEBAR_TABS[idx]);
      } else if (e.key.toLowerCase() === 'r') {
        // Cmd/Ctrl + R：刷新当前 Tab 数据（占位，未来 Home/Explore 接 refetch）
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusTabById]);

  return (
    <div className="glass-app-layout">
      {/* v2.0.7+：侧边栏头部 logo 改为可点击 button，点此进入首页。
          同时整个 sidebar 隐藏品牌文字，仅 hover logo 时弹出 tooltip。 */}
      <aside className="glass-sidebar" aria-label="主导航">
        <button
          type="button"
          className="glass-sidebar-header"
          aria-label="返回首页 SkillHub"
          title="首页 · SkillHub"
          onClick={() => setTab('home')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div className="glass-sidebar-logo" aria-hidden>
            {/* v2.0.7+：侧边栏 logo 走 lucide（之前用 🐙 emoji，深色玻璃上对比度差） */}
            <Sparkles size={20} strokeWidth={2.5} />
          </div>
        </button>
        <nav role="tablist" aria-label="主导航">
          {/* v2.0.7+：侧边栏只渲染 4 个 Tab（home 移到 logo）。文字通过 hover tooltip 显示。 */}
          {SIDEBAR_TABS.map((t) => (
            <TabButton
              key={t}
              active={tab === t}
              onClick={() => setTab(t)}
              tabId={t}
              tabOrder={SIDEBAR_TABS}
              onFocusTab={focusTabById}
            >
              <span className="glass-sidebar-icon" aria-hidden>
                {t === 'explore' && <Compass size={20} strokeWidth={2} />}
                {t === 'my' && <PackageOpen size={20} strokeWidth={2} />}
                {t === 'usage' && <BarChart3 size={20} strokeWidth={2} />}
                {t === 'settings' && <SettingsIcon size={20} strokeWidth={2} />}
              </span>
            </TabButton>
          ))}
        </nav>
        <div className="glass-sidebar-footer">
          {/* F20：LLM Key 状态。v2.0.7+ 改为：Brain 主图标 + 右下角绿点（已配）/灰点（未配）。
              tooltip 文本精简为「点此跳设置」/「已就绪」一句，不再含端口号以免溢出。 */}
          <div
            className={`glass-sidebar-status ${!hasKey ? 'glass-sidebar-status-warn' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={hasKey ? 'LLM Key 已配置 · 点此跳设置' : '未配置 LLM Key · 点此跳设置'}
            data-label={hasKey ? 'LLM 已就绪 · 点此跳设置' : '未配置 LLM Key · 点此跳设置'}
            onClick={() => setTab('settings')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setTab('settings');
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="glass-sidebar-status-icon" aria-hidden>
              <Brain size={18} strokeWidth={2} className={hasKey ? 'text-cyan-300' : 'text-muted'} />
              <span
                className={`glass-sidebar-status-dot ${hasKey ? 'success' : 'warn'}`}
                aria-hidden
              />
            </span>
          </div>
          </div>
      </aside>

      {/* v2.0.7+：右侧主区域。className="glass-main" 使其负责纵向滚动（父 .glass-app-layout height: 100vh + overflow: hidden 避免 body 出现滚动条）。
                  右上角渲染 WindowControls（minimize / toggle-maximize / close），样式走 glass-window-controls。 */}
      <main
        ref={mainRef}
        className={`glass-main ${isScrolling ? 'is-scrolling' : ''}`}
      >
        {/* v2.0.7+：Tauri 2 禁用了 OS 装饰栏（tauri.conf.json decorations: false）后，
            窗口不能被拖动。画一个顶部 drag bar（-webkit-app-region: drag）解决问题。
            WindowControls 内部用 -webkit-app-region: no-drag 避免按钮被 drag 吞掉。 */}
        <div className="glass-drag-bar" aria-hidden />
        {/* v2.0.7+：右上角三个窗口控制按钮。仅在 Tauri 环境下生效（web 下 getCurrentWindow 会报错，已 catch）。 */}
        <WindowControls />
        {/* v2.0.7+：main 内容包一层 .glass-main-content，为右上角按钮区预留顶部 padding。 */}
        <div className="glass-main-content">
          {/* v2.0.7+：删除了协议未注册 banner。普通用户不需要懂 Windows 协议注册机制，
           “Web 端一键安装” 是面向技术用户的进阶功能，每次启动都弹警告只会让用户觉得 “是不是装错了”。
           后端 ensure_protocol_registered 命令保留（自动注册时不打扰用户），注册失败仅记录到日志。 */}
          {/* A 轮 #G1：fallback 警示，从顶栏搬到主区域顶部 banner。 */}
          {info &&
            info.key_store_fallback && (
              <div
                role="alert"
                aria-label="KeyStore 数据未持久化"
                className="glass-hint-danger mb-4"
              >
                <strong className="flex items-center gap-2">
                  <AlertTriangle size={14} aria-hidden />
                  <span>数据未持久化</span>
                </strong>
                {' '}— KeyStore 已 fallback 到临时目录，{info.key_store_fallback_reason ? `原因：${info.key_store_fallback_reason}` : '重启后丢失'}
              </div>
            )}
          {/* M4：5 Tab panel */}
          <div
            role="tabpanel"
            id="home-panel"
            aria-labelledby="home-tab"
            tabIndex={0}
            hidden={tab !== 'home'}
          >
            {tab === 'home' && <Home version={info?.version ?? '2.0.7'} hasKey={hasKey} onNeedKey={handleNeedKey} />}
          </div>
          <div
            role="tabpanel"
            id="explore-panel"
            aria-labelledby="explore-tab"
            tabIndex={0}
            hidden={tab !== 'explore'}
          >
            {tab === 'explore' && <Explore hasKey={hasKey} onNeedKey={handleNeedKey} />}
          </div>
          <div
            role="tabpanel"
            id="my-panel"
            aria-labelledby="my-tab"
            tabIndex={0}
            hidden={tab !== 'my'}
          >
            {tab === 'my' && <MySkills />}
          </div>
          <div
            role="tabpanel"
            id="usage-panel"
            aria-labelledby="usage-tab"
            tabIndex={0}
            hidden={tab !== 'usage'}
          >
            {tab === 'usage' && <Usage />}
          </div>
          <div
            role="tabpanel"
            id="settings-panel"
            aria-labelledby="settings-tab"
            tabIndex={0}
            hidden={tab !== 'settings'}
          >
            {tab === 'settings' && (
              <AppJobsBridge onNavigateToSettings={() => setTab('settings')} />
            )}
          </div>
        </div>
      </main>
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
      className="glass-modal-backdrop"
      onClick={(e) => {
        // A 轮 #H3：点击背景蒙层关闭（点 dialog 内部不冒泡关闭）。
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-modal relative"
      >
        <div className="glass-top-bar-wide" />
        <h2 id="confirm-install-title" className="glass-modal-title">
          即将安装 Skill
        </h2>
        <div className="glass-card-soft mt-3 text-[13px] space-y-1.5">
          <div>
            <strong className="text-primary">Skill：</strong>
            <code className="text-cyan-300 font-mono">{pending.slug}</code>
          </div>
          <div>
            <strong className="text-primary">适用软件：</strong>
            <code className="font-mono">{pending.software}</code>
          </div>
          <div>
            <strong className="text-primary">触发：</strong>
            <span className="text-secondary">
              {pending.source === 'url-event' ? 'skillhub:// 协议唤起' : 'Web 端 window 桥接'}
            </span>
          </div>
        </div>
        <p id="confirm-install-desc" className="text-muted mt-3 text-xs leading-relaxed">
          如果这不是你主动触发的，请点取消。恶意 Web 页面可能通过此路径诱导安装。
        </p>
        <div className="mt-4 flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="glow-btn-ghost flex-1"
          >
            取消（Esc）
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="glow-btn-primary flex-1"
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
        <div className="flex items-center justify-between">
          <StatusBadge phase="succeeded" icon="✓" compact>
            {job.name}
          </StatusBadge>
          {job.cta?.action && (
            <button
              type="button"
              onClick={() => {
                const action = job.cta?.action ?? '';
                const url = resolveCtaUrl(action); // 验收 UX-P0-D：open-path 转 RFC 8089 file URL
                invoke('plugin:opener|open_url', { url })
                  .catch(() => import('@tauri-apps/plugin-opener').then((m) => m.openUrl(url)))
                  .catch(() => {});
              }}
              className="text-xs text-link hover:underline"
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
        <div className="flex items-center justify-between mb-1.5">
          <StatusBadge phase="failed" icon="✗" compact>
            安装失败 · {job.failure.skillName}
          </StatusBadge>
          <button
            type="button"
            onClick={onCloseFailure}
            aria-label="关闭"
            className="bg-transparent border-none text-base leading-none cursor-pointer px-1 rounded text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            ×
          </button>
        </div>
        <pre className="glass-hint-danger mt-0 mb-0 text-[11px] font-mono whitespace-pre-wrap break-all max-h-24 overflow-auto">
          {job.failure.error}
        </pre>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(job.failure?.error ?? '')}
          className="mt-2 text-xs text-muted hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
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
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-semibold text-cyan-300">
          正在安装 {job.name}
        </span>
        <span className="text-[11px] text-cyan-400 font-mono">
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
        className="glass-progress mb-0"
        style={msg ? { marginBottom: 6 } : undefined}
      >
        <div
          className="glass-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {msg && (
        <div className="text-[11px] text-muted mt-1.5 truncate">
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
  /// v2.0.7+：用 TAB_LABELS 提供 hover tooltip 文字（侧边栏窄模式只显示图标）。
  const tooltip = TAB_LABELS[tabId as Tab] ?? tabId;
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`${tabId}-panel`}
      aria-label={tooltip}
      title={tooltip}
      data-label={tooltip}
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
      className={`glass-sidebar-item ${active ? 'glass-sidebar-item-active' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400`}
    >
      {children}
    </button>
  );
}
