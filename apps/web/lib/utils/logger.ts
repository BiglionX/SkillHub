/**
 * 轻量日志工具（控制台实现）
 *
 * 后续可替换为 pino/winston 或接入 Sentry；
 * debug 级别仅在 LOG_LEVEL=debug 时输出。
 */

export const logger = {
  info: (...args: unknown[]) => console.log('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  debug: (...args: unknown[]) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug('[DEBUG]', ...args);
    }
  },
};
