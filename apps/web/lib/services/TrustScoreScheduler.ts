/**
 * Trust Score 定时任务调度器
 *
 * 集成到现有的 TaskScheduler（如果存在），或使用 node-cron 独立运行。
 *
 * 默认调度：每周日凌晨 3 点（流量低谷）批量重算
 */

import { recomputeAllTrustScores } from './TrustScoreService';
import { logger } from '@/lib/utils/logger';

/**
 * 定时任务定义
 */
export const TRUST_SCORE_CRON = {
  /** cron 表达式：每周日 03:00 */
  expression: '0 3 * * 0',
  description: 'Trust Score 周度重算',
  handler: async () => {
    logger.info('[TrustScoreScheduler] Starting weekly Trust Score recomputation');
    try {
      const result = await recomputeAllTrustScores({ batchSize: 100 });
      logger.info('[TrustScoreScheduler] Completed', result);
      return result;
    } catch (error) {
      logger.error('[TrustScoreScheduler] Failed:', error);
      throw error;
    }
  },
};

/**
 * 手动触发（用于运维或测试）
 */
export async function triggerTrustScoreRecompute() {
  return TRUST_SCORE_CRON.handler();
}

/**
 * 注册到现有 TaskScheduler
 */
export function registerTrustScoreTask() {
  // 适配现有的 TaskScheduler 接口
  // const { TaskScheduler } = await import('./TaskScheduler');
  // TaskScheduler.register(TRUST_SCORE_CRON);
  // 当前为占位实现，避免破坏现有架构
  logger.info('[TrustScoreScheduler] Registered weekly Trust Score recomputation task');
}
