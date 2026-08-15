/**
 * skillhub skill export 命令
 *
 * 导出 SkillHub Skill 为符合 Agent Skills 开放标准的 .tar.gz 包
 * 用法：
 *   skillhub skill export <slug>
 *   skillhub skill export <slug> --output ./my-skills/
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { getConfig } from '../config/config';

interface ExportOptions {
  output?: string;
  apiUrl?: string;
  includeResources?: boolean;
}

export function exportCommand(program: Command) {
  program
    .command('export <slug>')
    .description('Export a Skill to local directory in Agent Skills standard format')
    .option('-o, --output <dir>', 'Output directory', './')
    .option('--no-resources', 'Skip resources (only SKILL.md)')
    .option('--api-url <url>', 'Override API URL')
    .action(async (slug: string, options: ExportOptions) => {
      const spinner = ora(`Exporting ${chalk.cyan(slug)}...`).start();

      try {
        const config = getConfig();
        const apiUrl = options.apiUrl || config.apiUrl;
        const includeResources = options.includeResources !== false;

        // 1. 下载 SKILL.md
        const skillMdResponse = await axios.get(
          `${apiUrl}/api/v2/skills/${slug}/skill.md`,
          { responseType: 'text', timeout: 10000 },
        );

        // 2. 下载资源清单（discovery）
        const discoveryResponse = await axios.get(`${apiUrl}/api/v2/discovery`, {
          params: { limit: 5000 },
        });
        const skillMeta = discoveryResponse.data.skills?.find(
          (s: { slug: string }) => s.slug === slug,
        );

        // 3. 输出目录
        const outDir = path.resolve(options.output || './', slug);
        await fs.ensureDir(outDir);

        // 4. 写入 SKILL.md
        await fs.writeFile(path.join(outDir, 'SKILL.md'), skillMdResponse.data);
        spinner.text = `Saved SKILL.md (${skillMdResponse.data.length} bytes)`;

        // 5. 下载资源（如启用）
        let resourcesCount = 0;
        if (includeResources) {
          try {
            const filesResponse = await axios.get(
              `${apiUrl}/api/v2/skills/${slug}`,
              { params: { include: 'resources' } },
            );
            const resources = filesResponse.data.resources || [];

            for (const res of resources) {
              const fileUrl = `${apiUrl}/api/v2/skills/${slug}/files/${res.path}`;
              const filePath = path.join(outDir, res.path);
              await fs.ensureDir(path.dirname(filePath));
              const fileResp = await axios.get(fileUrl, {
                responseType: 'arraybuffer',
              });
              await fs.writeFile(filePath, fileResp.data);
              resourcesCount++;
            }
          } catch (err) {
            spinner.warn(
              chalk.yellow(
                `\nWarning: Failed to download some resources. Files may be incomplete.`,
              ),
            );
          }
        }

        // 6. 写入 skillhub.json 元数据
        const metadata = {
          exportedAt: new Date().toISOString(),
          source: apiUrl,
          skill: skillMeta || { slug },
          agentSkillsVersion: skillMeta?.agentSkillsVersion || '1.0',
        };
        await fs.writeFile(
          path.join(outDir, 'skillhub.json'),
          JSON.stringify(metadata, null, 2),
        );

        spinner.succeed(
          chalk.green(
            `✓ Exported ${slug} to ${outDir}\n` +
              `  SKILL.md: 1 file\n` +
              `  Resources: ${resourcesCount} file(s)\n` +
              `  Metadata: skillhub.json`,
          ),
        );

        console.log(chalk.gray('\nNext steps:'));
        console.log(chalk.gray(`  cd ${outDir}`));
        console.log(chalk.gray('  # Edit SKILL.md, then publish to another Agent'));
      } catch (error: unknown) {
        const err = error as { message?: string; response?: { status?: number; data?: { message?: string } } };
        if (err.response?.status === 404) {
          spinner.fail(chalk.red(`Skill not found: ${slug}`));
        } else {
          spinner.fail(
            chalk.red(
              `Export failed: ${err.response?.data?.message || err.message || 'Unknown error'}`,
            ),
          );
        }
        process.exit(1);
      }
    });
}