const path = require('path');

// Node 内建模块：Next 对 instrumentation.ts 的独立 webpack 编译未将其标记为 external，
// 导致 "Can't resolve 'path'/'os'/'crypto'" 类错误（server 编译需要以 external 方式引用）
const NODE_BUILTINS = [
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'stream/consumers',
  'stream/promises', 'string_decoder', 'timers', 'timers/promises', 'tls',
  'trace_events', 'tty', 'url', 'util', 'util/types', 'v8', 'vm', 'wasi',
  'worker_threads', 'zlib',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // monorepo workspace 内包以构建产物/源码被引用，需显式转译
  transpilePackages: ['@skillhub/search-sdk', '@skillhub/widget'],
  // Docker（docker-compose.neon.yml）使用 standalone 产物运行
  output: 'standalone',
  // 显式指定 monorepo 根，避免误探测仓库外的 package-lock.json（D:\BigLionX\package-lock.json）
  outputFileTracingRoot: path.join(__dirname, '../..'),
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];
      config.externals = [
        ...NODE_BUILTINS.map((m) => ({ [m]: `commonjs ${m}` })),
        ...existing,
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
