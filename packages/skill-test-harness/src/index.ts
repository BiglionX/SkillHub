/**
 * @skillhub/skill-test-harness — 技能包冒烟测试沙箱
 *
 * 与 `skills/skill-smoke-test` 技能配套的可执行实现：
 *   1. createSandbox()：把技能包复制进系统临时目录（隔离、可清理）
 *   2. runTask()：在沙箱内执行代表性任务（脚本命令，超时保护）
 *   3. smokeTest()：一站式 = 静态校验 + 默认任务 + markdown 报告
 *
 * 仅用 Node 内置能力（fs/promises、child_process），零外部运行时依赖。
 * 对接真实 LLM harness（DSH/DeerFlow）时，将 task.prompt 交给 AgentExecutor 即可扩展。
 */

import { readdir, stat, mkdir, copyFile, rm, readFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { validateSkillPackage, type ValidationReport } from '@skillhub/skill-validator';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface SmokeTask {
  name: string;
  /** 要执行的命令（在沙箱内、shell 模式），例如 `node scripts/hello.js` */
  command?: string;
  /** 若接入 LLM harness：给 Agent 的任务提示 */
  prompt?: string;
  /** 期望输出包含的子串（可选） */
  expected?: string;
  /** 超时（毫秒），默认 30s */
  timeoutMs?: number;
}

export interface TaskResult {
  name: string;
  status: 'pass' | 'fail' | 'error';
  output?: string;
  error?: string;
  durationMs: number;
}

export interface Sandbox {
  root: string;
  cleanup(): Promise<void>;
}

export interface SmokeTestOptions {
  tasks?: SmokeTask[];
  keepSandbox?: boolean;
}

export interface SmokeTestResult {
  packageDir: string;
  validation: ValidationReport;
  results: TaskResult[];
  report: string;
}

// ---------------------------------------------------------------------------
// 沙箱
// ---------------------------------------------------------------------------

const FORBIDDEN_DIRS = new Set(['node_modules', '.git', 'dist']);

async function copyDir(src: string, dest: string, depth = 0): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (depth === 0 && FORBIDDEN_DIRS.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d, depth + 1);
    } else if (entry.isFile()) {
      await copyFile(s, d);
    }
  }
}

/** 创建隔离沙箱：把技能包复制进系统临时目录 */
export async function createSandbox(packageDir: string): Promise<Sandbox> {
  const root = await mkdtempSafe();
  await copyDir(packageDir, root);
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function mkdtempSafe(): Promise<string> {
  const base = path.join(os.tmpdir(), 'skillhub-sandbox-');
  return mkdir(base, { recursive: true }).then(() => {
    return base + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }).then(async (p) => {
    await mkdir(p);
    return p;
  });
}

// ---------------------------------------------------------------------------
// 任务执行
// ---------------------------------------------------------------------------

/** 在沙箱内执行单个任务（命令 + 超时 + 期望输出检查） */
export function runTask(sandbox: Sandbox, task: SmokeTask): Promise<TaskResult> {
  const started = Date.now();

  if (!task.command) {
    // 无命令 → 视为提示型任务（接入 LLM harness 时执行）；当前标记为跳过错误
    return Promise.resolve({
      name: task.name,
      status: 'error',
      error: 'task.command 为空（LLM harness 任务需外部执行器）',
      durationMs: 0,
    });
  }

  // 上面 if 块已确保 command 非空，缓存为本地变量供内部闭包使用
  const command = task.command;

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: sandbox.root,
      shell: true,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        name: task.name,
        status: 'error',
        output: stdout || stderr,
        error: `超时（>${task.timeoutMs ?? 30_000}ms）`,
        durationMs: Date.now() - started,
      });
    }, task.timeoutMs ?? 30_000);

    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({
        name: task.name,
        status: 'error',
        error: e.message,
        durationMs: Date.now() - started,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const matched = task.expected
        ? stdout.includes(task.expected) || stderr.includes(task.expected)
        : true;
      const ok = code === 0 && matched;
      resolve({
        name: task.name,
        status: ok ? 'pass' : 'fail',
        output: stdout || stderr,
        error: ok
          ? undefined
          : `exit=${code}${task.expected && !matched ? '（期望输出未匹配）' : ''}`,
        durationMs: Date.now() - started,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// 默认任务发现
// ---------------------------------------------------------------------------

/** 发现技能包 scripts/ 下的可执行脚本，生成默认冒烟任务 */
export async function discoverScripts(packageDir: string): Promise<SmokeTask[]> {
  const scriptsDir = path.join(packageDir, 'scripts');
  try {
    await stat(scriptsDir);
  } catch {
    return [];
  }
  const tasks: SmokeTask[] = [];
  for (const file of await readdir(scriptsDir)) {
    const full = path.join(scriptsDir, file);
    const st = await stat(full);
    if (!st.isFile()) continue;
    const rel = path.posix.join('scripts', file);
    if (file.endsWith('.js')) {
      tasks.push({
        name: `run ${rel} --help`,
        command: `node ${rel} --help`,
        expected: undefined,
      });
    } else if (file.endsWith('.py')) {
      tasks.push({ name: `run ${rel} --help`, command: `python ${rel} --help` });
    } else if (file.endsWith('.sh')) {
      tasks.push({ name: `run ${rel} --help`, command: `bash ${rel} --help` });
    } else {
      tasks.push({ name: `run ${rel}`, command: rel });
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// 一站式冒烟
// ---------------------------------------------------------------------------

export function generateReport(input: {
  packageDir: string;
  validation: ValidationReport;
  results: TaskResult[];
}): string {
  const { packageDir, validation, results } = input;
  const name = validation.skillName ?? path.basename(packageDir);
  const lines: string[] = [
    `# 冒烟测试报告: ${name}${validation.version ? '@' + validation.version : ''}`,
    '',
    `- 包目录: \`${packageDir}\``,
    `- 静态校验: ${validation.valid ? '✅ 通过' : '❌ 拒绝'}（${validation.errors.length} 错误 / ${validation.warnings.length} 警告）`,
    '',
    '## 任务结果',
    '',
  ];
  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    lines.push(`- ${icon} **${r.name}** (${r.durationMs}ms)${r.error ? ` — ${r.error}` : ''}`);
    if (r.output && r.output.trim()) {
      lines.push('  ```', ...r.output.split('\n').slice(0, 10).map((l) => '  ' + l), '  ```');
    }
  }
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errored = results.filter((r) => r.status === 'error').length;
  lines.push('', '## 结论', '', `- 通过 ${passed} / 失败 ${failed} / 错误 ${errored}`);
  lines.push(`- 结论: ${!validation.valid || failed > 0 ? '需修复' : '可用'}`);
  return lines.join('\n');
}

/** 一站式：静态校验 + 默认任务冒烟 + 报告 */
export async function smokeTest(
  packageDir: string,
  options: SmokeTestOptions = {},
): Promise<SmokeTestResult> {
  const validation = await validateSkillPackage(packageDir);
  const tasks =
    options.tasks ?? (await discoverScripts(packageDir)).slice(0, 5);

  const sandbox = await createSandbox(packageDir);
  try {
    const results: TaskResult[] = [];
    for (const task of tasks) {
      results.push(await runTask(sandbox, task));
    }
    const report = generateReport({ packageDir, validation, results });
    return { packageDir, validation, results, report };
  } finally {
    if (!options.keepSandbox) {
      await sandbox.cleanup();
    }
  }
}

export { readFile as readSkillMd };
