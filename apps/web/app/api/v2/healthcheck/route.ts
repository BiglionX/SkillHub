import { NextResponse } from 'next/server';

/**
 * GET /api/v2/healthcheck
 *
 * Playwright webServer 健康检查探针专用端点。
 *
 * 为什么不用根路径 `/`？
 *   1. Next dev 首次 SSR 编译时偶尔返回 200 但 API 路由还没就绪
 *   2. 根路径可能引入意外副作用（Next redirect / middleware 拦截）
 *   3. 这个端点仅做存活探针，零依赖、零副作用
 *
 * 返回：
 *   - 200: 进程在跑
 *   - body 包含构建标识 + 启动时间 + 版本（调试用）
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: process.env.npm_package_version || 'unknown',
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    ts: new Date().toISOString(),
  });
}