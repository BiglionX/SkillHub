import { useState } from 'react';
import Settings from './pages/Settings';

type Tab = 'settings' | 'about';

export default function App() {
  const [tab, setTab] = useState<Tab>('settings');

  return (
    <div>
      <nav
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
        }}
      >
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
          LLM Key 设置
        </TabButton>
        <TabButton active={tab === 'about'} onClick={() => setTab('about')}>
          关于
        </TabButton>
      </nav>

      <main>
        {tab === 'settings' && <Settings />}
        {tab === 'about' && <About />}
      </main>
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
        padding: '6px 14px',
        border: '1px solid ' + (active ? '#2563eb' : '#e5e7eb'),
        background: active ? '#eff6ff' : '#fff',
        color: active ? '#2563eb' : '#374151',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
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
        SkillHub 桌面助手负责：
        <br />
        ① 注册 <code>skillhub://</code> 自定义协议（M2）
        <br />
        ② 扫描本机已装软件（M2）
        <br />
        ③ 转发 Web 端 LLM 调用到你本机的 API Key（<strong>不经过云端</strong>）
        <br />
        ④ 执安装剧本（Playbook，M2）
        <br />
        <br />
        你的 API Key 仅 AES-256 加密存储在本机 <code>%APPDATA%\skillhub-helper\.data\llm-keys.json</code>，
        永远不会上传到 SkillHub 服务器。
      </p>
    </div>
  );
}
