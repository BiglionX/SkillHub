'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Save, X } from 'lucide-react';

interface Namespace {
  id: string;
  name: string;
  slug: string;
  type: string;
}

export default function CreateSkillPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    repositoryUrl: '',
    category: 'other',
    tags: '',
    namespaceId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 获取命名空间列表
  const { data: namespacesData } = useQuery({
    queryKey: ['namespaces'],
    queryFn: async () => {
      const response = await fetch('/api/namespaces?limit=100');
      if (!response.ok) throw new Error('获取命名空间失败');
      return response.json();
    },
  });

  const namespaces: Namespace[] = namespacesData?.data?.namespaces || [];

  // 自动生成 slug
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // 创建技能
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await fetch('/api/skills', {
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
    onSuccess: (data) => {
      router.push(`/dashboard/skills/${data.data.slug}`);
    },
    onError: (error: Error) => {
      setErrors({ submit: error.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = '名称为必填项';
    }
    
    if (!formData.slug.trim()) {
      newErrors.slug = 'Slug 为必填项';
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug = 'Slug 只能包含小写字母、数字和连字符';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // 准备数据
    const submitData = {
      ...formData,
      tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
      namespaceId: formData.namespaceId || null,
    };

    createMutation.mutate(submitData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // 清除错误
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // 自动生成 slug
    if (name === 'name' && !formData.slug) {
      setFormData((prev) => ({
        ...prev,
        slug: generateSlug(value),
      }));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 返回按钮 */}
      <Link
        href="/dashboard/skills"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        返回 Skills 列表
      </Link>

      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">创建新 Skill</h1>
        <p className="mt-1 text-sm text-gray-500">
          发布你的 AI Agent 技能到 Skill Hub
        </p>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本信息 */}
        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">
            基本信息
          </h2>

          {/* 名称 */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`block w-full px-3 py-2 border ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
              placeholder="例如：Python Data Analysis"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="slug"
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              className={`block w-full px-3 py-2 border ${
                errors.slug ? 'border-red-300' : 'border-gray-300'
              } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
              placeholder="例如：python-data-analysis"
            />
            <p className="mt-1 text-xs text-gray-500">
              URL 友好标识符，只能包含小写字母、数字和连字符
            </p>
            {errors.slug && (
              <p className="mt-1 text-sm text-red-600">{errors.slug}</p>
            )}
          </div>

          {/* 描述 */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              描述
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="详细描述这个 Skill 的功能和用途..."
            />
          </div>

          {/* 仓库链接 */}
          <div>
            <label htmlFor="repositoryUrl" className="block text-sm font-medium text-gray-700 mb-1">
              代码仓库 URL
            </label>
            <input
              type="url"
              id="repositoryUrl"
              name="repositoryUrl"
              value={formData.repositoryUrl}
              onChange={handleChange}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="https://github.com/username/repo"
            />
          </div>
        </div>

        {/* 分类和标签 */}
        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">
            分类和标签
          </h2>

          {/* 分类 */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              分类
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="ai-agent">AI Agent</option>
              <option value="data-science">数据科学</option>
              <option value="web-development">Web 开发</option>
              <option value="automation">自动化</option>
              <option value="productivity">生产力</option>
              <option value="other">其他</option>
            </select>
          </div>

          {/* 标签 */}
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
              标签
            </label>
            <input
              type="text"
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="用逗号分隔，例如：python, ai, automation"
            />
            <p className="mt-1 text-xs text-gray-500">
              多个标签用逗号分隔
            </p>
          </div>
        </div>

        {/* 命名空间 */}
        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">
            命名空间
          </h2>

          <div>
            <label htmlFor="namespaceId" className="block text-sm font-medium text-gray-700 mb-1">
              选择命名空间（可选）
            </label>
            <select
              id="namespaceId"
              name="namespaceId"
              value={formData.namespaceId}
              onChange={handleChange}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="">个人空间</option>
              {namespaces.map((ns) => (
                <option key={ns.id} value={ns.id}>
                  {ns.name} ({ns.type})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              如果不选择，将发布到你的个人空间
            </p>
          </div>
        </div>

        {/* 提交错误 */}
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <X className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">创建失败</h3>
                <p className="mt-1 text-sm text-red-700">{errors.submit}</p>
              </div>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3">
          <Link
            href="/dashboard/skills"
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {createMutation.isPending ? '创建中...' : '创建 Skill'}
          </button>
        </div>
      </form>
    </div>
  );
}
