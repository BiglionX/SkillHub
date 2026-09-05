/**
 * Vitest 全局 setup
 * - 引入 jest-dom matchers（toBeInTheDocument、toHaveTextContent 等）
 * - mock happy-dom 未提供的 DOM API（window.matchMedia、Element.scrollIntoView）
 * - mock @tauri-apps/api/event：happy-dom 不实现 window.__TAURI_INTERNALS__，
 *   listen/emit/once 内部会读 transformCallback 抛 TypeError。
 *   v2.0.7+：Settings.tsx 的 `listen('scan-progress', ...)`、App.tsx 的 listen 都靠这个 mock。
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// happy-dom 不实现 matchMedia；很多组件（含 lucide-react、recharts）会调它
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// happy-dom 不实现 scrollIntoView；Settings.tsx useEffect 会调它
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
    /* noop */
  };
}

// happy-dom 不实现 window.__TAURI_INTERNALS__；@tauri-apps/api/event 内部调
// transformCallback 会抛 TypeError，导致 Settings/App.tsx 中 listen(...) 抛
// unhandled promise rejection。所有 Tauri 事件 API 都 mock 成返回 undefined
// unlisten 函数（listen 的返回值是 () => void 的取消订阅函数）。
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {}),
  TauriEvent: {},
}));