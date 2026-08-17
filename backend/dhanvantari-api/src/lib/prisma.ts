/**
 * Prisma client singleton — the ONLY process that may query the `dhanvantari`
 * schema.
 *
 * ARCHITECTURE.md §3.1, §4.3. README §7 (shared file).
 *
 * Part 1 owns this file. Part 2 imports it and never re-instantiates.
 *
 * Imported by explicit relative path, NOT as '@prisma/client'. Both API servers
 * generate a client and each schema declares its own `output` dir, so a bare
 * specifier resolves against the *process* working directory — `npm run
 * dev:dhanvantari-api` from the repo root would pick up the hoisted root
 * client, which may hold the other server's models. That typechecks and then
 * fails at runtime with "Cannot read properties of undefined (reading
 * 'findMany')". The relative path resolves against THIS FILE, so it is correct
 * regardless of where the process was started from.
 */

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
