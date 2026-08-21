'use client';

import React, { useState } from 'react';
import { Plus, Edit, Trash2, Upload, Package } from 'lucide-react';
import { useMySkills } from '../hooks/useMySkills';
import type { MySkillsManagerProps, LocalSkill } from '../types';

export function MySkillsManager({
  apiUrl = 'http://localhost:3000/api',
  authToken,
  allowPublish = true,
  allowEdit = true,
  allowDelete = true,
  className = '',
  theme,
  onSkillUpdate,
  onSkillPublish,
}: MySkillsManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<LocalSkill | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    version: '1.0.0',
    category: '',
    tags: '',
    content: '',
  });

  const { skills, loading, error, addSkill, updateSkill, deleteSkill, publishSkill } = useMySkills({
    onSkillUpdate,
    onSkillPublish,
  });

  const themeStyles = {
    '--widget-primary': theme?.primaryColor || '#3b82f6',
    '--widget-bg': theme?.backgroundColor || '#ffffff',
    '--widget-text': theme?.textColor || '#1f2937',
    '--widget-border': theme?.borderColor || '#e5e7eb',
    '--widget-radius': theme?.borderRadius || '0.5rem',
  } as React.CSSProperties;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const skillData = {
      name: formData.name,
      slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
      description: formData.description,
      version: formData.version,
      category: formData.category || undefined,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      content: formData.content,
      isPublished: false,
    };

    if (editingSkill) {
      updateSkill(editingSkill.id, skillData);
      setEditingSkill(null);
    } else {
      addSkill(skillData);
    }

    resetForm();
  };

  const handleEdit = (skill: LocalSkill) => {
    setEditingSkill(skill);
    setFormData({
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      version: skill.version || '1.0.0',
      category: skill.category || '',
      tags: skill.tags?.join(', ') || '',
      content: skill.content || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = (skillId: string) => {
    if (window.confirm('确定要删除这个 Skill 吗？')) {
      deleteSkill(skillId);
    }
  };

  const handlePublish = async (skillId: string) => {
    if (!authToken) {
      alert('请先配置认证 Token');
      return;
    }

    try {
      await publishSkill(skillId, authToken, apiUrl);
      alert('发布成功！');
    } catch (err) {
      alert(err instanceof Error ? err.message : '发布失败');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      version: '1.0.0',
      category: '',
      tags: '',
      content: '',
    });
    setShowAddForm(false);
    setEditingSkill(null);
  };

  return (
    <div className={`my-skills-manager ${className}`} style={themeStyles}>
      {/* 标题和操作 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--widget-text)' }}>
          我的 Skills
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity"
          style={{
            backgroundColor: 'var(--widget-primary)',
            borderRadius: 'var(--widget-radius)',
          }}
        >
          <Plus className="w-4 h-4" />
          {showAddForm ? '取消' : '新建 Skill'}
        </button>
      </div>

      {/* 添加/编辑表单 */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-6 border rounded-lg space-y-4">
          <h3 className="font-semibold" style={{ color: 'var(--widget-text)' }}>
            {editingSkill ? '编辑 Skill' : '新建 Skill'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                名称 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
                style={{ borderRadius: 'var(--widget-radius)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="留空则自动生成"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
                style={{ borderRadius: 'var(--widget-radius)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                版本
              </label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
                style={{ borderRadius: 'var(--widget-radius)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
                style={{ borderRadius: 'var(--widget-radius)' }}
              >
                <option value="">选择分类</option>
                <option value="development">开发工具</option>
                <option value="data">数据处理</option>
                <option value="automation">自动化</option>
                <option value="ai">AI/ML</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              描述 *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
              style={{ borderRadius: 'var(--widget-radius)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              标签（用逗号分隔）
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="python, automation, data"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)]"
              style={{ borderRadius: 'var(--widget-radius)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skill 内容（Markdown）
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
              placeholder="# Skill 名称&#10;&#10;## 描述&#10;..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--widget-primary)] font-mono text-sm"
              style={{ borderRadius: 'var(--widget-radius)' }}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: 'var(--widget-primary)',
                borderRadius: 'var(--widget-radius)',
              }}
            >
              {editingSkill ? '保存' : '创建'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              style={{
                borderColor: 'var(--widget-border)',
                borderRadius: 'var(--widget-radius)',
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Skills 列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 mb-2">暂无 Skills</p>
          <p className="text-sm text-gray-500">点击"新建 Skill"开始创建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="p-4 border rounded-lg hover:shadow-md transition-shadow"
              style={{
                backgroundColor: 'var(--widget-bg)',
                borderColor: 'var(--widget-border)',
                borderRadius: 'var(--widget-radius)',
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold" style={{ color: 'var(--widget-text)' }}>
                      {skill.name}
                    </h3>
                    {skill.isPublished && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
                        已发布
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                      v{skill.version}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{skill.description}</p>
                  
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {skill.category && (
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        {skill.category}
                      </span>
                    )}
                    {skill.tags?.slice(0, 3).map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {!skill.isPublished && allowPublish && (
                    <button
                      onClick={() => handlePublish(skill.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="发布到 SkillHub"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  )}
                  {allowEdit && (
                    <button
                      onClick={() => handleEdit(skill)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                  {allowDelete && (
                    <button
                      onClick={() => handleDelete(skill.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
