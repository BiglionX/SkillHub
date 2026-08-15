import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/tests/', '<rootDir>/app/api/__tests__/mocks.ts'],
};

// 使用 async 函数确保 next/jest 默认值不会覆盖 custom transformIgnorePatterns
export default async () => {
  const jestConfig: Config = await createJestConfig(config)();
  jestConfig.transformIgnorePatterns = [
    // pnpm 布局下依赖真实路径在 node_modules/.pnpm/<name>@<ver>/...，
    // 需将 .pnpm 整体纳入转译（pkce-challenge、@modelcontextprotocol/sdk 等 ESM/TS 依赖）
    '/node_modules/(?!(\\.pnpm|jose|next|@next|pkce-challenge)/)',
  ];
  return jestConfig;
};
