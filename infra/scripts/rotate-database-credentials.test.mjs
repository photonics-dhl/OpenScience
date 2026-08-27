import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptPath = new URL('./rotate-database-credentials.sh', import.meta.url);

test('database credential rotation keeps secrets out of command arguments and supports rollback', async () => {
  const script = await readFile(scriptPath, 'utf8');

  assert.match(script, /openssl rand -hex 32/);
  assert.match(script, /ALTER ROLE/);
  assert.match(script, /docker exec -i/);
  assert.match(script, /fs\.renameSync\(temporary, path\)/);
  assert.match(script, /rollback_on_exit/);
  assert.match(script, /--force-recreate postgres api agent-worker web/);
  assert.match(script, /DB_CREDENTIAL_ROTATION_OK/);
  assert.doesNotMatch(script, /docker run[^\n]*-e (?:DATABASE_URL|SEARCH_DATABASE_URL)=/);
  assert.doesNotMatch(script, /echo [^\n]*(?:password|DATABASE_URL|SEARCH_DATABASE_URL)/i);
});
