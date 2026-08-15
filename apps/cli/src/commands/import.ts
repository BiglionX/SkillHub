/**
 * skillhub skill import 命令
 *
 * 从 GitHub 仓库导入符合 Agent Skills 开放标准的 SKILL.md
 * 用法：
 *   skillhub skill import <github-url>
 *   skillhub skill import <owner/repo@skill-name>
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { getConfig } from '../config/config';

interface ImportOptions {
  namespace?: string;
  output?: string;
  apiUrl?: string;
}

export function importCommand(program: Command) {
  program
    .command('import <source>')
    .description('Import a SKILL.md from GitHub or local path (Agent Skills standard)')
    .option('-n, --namespace <name>', 'Target namespace', 'personal')
    .option('-o, --output <dir>', 'Output directory (skip upload)')
    .option('--api-url <url>', 'Override API URL')
    .action(async (source: string, options: ImportOptions) => {
      const spinner = ora('Importing SKILL.md...').start();

      try {
        // 1. 解析源（GitHub URL 或 本地路径）
        const skillMdContent = await fetchSkillMd(source);
        if (!skillMdContent) {
          spinner.fail(chalk.red('Failed to fetch SKILL.md'));
          return;
        }

        // 2. 基础验证
        const firstLine = skillMdContent.split('\n').find((l) => l.trim().startsWith('name:'));
        const nameMatch = firstLine?.match(/name:\s*(.+)/);
        const skillName = nameMatch?.[1]?.trim() ?? 'unknown';

        spinner.text = `Imported ${chalk.cyan(skillName)}, processing...`;

        // 3. 如果指定 --output，本地保存
        if (options.output) {
          const outDir = path.resolve(options.output);
          await fs.ensureDir(outDir);
          await fs.writeFile(path.join(outDir, 'SKILL.md'), skillMdContent);
          spinner.succeed(chalk.green(`Saved SKILL.md to ${outDir}/SKILL.md`));
          return;
        }

        // 4. 上传到 SkillHub
        const config = getConfig();
        const apiUrl = options.apiUrl || config.apiUrl;

        const response = await axios.post(
          `${apiUrl}/api/v2/skills/import`,
          {
            source,
            skillMdContent,
            namespace: options.namespace,
          },
          {
            headers: config.token
              ? { Authorization: `Bearer ${config.token}` }
              : {},
          },
        );

        spinner.succeed(
          chalk.green(
            `✓ Imported ${skillName}\n` +
              `  Slug: ${response.data.slug}\n` +
              `  URL:  ${apiUrl}/skills/${response.data.slug}`,
          ),
        );
      } catch (error: unknown) {
        const err = error as { message?: string; response?: { data?: { message?: string } } };
        spinner.fail(
          chalk.red(
            `Import failed: ${err.response?.data?.message || err.message || 'Unknown error'}`,
          ),
        );
        process.exit(1);
      }
    });
}

/**
 * 从 GitHub URL 或本地路径获取 SKILL.md 内容
 */
async function fetchSkillMd(source: string): Promise<string | null> {
  // 本地路径
  if (!source.startsWith('http') && !source.includes('@')) {
    const localPath = path.resolve(source);
    if (!(await fs.pathExists(localPath))) {
      throw new Error(`File not found: ${localPath}`);
    }
    return fs.readFile(localPath, 'utf-8');
  }

  // GitHub URL 或 owner/repo@skill-name 格式
  let rawUrl: string;

  if (source.startsWith('http')) {
    // https://github.com/anthropics/skills/tree/main/pdf
    // -> https://raw.githubusercontent.com/anthropics/skills/main/pdf/SKILL.md
    rawUrl = source
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/tree/', '/');
    if (!rawUrl.endsWith('/SKILL.md')) {
      rawUrl = `${rawUrl.replace(/\/$/, '')}/SKILL.md`;
    }
  } else {
    // owner/repo@skill-name
    const match = source.match(/^([^/]+)\/([^@]+)@(.+)$/);
    if (!match) {
      throw new Error(`Invalid source format: ${source}`);
    }
    const [, owner, repo, skillName] = match;
    rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillName}/SKILL.md`;
  }

  try {
    const response = await axios.get(rawUrl, {
      responseType: 'text',
      timeout: 10000,
    });
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { status?: number }; message?: string };
    if (err.response?.status === 404) {
      throw new Error(`SKILL.md not found at ${rawUrl}`);
    }
    throw new Error(`Failed to fetch ${rawUrl}: ${err.message}`);
  }
}