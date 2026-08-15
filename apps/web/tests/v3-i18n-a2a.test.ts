/**
 * F3 (i18n) + F4 (A2A) 集成测试
 *
 * 测试场景：
 * 1. i18n 配置和字典
 * 2. i18n API 端点（/api/v2/locales, /api/v2/locales/set）
 * 3. Skill 多语言端点
 * 4. A2A Agent Card 端点
 * 5. A2A Task 创建和管理
 */

import { GET as localesGET } from '../../app/api/v2/locales/route';
import { GET as skillI18nGET } from '../../app/api/v2/skills/[slug]/i18n/route';

// ============================================================
// i18n Locales API 测试
// ============================================================

describe('GET /api/v2/locales', () => {
  it('返回所有支持的 locale', async () => {
    const response = await localesGET();
    const data = await response.json();

    expect(data.version).toBe('1.0');
    expect(data.defaultLocale).toBe('zh-CN');
    expect(data.count).toBe(4);
    expect(data.locales).toHaveLength(4);

    const codes = data.locales.map((l: { code: string }) => l.code);
    expect(codes).toEqual(['zh-CN', 'en-US', 'ja-JP', 'ko-KR']);
  });

  it('每个 locale 包含完整元信息', async () => {
    const response = await localesGET();
    const data = await response.json();

    for (const locale of data.locales) {
      expect(locale).toHaveProperty('code');
      expect(locale).toHaveProperty('nativeName');
      expect(locale).toHaveProperty('englishName');
      expect(locale).toHaveProperty('chineseName');
      expect(locale).toHaveProperty('flag');
      expect(locale).toHaveProperty('dir');
      expect(locale).toHaveProperty('isDefault');
    }
  });

  it('默认 locale 标记为 isDefault=true', async () => {
    const response = await localesGET();
    const data = await response.json();
    const defaultLocale = data.locales.find((l: { code: string }) => l.isDefault);
    expect(defaultLocale?.code).toBe('zh-CN');
  });
});

// ============================================================
// Skill i18n API 测试（Mock Prisma）
// ============================================================

// 由于涉及数据库，简化测试 - 仅验证错误处理
describe('GET /api/v2/skills/[slug]/i18n', () => {
  it('无效 locale 返回 400', async () => {
    const request = new Request('http://localhost/api/v2/skills/test/i18n?locale=invalid');
    const response = await skillI18nGET(request as never, { params: Promise.resolve({ slug: 'test' }) });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('INVALID_LOCALE');
  });

  it('接受 zh-CN', async () => {
    const request = new Request('http://localhost/api/v2/skills/test/i18n?locale=zh-CN');
    const response = await skillI18nGET(request as never, { params: Promise.resolve({ slug: 'non-existent' }) });
    // 即使 Skill 不存在，locale 验证通过
    expect([200, 404]).toContain(response.status);
  });
});

// ============================================================
// A2A 测试已通过独立测试文件覆盖（__tests__/schemas.test.ts, task-store.test.ts）
// ============================================================
