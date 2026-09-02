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
  assert.match(script, /COMPOSE_FILE="\$RELEASE_ROOT\/infra\/compose\/docker-compose\.prod\.yml"/);
  assert.doesNotMatch(script, /SCANSCI_BROWSER|scansci-legal/u);
  assert.match(
    script,
    /COMPOSE=\(docker compose --project-directory "\$RELEASE_ROOT" --env-file "\$ENV_FILE" -f "\$COMPOSE_FILE"\)/,
  );
  assert.match(script, /flock -n 9/);
  assert.match(script, /DB_CREDENTIAL_ROTATION_ALREADY_RUNNING/);
  assert.match(script, /DB_CREDENTIAL_ROTATION_ROLLBACK_FAILED/);
  assert.match(script, /rollback_status/);
  assert.match(script, /environment_uses_password/);
  assert.match(script, /role_accepts_password/);
  assert.match(script, /rewrite_env_password "\$NEW_PASSWORD"/);
  assert.match(script, /alter_database_role "\$NEW_PASSWORD"/);
  assert.ok(
    script.lastIndexOf('ROLE_CHANGED=1') < script.lastIndexOf('alter_database_role "$NEW_PASSWORD"'),
    'mutation intent must be recorded before ALTER ROLE',
  );
  assert.match(script, /--force-recreate postgres api agent-worker web/);
  assert.match(script, /DB_CREDENTIAL_ROTATION_OK/);
  assert.doesNotMatch(script, /docker run[^\n]*-e (?:DATABASE_URL|SEARCH_DATABASE_URL)=/);
  assert.doesNotMatch(script, /echo [^\n]*(?:password|DATABASE_URL|SEARCH_DATABASE_URL)/i);
});
