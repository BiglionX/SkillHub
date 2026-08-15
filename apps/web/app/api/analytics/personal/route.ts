import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

// 强制动态渲染,因为使用了 auth() 和 request.url
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || 'all';

    // 计算时间范围
    let dateFilter: { gte?: Date } = {};
    const now = new Date();
    
    if (timeRange === 'today') {
      dateFilter = {
        gte: new Date(now.setHours(0, 0, 0, 0)),
      };
    } else if (timeRange === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { gte: weekAgo };
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = { gte: monthAgo };
    } else if (timeRange === 'year') {
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      dateFilter = { gte: yearAgo };
    }

    // 获取用户的 Skills
    const skills = await prisma.skill.findMany({
      where: {
        authorId: session.user.id,
        ...(timeRange !== 'all' && {
          createdAt: dateFilter,
        }),
      },
      include: {
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    });

    // 计算统计数据
    const totalSkills = skills.length;
    // downloads 是 Skill 标量字段 downloadCount（无 downloads 关系），直接用标量求和
    const totalDownloads = skills.reduce((sum, skill) => sum + skill.downloadCount, 0);
    
    const ratings = skills
      .filter(s => s._count.reviews > 0)
      .map(() => {
        // 这里需要从 reviews 表中计算平均评分
        return 0; // 暂时返回 0，后续可以优化
      });
    const averageRating = ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
      : 0;

    // 获取收入数据（如果有定价系统）
    const totalRevenue = 0; // 暂时返回 0

    // 按状态分组
    const skillsByStatus = await prisma.skill.groupBy({
      by: ['status'],
      where: {
        authorId: session.user.id,
      },
      _count: true,
    });

    // 获取最近更新的 Skills
    const recentSkills = await prisma.skill.findMany({
      where: {
        authorId: session.user.id,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        downloadCount: true,
        rating: true,
        reviewCount: true,
        price: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalSkills,
        totalDownloads,
        averageRating,
        totalRevenue,
        activeUsers: 0, // 后续可以添加活跃用户统计
        skillsByStatus: skillsByStatus.map(s => ({
          status: s.status,
          count: s._count,
        })),
        recentSkills,
        downloadsTrend: [], // 后续可以添加下载趋势
        timeRange,
      },
    });
  } catch (error) {
    console.error('获取个人统计数据失败:', error);
    return NextResponse.json(
      { error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}
