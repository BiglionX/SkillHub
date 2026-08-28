// Skill 相关类型
export interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  repositoryUrl?: string;
  packageUrl?: string;
  iconUrl?: string;
  screenshots: string[];
  readme?: string;
  status: SkillStatus;
  isPublic: boolean;
  price: number;
  currency: string;
  downloadCount: number;
  rating: number;
  reviewCount: number;
  authorId: string;
  namespaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export type SkillStatus = 
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED';

// 命名空间相关类型
export interface Namespace {
  id: string;
  name: string;
  slug: string;
  type: NamespaceType;
  description?: string;
  avatarUrl?: string;
  visibility: 'public' | 'private';
  allowPublicPublish: boolean;
  ownerId: string;
  skillCount: number;
  memberCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export type NamespaceType = 'PERSONAL' | 'TEAM' | 'GLOBAL';

export type NamespaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface NamespaceMember {
  namespaceId: string;
  userId: string;
  role: NamespaceRole;
  invitedBy?: string;
  joinedAt: string;
}

// 审核相关类型
export interface Review {
  id: string;
  skillId: string;
  version: string;
  status: ReviewStatus;
  previousStatus?: ReviewStatus;
  reviewerId?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  automatedChecks?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  skill?: {
    id: string;
    name: string;
    slug: string;
    author?: {
      id: string;
      name: string;
    };
  };
}

export type ReviewStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'AUTO_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REQUIRES_CHANGES'
  | 'ARCHIVED';

// 审计日志类型
export interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorId?: string;
  actorIp?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  status: 'success' | 'failure';
  errorMessage?: string;
  createdAt: string;
  actor?: {
    id: string;
    name?: string;
    email?: string;
  };
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
