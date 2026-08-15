/**
 * Skill Hub CLI 入口
 *
 * 用法：
 *   skillhub publish [path]       发布技能到 Skill Hub
 *   skillhub install <skill>      安装技能
 *   skillhub search <query>       搜索技能
 *   skillhub config [key] [value] 管理 CLI 配置
 *   skillhub skill export <slug>  导出技能为 Agent Skills 标准包
 *   skillhub skill import <src>   导入 SKILL.md（GitHub / 本地）
 *
 * 注意：源码由 dist 产物反推还原（2026-04），
 * 版本号通过 createRequire 读取 package.json，避免 tsc rootDir 限制。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { publishCommand } from './commands/publish';
import { installCommand } from './commands/install';
import { searchCommand } from './commands/search';
import { configCommand } from './commands/config';
import { exportCommand } from './commands/export';
import { importCommand } from './commands/import';

// 读取 package.json 版本号（dist/index.js 位于 dist/ 下，相对路径指向包根）
const nodeRequire = createRequire(__filename);
const { version } = nodeRequire('../package.json') as { version: string };

const program = new Command();

program
  .name('skillhub')
  .description(chalk.blue('Skill Hub CLI - Manage AI Agent Skills'))
  .version(version);

// Register commands
publishCommand(program);
installCommand(program);
searchCommand(program);
configCommand(program);

// skill 子命令组（Agent Skills 标准：export / import）
const skill = program
  .command('skill')
  .description('Manage skills (Agent Skills standard): export / import');
exportCommand(skill);
importCommand(skill);

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(' ')}`));
  console.log(chalk.yellow('See --help for a list of available commands.'));
  process.exit(1);
});

// Handle errors
program.exitOverride();
try {
  program.parse(process.argv);
  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
} catch (error: unknown) {
  const err = error as { code?: string; message?: string };
  if (err.code !== 'commander.helpDisplayed') {
    console.error(chalk.red('Error:', err.message));
    process.exit(1);
  }
}
