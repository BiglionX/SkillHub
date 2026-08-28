/**
 * Pagination 组件单元测试
 */

import { render, screen } from '@testing-library/react';
import Pagination from '../Pagination';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('next/link', () => {
  return function Link({ children, href, ...props }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <a href={href} {...props}>{children}</a>;
  };
});

describe('Pagination', () => {
  beforeEach(() => {
    // 重置searchParams
    for (const key of Array.from(mockSearchParams.keys())) {
      mockSearchParams.delete(key);
    }
  });

  it('当只有一页时不应该渲染', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} totalItems={10} />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('应该正确渲染分页组件', () => {
    render(
      <Pagination currentPage={1} totalPages={5} totalItems={100} />
    );

    expect(screen.getByLabelText('分页')).toBeInTheDocument();
    expect(screen.getByText(/显示第/)).toBeInTheDocument();
  });

  it('应该显示正确的结果范围', () => {
    render(
      <Pagination currentPage={1} totalPages={5} totalItems={100} pageSize={20} />
    );

    // 查找包含特定文本的元素
    const resultInfo = screen.getByText(/显示第/);
    expect(resultInfo).toBeInTheDocument();
    expect(resultInfo.textContent).toContain('1');
    expect(resultInfo.textContent).toContain('20');
    expect(resultInfo.textContent).toContain('100');
  });

  it('应该在第一页时禁用上一页按钮', () => {
    render(
      <Pagination currentPage={1} totalPages={5} totalItems={100} />
    );

    // 禁用的上一页按钮是span元素，有cursor-not-allowed类
    const disabledPrev = document.querySelector('nav span.cursor-not-allowed');
    expect(disabledPrev).toBeInTheDocument();
    expect(disabledPrev).toHaveClass('text-gray-400');
  });

  it('应该在最后一页时禁用下一页按钮', () => {
    render(
      <Pagination currentPage={5} totalPages={5} totalItems={100} />
    );

    // 禁用的下一页按钮是span元素，有cursor-not-allowed类
    const disabledNext = document.querySelector('nav span.cursor-not-allowed:last-of-type');
    expect(disabledNext).toBeInTheDocument();
    expect(disabledNext).toHaveClass('text-gray-400');
  });

  it('应该高亮当前页码', () => {
    render(
      <Pagination currentPage={3} totalPages={5} totalItems={100} />
    );

    const currentPage = screen.getByRole('link', { name: '3' });
    expect(currentPage).toHaveClass('from-blue-600');
    expect(currentPage).toHaveClass('to-indigo-600');
  });

  it('应该渲染所有页码当总页数较少时', () => {
    render(
      <Pagination currentPage={3} totalPages={5} totalItems={100} />
    );

    expect(screen.getByRole('link', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '4' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '5' })).toBeInTheDocument();
  });

  it('应该在当前页靠前的时候显示省略号', () => {
    render(
      <Pagination currentPage={2} totalPages={10} totalItems={200} />
    );

    const ellipsisElements = screen.getAllByText('...');
    expect(ellipsisElements.length).toBeGreaterThan(0);
  });

  it('应该在当前页靠后的时候显示省略号', () => {
    render(
      <Pagination currentPage={9} totalPages={10} totalItems={200} />
    );

    const ellipsisElements = screen.getAllByText('...');
    expect(ellipsisElements.length).toBeGreaterThan(0);
  });

  it('应该在当前页在中间时显示两边省略号', () => {
    render(
      <Pagination currentPage={5} totalPages={10} totalItems={200} />
    );

    const ellipsisElements = screen.getAllByText('...');
    expect(ellipsisElements).toHaveLength(2);
  });

  it('应该生成正确的URL包含page参数', () => {
    mockSearchParams.set('q', 'test');
    mockSearchParams.set('category', 'ai');

    render(
      <Pagination currentPage={1} totalPages={5} totalItems={100} />
    );

    const page2Link = screen.getByRole('link', { name: '2' });
    expect(page2Link).toHaveAttribute('href', '/skills?q=test&category=ai&page=2');
  });

  it('应该保留其他URL参数', () => {
    mockSearchParams.set('sortBy', 'quality');
    mockSearchParams.set('minStars', '100');

    render(
      <Pagination currentPage={1} totalPages={3} totalItems={60} />
    );

    const page2Link = screen.getByRole('link', { name: '2' });
    expect(page2Link).toHaveAttribute('href', '/skills?sortBy=quality&minStars=100&page=2');
  });

  it('应该正确计算显示范围在第2页', () => {
    render(
      <Pagination currentPage={2} totalPages={5} totalItems={100} pageSize={20} />
    );

    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('应该正确处理最后一页的不完整页面', () => {
    render(
      <Pagination currentPage={5} totalPages={5} totalItems={95} pageSize={20} />
    );

    // 查找结果信息文本
    const resultInfo = screen.getByText(/显示第/);
    expect(resultInfo).toBeInTheDocument();
    expect(resultInfo.textContent).toContain('81');
    expect(resultInfo.textContent).toContain('95');
  });

  it('上一页按钮应该有正确的aria-label', () => {
    render(
      <Pagination currentPage={2} totalPages={5} totalItems={100} />
    );

    const prevButton = screen.getByLabelText('上一页');
    expect(prevButton).toBeInTheDocument();
  });

  it('下一页按钮应该有正确的aria-label', () => {
    render(
      <Pagination currentPage={2} totalPages={5} totalItems={100} />
    );

    const nextButton = screen.getByLabelText('下一页');
    expect(nextButton).toBeInTheDocument();
  });

  it('当前页应该有aria-current属性', () => {
    render(
      <Pagination currentPage={3} totalPages={5} totalItems={100} />
    );

    const currentPage = screen.getByRole('link', { name: '3' });
    expect(currentPage).toHaveAttribute('aria-current', 'page');
  });

  it('非当前页不应该有aria-current属性', () => {
    render(
      <Pagination currentPage={3} totalPages={5} totalItems={100} />
    );

    const otherPage = screen.getByRole('link', { name: '2' });
    expect(otherPage).not.toHaveAttribute('aria-current');
  });

  it('应该支持自定义className', () => {
    const { container } = render(
      <Pagination 
        currentPage={1} 
        totalPages={5} 
        totalItems={100}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('应该使用默认的pageSize为20', () => {
    render(
      <Pagination currentPage={1} totalPages={5} totalItems={100} />
    );

    expect(screen.getByText('20')).toBeInTheDocument();
  });
});
