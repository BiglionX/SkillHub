/**
 * Settings 单测 — F20 hash 跳转自动展开 Key 编辑面板
 *
 * 覆盖场景：
 * 1. 挂载时 window.location.hash === '#llm-key-section' → Key 编辑面板自动展开
 * 2. 挂载时 window.location.hash === '' → 不触发展开，显示折叠态
 *
 * 注意事项：
 * - invoke 用 inline dispatcher mock 覆盖 4 个 Settings 启动命令
 * - get_provider_keys_status 返回 deepseek=true，让 Settings 进 console 阶段（避开 onboarding）
 * - window.location.hash 在每个 it 前后重置避免污染
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ==== Tauri mock ====
// factory 内的 vi.fn 会被 hoist 到 import 前；这样 Settings import 时拿到的是 mock 实例。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case 'get_helper_info':
        return { version: '2.0.5', name: 'SkillHub', helper_port: 14420 };
      case 'get_all_provider_base_urls':
        return {};
      case 'get_provider_keys_status':
        // 返回 deepseek=true → Settings 进 console 阶段（避开 onboarding）
        return {
          active: 'deepseek',
          providers: { deepseek: true, openai: false, glm: false, custom: false },
        };
      case 'trigger_software_scan':
        return [];
      default:
        return null;
    }
  }),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

// ==== Settings 必须在 mock 之后 import ====
import Settings from './Settings';

describe('Settings — F20 hash 监听自动展开 Key 编辑面板', () => {
  // 每个 it 前后重置 hash，避免全局 window.location 跨测试污染
  beforeEach(() => {
    window.location.hash = '';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('挂载时 hash === "#llm-key-section" → Key 编辑面板自动展开', async () => {
    window.location.hash = '#llm-key-section';
    render(<Settings installedSkills={[]} />);
    // 展开态：显示编辑表单（含「Test」按钮 + 「保存 Key」按钮）
    // 用 findBy 等待 useEffect + setState 完成
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /保存 Key/ })).toBeInTheDocument();
    // 折叠态的「修改 / 配置」按钮不应出现（keyExpanded 已 true）
    expect(screen.queryByRole('button', { name: /^配置$/ })).not.toBeInTheDocument();
  });

  it('挂载时 hash 为空 → 不触发展开，显示折叠态', async () => {
    render(<Settings installedSkills={[]} />);
    // 折叠态：mock 返回 deepseek=true，所以显示「已配：DeepSeek」
    await waitFor(() => {
      expect(screen.getByText(/已配/)).toBeInTheDocument();
    });
    // 编辑表单的「Test / 保存 Key」不应出现
    expect(screen.queryByRole('button', { name: 'Test' })).not.toBeInTheDocument();
  });
});