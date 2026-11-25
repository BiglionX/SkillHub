import { NextRequest, NextResponse } from 'next/server';
import { SearchService, type SearchResult } from '@/lib/search/SearchService';

const searchService = new SearchService();

export const dynamic = 'force-dynamic';

/**
 * GET /api/search/global
 *
 * 全局搜索：本地库 + 已同步入库的 GitHub 技能。
 *
 * 安全约定：本端点是公开 GET，绝不触发写库操作。
 * 实时爬取 GitHub 属于写操作，只能由以下已鉴权入口触发：
 *   - POST /api/cron/crawler     （CRON_SECRET）
 *   - POST /api/admin/crawler/start（管理员会话）
 * 这样匿名请求无法绕过入库质量门禁向数据库写入内容。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: '查询参数必填' }, { status: 400 });
    }

    // 本地搜索（SearchService 已内置公开可见性约束）
    const localResult = await searchService.search({
      query,
      page: 1,
      pageSize: 20,
    });

    // 已同步入库的 GitHub 技能（同样是只读查询，受公开可见性约束）
    const globalResults: SearchResult = await searchService.search({
      query,
      source: 'github',
      page: 1,
      pageSize: 15,
    });

    return NextResponse.json({
      local: localResult,
      global: globalResults,
      mode: globalResults.total > 0 ? 'mixed' : 'local',
      query,
    });
  } catch (error) {
    console.error('Global search failed:', error);
    return NextResponse.json(
      { error: '搜索失败', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
