// 学习更多: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfill for Web APIs (needed for NextRequest/NextResponse)
// 使用 node-fetch v2 的 Request/Response，并扩展 Response 添加缺少的方法
import { Request as NodeFetchRequest, Response as NodeFetchResponse } from 'node-fetch';
import { TextEncoder, TextDecoder } from 'util';

/* eslint-disable @typescript-eslint/no-explicit-any, no-var */

// 扩展 NodeFetchResponse 添加 Web 标准 API 的方法
// Next.js 15 使用 Response.json() 静态方法和 response.json() 实例方法
const ExtendedResponse: any = NodeFetchResponse;

// 添加缺失的静态方法 Response.json()
ExtendedResponse.json = function<JsonBody>(body: JsonBody, init?: ResponseInit) {
  const headers: any = new Headers(init?.headers as any);
  headers.set('Content-Type', 'application/json');
  return new ExtendedResponse(JSON.stringify(body), {
    ...init,
    headers,
  });
};

// 添加静态方法 Response.redirect()
ExtendedResponse.redirect = function(url: string | URL, status?: number) {
  const headers: any = new Headers();
  headers.set('Location', String(url));
  return new ExtendedResponse('', {
    status: status ?? 307,
    headers,
  });
};

// 添加静态方法 Response.error()
ExtendedResponse.error = function() {
  return new ExtendedResponse('', {
    status: 0,
    statusText: '',
  });
};

// 添加实例方法 response.json()
ExtendedResponse.prototype.json = function() {
  return this.text().then((text: string) => JSON.parse(text));
};

// 确保 Request 和 Response 在任何模块导入之前就已定义
if (typeof globalThis.Request === 'undefined') {
  (globalThis as any).Request = NodeFetchRequest;
}
if (typeof globalThis.Response === 'undefined') {
  (globalThis as any).Response = ExtendedResponse;
}
if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = TextDecoder;
}
/* eslint-enable @typescript-eslint/no-explicit-any, no-var */

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  useParams() {
    return {};
  },
}));

// Mock Prisma Client - 全局 mock 避免 ESM 模块问题
const mockPrisma = {
  skill: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  namespace: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  namespaceMember: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  review: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
  auditLog: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $executeRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// 导出 mockPrisma 供测试文件使用
(global as any).__mockPrisma = mockPrisma;

// Mock SearchService - 全局 mock 避免 ESM 模块问题
const mockSearchServiceInstance = {
  search: jest.fn(),
  advancedSearch: jest.fn(),
  getSuggestions: jest.fn(),
  getPopularSearches: jest.fn(),
};

const MockSearchService = jest.fn().mockImplementation(() => mockSearchServiceInstance);

jest.mock('@/lib/search/SearchService', () => ({
  SearchService: MockSearchService,
}));

// 导出 mockSearchServiceInstance 供测试文件使用
(global as any).__mockSearchService = mockSearchServiceInstance;
(global as any).__MockSearchService = MockSearchService;


// Suppress console errors during tests
const originalConsoleError = console.error;
console.error = (...args) => {
  // 忽略特定的警告信息
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning:') || args[0].includes('not wrapped in act'))
  ) {
    return;
  }
  originalConsoleError(...args);
};
