import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IDENTITY_QUERY = `
  SELECT
    COALESCE(inet_server_addr()::text, 'local') AS "serverAddress",
    COALESCE(inet_server_port(), 0) AS "serverPort",
    current_database() AS "databaseName"
`;

async function readDatabaseIdentity(client, label) {
  const rows = await client.$queryRawUnsafe(IDENTITY_QUERY);
  const identity = rows[0];
  if (!identity || typeof identity.serverAddress !== 'string'
    || typeof identity.serverPort !== 'number' || typeof identity.databaseName !== 'string') {
    throw new Error(`${label} database identity query returned an invalid result`);
  }
  return identity;
}

export async function verifyDatabaseIsolation(coreClient, searchClient) {
  const [core, search] = await Promise.all([
    readDatabaseIdentity(coreClient, 'core'),
    readDatabaseIdentity(searchClient, 'search'),
  ]);
  if (core.serverAddress === search.serverAddress
    && core.serverPort === search.serverPort
    && core.databaseName === search.databaseName) {
    throw new Error('DATABASE_ISOLATION_FAILED: core and search resolve to the same physical PostgreSQL database');
  }
  return { coreDatabase: core.databaseName, searchDatabase: search.databaseName };
}

async function main() {
  const require = createRequire(import.meta.url);
  const { PrismaClient: CorePrismaClient } = require('@prisma/client');
  const { PrismaClient: SearchPrismaClient } = require('../packages/search/generated/client');
  const core = new CorePrismaClient();
  const search = new SearchPrismaClient();
  try {
    const result = await verifyDatabaseIsolation(core, search);
    console.log(`DATABASE_ISOLATION_OK core=${result.coreDatabase} search=${result.searchDatabase}`);
  } finally {
    await Promise.allSettled([core.$disconnect(), search.$disconnect()]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'DATABASE_ISOLATION_FAILED');
    process.exitCode = 1;
  });
}
