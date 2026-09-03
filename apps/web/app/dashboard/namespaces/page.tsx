'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Users, Package, MoreVertical, Eye } from 'lucide-react';
import { Namespace } from '@/types';

export default function NamespacesPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNamespace, setNewNamespace] = useState<{
    name: string;
    slug: string;
    description: string;
    type: 'PERSONAL' | 'TEAM' | 'GLOBAL';
  }>({
    name: '',
    slug: '',
    description: '',
    type: 'PERSONAL',
  });

  // 获取命名空间列表
  const { data: namespacesData, isLoading } = useQuery({
    queryKey: ['namespaces'],
    queryFn: async () => {
      const response = await fetch('/api/namespaces?limit=100');
      if (!response.ok) throw new Error('获取命名空间失败');
      return response.json();
    },
  });

  const namespaces: Namespace[] = namespacesData?.data?.namespaces || [];

  // 创建命名空间
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; description?: string; type: 'PERSONAL' | 'TEAM' | 'GLOBAL' }) => {
      const response = await fetch('/api/namespaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '创建失败');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['namespaces'] });
      setShowCreateModal(false);
      setNewNamespace({ name: '', slug: '', description: '', type: 'PERSONAL' });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNamespace.name || !newNamespace.slug) return;
    createMutation.mutate(newNamespace);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const getTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      PERSONAL: '个人',
      TEAM: '团队',
      GLOBAL: '全局',
    };
    return typeMap[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      PERSONAL: 'bg-blue-100 text-blue-800',
      TEAM: 'bg-green-100 text-green-800',
      GLOBAL: 'bg-purple-100 text-purple-800',
    };
    return colorMap[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 标题和操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">命名空间管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理你的命名空间和团队协作
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          创建命名空间
        </button>
      </div>

      {/* 命名空间列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : namespaces.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">暂无命名空间</h3>
          <p className="mt-1 text-sm text-gray-500">
            开始创建你的第一个命名空间吧！
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              创建命名空间
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {namespaces.map((namespace) => (
            <div
              key={namespace.id}
              className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow duration-200"
            >
              {/* 头部 */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {namespace.name}
                  </h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(namespace.type)}`}>
                    {getTypeText(namespace.type)}
                  </span>
                </div>
                <div className="relative">
                  <button className="p-2 rounded-full hover:bg-gray-100">
                    <MoreVertical className="h-5 w-5 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* 描述 */}
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {namespace.description || '暂无描述'}
              </p>

              {/* 统计信息 */}
              <div className="flex items-center justify-between text-sm text-gray-500 mb-4 pt-4 border-t">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <Package className="h-4 w-4 mr-1" />
                    {namespace.skillCount || 0} Skills
                  </div>
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {namespace.memberCount || 1} 成员
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/namespaces/${namespace.slug}`}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  查看
                </Link>
                <Link
                  href={`/dashboard/namespaces/${namespace.slug}/members`}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Users className="h-4 w-4 mr-2" />
                  成员
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建命名空间模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">创建命名空间</h3>
            </div>
            <form onSubmit={handleCreateSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={newNamespace.name}
                  onChange={(e) => {
                    setNewNamespace({ ...newNamespace, name: e.target.value, slug: generateSlug(e.target.value) });
                  }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="输入命名空间名称"
                  required
                />
              </div>

              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
                  Slug <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="slug"
                  value={newNamespace.slug}
                  onChange={(e) => setNewNamespace({ ...newNamespace, slug: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="唯一标识符"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  只能包含小写字母、数字和连字符
                </p>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  描述
                </label>
                <textarea
                  id="description"
                  value={newNamespace.description}
                  onChange={(e) => setNewNamespace({ ...newNamespace, description: e.target.value })}
                  rows={3}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="描述这个命名空间的用途..."
                />
              </div>

              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                  类型
                </label>
                <select
                  id="type"
                  value={newNamespace.type}
                  onChange={(e) =>
                                      setNewNamespace({
                                        ...newNamespace,
                                        // v2.0.7+：select 下拉的 type 受枚举约束；onChange 给 string，需 cast
                                        type: e.target.value as 'PERSONAL' | 'TEAM' | 'GLOBAL',
                                      })
                                    }
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="PERSONAL">个人</option>
                  <option value="TEAM">团队</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
