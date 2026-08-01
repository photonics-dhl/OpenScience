import { DEFAULT_DEV_DATABASE_URL } from '@openscience/config';
import { PrismaClient } from '@prisma/client';

export interface CreatePrismaClientOptions {
  datasourceUrl?: string;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const url = options.datasourceUrl ?? process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  return new PrismaClient({ datasources: { db: { url } } });
}
