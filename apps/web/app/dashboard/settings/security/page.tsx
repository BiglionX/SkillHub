'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers/SessionProvider';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Shield, LogOut, Trash2, AlertTriangle } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码为必填项'),
  newPassword: z.string().min(8, '新密码长度至少为8个字符'),
  confirmPassword: z.string().min(1, '请确认新密码'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

export default function SecuritySettingsPage() {
  const { data: session } = useSession();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PasswordFormData>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onChange',
  });

  const validateForm = (data: PasswordFormData) => {
    const result = passwordSchema.safeParse(data);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0] as string] = issue.message;
        }
      });
      return errors;
    }
    return {};
  };

  const handlePasswordChange = async (data: PasswordFormData) => {
    const validationErrors = validateForm(data);
    if (Object.keys(validationErrors).length > 0) {
      setMessage({ type: 'error', text: '请修正表单错误' });
      return;
    }

    setIsChangingPassword(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '修改密码失败');
      }

      setMessage({ type: 'success', text: '密码修改成功！' });
      reset();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '修改密码失败，请重试',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    // TODO: 实现删除账户功能
    setMessage({ type: 'error', text: '删除账户功能暂未实现' });
    setShowDeleteConfirm(false);
  };

  if (!session) {
    return <LoadingSpinner />;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">账户安全</h1>
        <p className="mt-1 text-sm text-gray-600">管理您的密码和账户安全设置</p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 修改密码 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <div className="flex items-center mb-4">
          <Shield className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">修改密码</h2>
        </div>

        <form onSubmit={handleSubmit(handlePasswordChange)} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
              当前密码 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              id="currentPassword"
              {...register('currentPassword')}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {errors.currentPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.currentPassword.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              新密码 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              id="newPassword"
              {...register('newPassword')}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {errors.newPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.newPassword.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">密码长度至少为8个字符</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              确认新密码 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              id="confirmPassword"
              {...register('confirmPassword')}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChangingPassword ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  修改中...
                </>
              ) : (
                '修改密码'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 本地账号登录提示 */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
        <p className="text-sm text-blue-800">
          <strong>提示：</strong>您正在使用 SkillHub 本地账号。如需修改密码，请填写上方表单。
          通过第三方账号（ProClaw/OIDC）登录的用户如需设置本地密码，请联系管理员。
        </p>
      </div>

      {/* 活跃会话 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <LogOut className="w-5 h-5 text-gray-600 mr-2" />
            <h2 className="text-lg font-medium text-gray-900">活跃会话</h2>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          以下是您当前登录的设备。如果您发现任何异常活动，可以立即退出所有其他会话。
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
            <div>
              <p className="text-sm font-medium text-gray-900">当前设备</p>
              <p className="text-xs text-gray-500">刚刚活跃</p>
            </div>
            <span className="text-xs text-green-600 font-medium">当前会话</span>
          </div>
        </div>
        <button
          className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
          onClick={() => setMessage({ type: 'success', text: '退出其他会话功能暂未实现' })}
        >
          退出所有其他会话
        </button>
      </div>

      {/* 删除账户 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-red-200">
        <div className="flex items-center mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">危险区域</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          删除账户是不可逆的操作。您的所有数据（Skills、命名空间、评论等）都将被永久删除。
        </p>
        
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            删除账户
          </button>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800 font-medium mb-2">确认删除账户？</p>
              <p className="text-xs text-red-700">
                此操作无法撤销。您确定要删除账户及其所有数据吗？
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleDeleteAccount}
                className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                确认删除
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
