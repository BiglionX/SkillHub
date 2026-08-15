#!/usr/bin/env node
/**
 * skillhub-validate CLI — 校验技能包目录
 * 用法: skillhub-validate <skill-dir>
 * 退出码: 0=通过, 1=拒绝, 2=用法错误
 */

import * as path from 'path';
import { validateSkillPackage } from './index';

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) {
    console.error('用法: skillhub-validate <skill-dir>');
    process.exit(2);
  }

  const report = await validateSkillPackage(path.resolve(dir));
  const name = report.skillName ?? path.basename(dir);

  console.log(`# 校验报告: ${name}${report.version ? '@' + report.version : ''}`);
  console.log(`- 结论: ${report.valid ? '✅ 通过' : '❌ 拒绝'}`);
  console.log('');
  for (const c of report.checks) {
    console.log(`- [${c.status.toUpperCase()}] ${c.name}${c.detail ? ': ' + c.detail : ''}`);
  }
  if (report.errors.length) {
    console.log('\n错误:');
    report.errors.forEach((e) => console.log(`  - ${e}`));
  }
  if (report.warnings.length) {
    console.log('\n警告:');
    report.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  process.exit(report.valid ? 0 : 1);
}

main().catch((error: unknown) => {
  const err = error as { message?: string };
  console.error(err.message ?? String(error));
  process.exit(1);
});
