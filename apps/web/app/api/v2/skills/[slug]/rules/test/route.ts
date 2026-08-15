/**
 * POST /api/v2/skills/[slug]/rules/test - 测试规则执行
 * 传入测试上下文数据，返回规则评估结果
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ruleEngine } from '@/lib/services/RuleEngine';
import { ruleExecutionService } from '@/lib/services/RuleExecutionService';
import { v2SuccessResponse, v2ErrorResponse } from '@/lib/services/V2ApiAuth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { context } = body;

    if (!context || typeof context !== 'object') {
      return v2ErrorResponse('请提供测试上下文数据 context（JSON 对象）', 400);
    }

    // 获取技能及其知识片段
    const skill = await prisma.skill.findUnique({
      where: { id: slug },
      select: { id: true, name: true, type: true },
    });

    if (!skill) {
      return v2ErrorResponse('技能不存在', 404);
    }

    // 获取知识片段内容（如果存在）
    const fragment = await prisma.knowledgeFragment.findUnique({
      where: { skillId: slug },
      select: { content: true },
    });

    if (!fragment || !fragment.content) {
      return v2ErrorResponse('该技能没有可执行的规则内容', 404);
    }

    // 从知识片段内容中提取规则
    const ruleDefinition = ruleExecutionService.extractRuleFromSkill({
      id: skill.id,
      name: skill.name,
      content: fragment.content,
    });

    if (!ruleDefinition) {
      return v2ErrorResponse('知识片段内容不包含有效的规则定义', 400);
    }

    // 验证规则
    const validation = ruleEngine.validateRule(ruleDefinition);
    if (!validation.valid) {
      return v2ErrorResponse(`规则验证失败：${validation.error}`, 400);
    }

    // 执行规则
    const result = ruleExecutionService.executeSingleRule(ruleDefinition, context as Record<string, unknown>);

    return v2SuccessResponse({
      data: {
        rule_name: result.ruleName,
        matched: result.matched,
        priority: result.priority,
        details: result.details,
        triggered_actions: result.triggeredActions.map((a) => ({
          type: a.type,
          params: a.params,
          summary: ruleExecutionService.getActionSummary([a]),
        })),
      },
    });
  } catch (error) {
    console.error('POST /api/v2/rules/test 失败:', error);
    return v2ErrorResponse('规则执行测试失败', 500);
  }
}