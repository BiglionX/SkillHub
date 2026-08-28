 
/**
 * 全局类型定义
 */

// Tailwind CSS v4 类型声明
declare module 'tailwindcss' {
  const content: unknown;
  export default content;
}

// CSS 模块类型声明（支持 CSS Modules 和全局 CSS 导入）
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

interface SearchHistoryAPI {
  addToHistory: (query: string) => void;
  clearHistory: () => void;
}

/**
 * Jest 测试沙箱全局对象（在 jest.setup.ts 中挂载）
 * 用精确类型替代 `(global as any).__mockPrisma` / `__mockAuth` 写法
 */
interface JestMockPrisma {
  skill: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
    groupBy: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  namespace: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  namespaceMember: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
  user: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  review: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
  };
  auditLog: {
    findMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  $executeRaw: jest.Mock;
  $executeRawUnsafe: jest.Mock;
}

interface JestMockAuth extends jest.Mock<
  Promise<null | { user: { id: string; email: string } }>,
  []
> {}

declare global {
  interface Window {
    __searchHistoryAPI?: SearchHistoryAPI;
  }

  var __mockPrisma: JestMockPrisma;
  var __mockAuth: JestMockAuth;
}

export {};
