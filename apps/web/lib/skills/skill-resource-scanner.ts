/**
 * SKILL.md 资源扫描器
 *
 * 扫描 Skill 文件夹，识别 scripts/、references/、assets/ 等资源
 * 用于渐进式披露（Progressive Disclosure）
 *
 * @module lib/skills/skill-resource-scanner
 */

import { createHash } from 'crypto';

export type ResourceType = 'script' | 'reference' | 'asset' | 'other';

export interface ScannedResource {
  type: ResourceType;
  path: string;
  content: string | Buffer;
  sizeBytes: number;
  mimeType: string | null;
  checksum: string;
}

export interface ScanResult {
  resources: ScannedResource[];
  totalCount: number;
  totalSizeBytes: number;
  byType: Record<ResourceType, number>;
}

/**
 * 根据文件路径推断资源类型
 */
export function inferResourceType(filePath: string): ResourceType {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();

  if (normalized.startsWith('scripts/') || normalized.includes('/scripts/')) {
    return 'script';
  }
  if (
    normalized.startsWith('references/') ||
    normalized.includes('/references/')
  ) {
    return 'reference';
  }
  if (normalized.startsWith('assets/') || normalized.includes('/assets/')) {
    return 'asset';
  }
  return 'other';
}

/**
 * 根据文件扩展名推断 MIME 类型
 */
export function inferMimeType(filePath: string): string | null {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return null;

  const mimeMap: Record<string, string> = {
    '.sh': 'text/x-shellscript',
    '.bash': 'text/x-shellscript',
    '.py': 'text/x-python',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
  };

  return mimeMap[ext] ?? null;
}

/**
 * 计算 SHA-256 校验和
 */
export function calculateChecksum(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 扫描资源文件 Map（path -> content）
 */
export function scanResources(
  files: Map<string, string | Buffer>,
): ScanResult {
  const resources: ScannedResource[] = [];
  const byType: Record<ResourceType, number> = {
    script: 0,
    reference: 0,
    asset: 0,
    other: 0,
  };

  let totalSizeBytes = 0;

  for (const [path, content] of files.entries()) {
    const type = inferResourceType(path);
    const sizeBytes =
      typeof content === 'string'
        ? Buffer.byteLength(content, 'utf8')
        : content.length;
    const mimeType = inferMimeType(path);
    const checksum = calculateChecksum(content);

    resources.push({
      type,
      path,
      content,
      sizeBytes,
      mimeType,
      checksum,
    });

    byType[type]++;
    totalSizeBytes += sizeBytes;
  }

  // 按路径排序，确保顺序稳定
  resources.sort((a, b) => a.path.localeCompare(b.path));

  return {
    resources,
    totalCount: resources.length,
    totalSizeBytes,
    byType,
  };
}

/**
 * 生成资源存储 key
 */
export function buildStorageKey(
  skillSlug: string,
  resourcePath: string,
): string {
  // 清理路径
  const safePath = resourcePath.replace(/^\/+/, '').replace(/\.\./g, '_');
  return `skills/${skillSlug}/resources/${safePath}`;
}