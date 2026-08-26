import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDatabaseIsolation } from './verify-database-isolation.mjs';

function client(identity) {
  return {
    $queryRawUnsafe: async () => [identity],
  };
}

test('accepts separate PostgreSQL databases on one server', async () => {
  const result = await verifyDatabaseIsolation(
    client({ serverAddress: '172.20.0.2', serverPort: 5432, databaseName: 'openscience' }),
    client({ serverAddress: '172.20.0.2', serverPort: 5432, databaseName: 'openscience_search' }),
  );
  assert.deepEqual(result, { coreDatabase: 'openscience', searchDatabase: 'openscience_search' });
});

test('rejects the same physical PostgreSQL database despite URL aliases or credentials', async () => {
  await assert.rejects(
    verifyDatabaseIsolation(
      client({ serverAddress: '172.20.0.2', serverPort: 5432, databaseName: 'openscience' }),
      client({ serverAddress: '172.20.0.2', serverPort: 5432, databaseName: 'openscience' }),
    ),
    /same physical PostgreSQL database/,
  );
});
