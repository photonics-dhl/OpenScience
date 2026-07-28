import { PrismaClient } from '@prisma/client';
import { DEFAULT_DEV_DATABASE_URL } from './dev-defaults';

export interface CreatePrismaClientOptions {
  datasourceUrl?: string;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const url = options.datasourceUrl ?? process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  return new PrismaClient({ datasources: { db: { url } } });
}
