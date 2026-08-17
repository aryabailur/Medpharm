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

// Imported by explicit relative path, NOT as '@prisma/client'.
//
// Both API servers generate a client, and each schema declares its own
// `output` dir (see prisma/schema.prisma). A bare '@prisma/client' specifier
// resolves against the *process* working directory — so `npm run dev:vayu-api`
// from the repo root picks up the hoisted root client, which may hold the
// other server's models. That typechecks and then fails at runtime with
// "Cannot read properties of undefined (reading 'findMany')".
//
// The relative path resolves against THIS FILE, so it is correct regardless of
// where the process was started from.
// Types come from the alias (tsconfig `paths`), the runtime value from the
// relative path. Both point at the same generated client.
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import pkg from '../../node_modules/.prisma/client/index.js';

const { PrismaClient } = pkg as { PrismaClient: new (opts?: unknown) => PrismaClientType };

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

export const prisma: PrismaClientType =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
