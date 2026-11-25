/**
 * 统一的「公开可见性」约束
 *
 * 站内所有面向公众的技能查询都必须经过这里，确保只有
 * status = APPROVED 且 isPublic = true 的技能对外可见。
 *
 * 背景：历史上多个查询入口各自为政——有的只查 isPublic、有的只查 status、
 * 搜索服务甚至完全不做状态过滤，导致 DRAFT / PENDING_REVIEW / REJECTED /
 * ARCHIVED 的技能可能通过搜索、发现、详情页、Sitemap 等渠道泄漏。
 *
 * 本模块是唯一事实来源（single source of truth）。新增公开查询入口时，
 * 一律使用 PUBLIC_SKILL_WHERE（Prisma）或 PUBLIC_SKILL_SQL（原生 SQL），
 * 不要再手写状态条件。
 */

import type { SkillStatus } from '@prisma/client';

/** 允许对公众可见的技能状态。 */
export const PUBLIC_SKILL_STATUSES: readonly SkillStatus[] = ['APPROVED'];

/**
 * Prisma where 片段。
 * 用法：`where: { ...PUBLIC_SKILL_WHERE, category: 'dev_tools' }`
 */
export const PUBLIC_SKILL_WHERE = {
  status: 'APPROVED',
  isPublic: true,
} as const;

/**
 * 原生 SQL where 片段（供 $queryRawUnsafe 使用）。
 * 用法：`SELECT ... FROM skills WHERE ${PUBLIC_SKILL_SQL} AND category = $1`
 *
 * 注意：不要在此拼接任何用户输入；用户输入仍走参数化占位符。
 */
export const PUBLIC_SKILL_SQL = `status = 'APPROVED' AND "isPublic" = true`;

/**
 * 运行时判断某个技能是否对公众可见。
 * 用于 findUnique 之后（slug 直达）的兜底校验——Prisma 的 findUnique
 * 无法直接附加额外的 where 条件。
 */
export function isPubliclyVisible<T extends { status: string; isPublic: boolean }>(
  skill: T | null | undefined,
): skill is T {
  if (!skill) return false;
  return (
    (PUBLIC_SKILL_STATUSES as readonly string[]).includes(skill.status) &&
    skill.isPublic === true
  );
}
