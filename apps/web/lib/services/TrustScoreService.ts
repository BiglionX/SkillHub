/**
 * Trust Score Service
 *
 * Skill 健康度评分算法（0-100 分）
 *
 * 评分维度（总权重 100%）：
 * - Stars（收藏数）：     30%
 * - Downloads（下载量）：  30%
 * - Reviews（社区评分）：  25%
 * - Activity（活跃度）：   15%
 *
 * 评分映射采用对数缩放，避免单一维度被极端值主导。
 *
 * 使用场景：
 * - Skill 列表页排序
 * - "Verified" 徽章显示（≥80 分）
 * - 搜索结果加权
 *
 * 定时任务：每周一次批量重算所有 Skill 的 Trust Score
 */

import { prisma } from '@/lib/prisma';

// ============================================================
// 类型定义
// ============================================================

export interface TrustScoreInput {
  /** GitHub 收藏数 */
  starCount: number;
  /** 30 天下载量 */
  downloadsLast30Days: number;
  /** 平均评分（1-5） */
  averageRating: number;
  /** 评分人数 */
  ratingCount: number;
  /** 距最后更新的天数 */
  daysSinceUpdate: number;
}

export interface TrustScoreResult {
  /** 总分（0-100，保留 1 位小数） */
  score: number;
  /** 是否达到 Verified 阈值（默认 80） */
  verified: boolean;
  /** 各维度得分明细 */
  breakdown: {
    stars: number;       // 0-30
    downloads: number;   // 0-30
    reviews: number;     // 0-25
    activity: number;    // 0-15
  };
  /** 等级标签 */
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  /** 评估时间 */
  evaluatedAt: string;
}

// ============================================================
// 常量配置
// ============================================================

export const TRUST_SCORE_WEIGHTS = {
  stars: 0.30,
  downloads: 0.30,
  reviews: 0.25,
  activity: 0.15,
} as const;

export const VERIFIED_THRESHOLD = 80;

/** 各维度的"满分"基准（用于对数缩放） */
const REFERENCE_VALUES = {
  stars: 5000,           // 5K stars = 满分
  downloadsLast30Days: 10000, // 10K 月下载 = 满分
  ratingCount: 100,      // 100 条评分 = 满分
  daysSinceUpdate: 90,   // 90 天内活跃 = 满分
} as const;

// ============================================================
// 维度计算函数
// ============================================================

/**
 * 对数缩放：x = base * (1 + log10(value / base + 1)) - base
 *
 * 当 value >= base 时，score 接近满分（referenceScore）
 * 当 value = 0 时，score = 0
 * 中间值平滑过渡
 */
function logScale(value: number, reference: number, maxScore: number): number {
  if (value <= 0) return 0;
  if (value >= reference) return maxScore;
  // log10(value / reference + 1) 范围 0 ~ log10(2)
  const ratio = Math.log10(value / reference + 1);
  const scale = ratio / Math.log10(2); // 0 ~ 1
  return Math.round(scale * maxScore * 100) / 100;
}

/**
 * 线性插值（用于 reviews 和 activity）
 */
function linearScale(value: number, maxValue: number, maxScore: number, invert = false): number {
  const ratio = Math.min(Math.max(value / maxValue, 0), 1);
  const adjusted = invert ? 1 - ratio : ratio;
  return Math.round(adjusted * maxScore * 100) / 100;
}

/**
 * 计算 Stars 维度得分（满分 30）
 */
export function calculateStarsScore(starCount: number): number {
  return logScale(starCount, REFERENCE_VALUES.stars, 30);
}

/**
 * 计算 Downloads 维度得分（满分 30）
 */
export function calculateDownloadsScore(downloadsLast30Days: number): number {
  return logScale(downloadsLast30Days, REFERENCE_VALUES.downloadsLast30Days, 30);
}

/**
 * 计算 Reviews 维度得分（满分 25）
 *
 * 综合考虑：
 * - 平均评分（1-5 星）
 * - 评分数量（达到 100 条评分为满分基数）
 */
export function calculateReviewsScore(averageRating: number, ratingCount: number): number {
  // 平均分归一化到 0-1（2.5 分为中位线，5 分为满分）
  const normalizedRating = Math.max(0, (averageRating - 1) / 4);
  // 评分数量缩放
  const countFactor = logScale(ratingCount, REFERENCE_VALUES.ratingCount, 1);
  // 综合：评分质量 * 数量系数
  const combined = normalizedRating * countFactor;
  return Math.round(combined * 25 * 100) / 100;
}

