/**
 * Seed 脚本：把现有数据打上 deliveryCategory + 关联 IntentTag/SoftwareTag
 *
 * 运行：`pnpm --filter @skillhub/web run seed:v3`
 *
 * 策略：基于 Skill.name / description 的关键词匹配
 *   - 含「文案/写作/小红书/朋友圈/纪要/总结/翻译/PPT」→ C 类
 *   - 含「PS/Photoshop/修图/滤镜/插件/VSCode/调试/Blender/Figma」→ A 类
 *   - 含「飞书/Notion/同步/邮件/归档」→ B 类
 *   - 其他默认 A 类（最保守）
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KEYWORD_TO_DELIVERY: Array<{
  category: 'CONTENT_GENERATION' | 'ENVIRONMENT_DEPENDENT' | 'OAUTH_AUTHORIZED';
  keywords: string[];
  intentTags: string[]; // IntentTag.name
  softwareTags: string[]; // SoftwareTag.name
}> = [
  {
    category: 'CONTENT_GENERATION',
    keywords: ['文案', '写作', '小红书', '朋友圈', '纪要', '总结', '摘要', '翻译', 'PPT', '润色', '标题', '生成'],
    intentTags: ['content-write', 'meeting-summary', 'summarize', 'translate', 'ppt-generate', 'content-polish'],
    softwareTags: [],
  },
  {
    category: 'ENVIRONMENT_DEPENDENT',
    keywords: ['PS', 'Photoshop', '修图', '滤镜', '插件', 'VSCode', 'vscode', 'VS Code', '调试', 'Blender', 'Figma', 'Excel', 'PowerPoint'],
    intentTags: ['image-retouch', 'image-process', 'code-diagnose', 'code-tool', '3d-tool', 'design-tool', 'data-tool'],
    softwareTags: ['photoshop', 'vscode', 'blender', 'figma', 'excel', 'powerpoint'],
  },
  {
    category: 'OAUTH_AUTHORIZED',
    keywords: ['飞书', 'Notion', '同步', '邮件', '归档', 'OAuth', '连接'],
    intentTags: ['doc-sync', 'feishu-integration', 'notion-integration', 'email-handle', 'data-archive', 'data-sync'],
    softwareTags: ['feishu', 'notion', 'gmail'],
  },
];

const DEFAULT_LLM_CONFIG = (skillName: string) => ({
  model: 'deepseek-chat',
  system_prompt: `你是 SkillHub 的「${skillName}」Skill 助手。请按用户的输入参数生成高质量内容。`,
  input_schema: {
    params: [
      { name: 'topic', label: '主题', type: 'text', required: true, placeholder: '如：618 母婴好物推荐' },
      {
        name: 'tone',
        label: '语气',
        type: 'select',
        default: '活泼',
        options: [
          { value: '活泼', label: '活泼' },
          { value: '专业', label: '专业' },
          { value: '幽默', label: '幽默' },
        ],
      },
      {
        name: 'length',
        label: '长度',
        type: 'select',
        default: '中等',
        options: [
          { value: '短', label: '短（200字以内）' },
          { value: '中等', label: '中等（200-500字）' },
          { value: '长', label: '长（500+字）' },
        ],
      },
    ],
  },
});

async function main() {
  console.log('🌱 开始 Seed v3 delivery category...');

  // 1. 找所有已发布 Skill
  const skills = await prisma.skill.findMany({
    where: { status: 'APPROVED', isPublic: true },
    select: { id: true, slug: true, name: true, description: true, tags: true },
  });

  console.log(`📦 找到 ${skills.length} 个已发布 Skill`);

  // 2. 预加载 IntentTag / SoftwareTag
  const allIntentTags = await prisma.intentTag.findMany({ select: { id: true, name: true } });
  const allSoftwareTags = await prisma.softwareTag.findMany({ select: { id: true, name: true } });
  const intentTagMap = new Map(allIntentTags.map((t) => [t.name, t.id]));
  const softwareTagMap = new Map(allSoftwareTags.map((t) => [t.name, t.id]));

  let updated = 0;
  for (const skill of skills) {
    const text = `${skill.name} ${skill.description || ''} ${(skill.tags || []).join(' ')}`.toLowerCase();

    // 决定 deliveryCategory（投票）
    const votes: Record<string, number> = { CONTENT_GENERATION: 0, ENVIRONMENT_DEPENDENT: 0, OAUTH_AUTHORIZED: 0 };
    const matchedIntentTags = new Set<string>();
    const matchedSoftwareTags = new Set<string>();

    for (const rule of KEYWORD_TO_DELIVERY) {
      for (const kw of rule.keywords) {
        if (text.includes(kw.toLowerCase())) {
          votes[rule.category]++;
          for (const it of rule.intentTags) matchedIntentTags.add(it);
          for (const st of rule.softwareTags) matchedSoftwareTags.add(st);
        }
      }
    }

    // 默认：A 类（最保守）
    let deliveryCategory: 'CONTENT_GENERATION' | 'ENVIRONMENT_DEPENDENT' | 'OAUTH_AUTHORIZED' = 'ENVIRONMENT_DEPENDENT';
    let maxVotes = 0;
    const validCategories: ReadonlySet<string> = new Set([
      'CONTENT_GENERATION',
      'ENVIRONMENT_DEPENDENT',
      'OAUTH_AUTHORIZED',
    ]);
    for (const [cat, v] of Object.entries(votes)) {
      if (v > maxVotes && validCategories.has(cat)) {
        maxVotes = v;
        deliveryCategory = cat as 'CONTENT_GENERATION' | 'ENVIRONMENT_DEPENDENT' | 'OAUTH_AUTHORIZED';
      }
    }
    // 兜底：如果没有任何关键词命中，保持 A 类但加 content-write intent 标记（让 ChatIntentInput 至少能找到这条）
    if (maxVotes === 0) {
      matchedIntentTags.add('content-write');
    }

    // 3. 更新 Skill
    const llmConfig =
      deliveryCategory === 'CONTENT_GENERATION' ? DEFAULT_LLM_CONFIG(skill.name) : undefined;

    await prisma.skill.update({
      where: { id: skill.id },
      data: {
        deliveryCategory,
        llmConfig,
      },
    });

    // 4. 重建关联
    await prisma.skillIntentTag.deleteMany({ where: { skillId: skill.id } });
    await prisma.skillSoftwareTag.deleteMany({ where: { skillId: skill.id } });

    const intentTagRelations = Array.from(matchedIntentTags)
      .map((name) => intentTagMap.get(name))
      .filter((id): id is string => !!id)
      .map((intentTagId) => ({
        skillId: skill.id,
        intentTagId,
        weight: 1,
      }));

    const softwareTagRelations = Array.from(matchedSoftwareTags)
      .map((name) => softwareTagMap.get(name))
      .filter((id): id is string => !!id)
      .map((softwareTagId) => ({
        skillId: skill.id,
        softwareTagId,
      }));

    if (intentTagRelations.length > 0) {
      await prisma.skillIntentTag.createMany({ data: intentTagRelations, skipDuplicates: true });
    }
    if (softwareTagRelations.length > 0) {
      await prisma.skillSoftwareTag.createMany({ data: softwareTagRelations, skipDuplicates: true });
    }

    updated++;
    if (updated % 50 === 0) {
      console.log(`  ⏳ 已更新 ${updated}/${skills.length}`);
    }
  }

  console.log(`✅ 完成：${updated} 个 Skill 已打标`);
  console.log('\n📊 统计：');
  const stats = await prisma.skill.groupBy({
    by: ['deliveryCategory'],
    where: { status: 'APPROVED', isPublic: true },
    _count: true,
  });
  for (const s of stats) {
    console.log(`  ${s.deliveryCategory || '未标记'}: ${s._count}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });