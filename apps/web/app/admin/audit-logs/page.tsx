'use client';

import { useQuery } from '@tanstack/react-query';
import type { AuditLog } from '@/types';

export default function AuditLogsPage() {
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const response = await fetch('/api/audit-logs?limit=50');
      if (!response.ok) throw new Error('获取审计日志失败');
      return response.json();
    },
  });

  const logs: AuditLog[] = logsData?.data || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">审计日志</h1>
        <p className="mt-1 text-sm text-gray-600">
          查看系统操作记录和用户活动
        </p>
      </div>

      {/* 日志列表 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">暂无日志记录</h3>
              <p className="mt-1 text-sm text-gray-500">系统将自动记录所有重要操作</p>
            </div>
          ) : (
            <div className="flow-root">
              <ul className="-mb-8">
                {logs.map((log, idx) => (
                  <li key={log.id}>
                    <div className="relative pb-8">
                      {idx !== logs.length - 1 ? (
                        <span className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex items-start space-x-3">
                        <div>
                          <div className="relative px-1">
                            <div className="h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center ring-8 ring-white">
                              <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-900">
                                {log.actor?.name || '未知用户'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-sm text-gray-600">
                              执行了 <span className="font-medium text-purple-600">{log.action}</span>
                            </p>
                          </div>
                          <div className="mt-2 text-sm text-gray-500">
                            <p>资源类型: {log.resourceType}</p>
                            <p>资源ID: {log.resourceId}</p>
                            {log.metadata && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                                  查看详细元数据
                                </summary>
                                <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-gray-400">
                            <time dateTime={log.createdAt}>
                              {new Date(log.createdAt).toLocaleString('zh-CN')}
                            </time>
                            {log.actorIp && (
                              <span className="ml-2">IP: {log.actorIp}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
