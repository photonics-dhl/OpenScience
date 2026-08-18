import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const workerDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile', import.meta.url), 'utf8');
const parserDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile.parser', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../compose/docker-compose.prod.yml', import.meta.url), 'utf8');

test('production compose up receives the same env file used by migrate and validation', () => {
  assert.match(
    source,
    /docker compose --env-file \$PROD_ENV -f \$COMPOSE_FILE up -d --wait --wait-timeout 300/,
  );
});

test('parser starts first and must become healthy before the worker is converged', () => {
  assert.match(source, /docker compose --env-file \$PROD_ENV -f \$COMPOSE_FILE build agent-worker document-parser/);
  assert.match(
    source,
    /docker compose --env-file \$PROD_ENV -f \$COMPOSE_FILE up -d --wait --wait-timeout 300 document-parser/,
  );
  assert.doesNotMatch(source, /restart api web agent-worker document-parser/);
  assert.match(source, /restart api web agent-worker/);
});

test('deployment fails unless application health and public status checks pass', () => {
  assert.match(source, /wait_for_healthy api web agent-worker/);
  assert.match(source, /expect_http_status .*auth\/me 401/);
  assert.doesNotMatch(source, /curl[^\n]+\|\| true/);
});

test('parser reuses the production worker base that is available on ECS', () => {
  const workerBase = workerDockerfile.match(/^FROM (\S+)/m)?.[1];
  const parserBase = parserDockerfile.match(/^FROM (\S+)/m)?.[1];
  assert.equal(parserBase, workerBase);
});

test('parser build reaches registries through the ECS egress proxy without changing runtime isolation', () => {
  const parserService = productionCompose.split('\n  document-parser:')[1]?.split('\n  web:')[0] ?? '';
  const workerService = productionCompose.split('\n  agent-worker:')[1]?.split('\n  document-parser:')[0] ?? '';
  assert.match(parserService, /build:\r?\n[\s\S]*network: host/);
  assert.match(parserService, /HTTPS_PROXY: http:\/\/127\.0\.0\.1:7891/);
  assert.match(workerService, /build:\r?\n[\s\S]*network: host/);
  assert.match(workerService, /HTTPS_PROXY: http:\/\/127\.0\.0\.1:7891/);
  assert.match(parserService, /network_mode: none/);
});
