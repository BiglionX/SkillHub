/**
 * 启发式意图解析（兜底层）
 *
 * 当 LLM 不可用（助手离线/未配 Key/超时）时使用。
 * 准确率不如 LLM，但保证用户永远能拿到结果。
 *
 * 设计原则：
 * - 关键词字典覆盖 80% 的常见 query
 * - 检测不到时 confidence < 0.5，让 UI 提示「请换个说法」
 */

const KEYWORD_DICT: Record<
  string,
  {
    software_tags: string[];
    intent_tags: string[];
    skill_category: 'A' | 'B' | 'C';
  }
> = {
  // A 类：环境依赖型
  ps: { software_tags: ['photoshop'], intent_tags: ['image-process'], skill_category: 'A' },
  photoshop: { software_tags: ['photoshop'], intent_tags: ['image-process'], skill_category: 'A' },
  修图: { software_tags: ['photoshop'], intent_tags: ['image-retouch'], skill_category: 'A' },
  磨皮: { software_tags: ['photoshop'], intent_tags: ['image-retouch'], skill_category: 'A' },
  滤镜: { software_tags: ['photoshop'], intent_tags: ['image-process'], skill_category: 'A' },
  vscode: { software_tags: ['vscode'], intent_tags: ['code-tool'], skill_category: 'A' },
  'vs code': { software_tags: ['vscode'], intent_tags: ['code-tool'], skill_category: 'A' },
  调试: { software_tags: ['vscode'], intent_tags: ['code-diagnose'], skill_category: 'A' },
  插件: { software_tags: [], intent_tags: ['plugin'], skill_category: 'A' },
  blender: { software_tags: ['blender'], intent_tags: ['3d-tool'], skill_category: 'A' },
  excel: { software_tags: ['excel'], intent_tags: ['data-tool'], skill_category: 'A' },
  ppt: { software_tags: ['powerpoint'], intent_tags: ['data-tool'], skill_category: 'A' },
  figma: { software_tags: ['figma'], intent_tags: ['design-tool'], skill_category: 'A' },

  // B 类：数据授权型
  飞书: { software_tags: ['feishu'], intent_tags: ['feishu-integration'], skill_category: 'B' },
  同步: { software_tags: [], intent_tags: ['data-sync'], skill_category: 'B' },
  notion: { software_tags: ['notion'], intent_tags: ['notion-integration'], skill_category: 'B' },
  归档: { software_tags: [], intent_tags: ['data-archive'], skill_category: 'B' },
  邮件: { software_tags: ['gmail'], intent_tags: ['email-handle'], skill_category: 'B' },
  gmail: { software_tags: ['gmail'], intent_tags: ['email-handle'], skill_category: 'B' },
  日历: { software_tags: ['calendar'], intent_tags: ['schedule'], skill_category: 'B' },
  oauth: { software_tags: [], intent_tags: ['oauth-flow'], skill_category: 'B' },

  // C 类：内容生成型
  文案: { software_tags: [], intent_tags: ['content-write'], skill_category: 'C' },
  写: { software_tags: [], intent_tags: ['content-write'], skill_category: 'C' },
  小红书: { software_tags: [], intent_tags: ['content-write'], skill_category: 'C' },
  朋友圈: { software_tags: [], intent_tags: ['content-write'], skill_category: 'C' },
  纪要: { software_tags: [], intent_tags: ['meeting-summary'], skill_category: 'C' },
  总结: { software_tags: [], intent_tags: ['summarize'], skill_category: 'C' },
  摘要: { software_tags: [], intent_tags: ['summarize'], skill_category: 'C' },
  翻译: { software_tags: [], intent_tags: ['translate'], skill_category: 'C' },
  ppt生成: { software_tags: [], intent_tags: ['ppt-generate'], skill_category: 'C' },
  做ppt: { software_tags: [], intent_tags: ['ppt-generate'], skill_category: 'C' },
  写报告: { software_tags: [], intent_tags: ['report-write'], skill_category: 'C' },
  润色: { software_tags: [], intent_tags: ['content-polish'], skill_category: 'C' },
};

/**
 * 启发式解析 query
 * @param query 用户输入
 * @param detectedSoftware 已装软件列表（用于提升 confidence）
 */
export async function heuristicParse(
  query: string,
  detectedSoftware: string[] = []
): Promise<{
  software_tags: string[];
  intent_tags: string[];
  skill_category?: 'A' | 'B' | 'C';
  confidence: number;
  reasoning?: string;
}> {
  const lowerQuery = query.toLowerCase();

  // 收集所有命中
  const hits: Array<{
    software_tags: string[];
    intent_tags: string[];
    skill_category: 'A' | 'B' | 'C';
  }> = [];
  for (const [keyword, mapping] of Object.entries(KEYWORD_DICT)) {
    if (lowerQuery.includes(keyword.toLowerCase())) {
      hits.push(mapping);
    }
  }

  if (hits.length === 0) {
    return {
      software_tags: [],
      intent_tags: [],
      confidence: 0.0,
      reasoning: '未匹配到任何关键词，建议换个说法',
    };
  }

  // 合并所有命中
  const softwareTags = [...new Set(hits.flatMap((h) => h.software_tags))];
  const intentTags = [...new Set(hits.flatMap((h) => h.intent_tags))];

  // 类别投票（命中数最多的类别胜出）
  const categoryVotes: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
  for (const h of hits) categoryVotes[h.skill_category]++;

  let bestCategory: 'A' | 'B' | 'C' = 'C';
  let maxVotes = 0;
  for (const [cat, votes] of Object.entries(categoryVotes)) {
    if (votes > maxVotes) {
      bestCategory = cat as 'A' | 'B' | 'C';
      maxVotes = votes;
    }
  }

  // 计算 confidence：命中数 + 已装软件匹配加成
  let confidence = Math.min(0.5 + hits.length * 0.1, 0.85);

  const softwareMatch = softwareTags.filter((sw) => detectedSoftware.includes(sw));
  if (softwareMatch.length > 0) {
    confidence = Math.min(confidence + 0.1, 0.95);
  }

  return {
    software_tags: softwareTags,
    intent_tags: intentTags,
    skill_category: bestCategory,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: `启发式匹配（${hits.length} 个关键词命中）`,
  };
}