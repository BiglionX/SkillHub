import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://tauri.app/v2/start/frontend/vite/
// Tauri 2 + Vite 6 默认 dev 端口 1420（避免与 Next.js 3000 冲突）
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
  },
});
