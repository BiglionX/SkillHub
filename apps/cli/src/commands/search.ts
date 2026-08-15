/**
 * skillhub search 命令
 *
 * 搜索 Skill Hub 上的技能
 * 用法：
 *   skillhub search <query>
 *   skillhub search <query> --tag pdf --sort downloads
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { searchSkills } from '../utils/api';
import { getConfig } from '../config/config';

interface SearchOptions {
  tag?: string;
  namespace?: string;
  sort?: string;
}

export function searchCommand(program: Command) {
  program
    .command('search <query>')
    .alias('s')
    .description('Search for skills')
    .option('--tag <tag>', 'Filter by tag')
    .option('--namespace <namespace>', 'Filter by namespace')
    .option('--sort <sort>', 'Sort by (downloads, rating, updated)', 'downloads')
    .action(async (query: string, options: SearchOptions) => {
      try {
        console.log(chalk.blue('\n🔍 Skill Hub - Search Skills\n'));
        const config = getConfig();
        const spinner = ora('Searching...').start();

        try {
          const results = await searchSkills(query, {
            tag: options.tag,
            namespace: options.namespace,
            sort: options.sort,
            apiUrl: config.apiUrl,
          });
          spinner.succeed(`Found ${results.length} skill(s)`);

          if (results.length === 0) {
            console.log(chalk.yellow('\nNo skills found.'));
            return;
          }

          console.log(chalk.blue('\nResults:\n'));
          results.forEach((skill, index) => {
            console.log(chalk.cyan(`${index + 1}. ${skill.name}`));
            console.log(chalk.gray(`   Version: ${skill.version}`));
            console.log(chalk.gray(`   Namespace: ${skill.namespace}`));
            console.log(chalk.gray(`   Description: ${skill.description || 'N/A'}`));
            console.log(chalk.gray(`   Downloads: ${skill.downloads || 0}`));
            console.log(chalk.gray(`   Rating: ${skill.rating ? skill.rating.toFixed(1) : 'N/A'}`));
            console.log(chalk.gray(`   Tags: ${(skill.tags || []).join(', ')}`));
            console.log('');
          });
          console.log(chalk.yellow('\nTip: Use `skillhub install <skill-name>` to install a skill'));
        } catch (error: unknown) {
          spinner.fail('Search failed');
          const err = error as { message?: string };
          console.error(chalk.red(`\nError: ${err.message}`));
          process.exit(1);
        }
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.error(chalk.red(`\nError: ${err.message}`));
        process.exit(1);
      }
    });
}
