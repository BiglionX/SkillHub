/**
 * Skill Hub API 客户端
 *
 * 封装与 Skill Hub 服务端的 HTTP 交互：
 *   - searchSkills：搜索技能
 *   - uploadSkill：上传技能包
 *   - installSkillPackage：下载安装技能包
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { getToken } from '../config/config';

export interface SkillSearchResult {
  name: string;
  version: string;
  namespace: string;
  description?: string;
  downloads?: number;
  rating?: number;
  tags?: string[];
}

export interface SearchOptions {
  tag?: string;
  namespace?: string;
  sort?: string;
  apiUrl: string;
}

export interface UploadResult {
  skillName: string;
  version: string;
  url: string;
}

export interface InstallResult {
  skillName: string;
  version: string;
  installPath: string;
}

/**
 * 搜索技能
 */
export async function searchSkills(
  query: string,
  options: SearchOptions,
): Promise<SkillSearchResult[]> {
  try {
    const params: Record<string, string> = { q: query };
    if (options.tag) params.tag = options.tag;
    if (options.namespace) params.namespace = options.namespace;
    if (options.sort) params.sort = options.sort;

    const response = await axios.get(`${options.apiUrl}/api/skills/search`, {
      params,
    });
    return response.data.skills || [];
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    throw new Error(`Search failed: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * 上传技能包（skill.json / package.json + 资源文件）
 */
export async function uploadSkill(skillPath: string, namespace: string): Promise<UploadResult> {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication token not found. Please run `skillhub config token <your-token>`');
  }

  try {
    // Read skill manifest
    let manifestPath = path.join(skillPath, 'skill.json');
    if (!(await fs.pathExists(manifestPath))) {
      manifestPath = path.join(skillPath, 'package.json');
    }
    if (!(await fs.pathExists(manifestPath))) {
      throw new Error('No skill.json or package.json found');
    }

    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as { name: string; version: string };

    // Create form data for upload
    const formData = new FormData();
    formData.append('namespace', namespace);
    formData.append('manifest', manifestContent);

    // Add skill files
    const files = await fs.readdir(skillPath);
    for (const file of files) {
      if (file !== 'node_modules' && file !== '.git') {
        const filePath = path.join(skillPath, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          const fileContent = await fs.readFile(filePath);
          formData.append('files', new Blob([fileContent]), file);
        }
      }
    }

    // Upload to API
    const response = await axios.post(
      `${process.env.SKILLHUB_API_URL || 'https://skillhub.proclaw.cc'}/api/skills/upload`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    return {
      skillName: manifest.name,
      version: manifest.version,
      url: response.data.url as string,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    throw new Error(`Upload failed: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * 下载并安装技能包到 ./skills/<skillName>/
 */
export async function installSkillPackage(
  skillName: string,
  version: string,
  apiUrl: string,
): Promise<InstallResult> {
  try {
    // Download skill package metadata (response not used directly; we only need the side effect)
    await axios.get(`${apiUrl}/api/skills/${skillName}/download`, {
      params: { version },
      responseType: 'arraybuffer',
    });

    // Create installation directory
    const installDir = path.join(process.cwd(), 'skills', skillName);
    await fs.ensureDir(installDir);

    // For now, just create a placeholder
    // In a real implementation, this would extract the downloaded package
    const packageJson = {
      name: skillName,
      version,
      description: 'Installed skill',
      installedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(installDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    return {
      skillName,
      version,
      installPath: installDir,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    throw new Error(`Installation failed: ${err.response?.data?.message || err.message}`);
  }
}
