'use client';

import React from 'react';
import { Check, Archive, Trash2, FileText, X } from 'lucide-react';

 
interface BatchActionBarProps {
  selectedCount: number;
  onAction: (action: 'publish' | 'archive' | 'draft' | 'delete') => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}
 

/**
 * 批量操作工具栏组件
 */
export function BatchActionBar({
  selectedCount,
  onAction,
  onCancel,
  isLoading = false,
}: BatchActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  const handleAction = async (action: 'publish' | 'archive' | 'draft' | 'delete') => {
    const actionNames = {
      publish: '发布',
      archive: '归档',
      draft: '转为草稿',
      delete: '删除',
    };

    if (window.confirm(`确定要${actionNames[action]}选中的 ${selectedCount} 个Skills吗？`)) {
      await onAction(action);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50 animate-slide-up">
      <div className="flex items-center gap-4">
        {/* 选中数量 */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
          <span className="text-sm font-medium text-blue-700">
            已选择 {selectedCount} 项
          </span>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300"></div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('publish')}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
            title="批量发布"
          >
            <Check className="w-4 h-4" />
            发布
          </button>

          <button
            onClick={() => handleAction('draft')}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            title="转为草稿"
          >
            <FileText className="w-4 h-4" />
            草稿
          </button>

          <button
            onClick={() => handleAction('archive')}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors disabled:opacity-50"
            title="批量归档"
          >
            <Archive className="w-4 h-4" />
            归档
          </button>

          <button
            onClick={() => handleAction('delete')}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
            title="批量删除"
          >
            <Trash2 className="w-4 h-4" />
            删除
          </button>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300"></div>

        {/* 取消按钮 */}
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="取消选择"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
