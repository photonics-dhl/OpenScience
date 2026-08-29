import { DEFAULT_DEV_SEARCH_DATABASE_URL } from './dev-defaults';

export interface SearchEnv {
  nodeEnv: string;
  databaseUrl: string;
}

export function loadSearchEnv(env: NodeJS.ProcessEnv = process.env): SearchEnv {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const databaseUrl = env.SEARCH_DATABASE_URL
    ?? (nodeEnv === 'production' ? '' : DEFAULT_DEV_SEARCH_DATABASE_URL);
  if (!databaseUrl) throw new Error('SEARCH_DATABASE_URL is required when NODE_ENV=production');
  return { nodeEnv, databaseUrl };
}
