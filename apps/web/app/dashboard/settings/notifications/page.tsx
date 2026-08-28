'use client';

import { useState } from 'react';
import { Bell, Mail, Send } from 'lucide-react';

export default function NotificationSettingsPage() {
  const [notifications, setNotifications] = useState({
    skillApproved: true,
    skillRejected: true,
    newComment: true,
    memberInvitation: true,
    securityAlerts: true,
    marketingEmails: false,
    frequency: 'instant', // instant, daily, weekly
  });

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggle = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      // TODO: 调用 API 保存通知设置
      // await fetch('/api/users/notifications', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(notifications),
      // });

      // 模拟 API 调用
      await new Promise((resolve) => setTimeout(resolve, 500));

      setMessage({ type: 'success', text: '通知设置已保存！' });
    } catch {
      setMessage({
        type: 'error',
        text: '保存失败，请重试',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = () => {
    setMessage({ type: 'success', text: '测试通知已发送！请检查您的邮箱。' });
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">通知设置</h1>
        <p className="mt-1 text-sm text-gray-600">管理您接收通知的方式和频率</p>
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

      {/* Email 通知设置 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <div className="flex items-center mb-4">
          <Mail className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">Email 通知</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Skill 审核通过</p>
              <p className="text-xs text-gray-500">当您的 Skill 通过审核时通知您</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.skillApproved}
                onChange={() => handleToggle('skillApproved')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Skill 审核被拒</p>
              <p className="text-xs text-gray-500">当您的 Skill 被拒绝时通知您</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.skillRejected}
                onChange={() => handleToggle('skillRejected')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">新评论</p>
              <p className="text-xs text-gray-500">当有人评论您的 Skill 时通知您</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.newComment}
                onChange={() => handleToggle('newComment')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">成员邀请</p>
              <p className="text-xs text-gray-500">当您被邀请加入命名空间时通知您</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.memberInvitation}
                onChange={() => handleToggle('memberInvitation')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">安全提醒</p>
              <p className="text-xs text-gray-500">登录提醒、密码修改等安全相关通知</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.securityAlerts}
                onChange={() => handleToggle('securityAlerts')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <p className="text-sm font-medium text-gray-900">营销邮件</p>
              <p className="text-xs text-gray-500">产品更新、新功能介绍等</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.marketingEmails}
                onChange={() => handleToggle('marketingEmails')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 通知频率 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <div className="flex items-center mb-4">
          <Bell className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">通知频率</h2>
        </div>

        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="radio"
              name="frequency"
              value="instant"
              checked={notifications.frequency === 'instant'}
              onChange={(e) => setNotifications({ ...notifications, frequency: e.target.value })}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm text-gray-700">即时通知</span>
          </label>

          <label className="flex items-center">
            <input
              type="radio"
              name="frequency"
              value="daily"
              checked={notifications.frequency === 'daily'}
              onChange={(e) => setNotifications({ ...notifications, frequency: e.target.value })}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm text-gray-700">每日摘要</span>
          </label>

          <label className="flex items-center">
            <input
              type="radio"
              name="frequency"
              value="weekly"
              checked={notifications.frequency === 'weekly'}
              onChange={(e) => setNotifications({ ...notifications, frequency: e.target.value })}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm text-gray-700">每周摘要</span>
          </label>
        </div>
      </div>

      {/* 测试通知 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">测试通知</h2>
        <p className="text-sm text-gray-600 mb-4">
          发送一封测试邮件到您的邮箱，以验证通知设置是否正确。
        </p>
        <button
          onClick={handleTestNotification}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Send className="w-4 h-4 mr-2" />
          发送测试通知
        </button>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
