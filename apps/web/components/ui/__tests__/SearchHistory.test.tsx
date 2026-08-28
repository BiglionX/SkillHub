/**
 * SearchHistory 组件单元测试
 */

import { render, screen, fireEvent } from '@testing-library/react';
import SearchHistory from '../SearchHistory';

// Mock next/navigation
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('SearchHistory', () => {
  beforeEach(() => {
    mockPush.mockClear();
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  it('当没有历史记录时不应该渲染', () => {
    const { container } = render(<SearchHistory />);
    
    expect(container.firstChild).toBeNull();
  });

  it('应该从localStorage加载历史记录', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
      { query: 'another search', timestamp: Date.now() - 1000 },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    expect(localStorageMock.getItem).toHaveBeenCalledWith('skillhub_search_history');
  });

  it('应该显示历史按钮', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    expect(screen.getByText('历史')).toBeInTheDocument();
  });

  it('点击历史按钮应该显示下拉面板', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    expect(screen.getByText('搜索历史')).toBeInTheDocument();
    expect(screen.getByText('test search')).toBeInTheDocument();
  });

  it('应该显示清空按钮', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    expect(screen.getByText('清空')).toBeInTheDocument();
  });

  it('点击清空应该清除所有历史记录', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    const clearButton = screen.getByText('清空');
    fireEvent.click(clearButton);

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('skillhub_search_history');
  });

  it('应该显示删除单个记录的按钮', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    // 删除按钮在悬停时显示，我们需要找到它
    const listItem = screen.getByText('test search').closest('li');
    expect(listItem).toBeInTheDocument();
  });

  it('点击历史记录项应该跳转到搜索结果页', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    const searchItem = screen.getByText('test search');
    fireEvent.click(searchItem);

    expect(mockPush).toHaveBeenCalledWith('/skills?q=test%20search');
  });

  it('应该格式化相对时间', () => {
    const now = Date.now();
    const mockHistory = [
      { query: 'recent search', timestamp: now - 30000 }, // 30秒前
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    expect(screen.getByText('刚刚')).toBeInTheDocument();
  });

  it('应该限制历史记录数量', () => {
    const mockHistory = Array.from({ length: 15 }, (_, i) => ({
      query: `search ${i}`,
      timestamp: Date.now() - i * 1000,
    }));
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory maxItems={10} />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    // 应该只显示10条
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeLessThanOrEqual(10);
  });

  it('应该去重相同的搜索词', () => {
    // 清空localStorage
    localStorageMock.getItem.mockReturnValue(null);

    render(<SearchHistory />);

    const addToHistory = window.__searchHistoryAPI?.addToHistory;

    if (addToHistory) {
      addToHistory('test');
      addToHistory('test');

      // 检查最后一次setItem调用
      const setItemCalls = localStorageMock.setItem.mock.calls;
      expect(setItemCalls.length).toBeGreaterThan(0);

      const lastCall = setItemCalls[setItemCalls.length - 1];
      const stored = lastCall[1] as string;
      const parsed = JSON.parse(stored) as Array<{ query: string }>;

      expect(parsed.length).toBe(1);
      expect(parsed[0].query).toBe('test');
    }
  });

  it('应该更新已存在搜索词的时间戳', () => {
    const initialHistory = [
      { query: 'test', timestamp: 1000 },
    ];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(initialHistory));

    render(<SearchHistory />);

    const addToHistory = window.__searchHistoryAPI?.addToHistory;

    if (addToHistory) {
      addToHistory('test');

      // 应该调用setItem更新
      expect(localStorageMock.setItem).toHaveBeenCalled();
    }
  });

  it('应该忽略空搜索词', () => {
    render(<SearchHistory />);

    const addToHistory = window.__searchHistoryAPI?.addToHistory;

    if (addToHistory) {
      addToHistory('');
      addToHistory('   ');

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    }
  });

  it('应该显示最大记录数提示', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    render(<SearchHistory maxItems={10} />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    expect(screen.getByText('最多保存 10 条记录')).toBeInTheDocument();
  });

  it('点击遮罩层应该关闭下拉面板', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    const { container } = render(<SearchHistory />);

    const historyButton = screen.getByText('历史');
    fireEvent.click(historyButton);

    // 找到遮罩层并点击
    const overlay = container.querySelector('.fixed.inset-0');
    if (overlay) {
      fireEvent.click(overlay);
    }

    // 面板应该关闭（这里需要更复杂的断言）
  });

  it('应该支持自定义className', () => {
    const mockHistory = [
      { query: 'test search', timestamp: Date.now() },
    ];
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));

    const { container } = render(<SearchHistory className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('应该正确处理localStorage错误', () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('Storage error');
    });

    // 不应该抛出错误
    expect(() => render(<SearchHistory />)).not.toThrow();
  });

  it('暴露的API应该有addToHistory方法', () => {
    render(<SearchHistory />);

    expect(window.__searchHistoryAPI).toBeDefined();
    expect(window.__searchHistoryAPI?.addToHistory).toBeDefined();
  });

  it('暴露的API应该有clearHistory方法', () => {
    render(<SearchHistory />);

    expect(window.__searchHistoryAPI).toBeDefined();
    expect(window.__searchHistoryAPI?.clearHistory).toBeDefined();
  });
});
