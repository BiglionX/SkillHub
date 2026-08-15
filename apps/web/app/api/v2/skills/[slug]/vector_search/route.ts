/**
 * Vector Search API v2 端点
 * POST /api/v2/skills/[slug]/vector_search - 向量检索知识片段
 * POST /api/v2/skills/[slug]/vector_search/by_embedding - 使用已有向量检索
 */
import { NextRequest } from 'next/server';
import { knowledgeEmbeddingService } from '@/lib/services/KnowledgeEmbeddingService';
import { v2SuccessResponse, v2ErrorResponse } from '@/lib/services/V2ApiAuth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { query, top_k, threshold } = body;

    if (!query || typeof query !== 'string') {
      return v2ErrorResponse('查询文本 query 为必填项', 400);
    }

    const topK = Math.min(Math.max(top_k || 5, 1), 50);
    const thresholdValue = threshold !== undefined ? Math.max(0, Math.min(threshold, 1)) : 0.7;

    const results = await knowledgeEmbeddingService.vectorSearch(slug, query, topK, thresholdValue);

    return v2SuccessResponse({
      results: results.map((r) => ({
        chunk_index: r.chunkIndex,
        chunk_text: r.chunkText,
        score: Math.round(r.score * 10000) / 10000,
        metadata: r.metadata,
      })),
      total: results.length,
    });
  } catch (error) {
    console.error('POST /api/v2/vector_search 失败:', error);
    return v2ErrorResponse('向量检索失败', 500);
  }
}