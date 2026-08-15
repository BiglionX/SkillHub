/**
 * CLI 配置管理
 *
 * 配置存储在 ~/.skillhub/config.json
 * 支持环境变量：SKILLHUB_API_URL、SKILLHUB_TOKEN
 */

import fsExtra from 'fs-extra';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.skillhub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
  apiUrl: process.env.SKILLHUB_API_URL || 'https://skillhub.proclaw.cc',
  defaultNamespace: 'personal',
};

export interface Config {
  apiUrl: string;
  token?: string;
  defaultNamespace: string;
}

export function getConfig(): Config {
  try {
    if (fsExtra.existsSync(CONFIG_FILE)) {
      const configData = fsExtra.readFileSync(CONFIG_FILE, 'utf-8');
      const userConfig = JSON.parse(configData);
      return { ...DEFAULT_CONFIG, ...userConfig };
    }
  } catch (error) {
    console.error('Warning: Failed to read config file, using defaults');
  }
  return DEFAULT_CONFIG;
}

export function setConfig(key: keyof Config, value: string): Config {
  // Ensure config directory exists
  if (!fsExtra.existsSync(CONFIG_DIR)) {
    fsExtra.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const currentConfig = getConfig();
  const updatedConfig = { ...currentConfig, [key]: value };
  fsExtra.writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2), 'utf-8');
  return updatedConfig;
}

export function getToken(): string | undefined {
  const config = getConfig();
  return config.token || process.env.SKILLHUB_TOKEN;
}
