import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Settings from './pages/Settings';

type Tab = 'settings' | 'about';

interface HelperInfo {
  version: string;
  name: string;
  helper_port?: number;
  protocol_registered?: boolean;
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
}

interface InstalledSkill {
  slug: string;
  name: string;
  software: string;
  installedAt: Date;
  jobId: string;
}

// v2.0.5：失败态独立 state，避免与 success 路径耦合
// 历史：v2.0.4 中失败任务 setInstallProgress(null) 后无任何 UI 反馈，
// 用户被误导为"装成功了"，且失败原因彻底丢失。
interface InstallFailure {
  jobId: string;
  skillName: string;
  error: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('settings');
  const [info, setInfo] = useState<HelperInfo | null>(null);
  const [hasKey, setHasKey] = useState(false);

  // ===== 全局 install 进度（Web 端走 skillhub:// 唤起助手后，助手跑剧本） =====
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [installFailure, setInstallFailure] = useState<InstallFailure | null>(null);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  // jobId → {slug, name, software}（install_skill 调用时登记，install-complete 时回填）
  const pendingInstallRef = useRef<Record<string, { slug: string; name: string; software: string }>>({});

  // 监听 install-progress / install-complete
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlistenProgress = await listen<InstallProgress>('install-progress', (e) => {
        // 收到新一轮进度说明失败态已结算，清掉旧失败浮窗
        setInstallFailure(null);
        setInstallProgress(e.payload);
      });
      unlistenComplete = await listen<InstallComplete>('install-complete', (e) => {
        setInstallProgress(null);
        // v2.0.5：顶层统一清理 pendingRef，无论 success / failed
        const pending = pendingInstallRef.current[e.payload.job_id];
        delete pendingInstallRef.current[e.payload.job_id];

        if (e.payload.result === 'success') {
          if (pending) {
            setInstalledSkills((prev) => [
              ...prev,
              {
                slug: pending.slug,
                name: pending.name,
                software: pending.software,
                installedAt: new Date(),
                jobId: e.payload.job_id,
              },
            ]);
          }
        } else {
          // v2.0.5：失败路径不再静默吞错——展示独立失败浮窗
          setInstallFailure({
            jobId: e.payload.job_id,
            skillName: pending?.name ?? e.payload.job_id,
            error: e.payload.error ?? e.payload.message ?? '未知错误',
          });
        }
      });
    })();

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
    };
  }, []);

  // 暴露给 window：方便 Web 端协议唤起时调 install_skill
  // （Tauri WebView 自家窗口；外部浏览器走 skillhub:// 协议 → Rust 端 emit "install-from-url"）
  useEffect(() => {
    (window as unknown as {
      __skillhubInstallSkill?: (skill: { slug: string; name?: string; software?: string[] }) => Promise<void>;
    }).__skillhubInstallSkill = async (skill) => {
      const tags = (skill.software ?? []) as string[];
      const software = tags[0] ?? 'unknown';
      const name = skill.name ?? skill.slug;
      try {
        const jobId = await invoke<string>('install_skill', {
          slug: skill.slug,
          skill: { slug: skill.slug, name, software },
        });
        pendingInstallRef.current[jobId] = { slug: skill.slug, name, software };
      } catch (e) {
        // v2.0.5：invoke 失败同步弹失败浮窗（之前只在 install-complete 监听里处理）
        setInstallFailure({
          jobId: 'invoke-failed',
          skillName: name,
          error: typeof e === 'string' ? e : '调起安装失败，请重试',
        });
      }
    };
  }, []);

  // 监听协议唤起（外部浏览器调 skillhub:// 后，Rust 端 emit 这个事件）
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<{ slug: string; name?: string; software?: string }>('install-from-url', (e) => {
        const fn = (window as unknown as {
          __skillhubInstallSkill?: (s: { slug: string; name?: string; software?: string[] }) => Promise<void>;
        }).__skillhubInstallSkill;
        if (fn) {
          fn({ slug: e.payload.slug, name: e.payload.name, software: e.payload.software ? [e.payload.software] : [] });
        }
        // v2.0.5：仅在当前 Tab ≠ settings 时切，避免破坏用户上下文
        // （用户在看"关于"Tab 时被强制拽回 Settings 会困惑）
        setTab((cur) => (cur === 'settings' ? cur : 'settings'));
      });
    })();
    return () => unlisten?.();
  }, []);

  // 启动时拉基本信息
  useEffect(() => {
    invoke<HelperInfo>('get_helper_info').then(setInfo).catch(() => {});
    invoke<KeyStatus>('get_provider_keys_status')
      .then((s) => setHasKey(Object.values(s.providers).some(Boolean)))
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
        <div style={{ display: 'flex', gap: 4 }}>
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
            LLM Key 设置
          </TabButton>
          <TabButton active={tab === 'about'} onClick={() => setTab('about')}>
            关于
          </TabButton>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <span style={{ fontSize: 12, color: hasKey ? '#16a34a' : '#6b7280' }}>
            {hasKey ? `已就绪 · 端口 ${info?.helper_port ?? '…'}` : '未配置'}
          </span>
        </div>
      </nav>

      <main>
        {tab === 'settings' && <Settings installedSkills={installedSkills} />}
        {tab === 'about' && <About />}
      </main>

      {/* ===== 全局 install 进度浮窗（覆盖任何 Tab） ===== */}
      {installProgress && (
        <InstallProgressToast
          progress={installProgress}
          pendingName={pendingInstallRef.current[installProgress.job_id]?.name}
        />
      )}

      {/* v2.0.5：失败浮窗独立渲染，不依赖 installProgress。
          解决 v2.0.4 "失败被吞" P0-16 问题。 */}
      {installFailure && (
        <InstallFailureToast
          failure={installFailure}
          onClose={() => setInstallFailure(null)}
        />
      )}
    </div>
  );
}

