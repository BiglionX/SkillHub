/**
 * 表单验证工具函数
 */

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    return '邮箱为必填项';
  }
  if (!emailRegex.test(email)) {
    return '请输入有效的邮箱地址';
  }
  return null;
}

/**
 * 验证密码强度（与 NvwaX 统一身份平台要求一致）
 * 要求：至少10个字符，包含字母和数字
 */
export function validatePassword(password: string): string | null {
  if (!password) {
    return '密码为必填项';
  }
  if (password.length < 10) {
    return '密码长度至少为10个字符';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return '密码必须包含至少一个字母';
  }
  if (!/[0-9]/.test(password)) {
    return '密码必须包含至少一个数字';
  }
  return null;
}

/**
 * 验证用户名
 */
export function validateUsername(username: string): string | null {
  if (!username) {
    return '用户名为必填项';
  }
  if (username.length < 3) {
    return '用户名长度至少为3个字符';
  }
  if (username.length > 20) {
    return '用户名长度不能超过20个字符';
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return '用户名只能包含字母、数字、下划线和连字符';
  }
  return null;
}

/**
 * 验证 Slug 格式
 */
export function validateSlug(slug: string): string | null {
  if (!slug) {
    return 'Slug 为必填项';
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'Slug 只能包含小写字母、数字和连字符';
  }
  if (slug.length < 3) {
    return 'Slug 长度至少为3个字符';
  }
  if (slug.length > 50) {
    return 'Slug 长度不能超过50个字符';
  }
  return null;
}

/**
 * 验证 URL 格式
 */
export function validateUrl(url: string): string | null {
  if (!url) {
    return null; // URL 通常是可选的
  }
  try {
    new URL(url);
    return null;
  } catch {
    return '请输入有效的 URL 地址';
  }
}

/**
 * 验证必填字段
 */
export function validateRequired(value: unknown, fieldName: string): string | null {
  if (!value || (typeof value === 'string' && !value.trim())) {
    return `${fieldName}为必填项`;
  }
  return null;
}

/**
 * 验证字符串长度
 */
export function validateLength(
  value: string,
  fieldName: string,
  min: number,
  max: number
): string | null {
  if (!value) {
    return null;
  }
  if (value.length < min) {
    return `${fieldName}长度至少为${min}个字符`;
  }
  if (value.length > max) {
    return `${fieldName}长度不能超过${max}个字符`;
  }
  return null;
}

/**
 * 验证标签数组
 */
export function validateTags(tags: string[]): string | null {
  if (tags.length === 0) {
    return null; // 标签通常是可选的
  }
  if (tags.length > 10) {
    return '标签数量不能超过10个';
  }
  for (const tag of tags) {
    if (tag.length > 20) {
      return `标签 "${tag}" 长度不能超过20个字符`;
    }
  }
  return null;
}

/**
 * 综合验证 Skill 表单
 */
export function validateSkillForm(data: {
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  repositoryUrl?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // 验证名称
  const nameError = validateRequired(data.name, '名称');
  if (nameError) {
    errors.name = nameError;
  } else {
    const nameLengthError = validateLength(data.name, '名称', 3, 100);
    if (nameLengthError) errors.name = nameLengthError;
  }

  // 验证 Slug
  const slugError = validateSlug(data.slug);
  if (slugError) errors.slug = slugError;

  // 验证描述
  const descError = validateRequired(data.description, '描述');
  if (descError) {
    errors.description = descError;
  } else {
    const descLengthError = validateLength(data.description, '描述', 10, 1000);
    if (descLengthError) errors.description = descLengthError;
  }

  // 验证分类
  const categoryError = validateRequired(data.category, '分类');
  if (categoryError) errors.category = categoryError;

  // 验证标签
  const tagsError = validateTags(data.tags);
  if (tagsError) errors.tags = tagsError;

  // 验证仓库 URL
  if (data.repositoryUrl) {
    const urlError = validateUrl(data.repositoryUrl);
    if (urlError) errors.repositoryUrl = urlError;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * 综合验证 Namespace 表单
 */
export function validateNamespaceForm(data: {
  name: string;
  slug: string;
  description?: string;
  type: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // 验证名称
  const nameError = validateRequired(data.name, '名称');
  if (nameError) {
    errors.name = nameError;
  } else {
    const nameLengthError = validateLength(data.name, '名称', 3, 50);
    if (nameLengthError) errors.name = nameLengthError;
  }

  // 验证 Slug
  const slugError = validateSlug(data.slug);
  if (slugError) errors.slug = slugError;

  // 验证类型
  const typeError = validateRequired(data.type, '类型');
  if (typeError) errors.type = typeError;

  // 验证描述(可选)
  if (data.description) {
    const descLengthError = validateLength(data.description, '描述', 0, 500);
    if (descLengthError) errors.description = descLengthError;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
