/**
 * A2A (Agent-to-Agent) Protocol Schema Definitions
 *
 * 协议参考：https://a2a-protocol.org
 *
 * 核心概念：
 * - Agent Card：描述 Agent 的能力、技能、认证方式
 * - Task：Agent 间异步任务，包含状态跟踪和结果
 * - Message：Agent 间通信消息
 * - Artifact：任务产生的输出产物
 *
 * 本文件使用 Zod 定义 A2A 协议 v0.2 的核心类型，
 * 供 API 路由和客户端复用。
 */

import { z } from 'zod';

// ============================================================
// Agent Card Schema
// ============================================================

export const AgentCapabilitySchema = z.object({
  /** 能力名称，如 'streaming', 'pushNotifications', 'stateTransitionHistory' */
  name: z.string().min(1).max(64),
  /** 是否启用 */
  enabled: z.boolean().default(true),
  /** 可选描述 */
  description: z.string().optional(),
});
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentSkillSchema = z.object({
  /** Skill 唯一标识 */
  id: z.string().min(1).max(128),
  /** Skill 名称（人类可读） */
  name: z.string().min(1).max(256),
  /** Skill 描述 */
  description: z.string().min(10).max(1024),
  /** 标签 */
  tags: z.array(z.string()).default([]),
  /** 关联的 SkillHub slug（如果有） */
  skillhubSlug: z.string().optional(),
  /** 输入 schema（JSON Schema） */
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  /** 输出 schema（JSON Schema） */
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  /** 示例用法 */
  examples: z.array(z.string()).optional(),
});
export type AgentSkill = z.infer<typeof AgentSkillSchema>;

export const AgentAuthenticationSchema = z.object({
  /** 认证方案 */
  schemes: z.array(
    z.enum(['bearer', 'basic', 'oauth2', 'apiKey', 'none']),
  ),
  /** 凭证获取地址 */
  credentialsUrl: z.string().url().optional(),
  /** OAuth scopes（如果适用） */
  scopes: z.array(z.string()).optional(),
});
export type AgentAuthentication = z.infer<typeof AgentAuthenticationSchema>;

export const AgentCardSchema = z.object({
  /** A2A 协议版本 */
  protocolVersion: z.literal('0.2').default('0.2'),
  /** Agent 唯一标识 */
  name: z.string().min(1).max(128),
  /** Agent 描述 */
  description: z.string().min(10).max(2048),
  /** Agent 服务 URL（A2A 端点） */
  url: z.string().url(),
  /** Agent 提供者 */
  provider: z.object({
    name: z.string(),
    url: z.string().url().optional(),
  }),
  /** Agent 版本 */
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  /** 支持的能力 */
  capabilities: z.array(AgentCapabilitySchema).default([]),
  /** 认证方式 */
  authentication: AgentAuthenticationSchema,
  /** 默认输入模式 */
  defaultInputModes: z.array(z.string()).default(['text/plain']),
  /** 默认输出模式 */
  defaultOutputModes: z.array(z.string()).default(['text/plain']),
  /** Agent 提供的 Skills */
  skills: z.array(AgentSkillSchema).default([]),
  /** 文档链接 */
  documentationUrl: z.string().url().optional(),
  /** 图标 */
  iconUrl: z.string().url().optional(),
});
export type AgentCard = z.infer<typeof AgentCardSchema>;

// ============================================================
// Task Schema
// ============================================================

export const TaskStateSchema = z.enum([
  'pending',     // 已创建，等待执行
  'running',     // 正在执行
  'completed',   // 已完成
  'failed',      // 失败
  'cancelled',   // 已取消
  'input-required', // 需要更多输入
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const MessagePartSchema = z.object({
  type: z.enum(['text', 'file', 'data']),
  text: z.string().optional(),
  mimeType: z.string().optional(),
  data: z.unknown().optional(),
});
export type MessagePart = z.infer<typeof MessagePartSchema>;

export const MessageSchema = z.object({
  role: z.enum(['user', 'agent', 'system']),
  parts: z.array(MessagePartSchema).min(1),
});
export type Message = z.infer<typeof MessageSchema>;

export const ArtifactSchema = z.object({
  name: z.string(),
  mimeType: z.string().optional(),
  parts: z.array(MessagePartSchema).min(1),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const TaskSchema = z.object({
  id: z.string().min(1),
  /** 关联的 SkillHub Skill slug */
  skillSlug: z.string().min(1),
  /** 任务状态 */
  state: TaskStateSchema,
  /** 输入消息历史 */
  messages: z.array(MessageSchema).min(1),
  /** 输出 artifacts */
  artifacts: z.array(ArtifactSchema).default([]),
  /** 任务元数据 */
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** 创建时间（ISO 8601） */
  createdAt: z.string().datetime(),
  /** 更新时间（ISO 8601） */
  updatedAt: z.string().datetime(),
  /** 错误信息（如果失败） */
  error: z.string().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// ============================================================
// Request Schemas
// ============================================================

export const CreateTaskRequestSchema = z.object({
  skillSlug: z.string().min(1).max(128),
  messages: z.array(MessageSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Webhook URL（可选，用于任务完成通知） */
  webhookUrl: z.string().url().optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const SendMessageRequestSchema = z.object({
  message: MessageSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
