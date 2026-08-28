'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { Review } from '@/types';

export default function ReviewsPage() {
  // 获取待审核的 reviews
  const { data: reviewsData, isLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      const response = await fetch('/api/reviews?status=PENDING_REVIEW');
      if (!response.ok) throw new Error('获取审核列表失败');
      return response.json();
    },
  });

  const reviews: Review[] = reviewsData?.data || [];

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
        <h1 className="text-2xl font-bold text-gray-900">审核管理</h1>
        <p className="mt-1 text-sm text-gray-600">
          管理和审核提交的 Skills
        </p>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">待审核</div>
          <div className="mt-2 text-3xl font-semibold text-yellow-600">
            {reviews.filter((r) => r.status === 'PENDING_REVIEW').length}
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">审核中</div>
          <div className="mt-2 text-3xl font-semibold text-blue-600">
            {reviews.filter((r) => r.status === 'UNDER_REVIEW').length}
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">今日已完成</div>
          <div className="mt-2 text-3xl font-semibold text-green-600">
            {reviews.filter((r) => {
              if (r.status !== 'APPROVED' || !r.completedAt) return false;
              const today = new Date();
              const completedAt = new Date(r.completedAt);
              return completedAt.toDateString() === today.toDateString();
            }).length}
          </div>
        </div>
      </div>

      {/* 审核列表 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">待审核列表</h3>
          
          {reviews.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">暂无待审核项目</h3>
              <p className="mt-1 text-sm text-gray-500">所有 Skills 都已审核完毕</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Skill
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      版本
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      提交者
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      提交时间
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reviews.map((review) => (
                    <tr key={review.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {review.skill?.name || '未知 Skill'}
                        </div>
                        <div className="text-sm text-gray-500">{review.skill?.slug}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          v{review.version}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {review.skill?.author?.name || '未知用户'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          review.status === 'PENDING_REVIEW' ? 'bg-yellow-100 text-yellow-800' :
                          review.status === 'UNDER_REVIEW' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {review.status === 'PENDING_REVIEW' ? '待审核' :
                           review.status === 'UNDER_REVIEW' ? '审核中' :
                           review.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(review.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/dashboard/skills/${review.skill?.slug}`}
                          className="text-purple-600 hover:text-purple-900 mr-4"
                        >
                          查看
                        </Link>
                        <button className="text-green-600 hover:text-green-900 mr-4">
                          通过
                        </button>
                        <button className="text-red-600 hover:text-red-900">
                          拒绝
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
