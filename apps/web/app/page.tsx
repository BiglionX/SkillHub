import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-config';

/**
 * 首页（v3 M4 升级）：
 *   - 未登录 → /skills（浏览公开技能市场）
 *   - 已登录 → /dashboard/usage（个人用量中心，直接展示价值）
 *
 * 把已登录用户的首次落地放在「用量中心」，理由：
 *   1. D6 决策：用户自费 LLM Key → 第一关注是「我花了多少钱」
 *   2. /dashboard/usage 是 M4 的核心新增功能，让老用户尽快看到
 *   3. /skills 仍然可从 dashboard nav 或 nav 顶部进入
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard/usage');
  }
  redirect('/skills');
}