/**
 * skillhub config 命令
 *
 * 查看/设置 CLI 配置（~/.skillhub/config.json）
 * 用法：
 *   skillhub config             查看全部配置
 *   skillhub config apiUrl      查看单个配置
 *   skillhub config token <t>   设置配置
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfig, type Config } from '../config/config';

export function configCommand(program: Command) {
  program
    .command('config [key] [value]')
    .description('Manage CLI configuration')
    .action(async (key: keyof Config | undefined, value: string | undefined) => {
      try {
        console.log(chalk.blue('\n⚙️  Skill Hub - Configuration\n'));
        const config = getConfig();

        // If no key provided, show all config
        if (!key) {
          console.log(chalk.blue('Current Configuration:\n'));
          console.log(chalk.cyan('  API URL:'), config.apiUrl);
          console.log(chalk.cyan('  Token:'), config.token ? '********' : 'Not set');
          console.log(chalk.cyan('  Default Namespace:'), config.defaultNamespace || 'personal');
          console.log('');
          return;
        }

        // If key provided but no value, show that key
        if (key && !value) {
          const configValue = config[key];
          if (configValue !== undefined) {
            console.log(chalk.cyan(`${key}:`), configValue);
          } else {
            console.log(chalk.yellow(`${key}: Not set`));
          }
          return;
        }

        // Set the configuration value
        if (key && value) {
          const updatedConfig = setConfig(key, value);
          console.log(chalk.green(`\n✅ Configuration updated!`));
          console.log(chalk.cyan(`${key}:`), updatedConfig[key]);
          return;
        }
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.error(chalk.red(`\nError: ${err.message}`));
        process.exit(1);
      }
    });
}
