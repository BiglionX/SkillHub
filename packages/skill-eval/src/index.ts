/**
 * @skillhub/skill-eval — 技能质量评分
 *
 * 输出与 SkillHub 平台 `DiscoverySkill.stats.qualityScore`（0-100）对齐：
 *   - LLM-as-judge：通过 fetch 调用 OpenAI 兼容 Chat Completions（或注入自定义 judge）
 *   - 离线兜底：启发式评分（frontmatter/结构/冒烟结果），无网络也可用
 *
 * 集成示例（写入平台 qualityScore）：
 *   const score = await evaluateSkill(input);
 *   await prisma.skill.update({ where: { id }, data: { qualityScore: score.qualityScore } });
 */

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface EvalInput {
  skillName: string;
  description?: string;
  frontmatterOk: boolean;
  structureOk: boolean;
  smokeResults?: Array<{ name: string; status: string }>;
  warningCount?: number;
}

export interface EvalDimensions {
  correctness: number;
  safety: number;
  clarity: number;
  usefulness: number;
}

export interface EvalScore {
  qualityScore: number; // 0-100
  dimensions: EvalDimensions;
  rationale: string;
  source: 'llm' | 'heuristic';
}

export type Judge = (prompt: string) => Promise<string>;

export interface EvaluateOptions {
  judge?: Judge;
  openaiBaseUrl?: string;
  apiKey?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// 启发式兜底评分
// ---------------------------------------------------------------------------

export function heuristicScore(input: EvalInput): EvalScore {
  const d: EvalDimensions = { correctness: 0, safety: 90, clarity: 0, usefulness: 0 };

  // correctness: 结构 + frontmatter
  d.correctness = (input.structureOk ? 40 : 10) + (input.frontmatterOk ? 40 : 10);
  d.correctness = Math.min(100, d.correctness);

  // clarity: 描述长度
  const len = input.description?.trim().length ?? 0;
  d.clarity = len >= 120 ? 100 : len >= 60 ? 80 : len >= 20 ? 60 : len > 0 ? 40 : 10;

  // usefulness: 冒烟通过率
  const smoke = input.smokeResults ?? [];
  if (smoke.length === 0) {
    d.usefulness = 60; // 无冒烟数据 → 中性
  } else {
    const pass = smoke.filter((r) => r.status === 'pass').length;
    d.usefulness = Math.round((pass / smoke.length) * 100);
  }

  // safety: 警告扣分
  d.safety = Math.max(0, 90 - (input.warningCount ?? 0) * 10);

  const dimensions = d;
  const qualityScore = clamp(
    Math.round(
      dimensions.correctness * 0.35 +
        dimensions.safety * 0.2 +
        dimensions.clarity * 0.2 +
        dimensions.usefulness * 0.25,
    ),
  );
  return {
    qualityScore,
    dimensions,
    rationale: `启发式评分：correctness=${dimensions.correctness} safety=${dimensions.safety} clarity=${dimensions.clarity} usefulness=${dimensions.usefulness}`,
    source: 'heuristic',
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ---------------------------------------------------------------------------
// LLM-as-judge
// ---------------------------------------------------------------------------

export function buildJudgePrompt(input: EvalInput): string {
  return [
    '你是技能包质量评审员。根据以下信息给出质量评分（0-100）与四个维度分（correctness/safety/clarity/usefulness，各 0-100）。',
    '只输出 JSON：{"qualityScore": 0, "dimensions": {"correctness": 0, "safety": 0, "clarity": 0, "usefulness": 0}, "rationale": "一句话理由"}',
    '',
    `技能名: ${input.skillName}`,
    `描述: ${input.description ?? 'N/A'}`,
    `frontmatter 合法: ${input.frontmatterOk}`,
    `结构合法: ${input.structureOk}`,
    `警告数: ${input.warningCount ?? 0}`,
    `冒烟结果: ${JSON.stringify(input.smokeResults ?? [])}`,
  ].join('\n');
}

async function callChatCompletions(
  prompt: string,
  options: EvaluateOptions,
): Promise<string> {
  const base = (options.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM 调用失败: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? '';
}

function parseJudgeOutput(text: string, input: EvalInput): EvalScore {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      qualityScore?: number;
      dimensions?: Partial<EvalDimensions>;
      rationale?: string;
    };
    const dimensions: EvalDimensions = {
      correctness: clamp(parsed.dimensions?.correctness ?? 0),
      safety: clamp(parsed.dimensions?.safety ?? 0),
      clarity: clamp(parsed.dimensions?.clarity ?? 0),
      usefulness: clamp(parsed.dimensions?.usefulness ?? 0),
    };
    return {
      qualityScore: clamp(parsed.qualityScore ?? 0),
      dimensions,
      rationale: parsed.rationale ?? '（无理由）',
      source: 'llm',
    };
  } catch {
    return heuristicScore(input);
  }
}

/** 评分入口：优先 judge/LLM，失败或未配置时回落启发式 */
export async function evaluateSkill(
  input: EvalInput,
  options: EvaluateOptions = {},
): Promise<EvalScore> {
  const prompt = buildJudgePrompt(input);

  if (options.judge) {
    try {
      return parseJudgeOutput(await options.judge(prompt), input);
    } catch {
      return heuristicScore(input);
    }
  }

  if (options.apiKey) {
    try {
      return parseJudgeOutput(await callChatCompletions(prompt, options), input);
    } catch {
      return heuristicScore(input);
    }
  }

  return heuristicScore(input);
}
