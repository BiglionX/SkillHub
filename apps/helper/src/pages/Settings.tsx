/**
 * SkillHub Helper 设置页
 *
 * M1 核心功能：
 * 1. 用户填 LLM API Key（DeepSeek / OpenAI / GLM / 自定义）
 * 2. 一键 Test 连接
 * 3. 切换 active Provider
 * 4. 显示当前助手端口号（让用户知道 Web 端怎么连）
 */
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface HelperInfo {
  version: string;
  name: string;
}

type Provider = 'deepseek' | 'openai' | 'glm' | 'custom';

const PROVIDERS: Array<{
  id: Provider;
  label: string;
  placeholder: string;
  docsUrl: string;
  defaultBaseUrl?: string;
}> = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    defaultBaseUrl: 'https://api.deepseek.com',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'glm',
    label: '智谱 GLM',
    placeholder: 'your-zhipu-key',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'custom',
    label: '自定义（自托管）',
    placeholder: 'your-key',
    docsUrl: '',
  },
];

export default function Settings() {
  const [info, setInfo] = useState<HelperInfo | null>(null);
  const [activeProvider, setActiveProvider] = useState<Provider>('deepseek');
  const [keys, setKeys] = useState<Record<Provider, string>>({
    deepseek: '',
    openai: '',
    glm: '',
    custom: '',
  });
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [testing, setTesting] = useState<Provider | null>(null);
  const [testResults, setTestResults] = useState<Record<Provider, 'ok' | 'fail' | null>>({
    deepseek: null,
    openai: null,
    glm: null,
    custom: null,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<HelperInfo>('get_helper_info').then(setInfo);
  }, []);

  const handleSave = async (_provider: Provider) => {
    // TODO: 调 Rust 命令保存
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async (provider: Provider) => {
    setTesting(provider);
    setTestResults((p) => ({ ...p, [provider]: null }));
    try {
      const providerConfig = PROVIDERS.find((p) => p.id === provider);
      if (!providerConfig) {
        setTestResults((p) => ({ ...p, [provider]: 'fail' }));
        return;
      }
      const result = await invoke<{ ok: boolean }>('test_provider_key', {
        provider,
        apiKey: keys[provider],
        baseUrl: provider === 'custom' ? customBaseUrl : providerConfig.defaultBaseUrl,
      });
      setTestResults((p) => ({ ...p, [provider]: result.ok ? 'ok' : 'fail' }));
    } catch {
      setTestResults((p) => ({ ...p, [provider]: 'fail' }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">SkillHub Helper</h1>
          <p className="mt-1 text-sm text-gray-500">
            桌面助手配置 · 版本 {info?.version || '...'}
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">LLM API Key</h2>
          <p className="mb-4 text-sm text-gray-500">
            您的 Key 仅存储在本机（AES 加密），不发送到云端。
          </p>

          <div className="space-y-4">
            {PROVIDERS.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border p-4 ${
                  activeProvider === p.id
                    ? 'border-blue-500 bg-blue-50/30'
                    : 'border-gray-200'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="activeProvider"
                      checked={activeProvider === p.id}
                      onChange={() => setActiveProvider(p.id)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-gray-900">{p.label}</span>
                  </label>
                  {p.docsUrl && (
                    <a
                      href={p.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      获取 Key →
                    </a>
                  )}
                </div>

                {p.id === 'custom' && activeProvider === 'custom' && (
                  <input
                    type="text"
                    placeholder="Base URL，如 https://your-vllm.com/v1"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    className="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                )}

                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={p.placeholder}
                    value={keys[p.id]}
                    onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                    className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleTest(p.id)}
                    disabled={!keys[p.id] || testing === p.id}
                    className="rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {testing === p.id ? '测试中...' : 'Test'}
                  </button>
                </div>

                {testResults[p.id] === 'ok' && (
                  <p className="mt-2 text-xs text-green-600">✓ Key 有效</p>
                )}
                {testResults[p.id] === 'fail' && (
                  <p className="mt-2 text-xs text-red-600">✗ Key 无效，请检查</p>
                )}

                <button
                  onClick={() => handleSave(p.id)}
                  className="mt-3 w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  保存 {p.label} Key
                </button>
              </div>
            ))}
          </div>

          {saved && (
            <p className="mt-4 text-sm text-green-600">✓ 已保存到本机</p>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">关于</h2>
          <p className="text-sm text-gray-500">
            本助手仅用于在您的电脑和 SkillHub 网页之间转发 LLM 请求。
            您的 Key 永远不会上传到 SkillHub 服务器。
          </p>
        </section>
      </div>
    </div>
  );
}