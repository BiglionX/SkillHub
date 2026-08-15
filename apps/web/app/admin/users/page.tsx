import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import Link from 'next/link';
import StatusFilter from './StatusFilter';

// 强制动态渲染，避免在构建时访问数据库
export const dynamic = 'force-dynamic';

interface UsersPageProps {
  // Next.js 15: searchParams 是 Promise，必须 await
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
  }>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  await auth();

  // 获取查询参数
  const resolved = await searchParams;
  const page = parseInt(resolved.page || '1');
  const search = resolved.search || '';
  const status = resolved.status || 'all';
  const pageSize = 20;
  
  // 构建查询条件
  const where: Prisma.UserWhereInput = {};
  
  // 搜索条件
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  
  // 状态筛选
  if (status === 'verified') {
    where.emailVerified = { not: null };
  } else if (status === 'unverified') {
    where.emailVerified = null;
  }
  
  const [users, totalUsers] = await Promise.all([
    prisma.user.findMany({
      where,
      take: pageSize,
      skip: (page - 1) * pageSize,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            skills: true,
            apiKeys: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(totalUsers / pageSize);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
          <p className="mt-1 text-sm text-gray-600">管理平台所有注册用户</p>
        </div>
        <div className="text-sm text-gray-600">
          共 <span className="font-semibold text-gray-900">{totalUsers}</span> 个用户
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* 搜索框 */}
          <div className="flex-1">
            <form action="/admin/users" method="GET" className="relative">
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="搜索用户名或邮箱..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {status && <input type="hidden" name="status" value={status} />}
              <button type="submit" className="sr-only">搜索</button>
            </form>
          </div>

          {/* 状态筛选 */}
          <form action="/admin/users" method="GET" className="flex gap-2">
            {search && <input type="hidden" name="search" value={search} />}
            <StatusFilter status={status} search={search} />
            {(search || status !== 'all') && (
              <Link
                href="/admin/users"
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm text-gray-700"
              >
                清除筛选
              </Link>
            )}
          </form>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用户
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  邮箱
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Skills
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  API Keys
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  注册时间
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="shrink-0">
                        {user.image ? (
                          <img
                            className="h-10 w-10 rounded-full"
                            src={user.image}
                            alt={user.name || 'User'}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-linear-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {(user.name || user.email || 'U')[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.name || '未设置姓名'}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {user.id.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.email}</div>
                    <div className="text-xs text-gray-500">
                      {user.emailVerified ? '已验证' : '未验证'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user._count.skills}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user._count.apiKeys}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(user.createdAt).toLocaleTimeString('zh-CN', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.emailVerified 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {user.emailVerified ? '活跃' : '待验证'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-purple-600 hover:text-purple-900"
                    >
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 空状态 */}
        {users.length === 0 && (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">暂无用户</h3>
            <p className="mt-1 text-sm text-gray-500">还没有用户注册</p>
          </div>
        )}

        {/* 分页 */}
        {totalUsers > pageSize && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <Link
                href={`/admin/users?page=${Math.max(1, page - 1)}${search ? `&search=${search}` : ''}${status !== 'all' ? `&status=${status}` : ''}`}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  page === 1 ? 'text-gray-300 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                上一页
              </Link>
              <Link
                href={`/admin/users?page=${Math.min(totalPages, page + 1)}${search ? `&search=${search}` : ''}${status !== 'all' ? `&status=${status}` : ''}`}
                className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  page === totalPages ? 'text-gray-300 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                下一页
              </Link>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  显示第{' '}
                  <span className="font-medium">{(page - 1) * pageSize + 1}</span> 到{' '}
                  <span className="font-medium">{Math.min(page * pageSize, totalUsers)}</span> 条，
                  共 <span className="font-medium">{totalUsers}</span> 条结果
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  {/* 上一页 */}
                  <Link
                    href={`/admin/users?page=${Math.max(1, page - 1)}${search ? `&search=${search}` : ''}${status !== 'all' ? `&status=${status}` : ''}`}
                    className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 text-sm font-medium ${
                      page === 1
                        ? 'text-gray-300 bg-gray-50 cursor-not-allowed'
                        : 'text-gray-500 bg-white hover:bg-gray-50'
                    }`}
                  >
                    上一页
                  </Link>

                  {/* 页码按钮 */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <Link
                        key={pageNum}
                        href={`/admin/users?page=${pageNum}${search ? `&search=${search}` : ''}${status !== 'all' ? `&status=${status}` : ''}`}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          page === pageNum
                            ? 'z-10 bg-purple-50 border-purple-500 text-purple-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </Link>
                    );
                  })}

                  {/* 下一页 */}
                  <Link
                    href={`/admin/users?page=${Math.min(totalPages, page + 1)}${search ? `&search=${search}` : ''}${status !== 'all' ? `&status=${status}` : ''}`}
                    className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 text-sm font-medium ${
                      page === totalPages
                        ? 'text-gray-300 bg-gray-50 cursor-not-allowed'
                        : 'text-gray-500 bg-white hover:bg-gray-50'
                    }`}
                  >
                    下一页
                  </Link>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
