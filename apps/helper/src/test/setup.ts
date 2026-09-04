/**
 * Vitest 全局 setup
 * - 引入 jest-dom matchers（toBeInTheDocument、toHaveTextContent 等）
 * - mock happy-dom 未提供的 DOM API（window.matchMedia、Element.scrollIntoView）
 */

import '@testing-library/jest-dom/vitest';

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