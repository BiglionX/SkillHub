import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

describe('ErrorBoundary 组件', () => {
  const mockReset = jest.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    mockReset.mockClear();
    // Mock window.location
    delete (window as unknown as { location?: Location }).location;
    (window as unknown as { location: Location }).location = { href: '' } as Location;
  });

  afterAll(() => {
    // Restore original location
    (window as unknown as { location: Location }).location = originalLocation;
  });

  it('应该渲染错误界面', () => {
    const error = new Error('测试错误');
    render(<ErrorBoundary error={error} reset={mockReset} />);
    
    expect(screen.getByText('出错了')).toBeInTheDocument();
    expect(screen.getByText('测试错误')).toBeInTheDocument();
  });

  it('应该显示默认错误消息当没有提供具体消息时', () => {
    const error = new Error();
    render(<ErrorBoundary error={error as Error & { digest?: string }} reset={mockReset} />);
    
    expect(screen.getByText('抱歉,发生了意外错误。请重试或联系支持团队。')).toBeInTheDocument();
  });

  it('不应该在非开发环境下显示错误ID', () => {
    // 注意：next/jest 的 SWC 编译时会内联 process.env.NODE_ENV 为 'test'，
    // 因此运行态修改 NODE_ENV 对已编译的 JSX 无效
    
    const error = new Error('测试错误') as Error & { digest?: string };
    error.digest = 'test-error-id-123';
    
    render(<ErrorBoundary error={error} reset={mockReset} />);
    
    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
    expect(screen.queryByText('test-error-id-123')).not.toBeInTheDocument();
  });

  it('不应该在生产环境下显示错误ID', () => {
    // 保存原始值
    const originalEnv = process.env.NODE_ENV;
    
    // 使用defineProperty来修改只读属性
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true
    });
    
    const error = new Error('测试错误') as Error & { digest?: string };
    error.digest = 'test-error-id-123';
    
    render(<ErrorBoundary error={error} reset={mockReset} />);
    
    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
    
    // 恢复环境变量
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      writable: true,
      configurable: true
    });
  });

  it('点击重试按钮应该调用reset函数', () => {
    const error = new Error('测试错误');
    render(<ErrorBoundary error={error} reset={mockReset} />);
    
    const retryButton = screen.getByText('重试');
    fireEvent.click(retryButton);
    
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('点击返回首页按钮应该导航到首页', () => {
    const error = new Error('测试错误');
    render(<ErrorBoundary error={error} reset={mockReset} />);
    
    const homeButton = screen.getByText('返回首页');
    fireEvent.click(homeButton);

    // 组件将 window.location.href 设为 '/'（本测试已用纯对象 mock location，不会做 URL 解析）
    expect(window.location.href).toBe('/');
  });

  it('应该渲染错误图标', () => {
    const error = new Error('测试错误');
    render(<ErrorBoundary error={error} reset={mockReset} />);
    
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('text-red-500');
  });

  it('应该包含正确的按钮样式', () => {
    const error = new Error('测试错误');
    render(<ErrorBoundary error={error} reset={mockReset} />);
    
    const retryButton = screen.getByText('重试');
    const homeButton = screen.getByText('返回首页');
    
    expect(retryButton).toHaveClass('bg-blue-600');
    expect(homeButton).toHaveClass('bg-white');
  });
});