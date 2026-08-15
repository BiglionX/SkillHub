/**
 * A2A Schemas 单元测试
 */

import { describe, it, expect } from '@jest/globals';
import {
  AgentCardSchema,
  AgentSkillSchema,
  TaskSchema,
  TaskStateSchema,
  CreateTaskRequestSchema,
  SendMessageRequestSchema,
} from '../schemas';

describe('A2A AgentCardSchema', () => {
  const validCard = {
    protocolVersion: '0.2',
    name: 'SkillHub',
    description: 'SkillHub is an open-source, enterprise-grade AI Agent Skills registry.',
    url: 'https://skillhub.proclaw.cc/api/a2a/tasks',
    provider: { name: 'BigLionX' },
    version: '3.0.0',
    capabilities: [
      { name: 'streaming', enabled: true },
      { name: 'pushNotifications', enabled: true },
    ],
    authentication: {
      schemes: ['bearer' as const, 'oauth2' as const],
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'skillhub:pdf-tools',
        name: 'PDF Tools',
        description: 'Generate, manipulate, and analyze PDF documents.',
        tags: ['pdf', 'document'],
      },
    ],
  };

  it('验证有效的 Agent Card', () => {
    const result = AgentCardSchema.safeParse(validCard);
    expect(result.success).toBe(true);
  });

  it('拒绝空 name', () => {
    const result = AgentCardSchema.safeParse({ ...validCard, name: '' });
    expect(result.success).toBe(false);
  });

  it('拒绝过短 description', () => {
    const result = AgentCardSchema.safeParse({ ...validCard, description: 'short' });
    expect(result.success).toBe(false);
  });

  it('拒绝无效协议版本', () => {
    const result = AgentCardSchema.safeParse({ ...validCard, protocolVersion: '99.0' });
    expect(result.success).toBe(false);
  });

  it('拒绝无效 URL', () => {
    const result = AgentCardSchema.safeParse({ ...validCard, url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('要求版本符合 semver', () => {
    expect(AgentCardSchema.safeParse({ ...validCard, version: '3.0.0' }).success).toBe(true);
    expect(AgentCardSchema.safeParse({ ...validCard, version: '3.0' }).success).toBe(false);
    expect(AgentCardSchema.safeParse({ ...validCard, version: 'invalid' }).success).toBe(false);
  });

  it('允许可选的 documentationUrl 和 iconUrl', () => {
    const withOptional = {
      ...validCard,
      documentationUrl: 'https://docs.example.com',
      iconUrl: 'https://example.com/icon.png',
    };
    expect(AgentCardSchema.safeParse(withOptional).success).toBe(true);
  });
});

describe('A2A TaskSchema', () => {
  const validTask = {
    id: 'task-123',
    skillSlug: 'pdf-tools',
    state: 'pending' as const,
    messages: [
      {
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Generate a PDF report' }],
      },
    ],
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('验证有效的任务', () => {
    expect(TaskSchema.safeParse(validTask).success).toBe(true);
  });

  it('所有 6 种状态均被接受', () => {
    const states = ['pending', 'running', 'completed', 'failed', 'cancelled', 'input-required'];
    for (const state of states) {
      const result = TaskStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    }
  });

  it('拒绝无效状态', () => {
    expect(TaskStateSchema.safeParse('unknown').success).toBe(false);
    expect(TaskStateSchema.safeParse('PENDING').success).toBe(false); // 大小写敏感
  });

  it('要求 messages 非空（至少 1 个）', () => {
    expect(TaskSchema.safeParse({ ...validTask, messages: [] }).success).toBe(false);
  });

  it('artifact 是可选的', () => {
    const withArtifact = {
      ...validTask,
      state: 'completed' as const,
      artifacts: [
        {
          name: 'result.pdf',
          mimeType: 'application/pdf',
          parts: [{ type: 'file' as const, mimeType: 'application/pdf', data: 'base64data' }],
        },
      ],
    };
    expect(TaskSchema.safeParse(withArtifact).success).toBe(true);
  });
});

describe('A2A CreateTaskRequestSchema', () => {
  const validRequest = {
    skillSlug: 'pdf-tools',
    messages: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      },
    ],
  };

  it('验证最小必填字段', () => {
    expect(CreateTaskRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it('允许可选 metadata 和 webhookUrl', () => {
    const full = {
      ...validRequest,
      metadata: { requestId: 'req-123' },
      webhookUrl: 'https://example.com/webhook',
    };
    expect(CreateTaskRequestSchema.safeParse(full).success).toBe(true);
  });

  it('拒绝无效 webhookUrl', () => {
    expect(
      CreateTaskRequestSchema.safeParse({ ...validRequest, webhookUrl: 'not-a-url' }).success,
    ).toBe(false);
  });

  it('拒绝空 skillSlug', () => {
    expect(
      CreateTaskRequestSchema.safeParse({ ...validRequest, skillSlug: '' }).success,
    ).toBe(false);
  });
});

describe('A2A SendMessageRequestSchema', () => {
  it('验证有效的 send message', () => {
    const valid = {
      message: {
        role: 'user',
        parts: [{ type: 'text', text: 'Continue' }],
      },
    };
    expect(SendMessageRequestSchema.safeParse(valid).success).toBe(true);
  });
});

describe('A2A AgentSkillSchema', () => {
  it('验证最小必填字段', () => {
    const minimal = {
      id: 'skill-1',
      name: 'Skill Name',
      description: 'This is a valid skill description with enough length.',
    };
    expect(AgentSkillSchema.safeParse(minimal).success).toBe(true);
  });

  it('拒绝过短 description', () => {
    const short = {
      id: 'skill-1',
      name: 'Skill Name',
      description: 'short',
    };
    expect(AgentSkillSchema.safeParse(short).success).toBe(false);
  });

  it('tags 默认为空数组', () => {
    const result = AgentSkillSchema.safeParse({
      id: 'skill-1',
      name: 'Skill',
      description: 'A skill with default tags',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });
});