function InstallProgressToast({
  progress,
  pendingName,
}: {
  progress: InstallProgress;
  pendingName?: string;
}) {
  const pct = progress.total_steps > 0 ? (progress.step / progress.total_steps) * 100 : 0;
  const msg = progress.event?.message ?? progress.event?.kind ?? '';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 340,
        padding: 14,
        background: '#fff',
        border: '1px solid #bfdbfe',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
        zIndex: 1000,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e3a8a' }}>
          正在安装 {pendingName ?? progress.job_id}
        </span>
        <span style={{ fontSize: 11, color: '#1d4ed8', fontFamily: 'monospace' }}>
          {progress.step}/{progress.total_steps} · {(progress.elapsed_ms / 1000).toFixed(1)}s
        </span>
      </div>
      <div
        style={{
          height: 6,
          width: '100%',
          background: '#dbeafe',
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: msg ? 6 : 0,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: '#2563eb',
            transition: 'width 200ms ease',
          }}
        />
      </div>
      {msg && (
        <div style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {msg}
        </div>
      )}
    </div>
  );
}

/**
 * v2.0.5：失败浮窗（红色 toast），独立于进度浮窗。
 * 旧版 install-complete 收到 failed 时只 setInstallProgress(null)，用户被误导为"装成功了"。
 */
function InstallFailureToast({
  failure,
  onClose,
}: {
  failure: InstallFailure;
  onClose: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 340,
        padding: 14,
        background: '#fff',
        border: '1px solid #fca5a5',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
        zIndex: 1000,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>
          ✗ 安装失败 · {failure.skillName}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6b7280',
            fontSize: 14,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#7f1d1d',
          background: '#fef2f2',
          padding: 6,
          borderRadius: 6,
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          maxHeight: 96,
          overflow: 'auto',
        }}
      >
        {failure.error}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
        可去「LLM Key 设置」查看「已安装 Skills」列表，确认是否需要重试。
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
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
