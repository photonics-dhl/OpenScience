import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');

test('production compose up receives the same env file used by migrate and validation', () => {
  assert.match(
    source,
    /run_remote "cd \$REMOTE_ROOT && docker compose --env-file \$PROD_ENV -f \$COMPOSE_FILE up -d"/,
  );
});

test('bind-mounted application processes restart after a source release is synced', () => {
  assert.match(
    source,
    /docker compose --env-file \$PROD_ENV -f \$COMPOSE_FILE restart api web agent-worker/,
  );
});
