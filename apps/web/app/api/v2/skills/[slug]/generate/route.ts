import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { LlmGateway } from '@/lib/services/LlmGateway';

const prisma = new PrismaClient();
const llm = new LlmGateway();

/**
 * POST /api/v2/skills/[slug]/generate
 *
 * C 类 Skill 的内容生成接口。
 *
 * 决策路径（D6 v2.0.2）：
 *   1. 校验 Skill 存在 + deliveryCategory === 'CONTENT_GENERATION'
 *   2. 读取 skill.llmConfig（含 system_prompt + input_schema）
 *   3. 经 LlmGateway 调助手转发（用户自费）
 *   4. SSE 流式返回（C 类输出通常较长，必须 streaming）
 *
 * 响应：
 *   - SSE：`data: {"delta": "..."}` 流式片段
 *   - 结束：`data: {"done": true, "tokens_used": N}`
 *   - 错误：`data: {"error": "..."}`
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();
  const userParams: Record<string, string> = body.params || {};

  // 1. 加载 Skill
  const skill = await prisma.skill.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      deliveryCategory: true,
      llmConfig: true,
    },
  });

  if (!skill) {
    return NextResponse.json({ error: 'Skill 不存在' }, { status: 404 });
  }

  if (skill.deliveryCategory !== 'CONTENT_GENERATION') {
    return NextResponse.json(
      { error: '该 Skill 不是内容生成型，请使用对应类型的安装流程' },
      { status: 400 }
    );
  }

  if (!skill.llmConfig) {
    return NextResponse.json(
      { error: '该 Skill 缺少 LLM 配置（llmConfig 为空）' },
      { status: 400 }
    );
  }

  const llmConfig = skill.llmConfig as {
    model?: string;
    system_prompt?: string;
    input_schema?: { params?: Array<{ name: string; required?: boolean }> };
  };

  // 2. 构造 system_prompt
  let systemPrompt = llmConfig.system_prompt || `你是 SkillHub 的「${skill.name}」助手。请按要求生成内容。`;

  // 注入用户参数到 system 末尾
  if (userParams && Object.keys(userParams).length > 0) {
    systemPrompt += '\n\n# 用户参数\n';
    for (const [k, v] of Object.entries(userParams)) {
      systemPrompt += `- ${k}: ${v}\n`;
    }
  }

  // 校验必填参数
  const required = llmConfig.input_schema?.params?.filter((p) => p.required) || [];
  for (const p of required) {
    if (!userParams[p.name]?.trim()) {
      return NextResponse.json(
        { error: `缺少必填参数：${p.name}` },
        { status: 400 }
      );
    }
  }

  // 3. 构造 user message
  const userMessage = userParams.topic
    ? `主题：${userParams.topic}`
    : '请生成内容。';

  // 4. 创建 SSE 流式响应
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller 已关闭，忽略
        }
      };

      try {
        // D6：助手转发（用户自费 Key）
        const result = await llm.chat({
          systemPrompt,
          userMessage,
          jsonMode: false,
          temperature: 0.7,
          maxTokens: 1500,
        });

        if (!result.ok) {
          // 助手离线 / 未配 Key / 服务未启用
          if (result.reason === 'helper_no_key' || result.reason === 'service_disabled') {
            send({
              error: 'NEED_HELPER_KEY',
              message: '需要桌面助手并配置 LLM Key 才能生成',
              reason: result.reason,
            });
          } else {
            send({ error: result.message });
          }
          controller.close();
          return;
        }

        // M1 简化版：助手一次性返回，模拟流式（按句号/换行拆段）
        const content = result.content || '';
        const chunks = chunkContent(content, 6); // 每 6 个字符一段
        for (const chunk of chunks) {
          send({ delta: chunk });
          // 模拟打字效果
          await new Promise((r) => setTimeout(r, 30));
        }

        send({ done: true, tokens_used: result.tokensUsed || 0 });
        controller.close();
      } catch (err) {
        send({ error: err instanceof Error ? err.message : String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * 把内容切成多段，用于模拟流式打字效果。
 * 优先按标点/换行切，避免截断中文。
 */
function chunkContent(text: string, size: number): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let buffer = '';
  for (const char of text) {
    buffer += char;
    if (buffer.length >= size || /[。！？\n]/.test(char)) {
      chunks.push(buffer);
      buffer = '';
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}