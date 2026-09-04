import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/// 单测配置：与 vite.config.ts 共享 react() plugin，避免重复。
/// 单独文件而非合并到 vite.config.ts 的理由：测试配置不应污染 dev/build 启动。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    /// 排除 src-tauri（Cargo 测试用 cargo test，不走 vitest）
    exclude: ['**/node_modules/**', '**/dist/**', '**/src-tauri/**'],
    /// 避免 happy-dom 与 lucide-react 某些 SVG attribute 不兼容的 warning 升级
    onConsoleLog(log) {
      // 屏蔽 lucide-react 在 happy-dom 下的 SVG namespace warning（已知无害）
      if (log.includes('SVGElement')) return false;
      return true;
    },
  },
});