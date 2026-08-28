import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { redis } from '@/lib/redis';
import { heuristicParse } from '@/lib/intent/heuristic';
import { LlmGateway } from '@/lib/services/LlmGateway';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const llm = new LlmGateway();

/**
 * POST /api/v2/intent/parse
 * 智能问答入口：用户口语化描述 → {software_tags, intent_tags, skill_category, matched_skills}
 *
 * 决策路径（D6 v2.0.2）：
 *   1. Redis 缓存查询（key = hash(query)）
 *   2. 助手转发调 LLM（用户自费 Key）
 *   3. 启发式兜底（关键词字典 + SQL LIKE）
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const body = await req.json();
  const query: string = body.query?.trim() || '';
  const detectedSoftware: string[] = body.client_context?.detected_software || [];

  if (!query) {
    return NextResponse.json({ error: 'query 不能为空' }, { status: 400 });
  }

  // 1. Redis 缓存查询
  const cacheKey = `intent:${crypto.createHash('sha256').update(query).digest('hex')}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return NextResponse.json({
        ...parsed,
        cached: true,
        llm_path: 'cache',
        duration_ms: Date.now() - startedAt,
      });
    }
  } catch {
    // Redis 不可用时静默降级
  }

  // 2. 助手转发 → 启发式兜底
  let result;
  let llmPath: 'helper' | 'cloud' | 'heuristic' = 'heuristic';
  try {
    const llmRes = await llm.chat({
      systemPrompt: INTENT_PARSE_SYSTEM_PROMPT,
      userMessage: query,
      jsonMode: true,
      detectedSoftware,
    });

    if (llmRes.ok && llmRes.parsed) {
      result = llmRes.parsed;
      llmPath = llmRes.path;
    } else {
      result = await heuristicParse(query, detectedSoftware);
    }
  } catch {
    result = await heuristicParse(query, detectedSoftware);
  }

  // 3. 用解析出的标签查数据库，匹配 Top 3 Skills
  const matched = await matchSkills(result);

  // 4. 写缓存
  try {
    await redis.setex(cacheKey, 86400, JSON.stringify(result));
  } catch {
    // 缓存失败不影响响应
  }

  return NextResponse.json({
    ...result,
    matched_skills: matched,
    cached: false,
    llm_path: llmPath,
    duration_ms: Date.now() - startedAt,
  });
}

/**
 * 根据解析出的标签，从数据库匹配 Top 3 技能。
 *
 * v3 M1 升级：用 IntentTag/SoftwareTag 关联表精确匹配，取代 LIKE 模糊匹配
 *
 * 评分规则：
 *   - 每个 intentTag 命中 × 10 × weight
 *   - 每个 softwareTag 命中 × 5
 *   - downloadCount 加成 / 100
 *   - deliveryCategory 完全匹配 × 20
 */
async function matchSkills(parsed: {
  software_tags: string[];
  intent_tags: string[];
  skill_category?: 'A' | 'B' | 'C';
}) {
  const { software_tags, intent_tags, skill_category } = parsed;

  // 1. 解析 category → Prisma enum
  const deliveryCategoryMap: Record<'A' | 'B' | 'C', 'ENVIRONMENT_DEPENDENT' | 'OAUTH_AUTHORIZED' | 'CONTENT_GENERATION'> = {
    A: 'ENVIRONMENT_DEPENDENT',
    B: 'OAUTH_AUTHORIZED',
    C: 'CONTENT_GENERATION',
  };

  // 3. 找匹配的 IntentTag / SoftwareTag ID
  const [intentTagRecords, softwareTagRecords] = await Promise.all([
    intent_tags.length > 0
      ? prisma.intentTag.findMany({
          where: { name: { in: intent_tags } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    software_tags.length > 0
      ? prisma.softwareTag.findMany({
          where: { name: { in: software_tags } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const intentTagIds = intentTagRecords.map((t) => t.id);
  const softwareTagIds = softwareTagRecords.map((t) => t.id);

  // 4. 主查询：通过关联表找出候选 Skill
  const candidates = await prisma.skill.findMany({
    where: {
      AND: [
        { isPublic: true },
        { status: 'APPROVED' },
        // deliveryCategory 优先匹配（如果 LLM 给出）
        ...(skill_category
          ? [{ deliveryCategory: deliveryCategoryMap[skill_category] }]
          : []),
        // 至少有一个意图标签命中
        ...(intentTagIds.length > 0
          ? [
              {
                intentTags: {
                  some: { intentTagId: { in: intentTagIds } },
                },
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      iconUrl: true,
      downloadCount: true,
      rating: true,
      category: true,
      deliveryCategory: true,
      intentTags: {
        select: { intentTagId: true, weight: true },
      },
      softwareTags: {
        select: { softwareTagId: true },
      },
    },
    take: 30,
    orderBy: [{ downloadCount: 'desc' }, { rating: 'desc' }],
  });

  // 5. 评分
  const scored = candidates.map((c) => {
    const intentHits = c.intentTags.filter((t) => intentTagIds.includes(t.intentTagId));
    const intentScore = intentHits.reduce((sum, t) => sum + 10 * t.weight, 0);
    const softwareScore = c.softwareTags.filter((t) => softwareTagIds.includes(t.softwareTagId)).length * 5;
    const categoryBonus = c.deliveryCategory && skill_category && deliveryCategoryMap[skill_category] === c.deliveryCategory ? 20 : 0;
    const popularityScore = (c.downloadCount || 0) / 100;
    const score = intentScore + softwareScore + categoryBonus + popularityScore;
    return { ...c, score: Math.round(score * 100) / 100 };
  });

  scored.sort((a, b) => b.score - a.score);

  // 简化返回字段
  return scored.slice(0, 3).map(({ intentTags, softwareTags, ...rest }) => rest);
}

const INTENT_PARSE_SYSTEM_PROMPT = `你是 SkillHub 的意图分类器。给定用户的口语化需求，输出结构化 JSON。

# 任务
将用户描述映射到三个维度：
- software_tags: 涉及的具体软件（photoshop / vscode / blender / excel / feishu / notion / gmail / figma 等），没有则空数组
- intent_tags: 功能意图（image-retouch / code-diagnose / doc-sync / content-write / summarize / translate 等）
- skill_category: 决定交付物形态，必填
  - "A" = 环境依赖型（需配合已装软件，如 PS/VSCode 插件）
  - "B" = 数据授权型（需连接第三方账号，如飞书/Notion 同步）
  - "C" = 内容生成型（在线直接出结果，如写文案/做 PPT/会议纪要）
- confidence: 0-1，越高表示越确定

# 严格输出 JSON 格式
{"software_tags": [...], "intent_tags": [...], "skill_category": "A"|"B"|"C", "confidence": 0.0}

# 示例
用户输入："帮我把照片皮肤磨皮"
输出：{"software_tags":["photoshop"], "intent_tags":["image-retouch"], "skill_category":"A", "confidence":0.95}

用户输入："把飞书会议纪要同步到 Notion"
输出：{"software_tags":["feishu","notion"], "intent_tags":["doc-sync"], "skill_category":"B", "confidence":0.93}

用户输入："写一篇 618 母婴好物小红书"
输出：{"software_tags":[], "intent_tags":["content-write"], "skill_category":"C", "confidence":0.98}
`;