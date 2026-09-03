/**
 * @skillhub/ui · 公共入口
 *
 * v2.0.7+：apps/helper 与 apps/web 共享的 UI 设计 token + glass class 名称常量。
 *
 * 当前实现：
 * - `tokens/colors`：玻璃拟态色板（hex 单一来源）
 * - `tokens/glass-classes`：glass utility class 名称映射（避免 string literal 漂移）
 *
 * 用法：
 * ```ts
 * import { COLORS, GLASS_PILL, GlassTone } from '@skillhub/ui';
 *
 * // 颜色
 * console.log(COLORS.brand.cyan500);  // '#06b6d4'
 *
 * // class
 * const cls = GLASS_PILL.cyan;       // 'glass-pill glass-pill-cyan'
 * ```
 *
 * 后续可扩展：
 * - typography / spacing / radius / motion
 * - 复用 React 组件（StatCard / GlassCard / GlowButton），让 helper 与 web 共享组件层
 */
export * from './tokens';