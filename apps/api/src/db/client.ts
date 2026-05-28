import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// Prevent multiple Prisma Client instances in development (hot reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: env.DATABASE_URL + (env.DATABASE_URL.includes('?') ? '&' : '?') + 'connect_timeout=10&pool_timeout=10',
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
