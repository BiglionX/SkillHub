import { jest } from '@jest/globals';

// Use the global Prisma mock from jest.setup.ts (the same one used by route handlers)
// This avoids the issue of having two separate mock instances
export const mockPrisma: Record<string, Record<string, jest.Mock<unknown>>> = global.__mockPrisma;

// Prisma mock is already set up in jest.setup.ts (via __mockPrisma global)
// Do NOT add jest.mock('@/lib/prisma') here — it would override the working mock
// from jest.setup.ts with a broken one due to Jest hoisting behavior.
