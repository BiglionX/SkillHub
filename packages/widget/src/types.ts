 
import type { SkillSearchResult } from '@skillhub/search-sdk';

/**
 * Widget 主题配置
 */
export interface WidgetTheme {
  /** 主色调 */
  primaryColor?: string;
  /** 背景色 */
  backgroundColor?: string;
  /** 文字颜色 */
  textColor?: string;
  /** 边框颜色 */
  borderColor?: string;
  /** 圆角大小 */
  borderRadius?: string;
  /** 字体大小 */
  fontSize?: 'sm' | 'md' | 'lg';
}

/**
 * 搜索组件属性
 */
export interface SkillSearchWidgetProps {
  /** API 基础 URL */
  apiUrl?: string;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否显示高级筛选 */
  showAdvancedFilter?: boolean;
  /** 是否显示搜索结果 */
  showResults?: boolean;
  /** 默认每页数量 */
  pageSize?: number;
  /** 自定义类名 */
  className?: string;
  /** 主题配置 */
  theme?: WidgetTheme;
  /** 搜索完成回调 */
  onSearchComplete?: (results: SkillSearchResult[]) => void;
  /** 点击 Skill 卡片回调 */
  onSkillClick?: (skill: SkillSearchResult) => void;
}

/**
 * 我的 Skills 管理器属性
 */
export interface MySkillsManagerProps {
  /** API 基础 URL */
  apiUrl?: string;
  /** 用户认证 Token */
  authToken?: string;
  /** 是否允许发布到 SkillHub */
  allowPublish?: boolean;
  /** 是否允许编辑 */
  allowEdit?: boolean;
  /** 是否允许删除 */
  allowDelete?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 主题配置 */
  theme?: WidgetTheme;
  /** Skill 更新回调 */
  onSkillUpdate?: () => void;
  /** Skill 发布回调 */
  onSkillPublish?: (skillId: string) => void;
}

/**
 * 完整 Skill 商店组件属性
 */
export interface SkillStoreWidgetProps {
  /** API 基础 URL */
  apiUrl?: string;
  /** 用户认证 Token（可选） */
  authToken?: string;
  /** 默认视图：search | my-skills */
  defaultView?: 'search' | 'my-skills';
  /** 是否显示标签切换 */
  showTabs?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 主题配置 */
  theme?: WidgetTheme;
  /** 搜索相关回调 */
  onSearchComplete?: (results: SkillSearchResult[]) => void;
  onSkillClick?: (skill: SkillSearchResult) => void;
  /** 管理相关回调 */
  onSkillUpdate?: () => void;
  onSkillPublish?: (skillId: string) => void;
}

/**
 * Skill 数据（用于本地管理）
 */
export interface LocalSkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  version?: string;
  category?: string;
  tags?: string[];
  content?: string;
  isPublished?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}
