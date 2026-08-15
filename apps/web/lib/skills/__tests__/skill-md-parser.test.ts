/**
 * SKILL.md 解析器单元测试
 *
 * 覆盖场景：
 * 1. 合法 SKILL.md 解析（基础 / 完整 / 扩展字段）
 * 2. frontmatter 字段缺失报错
 * 3. 字段长度限制
 * 4. 非法 name 格式
 * 5. 关键词提取（中英文）
 * 6. 标题提取
 * 7. 边界场景（空内容、非字符串）
 * 8. validateSkillMd 快速校验
 * 9. generateSkillMd 生成
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseSkillMd,
  validateSkillMd,
  generateSkillMd,
  SkillMdParseError,
} from '../skill-md-parser';

describe('parseSkillMd - 基础场景', () => {
  it('应成功解析合法的 SKILL.md（基础）', () => {
    const content = `---
name: pdf-generation
description: Generate PDF documents from markdown content
---

# PDF Generation Skill

Use this skill to convert markdown files into PDF documents.
`;

    const result = parseSkillMd(content);

    expect(result.frontmatter.name).toBe('pdf-generation');
    expect(result.frontmatter.description).toBe(
      'Generate PDF documents from markdown content',
    );
    expect(result.body).toContain('PDF Generation Skill');
    expect(result.body).toContain('convert markdown files into PDF');
    expect(result.title).toBe('PDF Generation Skill');
    expect(result.agentSkillsVersion).toBe('1.0');
    expect(result.extraFields).toEqual({});
  });

  it('应保留额外的 frontmatter 字段', () => {
    const content = `---
name: data-analysis
description: Analyze data using pandas and generate visualization charts
author: john-doe
version: 1.2.0
tags:
  - data
  - analysis
---

# Data Analysis
`;

    const result = parseSkillMd(content);

    expect(result.extraFields).toMatchObject({
      author: 'john-doe',
      version: '1.2.0',
    });
    expect(result.extraFields.tags).toEqual(['data', 'analysis']);
  });

  it('应支持中文 description', () => {
    const content = `---
name: chinese-test
description: 这是一个用于测试中文描述的技能，它能处理中文字符
---

# 中文测试
`;

    const result = parseSkillMd(content);

    expect(result.frontmatter.description).toContain('中文');
    // 中文应作为关键词
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.keywords.some((k) => /[\u4e00-\u9fa5]/.test(k))).toBe(true);
  });

  it('应提取关键词（中英文混合）', () => {
    const content = `---
name: test
description: A skill for processing PDF files and analyzing data
---

body
`;

    const result = parseSkillMd(content);

    // 英文关键词
    expect(result.keywords).toContain('skill');
    expect(result.keywords).toContain('processing');
    expect(result.keywords).toContain('pdf');
    expect(result.keywords).toContain('files');
    expect(result.keywords).toContain('analyzing');
    expect(result.keywords).toContain('data');
    // 停用词应被过滤
    expect(result.keywords).not.toContain('a');
    expect(result.keywords).not.toContain('for');
    expect(result.keywords).not.toContain('and');
  });
});

describe('parseSkillMd - 错误场景', () => {
  it('应拒绝空内容', () => {
    expect(() => parseSkillMd('')).toThrow(SkillMdParseError);
    expect(() => parseSkillMd('   ')).toThrow(SkillMdParseError);
    expect(() => parseSkillMd('\n\n')).toThrow(SkillMdParseError);
  });

  it('应拒绝非字符串输入', () => {
    expect(() => parseSkillMd(null as unknown as string)).toThrow(SkillMdParseError);
    expect(() => parseSkillMd(undefined as unknown as string)).toThrow(SkillMdParseError);
  });

  it('应拒绝缺少 frontmatter 的内容', () => {
    const content = '# Just a title\n\nNo frontmatter here.';

    expect(() => parseSkillMd(content)).toThrow(/frontmatter|name|description/i);
  });

  it('应拒绝缺少 name 字段', () => {
    const content = `---
description: A skill without a name field
---

body
`;

    try {
      parseSkillMd(content);
      fail('应抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(SkillMdParseError);
      expect((error as SkillMdParseError).code).toBe('INVALID_NAME');
    }
  });

  it('应拒绝缺少 description 字段', () => {
    const content = `---
name: my-skill
---

body
`;

    try {
      parseSkillMd(content);
      fail('应抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(SkillMdParseError);
      expect((error as SkillMdParseError).code).toBe('INVALID_DESCRIPTION');
    }
  });

  it('应拒绝过短的 description', () => {
    const content = `---
name: my-skill
description: short
---

body
`;

    try {
      parseSkillMd(content);
      fail('应抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(SkillMdParseError);
      expect((error as SkillMdParseError).code).toBe('INVALID_DESCRIPTION');
    }
  });

  it('应拒绝包含非法字符的 name', () => {
    const content = `---
name: invalid name with spaces
description: This is a valid description
---

body
`;

    expect(() => parseSkillMd(content)).toThrow(SkillMdParseError);
  });

  it('应拒绝过长的 name', () => {
    const longName = 'a'.repeat(65);
    const content = `---
name: ${longName}
description: This is a valid description
---

body
`;

    expect(() => parseSkillMd(content)).toThrow(SkillMdParseError);
  });
});

describe('parseSkillMd - 边界场景', () => {
  it('应处理没有主体的 SKILL.md', () => {
    const content = `---
name: empty-body
description: A skill with no body content
---
`;

    const result = parseSkillMd(content);

    expect(result.body).toBe('');
    expect(result.title).toBeNull();
  });

  it('应处理没有 H1 的主体', () => {
    const content = `---
name: no-title
description: A skill without H1 heading
---

This is just body text without any heading.
Some more content here.
`;

    const result = parseSkillMd(content);

    expect(result.title).toBeNull();
    expect(result.body).toContain('just body text');
  });

  it('应限制关键词数量为最多 10 个', () => {
    const longDesc = Array.from(
      { length: 50 },
      (_, i) => `keyword${i}`,
    ).join(' ');
    const content = `---
name: many-keywords
description: ${longDesc}
---

body
`;

    const result = parseSkillMd(content);

    expect(result.keywords.length).toBeLessThanOrEqual(10);
  });

  it('关键词应去重', () => {
    const content = `---
name: dedup
description: test test test keyword keyword skill
---

body
`;

    const result = parseSkillMd(content);

    const unique = new Set(result.keywords);
    expect(unique.size).toBe(result.keywords.length);
  });
});

describe('validateSkillMd - 快速校验', () => {
  it('合法内容应返回 valid: true', () => {
    const content = `---
name: test
description: This is a valid description
---

body
`;

    const result = validateSkillMd(content);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.frontmatter).toBeDefined();
    expect(result.frontmatter?.name).toBe('test');
  });

  it('非法内容应返回 valid: false', () => {
    const result = validateSkillMd('just text');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.frontmatter).toBeUndefined();
  });
});

describe('generateSkillMd - 生成', () => {
  it('应生成可被 parseSkillMd 重新解析的内容', () => {
    const frontmatter = {
      name: 'roundtrip',
      description: 'A skill to test roundtrip parsing',
    };
    const body = '# Roundtrip Test\n\nThis body should survive roundtrip.';

    const generated = generateSkillMd(frontmatter, body);
    const parsed = parseSkillMd(generated);

    expect(parsed.frontmatter.name).toBe(frontmatter.name);
    expect(parsed.frontmatter.description).toBe(frontmatter.description);
    expect(parsed.body).toContain('Roundtrip Test');
    expect(parsed.body).toContain('survive roundtrip');
  });

  it('生成的输出应包含 YAML frontmatter 分隔符', () => {
    const generated = generateSkillMd(
      { name: 'test', description: 'valid description here' },
      'body',
    );

    expect(generated).toContain('---');
    expect(generated).toContain('name: test');
  });
});