import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// 强制动态渲染，避免在构建时访问数据库
export const dynamic = 'force-dynamic';

// Next.js 15: params 现在是 Promise，必须 await
interface UserDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  await auth();
  // Next.js 15: 必须 await params
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          skills: true,
          apiKeys: true,
          auditLogs: true,
          reviews: true,
        },
      },
      skills: {
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
      },
      apiKeys: {
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* 返回按钮 */}
      <Link
        href="/admin/users"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回用户列表
      </Link>

      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">用户详情</h1>
        <p className="mt-1 text-sm text-gray-600">查看用户详细信息和活动记录</p>
      </div>

      {/* 用户基本信息卡片 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-start space-x-6">
          <div className="shrink-0">
            {user.image ? (
              <img
                className="h-24 w-24 rounded-full"
                src={user.image}
                alt={user.name || 'User'}
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-linear-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
                <span className="text-white font-medium text-3xl">
                  {(user.name || user.email)[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {user.name || '未设置姓名'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">{user.email}</p>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                user.emailVerified 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {user.emailVerified ? '已验证' : '待验证'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600">Skills</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">
                  {user._count.skills}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600">API Keys</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">
                  {user._count.apiKeys}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600">审计日志</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">
                  {user._count.auditLogs}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600">审核记录</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">
                  {user._count.reviews}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">用户 ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{user.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">注册时间</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(user.createdAt).toLocaleString('zh-CN')}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">最后更新</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(user.updatedAt).toLocaleString('zh-CN')}
              </dd>
            </div>
            {user.emailVerified && (
              <div>
                <dt className="text-sm font-medium text-gray-500">邮箱验证时间</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(user.emailVerified).toLocaleString('zh-CN')}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* 用户的 Skills */}
      {user.skills.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">最近创建的 Skills</h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {user.skills.map((skill: { id: string; name: string; slug: string; description: string | null; category: string; version: string; status: string; createdAt: Date }) => (
              <li key={skill.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Link
                      href={`/skills/${skill.slug}`}
                      className="text-sm font-medium text-purple-600 hover:text-purple-900"
                    >
                      {skill.name}
                    </Link>
                    <p className="text-sm text-gray-600 mt-1">{skill.description}</p>
                    <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                      <span>分类: {skill.category}</span>
                      <span>版本: {skill.version}</span>
                      <span>状态: {skill.status}</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(skill.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 用户的 API Keys */}
      {user.apiKeys.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">API Keys</h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {user.apiKeys.map((apiKey: { id: string; name: string; prefix: string; permissions: string[]; lastUsedAt: Date | null; createdAt: Date }) => (
              <li key={apiKey.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{apiKey.name}</div>
                    <div className="text-sm text-gray-500 mt-1 font-mono">
                      {apiKey.prefix}...
                    </div>
                    <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                      <span>权限: {apiKey.permissions.join(', ')}</span>
                      {apiKey.lastUsedAt && (
                        <span>最后使用: {new Date(apiKey.lastUsedAt).toLocaleDateString('zh-CN')}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    创建于 {new Date(apiKey.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex space-x-3">
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          编辑用户
        </button>
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          禁用账户
        </button>
      </div>
    </div>
  );
}
