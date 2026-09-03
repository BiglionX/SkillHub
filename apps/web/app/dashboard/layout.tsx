import { auth } from '@/lib/auth-config';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  
  // 如果用户未登录，重定向到登录页面
  if (!session) {
    redirect('/login');
  }

  const user = session?.user;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center group">
                <img src="/skillhub.png" alt="Skill Hub Logo" className="h-10 w-auto object-contain transition-transform group-hover:scale-105" />
              </Link>
              <div className="hidden md:flex space-x-6">
                <Link href="/dashboard" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                  概览
                </Link>
                <Link href="/dashboard/skills" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                  我的 Skills
                </Link>
                <Link href="/dashboard/usage" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                  用量
                </Link>
                <Link href="/dashboard/bounties" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                  我的悬赏
                </Link>
                <Link href="/dashboard/namespaces" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                  命名空间
                </Link>
                <Link href="/widget-demo" className="text-sm font-medium text-purple-700 hover:text-purple-800 transition-colors flex items-center gap-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                    NEW
                  </span>
                  Widget
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <>
                  <div className="flex items-center space-x-2">
                    {user.image && (
                      <img
                        src={user.image}
                        alt={user.name || 'User'}
                        className="h-8 w-8 rounded-full"
                      />
                    )}
                    <span className="text-sm text-gray-700">{user.name}</span>
                  </div>
                  <button
                    onClick={async () => {
                      const { handleSignOut } = await import('@/app/actions/auth-actions')
                      await handleSignOut()
                    }}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    退出登录
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
