import { describe, it, expect } from '@jest/globals';
import {
  validateEmail,
  validatePassword,
  validateUsername,
  validateSlug,
  validateUrl,
  validateRequired,
  validateLength,
  validateTags,
  validateSkillForm,
  validateNamespaceForm,
} from '@/lib/form-validation';

describe('表单验证工具函数', () => {
  describe('validateEmail', () => {
    it('应该验证有效的邮箱地址', () => {
      expect(validateEmail('test@example.com')).toBeNull();
      expect(validateEmail('user.name+tag@example.co.uk')).toBeNull();
    });

    it('应该拒绝无效的邮箱地址', () => {
      expect(validateEmail('')).toBe('邮箱为必填项');
      expect(validateEmail('invalid')).toBe('请输入有效的邮箱地址');
      expect(validateEmail('@example.com')).toBe('请输入有效的邮箱地址');
      expect(validateEmail('test@')).toBe('请输入有效的邮箱地址');
    });
  });

  describe('validatePassword', () => {
    it('应该验证强密码', () => {
      expect(validatePassword('Password123')).toBeNull();
      expect(validatePassword('Str0ng!Pass')).toBeNull();
    });

    it('应该拒绝弱密码', () => {
      // 密码策略与 NvwaX 统一身份平台一致：至少10个字符，包含字母和数字
      expect(validatePassword('')).toBe('密码为必填项');
      expect(validatePassword('short')).toBe('密码长度至少为10个字符');
      expect(validatePassword('abcdefghij')).toBe('密码必须包含至少一个数字');
      expect(validatePassword('1234567890')).toBe('密码必须包含至少一个字母');
    });
  });

  describe('validateUsername', () => {
    it('应该验证有效的用户名', () => {
      expect(validateUsername('john_doe')).toBeNull();
      expect(validateUsername('user-123')).toBeNull();
    });

    it('应该拒绝无效的用户名', () => {
      expect(validateUsername('')).toBe('用户名为必填项');
      expect(validateUsername('ab')).toBe('用户名长度至少为3个字符');
      expect(validateUsername('a'.repeat(21))).toBe('用户名长度不能超过20个字符');
      expect(validateUsername('user name')).toBe('用户名只能包含字母、数字、下划线和连字符');
    });
  });

  describe('validateSlug', () => {
    it('应该验证有效的 slug', () => {
      expect(validateSlug('my-awesome-skill')).toBeNull();
      expect(validateSlug('test-123')).toBeNull();
    });

    it('应该拒绝无效的 slug', () => {
      expect(validateSlug('')).toBe('Slug 为必填项');
      expect(validateSlug('Invalid_Slug')).toBe('Slug 只能包含小写字母、数字和连字符');
      expect(validateSlug('ab')).toBe('Slug 长度至少为3个字符');
      expect(validateSlug('a'.repeat(51))).toBe('Slug 长度不能超过50个字符');
    });
  });

  describe('validateUrl', () => {
    it('应该验证有效的 URL', () => {
      expect(validateUrl('https://example.com')).toBeNull();
      expect(validateUrl('http://github.com/user/repo')).toBeNull();
    });

    it('应该允许空 URL(可选字段)', () => {
      expect(validateUrl('')).toBeNull();
    });

    it('应该拒绝无效的 URL', () => {
      expect(validateUrl('not a url')).toBe('请输入有效的 URL 地址');
      expect(validateUrl('::invalid')).toBe('请输入有效的 URL 地址');
    });
  });

  describe('validateRequired', () => {
    it('应该验证必填字段', () => {
      expect(validateRequired('value', '字段')).toBeNull();
      expect(validateRequired('', '字段')).toBe('字段为必填项');
      expect(validateRequired(null, '字段')).toBe('字段为必填项');
      expect(validateRequired(undefined, '字段')).toBe('字段为必填项');
    });
  });

  describe('validateLength', () => {
    it('应该验证字符串长度', () => {
      expect(validateLength('test', '字段', 2, 10)).toBeNull();
      expect(validateLength('t', '字段', 2, 10)).toBe('字段长度至少为2个字符');
      expect(validateLength('test123456789', '字段', 2, 10)).toBe('字段长度不能超过10个字符');
    });

    it('应该允许空值', () => {
      expect(validateLength('', '字段', 2, 10)).toBeNull();
    });
  });

  describe('validateTags', () => {
    it('应该验证有效的标签数组', () => {
      expect(validateTags(['tag1', 'tag2'])).toBeNull();
      expect(validateTags([])).toBeNull(); // 空数组是允许的
    });

    it('应该拒绝过多的标签', () => {
      const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
      expect(validateTags(tooManyTags)).toBe('标签数量不能超过10个');
    });

    it('应该拒绝过长的标签', () => {
      expect(validateTags(['a'.repeat(21)])).toBe('标签 "aaaaaaaaaaaaaaaaaaaaa" 长度不能超过20个字符');
    });
  });

  describe('validateSkillForm', () => {
    it('应该验证有效的 Skill 表单', () => {
      const validData = {
        name: 'My Awesome Skill',
        slug: 'my-awesome-skill',
        description: 'This is a great skill for AI agents',
        category: 'ai-agent',
        tags: ['ai', 'automation'],
        repositoryUrl: 'https://github.com/user/repo',
      };

      const result = validateSkillForm(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('应该检测无效的 Skill 表单', () => {
      const invalidData = {
        name: '',
        slug: 'INVALID',
        description: 'short',
        category: '',
        tags: [],
      };

      const result = validateSkillForm(invalidData as Parameters<typeof validateSkillForm>[0]);
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBeDefined();
      expect(result.errors.slug).toBeDefined();
      expect(result.errors.description).toBeDefined();
      expect(result.errors.category).toBeDefined();
    });
  });

  describe('validateNamespaceForm', () => {
    it('应该验证有效的 Namespace 表单', () => {
      const validData = {
        name: 'My Team',
        slug: 'my-team',
        description: 'A team workspace',
        type: 'TEAM',
      };

      const result = validateNamespaceForm(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('应该检测无效的 Namespace 表单', () => {
      const invalidData = {
        name: '',
        slug: '',
        type: '',
      };

      const result = validateNamespaceForm(invalidData as Parameters<typeof validateNamespaceForm>[0]);
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBeDefined();
      expect(result.errors.slug).toBeDefined();
      expect(result.errors.type).toBeDefined();
    });
  });
});
