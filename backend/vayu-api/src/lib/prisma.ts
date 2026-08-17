/**
 * Prisma client singleton — the ONLY process that may query the `vayu` schema.
 *
 * ARCHITECTURE.md §3.1, §4.2. README §7 (shared file).
 *
 * Part 1 owns this file. Part 2 imports it and never re-instantiates.
 *
 * `tsx watch` reloads the module graph on every save; without the global cache
 * each reload would open a fresh connection pool until Postgres refuses new
 * connections.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
