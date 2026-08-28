/**
 * 启发式意图解析单元测试
 *
 * 覆盖三类 Skill 关键词、A/B/C 分类投票、confidence 计算
 */

import { heuristicParse } from '../heuristic';

describe('heuristicParse', () => {
  describe('A 类（环境依赖型）', () => {
    it('识别 Photoshop 修图 → A 类 + image-retouch', async () => {
      const r = await heuristicParse('帮我把照片皮肤磨皮');
      expect(r.skill_category).toBe('A');
      expect(r.software_tags).toContain('photoshop');
      expect(r.intent_tags).toContain('image-retouch');
    });

    it('识别 VSCode 调试 → A 类 + code-diagnose', async () => {
      const r = await heuristicParse('用 VSCode 帮我调试这段 JS');
      expect(r.skill_category).toBe('A');
      expect(r.software_tags).toContain('vscode');
      expect(r.intent_tags).toContain('code-diagnose');
    });

    it('识别 Blender → A 类 + 3d-tool', async () => {
      const r = await heuristicParse('blender 怎么导出模型');
      expect(r.skill_category).toBe('A');
      expect(r.software_tags).toContain('blender');
    });
  });

  describe('B 类（数据授权型）', () => {
    it('识别飞书 → B 类 + feishu-integration', async () => {
      const r = await heuristicParse('打开飞书');
      expect(r.skill_category).toBe('B');
      expect(r.software_tags).toContain('feishu');
    });

    it('识别 Notion 同步 → B 类 + notion-integration', async () => {
      const r = await heuristicParse('把文档同步到 notion');
      expect(r.skill_category).toBe('B');
      expect(r.software_tags).toContain('notion');
      expect(r.intent_tags).toContain('notion-integration');
    });

    it('识别邮件 → B 类', async () => {
      const r = await heuristicParse('帮我处理一下邮件');
      expect(r.skill_category).toBe('B');
      expect(r.software_tags).toContain('gmail');
    });
  });

  describe('C 类（内容生成型）', () => {
    it('识别小红书文案 → C 类 + content-write', async () => {
      const r = await heuristicParse('写一篇 618 母婴好物小红书');
      expect(r.skill_category).toBe('C');
      expect(r.intent_tags).toContain('content-write');
    });

    it('识别会议纪要 → C 类 + meeting-summary', async () => {
      const r = await heuristicParse('帮我做会议纪要');
      expect(r.skill_category).toBe('C');
      expect(r.intent_tags).toContain('meeting-summary');
    });

    it('识别翻译 → C 类', async () => {
      const r = await heuristicParse('翻译成英文');
      expect(r.skill_category).toBe('C');
      expect(r.intent_tags).toContain('translate');
    });

    it('识别润色 → C 类', async () => {
      const r = await heuristicParse('润色一下这段文字');
      expect(r.skill_category).toBe('C');
      expect(r.intent_tags).toContain('content-polish');
    });
  });

  describe('未匹配处理', () => {
    it('完全不相关 query 返回 0 confidence', async () => {
      const r = await heuristicParse('zzzzzzzz random gibberish 12345');
      expect(r.confidence).toBe(0);
      expect(r.skill_category).toBeUndefined();
    });

    it('空字符串处理（防御性）', async () => {
      const r = await heuristicParse('');
      expect(r.confidence).toBe(0);
    });
  });

  describe('confidence 计算', () => {
    it('命中越多 confidence 越高', async () => {
      const r1 = await heuristicParse('ps');
      const r2 = await heuristicParse('ps 修图 滤镜');
      expect(r2.confidence).toBeGreaterThanOrEqual(r1.confidence);
    });

    it('已装软件命中提升 confidence', async () => {
      const baseR = await heuristicParse('帮我修图');
      const withInstalled = await heuristicParse('帮我修图', ['photoshop']);
      expect(withInstalled.confidence).toBeGreaterThan(baseR.confidence);
    });

    it('confidence 不超过 0.95', async () => {
      const r = await heuristicParse('ps 修图 滤镜 磨皮 photoshop', ['photoshop']);
      expect(r.confidence).toBeLessThanOrEqual(0.95);
    });
  });

  describe('多关键词混合', () => {
    it('飞书 + 写 → B 类胜出（按投票）', async () => {
      const r = await heuristicParse('飞书 同步 写 文档');
      // 同步/归档(2个 B 关键词) > 写(1 个 C 关键词)
      expect(r.skill_category).toBe('B');
    });

    it('混合 query 合并所有命中标签', async () => {
      const r = await heuristicParse('ps 修图 然后写文案 同步到飞书');
      // 三类都触发
      expect(r.software_tags.length).toBeGreaterThan(0);
      expect(r.intent_tags.length).toBeGreaterThan(0);
    });
  });
});