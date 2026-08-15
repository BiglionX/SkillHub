/**
 * SKILL.md 资源扫描器单元测试
 */

import { describe, it, expect } from '@jest/globals';
import {
  inferResourceType,
  inferMimeType,
  calculateChecksum,
  scanResources,
  buildStorageKey,
} from '../skill-resource-scanner';

describe('inferResourceType', () => {
  it('应识别 scripts/ 目录下的文件', () => {
    expect(inferResourceType('scripts/check.sh')).toBe('script');
    expect(inferResourceType('scripts/deploy.py')).toBe('script');
    expect(inferResourceType('src/scripts/run.js')).toBe('script');
  });

  it('应识别 references/ 目录下的文件', () => {
    expect(inferResourceType('references/sop.md')).toBe('reference');
    expect(inferResourceType('docs/references/api.md')).toBe('reference');
  });

  it('应识别 assets/ 目录下的文件', () => {
    expect(inferResourceType('assets/logo.png')).toBe('asset');
    expect(inferResourceType('static/assets/icon.svg')).toBe('asset');
  });

  it('未知路径应归类为 other', () => {
    expect(inferResourceType('README.md')).toBe('other');
    expect(inferResourceType('package.json')).toBe('other');
  });

  it('应处理 Windows 路径分隔符', () => {
    expect(inferResourceType('scripts\\check.sh')).toBe('script');
    expect(inferResourceType('references\\sop.md')).toBe('reference');
  });

  it('大小写不敏感', () => {
    expect(inferResourceType('SCRIPTS/check.sh')).toBe('script');
    expect(inferResourceType('References/sop.md')).toBe('reference');
  });
});

describe('inferMimeType', () => {
  it('应推断常见脚本类型', () => {
    expect(inferMimeType('run.sh')).toBe('text/x-shellscript');
    expect(inferMimeType('script.py')).toBe('text/x-python');
    expect(inferMimeType('main.js')).toBe('application/javascript');
    expect(inferMimeType('app.ts')).toBe('application/typescript');
  });

  it('应推断常见数据/文档类型', () => {
    expect(inferMimeType('data.json')).toBe('application/json');
    expect(inferMimeType('readme.md')).toBe('text/markdown');
    expect(inferMimeType('config.yaml')).toBe('application/yaml');
    expect(inferMimeType('config.yml')).toBe('application/yaml');
  });

  it('应推断图片类型', () => {
    expect(inferMimeType('logo.png')).toBe('image/png');
    expect(inferMimeType('photo.jpg')).toBe('image/jpeg');
    expect(inferMimeType('photo.jpeg')).toBe('image/jpeg');
    expect(inferMimeType('icon.svg')).toBe('image/svg+xml');
  });

  it('无扩展名应返回 null', () => {
    expect(inferMimeType('README')).toBeNull();
    expect(inferMimeType('Makefile')).toBeNull();
  });

  it('未知扩展名应返回 null', () => {
    expect(inferMimeType('file.unknown')).toBeNull();
  });
});

describe('calculateChecksum', () => {
  it('相同输入应产生相同 SHA-256', () => {
    const input = 'hello world';
    const a = calculateChecksum(input);
    const b = calculateChecksum(input);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('不同输入应产生不同校验和', () => {
    expect(calculateChecksum('a')).not.toBe(calculateChecksum('b'));
  });

  it('应支持 Buffer 输入', () => {
    const buf = Buffer.from('hello', 'utf8');
    expect(calculateChecksum(buf)).toBe(calculateChecksum('hello'));
  });
});

describe('scanResources', () => {
  it('应正确统计各种类型', () => {
    const files = new Map<string, string | Buffer>([
      ['scripts/run.sh', '#!/bin/bash\necho hi'],
      ['scripts/deploy.py', 'import os'],
      ['references/sop.md', '# SOP'],
      ['assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      ['README.md', '# README'],
    ]);

    const result = scanResources(files);

    expect(result.totalCount).toBe(5);
    expect(result.byType.script).toBe(2);
    expect(result.byType.reference).toBe(1);
    expect(result.byType.asset).toBe(1);
    expect(result.byType.other).toBe(1);
  });

  it('应计算总大小', () => {
    const files = new Map<string, string | Buffer>([
      ['a.txt', 'hello'],
      ['b.txt', 'world!'],
    ]);

    const result = scanResources(files);

    expect(result.totalSizeBytes).toBe(
      Buffer.byteLength('hello', 'utf8') + Buffer.byteLength('world!', 'utf8'),
    );
  });

  it('应填充 mimeType 和 checksum', () => {
    const files = new Map<string, string | Buffer>([
      ['scripts/run.sh', '#!/bin/bash'],
    ]);

    const result = scanResources(files);

    expect(result.resources[0].mimeType).toBe('text/x-shellscript');
    expect(result.resources[0].checksum).toHaveLength(64);
  });

  it('应按路径排序', () => {
    const files = new Map<string, string | Buffer>([
      ['z.txt', 'z'],
      ['a.txt', 'a'],
      ['m.txt', 'm'],
    ]);

    const result = scanResources(files);

    expect(result.resources.map((r) => r.path)).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });

  it('空 Map 应返回空结果', () => {
    const result = scanResources(new Map());

    expect(result.totalCount).toBe(0);
    expect(result.resources).toHaveLength(0);
    expect(result.totalSizeBytes).toBe(0);
  });
});

describe('buildStorageKey', () => {
  it('应生成包含 skill slug 的路径', () => {
    expect(buildStorageKey('pdf-gen', 'scripts/check.sh')).toBe(
      'skills/pdf-gen/resources/scripts/check.sh',
    );
  });

  it('应清理前导斜杠', () => {
    expect(buildStorageKey('my-skill', '/scripts/run.sh')).toBe(
      'skills/my-skill/resources/scripts/run.sh',
    );
  });

  it('应防止路径遍历', () => {
    expect(buildStorageKey('my-skill', '../../../etc/passwd')).not.toContain('..');
    expect(buildStorageKey('my-skill', '../../../etc/passwd')).toBe(
      'skills/my-skill/resources/_/_/_/etc/passwd',
    );
  });
});