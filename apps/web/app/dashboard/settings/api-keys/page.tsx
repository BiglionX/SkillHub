'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/ToastContainer';
import { Key, Trash2, Copy, Eye, EyeOff, Loader2, Plus } from 'lucide-react';

export default function ApiKeysSettingsPage() {
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState<Array<{
    id: string;
    name: string;
    prefix: string;
    permissions: string[];
    createdAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState(['read']);
  const [newKeyExpiresIn, setNewKeyExpiresIn] = useState<string>('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showFullKey, setShowFullKey] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // 加载 API 密钥列表
  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings/api-keys');
      if (!response.ok) throw new Error('加载失败');
      const data = await response.json();
      setApiKeys(data.data || []);
    } catch {
      toast.error('加载 API 密钥失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('请输入密钥名称');
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName,
          permissions: newKeyPermissions,
          expiresIn: newKeyExpiresIn || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建失败');
      }

      const result = await response.json();
      setGeneratedKey(result.data.fullKey);
      
      // 重新加载列表
      await loadApiKeys();
      
      setNewKeyName('');
      setNewKeyExpiresIn('');
      toast.success('API 密钥创建成功！请复制并妥善保管。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('确定要删除此 API 密钥吗？此操作无法撤销。')) {
      return;
    }

    try {
      const response = await fetch(`/api/settings/api-keys/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('删除失败');

      await loadApiKeys();
      toast.success('API 密钥已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  const togglePermission = (permission: string) => {
    setNewKeyPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API 密钥</h1>
          <p className="mt-1 text-sm text-gray-600">管理您的 API 访问密钥</p>
        </div>
        <button
          onClick={() => {
            setShowCreateModal(true);
            setGeneratedKey(null);
          }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          创建新密钥
        </button>
      </div>

      {/* 加载状态 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {apiKeys.length === 0 ? (
              <div className="p-12 text-center">
                <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">暂无 API 密钥</h3>
                <p className="text-sm text-gray-600 mb-4">
                  创建 API 密钥以通过 API 访问 SkillHub
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  创建第一个密钥
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{apiKey.name}</h3>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {apiKey.permissions.join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <code className="bg-gray-100 px-2 py-1 rounded font-mono">
                            {apiKey.prefix}
                          </code>
                          <button
                            onClick={() => copyToClipboard(apiKey.prefix)}
                            className="text-blue-600 hover:text-blue-700"
                            title="复制密钥前缀"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <p>创建于: {apiKey.createdAt}</p>
                          {apiKey.lastUsedAt && <p>最后使用: {apiKey.lastUsedAt}</p>}
                          {apiKey.expiresAt && <p>过期时间: {apiKey.expiresAt}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteKey(apiKey.id)}
                        className="ml-4 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                        title="删除密钥"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 创建密钥模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">创建 API 密钥</h3>
            </div>

            {!generatedKey ? (
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label htmlFor="keyName" className="block text-sm font-medium text-gray-700 mb-1">
                    密钥名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="keyName"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="例如：生产环境密钥"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    权限范围
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newKeyPermissions.includes('read')}
                        onChange={() => togglePermission('read')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">读取 (read)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newKeyPermissions.includes('write')}
                        onChange={() => togglePermission('write')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">写入 (write)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newKeyPermissions.includes('admin')}
                        onChange={() => togglePermission('admin')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">管理员 (admin)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    过期时间
                  </label>
                  <select
                    value={newKeyExpiresIn}
                    onChange={(e) => setNewKeyExpiresIn(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="">永不过期</option>
                    <option value="7d">7 天</option>
                    <option value="30d">30 天</option>
                    <option value="90d">90 天</option>
                    <option value="1y">1 年</option>
                  </select>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md">
                  <p className="text-xs text-yellow-800">
                    <strong>注意：</strong>密钥创建后只会显示一次，请立即复制并妥善保管。
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-6 py-4 space-y-4">
                <div className="bg-green-50 border border-green-200 p-4 rounded-md">
                  <p className="text-sm text-green-800 font-medium mb-2">密钥创建成功！</p>
                  <p className="text-xs text-green-700 mb-3">
                    请立即复制以下密钥，关闭后将无法再次查看完整密钥。
                  </p>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded border font-mono text-sm break-all">
                      {showFullKey ? generatedKey : generatedKey.substring(0, 20) + '...'}
                    </code>
                    <button
                      onClick={() => setShowFullKey(!showFullKey)}
                      className="p-2 text-gray-600 hover:text-gray-700"
                      title={showFullKey ? '隐藏' : '显示'}
                    >
                      {showFullKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(generatedKey)}
                      className="p-2 text-blue-600 hover:text-blue-700"
                      title="复制"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setGeneratedKey(null);
                  setNewKeyName('');
                }}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                {generatedKey ? '关闭' : '取消'}
              </button>
              {!generatedKey && (
                <button
                  onClick={handleCreateKey}
                  disabled={isCreating}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    '创建密钥'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
