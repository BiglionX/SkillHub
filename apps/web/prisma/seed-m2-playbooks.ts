/**
 * Seed 脚本：从 apps/helper/resources/playbooks/ 加载5 个内置剧本，
 * 把 YAML 内容 + schemaHash 写入 PlaybookDefinition。
 *
 * 运行：`pnpm --filter @skillhub/web run seed:m2`
 *
 * 注意：apps/helper/resources 在 monorepo 根目录的相对路径下，
 * 需要从 apps/web/prisma/ 出发上溯两级。
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();

const PLAYBOOKS = [
  { id: 'photoshop-plugin@v1', software: 'photoshop', file: 'photoshop-plugin.yml' },
  { id: 'vscode-extension@v1', software: 'vscode', file: 'vscode-extension.yml' },
  { id: 'blender-addon@v1', software: 'blender', file: 'blender-addon.yml' },
  { id: 'excel-automation@v1', software: 'excel', file: 'excel-automation.yml' },
  { id: 'powerpoint-template@v1', software: 'powerpoint', file: 'powerpoint-template.yml' },
];

async function main() {
  console.log('🌱 Seed M2 内置剧本...');

  // 路径：从 apps/web/prisma/seed-m2-playbooks.ts 上溯到 apps/helper/resources/playbooks/
  const playbooksDir = path.resolve(__dirname, '../../helper/resources/playbooks');

  if (!fs.existsSync(playbooksDir)) {
    console.error(`❌ 找不到剧本目录: ${playbooksDir}`);
    console.error('请确认 apps/helper/resources/playbooks/ 存在');
    process.exit(1);
  }

  for (const p of PLAYBOOKS) {
    const filePath = path.join(playbooksDir, p.file);
    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ 缺失: ${p.file}`);
      continue;
    }

    const yaml = fs.readFileSync(filePath, 'utf-8');
    const schemaHash = 'sha256:' + crypto.createHash('sha256').update(yaml).digest('hex').slice(0, 32);

    await prisma.playbookDefinition.upsert({
      where: { id: p.id },
      update: {
        yaml,
        schemaHash,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
      create: {
        id: p.id,
        software: p.software,
        version: '1.0.0',
        source: 'BUILTIN',
        yaml,
        schemaHash,
        status: 'ACTIVE',
      },
    });

    console.log(`  ✓ ${p.id} (${yaml.length} chars, hash=${schemaHash.slice(0, 16)}…)`);
  }

  // 统计
  const count = await prisma.playbookDefinition.count({ where: { source: 'BUILTIN' } });
  console.log(`\n✅ 完成：${count} 个 PlaybookDefinition (BUILTIN)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });