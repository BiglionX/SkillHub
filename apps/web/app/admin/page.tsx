import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
// v2.0.7+：plan §3.4。仪表盘统计卡接入玻璃化 StatCard（components/ui/StatCard.tsx）。
import { StatCard, StatsGrid } from '@/components/ui/StatCard';
import { Package, Clock, Users, Layers } from 'lucide-react';

// 强制动态渲染，避免在构建时访问数据库
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();

  // 获取统计数据
  const [
    totalSkills,
    pendingReviews,
    totalUsers,
    totalNamespaces,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.skill.count(),
    prisma.review.count({
      where: {
        status: {
          in: ['PENDING_REVIEW', 'UNDER_REVIEW'],
        },
      },
    }),
    prisma.user.count(),
    prisma.namespace.count(),
    prisma.auditLog.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        actor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="glass-card-soft px-6 py-5">
        <h1 className="text-2xl font-bold gradient-text-h">管理概览</h1>
        <p className="mt-1 text-sm text-glass-text-secondary">
          欢迎回来，{session?.user?.name || '管理员'}
        </p>
      </div>

      {/* v2.0.7+：统计卡片接入玻璃化 StatCard。4 个核心指标 + 趋势色 tone（cyan/magenta/success/warning）。 */}
      <StatsGrid columns={4}>
        <StatCard
          title="总 Skills"
          value={totalSkills.toLocaleString()}
          icon={<Package className="w-6 h-6" />}
          color="cyan"
        />
        <StatCard
          title="待审核"
          value={pendingReviews.toLocaleString()}
          icon={<Clock className="w-6 h-6" />}
          color="warning"
          trend={{ value: 0, label: '待处理', isPositive: pendingReviews === 0 }}
        />
        <StatCard
          title="总用户"
          value={totalUsers.toLocaleString()}
          icon={<Users className="w-6 h-6" />}
          color="magenta"
        />
        <StatCard
          title="命名空间"
          value={totalNamespaces.toLocaleString()}
          icon={<Layers className="w-6 h-6" />}
          color="success"
        />
      </StatsGrid>

      {/* 最近活动 */}
      <div className="glass-card">
        <div className="px-6 py-5">
          <h3 className="text-lg font-semibold text-glass-text-primary mb-4">最近活动</h3>
          <div className="flow-root">
            <ul className="-mb-8">
              {recentAuditLogs.map((log: { id: string; action: string; resourceType: string; resourceId: string; createdAt: Date; actor?: { name?: string | null; email?: string | null } | null }, idx: number) => (
                <li key={log.id}>
                  <div className="relative pb-8">
                    {idx !== recentAuditLogs.length - 1 ? (
                      <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-glass-border" aria-hidden="true" />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-glass-surface-strong flex items-center justify-center ring-8 ring-glass-card-300/30">
                          <svg className="h-5 w-5 text-glass-text-link" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-sm text-glass-text-primary">
                            <span className="font-medium">{log.actor?.name || '未知用户'}</span>
                            {' '}执行了{' '}
                            <span className="font-medium text-magenta-300">{log.action}</span>
                          </p>
                          <p className="text-xs text-glass-text-muted mt-1">
                            {log.resourceType}: {log.resourceId}
                          </p>
                        </div>
                        <div className="text-right text-sm whitespace-nowrap text-glass-text-muted">
                          <time dateTime={log.createdAt.toISOString()}>
                            {new Date(log.createdAt).toLocaleString('zh-CN')}
                          </time>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
}