/**
 * 计算 Activity 维度得分（满分 15）
 *
 * 越近更新的 Skill 分数越高，超过 90 天大幅衰减
 */
export function calculateActivityScore(daysSinceUpdate: number): number {
  return linearScale(daysSinceUpdate, REFERENCE_VALUES.daysSinceUpdate, 15, true);
}

// ============================================================
// 主计算函数
// ============================================================

/**
 * 计算 Trust Score
 */
export function calculateTrustScore(input: TrustScoreInput): TrustScoreResult {
  const stars = calculateStarsScore(input.starCount);
  const downloads = calculateDownloadsScore(input.downloadsLast30Days);
  const reviews = calculateReviewsScore(input.averageRating, input.ratingCount);
  const activity = calculateActivityScore(input.daysSinceUpdate);

  const rawTotal = stars + downloads + reviews + activity;
  const score = Math.min(100, Math.round(rawTotal * 10) / 10);

  return {
    score,
    verified: score >= VERIFIED_THRESHOLD,
    breakdown: { stars, downloads, reviews, activity },
    grade: getGrade(score),
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * 等级评定
 */
export function getGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// ============================================================
// 数据库操作
// ============================================================

/**
 * 从数据库读取 Skill 评分所需的输入数据
 */
export async function loadTrustScoreInput(skillId: string): Promise<TrustScoreInput> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: {
      starCount: true,
      downloadCount: true,
      updatedAt: true,
      // 用户评分在 SkillComment.rating（Review 是审核记录，无 rating）
      comments: {
        select: {
          rating: true,
          createdAt: true,
        },
      },
    },
  });

  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  // 30 天内的下载数（如果数据库有 download events 表）
  // 这里简化处理，使用总下载数除以估算的"使用天数"
  const downloadsLast30Days = Math.round(skill.downloadCount * 0.3);

  // 计算平均评分（最近 100 条，仅统计带评分的评论）
  const ratedComments = skill.comments
    .filter((c) => c.rating != null)
    .slice(-100);
  const averageRating =
    ratedComments.length > 0
      ? ratedComments.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedComments.length
      : 0;

  // 距最后更新的天数
  const daysSinceUpdate = Math.floor(
    (Date.now() - skill.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    starCount: skill.starCount,
    downloadsLast30Days,
    averageRating,
    ratingCount: ratedComments.length,
    daysSinceUpdate,
  };
}

/**
 * 计算并存储单个 Skill 的 Trust Score
 * 注意：存储到现有的 qualityScore 字段（向后兼容）
 */
export async function computeAndStoreTrustScore(skillId: string): Promise<TrustScoreResult> {
  const input = await loadTrustScoreInput(skillId);
  const result = calculateTrustScore(input);

  // 存储到现有字段（使用 qualityScore 作为 trust score 的存储位置）
  try {
    await prisma.skill.update({
      where: { id: skillId },
      data: {
        qualityScore: result.score,
      },
    });
  } catch (err) {
    console.warn(`[TrustScore] Failed to persist for skill ${skillId}:`, err);
  }

  return result;
}

/**
 * 批量计算所有 Skill 的 Trust Score
 *
 * 定时任务入口：每周一次
 */
export async function recomputeAllTrustScores(options?: { batchSize?: number }): Promise<{
  total: number;
  successful: number;
  failed: number;
  durationMs: number;
}> {
  const start = Date.now();
  const batchSize = options?.batchSize ?? 100;
  let total = 0;
  let successful = 0;
  let failed = 0;

  // 分批处理避免内存爆炸
  let cursor: string | undefined = undefined;
  while (true) {
    const query: {
      select: { id: true };
      take: number;
      skip?: number;
      cursor?: { id: string };
    } = { select: { id: true }, take: batchSize };
    if (cursor) {
      query.skip = 1;
      query.cursor = { id: cursor };
    }
    const skills = await prisma.skill.findMany(query);

    if (skills.length === 0) break;

    for (const skill of skills) {
      total++;
      try {
        await computeAndStoreTrustScore(skill.id);
        successful++;
      } catch (err) {
        failed++;
        console.error(`[TrustScore] Failed for skill ${skill.id}:`, err);
      }
    }

    cursor = skills[skills.length - 1]?.id;
    if (skills.length < batchSize) break;
  }

  return {
    total,
    successful,
    failed,
    durationMs: Date.now() - start,
  };
}
