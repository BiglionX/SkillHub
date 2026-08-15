/**
 * 性能监控工具
 *
 * 用于：
 * - API 响应时间追踪
 * - 缓存命中率统计
 * - 慢查询日志
 *
 * 在生产环境可以对接 Langfuse / OpenTelemetry / Sentry。
 */

interface PerformanceMetric {
  name: string;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const metrics: PerformanceMetric[] = [];
const SLOW_THRESHOLD_MS = 1000;

export interface MeasureOptions {
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 测量异步函数执行时间
 *
 * ```ts
 * const result = await measure('search_skills', async () => {
 *   return await searchSkills(query);
 * }, { metadata: { query } });
 * ```
 */
export async function measure<T>(
  name: string,
  fn: () => Promise<T>,
  options: MeasureOptions = {},
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    recordMetric({ name, durationMs: duration, timestamp: new Date().toISOString(), metadata: options.metadata });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    recordMetric({
      name: `${name}_error`,
      durationMs: duration,
      timestamp: new Date().toISOString(),
      metadata: { ...options.metadata, error: String(error) },
    });
    throw error;
  }
}

function recordMetric(metric: PerformanceMetric) {
  metrics.push(metric);

  // 慢查询警告
  if (metric.durationMs > SLOW_THRESHOLD_MS) {
    console.warn(`[perf] Slow: ${metric.name} took ${metric.durationMs.toFixed(2)}ms`, metric.metadata);
  }

  // 防止内存无限增长
  if (metrics.length > 1000) {
    metrics.shift();
  }
}

/**
 * 获取最近的性能指标
 */
export function getRecentMetrics(limit = 100): PerformanceMetric[] {
  return metrics.slice(-limit);
}

/**
 * 计算指定操作的平均耗时
 */
export function getAverageDuration(name: string, windowMs = 60_000): number {
  const now = Date.now();
  const recent = metrics.filter(
    (m) => m.name === name && now - new Date(m.timestamp).getTime() < windowMs,
  );
  if (recent.length === 0) return 0;
  const sum = recent.reduce((acc, m) => acc + m.durationMs, 0);
  return sum / recent.length;
}

/**
 * 计算 P95 响应时间
 */
export function getP95Duration(name: string, windowMs = 60_000): number {
  const now = Date.now();
  const recent = metrics
    .filter((m) => m.name === name && now - new Date(m.timestamp).getTime() < windowMs)
    .map((m) => m.durationMs)
    .sort((a, b) => a - b);
  if (recent.length === 0) return 0;
  const idx = Math.floor(recent.length * 0.95);
  return recent[idx] ?? 0;
}

/**
 * 清空指标（用于测试）
 */
export function clearMetrics(): void {
  metrics.length = 0;
}
