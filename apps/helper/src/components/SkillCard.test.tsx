/**
 * SkillCard 单测 — F20 拦截逻辑回归测试
 *
 * 覆盖场景：
 * 1. 未配 Key + C 类：点 [安装] 弹 Dialog
 * 2. 未配 Key + C 类 Dialog：[稍后] 关闭 Dialog
 * 3. 未配 Key + C 类 Dialog：[现在配] 调 onNeedKey + 关闭 Dialog
 * 4. 已配 Key + C 类：点 [安装] 直接调 onInstall，不弹 Dialog
 * 5. 未配 Key + A 类：点 [安装] 直接调 onInstall（不拦截）
 * 6. 未配 Key + category undefined：按 C 类兜底拦截
 * 7. Dialog 打开时按 Esc 关闭
 * 8. 未配 Key + B 类：点 [安装] 直接调 onInstall（不拦截）
 * 9. 点 Dialog 遮罩（backdrop）关闭
 * 10. hasKey undefined：按未配处理（C 类触发拦截）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillCard from './SkillCard';

const baseSkill = {
  slug: 'test-skill',
  name: '测试 Skill',
  software: 'photoshop',
  blurb: '用于测试',
};

describe('SkillCard — F20 拦截逻辑', () => {
  it('未配 Key + C 类：点 [安装] 弹 Dialog', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'C' }}
        installed={false}
        hasKey={false}
        onInstall={onInstall}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('此 Skill 需要大模型')).toBeInTheDocument();
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('未配 Key + C 类 Dialog：[稍后] 关闭 Dialog', async () => {
    const user = userEvent.setup();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'C' }}
        installed={false}
        hasKey={false}
        onInstall={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    await user.click(screen.getByRole('button', { name: '稍后' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('未配 Key + C 类 Dialog：[现在配] 调 onNeedKey + 关闭 Dialog', async () => {
    const user = userEvent.setup();
    const onNeedKey = vi.fn();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'C' }}
        installed={false}
        hasKey={false}
        onNeedKey={onNeedKey}
        onInstall={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    await user.click(screen.getByRole('button', { name: '现在配' }));
    expect(onNeedKey).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('已配 Key + C 类：点 [安装] 直接调 onInstall，不弹 Dialog', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'C' }}
        installed={false}
        hasKey={true}
        onInstall={onInstall}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(onInstall).toHaveBeenCalledWith('test-skill');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('未配 Key + A 类：点 [安装] 直接调 onInstall（不拦截）', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'A' }}
        installed={false}
        hasKey={false}
        onInstall={onInstall}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(onInstall).toHaveBeenCalledWith('test-skill');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('未配 Key + category undefined：按 C 类兜底拦截', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(
      <SkillCard
        skill={{ ...baseSkill /* no category */ }}
        installed={false}
        hasKey={false}
        onInstall={onInstall}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('Dialog 打开时按 Esc 关闭', async () => {
    const user = userEvent.setup();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'C' }}
        installed={false}
        hasKey={false}
        onInstall={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('未配 Key + B 类：点 [安装] 直接调 onInstall（不拦截）', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'B' }}
        installed={false}
        hasKey={false}
        onInstall={onInstall}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(onInstall).toHaveBeenCalledWith('test-skill');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('点 Dialog 遮罩（backdrop）关闭', async () => {
    const user = userEvent.setup();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'C' }}
        installed={false}
        hasKey={false}
        onInstall={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // backdrop 是 role="presentation" 的容器，直接点击触发它的 onClick
    const backdrop = document.querySelector('.glass-modal-backdrop') as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hasKey undefined：按未配处理（C 类触发拦截）', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(
      <SkillCard
        skill={{ ...baseSkill, category: 'C' }}
        installed={false}
        // 不传 hasKey → 内部判定 hasKey !== true → keyMissing=true → 拦截
        onInstall={onInstall}
      />,
    );
    await user.click(screen.getByRole('button', { name: /安装/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onInstall).not.toHaveBeenCalled();
  });
});