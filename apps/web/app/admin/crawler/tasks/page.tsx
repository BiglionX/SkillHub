import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import Link from 'next/link';

// 强制动态渲染，避免在构建时访问数据库
export const dynamic = 'force-dynamic';

interface TasksPageProps {
  // Next.js 15: searchParams 是 Promise，必须 await
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
}

export default async function CrawlerTasksPage({ searchParams }: TasksPageProps) {
  const session = await auth();

  // 检查管理员权限
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  if (!session?.user?.email || !adminEmails.includes(session.user.email)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">未授权访问</h1>
          <p className="text-gray-600">您需要管理员权限才能查看此页面</p>
          <Link href="/admin" className="mt-4 inline-block text-purple-600 hover:text-purple-800">
            返回管理后台
          </Link>
        </div>
      </div>
    );
  }

  // 获取查询参数
  const resolved = await searchParams;
  const page = parseInt(resolved.page || '1');
  const status = resolved.status || 'all';
  const pageSize = 20;

  // 构建查询条件
  const where: Prisma.CrawlerTaskWhereInput = {};
  if (status !== 'all') {
    where.status = status;
  }

  const [tasks, totalTasks] = await Promise.all([
    prisma.crawlerTask.findMany({
      where,
      take: pageSize,
      skip: (page - 1) * pageSize,
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.crawlerTask.count({ where }),
  ]);

  const totalPages = Math.ceil(totalTasks / pageSize);

  // 状态颜色映射
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // 状态中文映射
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      case 'running':
        return '运行中';
      case 'pending':
        return '等待中';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">爬虫任务历史</h1>
          <p className="mt-1 text-sm text-gray-600">查看所有爬虫任务的执行记录</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/crawler"
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm text-gray-700"
          >
            返回爬虫设置
          </Link>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-600">总任务数</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalTasks}</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-600">已完成</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {tasks.filter(t => t.status === 'completed').length}
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-600">失败</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {tasks.filter(t => t.status === 'failed').length}
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-600">运行中</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {tasks.filter(t => t.status === 'running').length}
          </div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">状态筛选：</span>
          <div className="flex gap-2">
            {['all', 'pending', 'running', 'completed', 'failed'].map((s) => (
              <Link
                key={s}
                href={`/admin/crawler/tasks?status=${s}`}
                className={`px-3 py-1 rounded-md text-sm ${
                  status === s
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? '全部' : getStatusText(s)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  任务类型
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  目标
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  重试次数
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建时间
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  完成时间
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{task.taskType}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">{task.target}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {task.retryCount} / {task.maxRetries}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(task.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {task.completedAt 
                        ? new Date(task.completedAt).toLocaleString('zh-CN')
                        : '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 空状态 */}
        {tasks.length === 0 && (
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">暂无任务</h3>
            <p className="mt-1 text-sm text-gray-500">还没有爬虫任务记录</p>
          </div>
        )}

        {/* 分页 */}
        {totalTasks > pageSize && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <Link
                href={`/admin/crawler/tasks?page=${Math.max(1, page - 1)}${status !== 'all' ? `&status=${status}` : ''}`}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  page === 1 ? 'text-gray-300 bg-gray-50 cursor-not-allowed' : 'text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                上一页
              </Link>
              <Link
                href={`/admin/crawler/tasks?page=${Math.min(totalPages, page + 1)}${status !== 'all' ? `&status=${status}` : ''}`}
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
                  <span className="font-medium">{Math.min(page * pageSize, totalTasks)}</span> 条，
                  共 <span className="font-medium">{totalTasks}</span> 条结果
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <Link
                    href={`/admin/crawler/tasks?page=${Math.max(1, page - 1)}${status !== 'all' ? `&status=${status}` : ''}`}
                    className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 text-sm font-medium ${
                      page === 1
                        ? 'text-gray-300 bg-gray-50 cursor-not-allowed'
                        : 'text-gray-500 bg-white hover:bg-gray-50'
                    }`}
                  >
                    上一页
                  </Link>

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
                        href={`/admin/crawler/tasks?page=${pageNum}${status !== 'all' ? `&status=${status}` : ''}`}
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

                  <Link
                    href={`/admin/crawler/tasks?page=${Math.min(totalPages, page + 1)}${status !== 'all' ? `&status=${status}` : ''}`}
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
