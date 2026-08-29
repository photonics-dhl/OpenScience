import { loadSearchEnv } from '@openscience/config';
import { PrismaClient } from '../generated/client';

export interface CreateSearchPrismaClientOptions {
  datasourceUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export function createSearchPrismaClient(options: CreateSearchPrismaClientOptions = {}): PrismaClient {
  const databaseUrl = options.datasourceUrl ?? loadSearchEnv(options.env).databaseUrl;
  return new PrismaClient({ datasources: { search: { url: databaseUrl } } });
}
