import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://tauri.app/v2/start/frontend/vite/
// Tauri 2 + Vite 6 默认 dev 端口 1420（避免与 Next.js 3000 冲突）
//
// M6 §R12（PRD §15.1）+ 资源约束（安装包 ≤ 8MB / 冷启动 ≤ 1500ms）：
// - 5 个 Tab page 走 React.lazy 自动拆 chunk
// - manualChunks 把 recharts（仅 UsageDashboard 用，~150KB gzip）单独拆
//   到 Usage chunk，其他 Tab 不下载
// - lucide-react 提到 vendor，给所有 Tab 共用
// - @tauri-apps 提到 vendor-tauri，首屏必加载
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 1421,
    },
    watch: {
      // 不监听 src-tauri（Cargo 改完由 tauri 自己重启）
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // recharts 仅 Usage 页用，单独 chunk 避免其他 Tab 下载
          recharts: ['recharts'],
          // @skillhub/ui 是 token 共享层，常驻
          'skillhub-ui': ['@skillhub/ui'],
          // lucide-react 图标库，按需 import 但打包时 tree-shake 不完全，提到 vendor
          'lucide-react': ['lucide-react'],
          // Tauri API 必加载（invoke / listen / openUrl 等）
          'tauri-api': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-opener',
          ],
        },
      },
    },
  },
});
