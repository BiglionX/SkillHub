/**
 * skillhub publish 命令
 *
 * 校验并发布技能包到 Skill Hub
 * 用法：
 *   skillhub publish [path]
 *   skillhub publish ./my-skill --namespace team-a
 *   skillhub publish --dry-run
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { validateSkillManifest } from '../utils/validator';
import { uploadSkill } from '../utils/api';

interface PublishOptions {
  namespace?: string;
  dryRun?: boolean;
}

export function publishCommand(program: Command) {
  program
    .command('publish [path]')
    .description('Publish a skill to Skill Hub')
    .option('-n, --namespace <namespace>', 'Namespace for the skill')
    .option('--dry-run', 'Validate without publishing')
    .action(async (path: string | undefined, options: PublishOptions) => {
      try {
        const skillPath = path || process.cwd();
        console.log(chalk.blue('\n📦 Skill Hub - Publish Skill\n'));

        // Validate skill manifest
        const spinner = ora('Validating skill manifest...').start();
        const validationResult = await validateSkillManifest(skillPath);

        if (!validationResult.valid) {
          spinner.fail('Validation failed');
          console.error(chalk.red('\nValidation errors:'));
          validationResult.errors.forEach((err) => {
            console.error(chalk.red(`  - ${err}`));
          });
          process.exit(1);
        }
        spinner.succeed('Skill manifest is valid');

        if (options.dryRun) {
          console.log(chalk.green('\n✅ Dry run completed successfully!'));
          console.log(chalk.yellow('Use without --dry-run to actually publish.'));
          return;
        }

        // Ask for namespace if not provided
        let namespace = options.namespace;
        if (!namespace) {
          const answers = await inquirer.prompt<{ namespace: string }>([
            {
              type: 'input',
              name: 'namespace',
              message: 'Enter namespace:',
              default: 'personal',
            },
          ]);
          namespace = answers.namespace;
        }

        // Upload skill
        const uploadSpinner = ora('Uploading skill...').start();
        try {
          const result = await uploadSkill(skillPath, namespace);
          uploadSpinner.succeed('Skill uploaded successfully!');
          console.log(chalk.green('\n🎉 Skill published successfully!'));
          console.log(chalk.blue(`   Name: ${result.skillName}`));
          console.log(chalk.blue(`   Version: ${result.version}`));
          console.log(chalk.blue(`   URL: ${result.url}`));
        } catch (error: unknown) {
          uploadSpinner.fail('Upload failed');
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
