import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const workerDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile', import.meta.url), 'utf8');
const parserDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile.parser', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../compose/docker-compose.prod.yml', import.meta.url), 'utf8');
const cloudSync = readFileSync(new URL('../../scripts/cloud-sync.mjs', import.meta.url), 'utf8');
const releaseSyncCommand = readFileSync(new URL('../../scripts/release-sync-command.mjs', import.meta.url), 'utf8');
const backup = readFileSync(new URL('./backup.sh', import.meta.url), 'utf8');

test('production compose up receives the same env file used by migrate and validation', () => {
  assert.match(
    source,
    /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA docker compose --env-file \$PROD_ENV -f \$COMPOSE_FILE \$1/,
  );
  assert.match(source, /compose_current "up -d --wait --wait-timeout 300 \$\{services\[\*\]\}"/);
  assert.match(source, /compose_current "run --rm --no-deps[^"]+migrate-cli\.js deploy"/);
});

test('parser starts first and must become healthy before the worker is converged', () => {
  assert.match(source, /compose_current "build agent-worker document-parser"/);
  assert.match(
    source,
    /compose_current "up -d --force-recreate --wait --wait-timeout 300 document-parser"/,
  );
  assert.doesNotMatch(source, /restart api web agent-worker document-parser/);
  assert.match(source, /up -d --force-recreate --wait --wait-timeout 300 api web agent-worker/);
  assert.doesNotMatch(source, /wait_for_healthy\s*\n/);
});

test('deployment fails unless application health and public status checks pass', () => {
  assert.match(source, /wait_for_healthy api web agent-worker/);
  assert.match(source, /expect_http_status .*auth\/me 401/);
  assert.doesNotMatch(source, /curl[^\n]+\|\| true/);
});

test('deployment publishes and verifies the exact immutable release identity', () => {
  assert.match(source, /verify-release-source\.mjs" --root "\$PROJECT_ROOT" --ref "\$RELEASE_REF"/);
  assert.match(source, /printf '%s\\n' '\$RELEASE_SHA'[^\n]+\.release-id\.next; mv[^\n]+\.release-id/);
  assert.match(source, /expect_http_body .*\/__release "\$RELEASE_SHA"/);
});

test('release source guard rejects dirty trees and refs other than HEAD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-release-guard-'));
  const guard = fileURLToPath(new URL('../../scripts/verify-release-source.mjs', import.meta.url));
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'gate@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Release Gate'], { cwd: root });
    await writeFile(join(root, 'tracked.txt'), 'one\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'one'], { cwd: root, stdio: 'ignore' });
    const first = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    await writeFile(join(root, 'tracked.txt'), 'two\n');
    expectNonzero(spawnSync(process.execPath, [guard, '--root', root, '--ref', 'HEAD']));
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'two'], { cwd: root, stdio: 'ignore' });
    const clean = spawnSync(process.execPath, [guard, '--root', root, '--ref', 'HEAD'], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout.trim(), /^[0-9a-f]{40}$/);
    expectNonzero(spawnSync(process.execPath, [guard, '--root', root, '--ref', first]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cloud sync materializes the complete commit in an immutable release directory', () => {
  assert.match(cloudSync, /spawn\('git', \['archive', '--format=tar\.gz', releaseSha\]/);
  assert.match(cloudSync, /const releaseRoot = `\/opt\/openscience-releases\/\$\{releaseSha\}`/);
  assert.doesNotMatch(cloudSync, /process\.env\.XGS_RELEASE_ROOT/);
  assert.doesNotMatch(cloudSync, /ENTRIES|MANAGED_DIRS|MANAGED_FILES|--', \.\.\./);
  assert.match(source, /RELEASE_ROOT="\/opt\/openscience-releases\/\$RELEASE_SHA"/);
  assert.match(source, /XGS_RELEASE_ROOT=\$RELEASE_ROOT/);
  assert.doesNotMatch(source, /XGS_RELEASE_SHA="\$PREVIOUS_RELEASE_SHA" XGS_RELEASE_ROOT=/);
  assert.doesNotMatch(source, /XGS_RELEASE_SHA="\$RELEASE_SHA" XGS_RELEASE_ROOT=/);
  assert.match(productionCompose, /context: \$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}/);
  assert.match(productionCompose, /\$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}:\/opt\/openscience/);
  assert.match(productionCompose, /\$\{XGS_RELEASE_ROOT:\?XGS_RELEASE_ROOT required\}:\/opt\/openscience:ro/);
});

test('release materialization is write-once and cleans only a failed stage', async () => {
  const { buildReleaseMaterializeCommand } = await import('../../scripts/release-sync-command.mjs');
  const releaseRoot = `/opt/openscience-releases/${'a'.repeat(40)}`;
  const command = buildReleaseMaterializeCommand(releaseRoot, 'a'.repeat(40));
  assert.match(command, /\.release-source/);
  assert.match(command, /trap .*stage/);
  assert.match(command, /tar -tzf -/);
  assert.doesNotMatch(command, /active_release/);
  assert.match(command, /if \[ -d '[^']+' \]; then test[^\n]+tar -tzf - >\/dev\/null; exit 0; fi/);
  assert.doesNotMatch(command, new RegExp(`rm -rf -- '${releaseRoot.replaceAll('/', '\\/')}'`));
  const parsed = spawnSync('bash', ['-n', '-c', command], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.throws(() => buildReleaseMaterializeCommand('/tmp/not-production', 'a'.repeat(40)));
});

test('deployment keeps an application rollback trap until public health succeeds', () => {
  assert.match(source, /--rollback-ref/);
  assert.match(source, /ROLLBACK_SHA=/);
  assert.match(source, /ACTIVE_RELEASE_SHA=.*\.release-id/);
  assert.match(source, /PREVIOUS_RELEASE_SHA="\$\{ACTIVE_RELEASE_SHA:-\$ROLLBACK_SHA\}"/);
  assert.match(source, /rollback_application\(\)/);
  assert.match(source, /trap 'rollback_application' ERR/);
  assert.match(source, /trap - ERR[\s\S]*部署完成/);
  assert.match(source, /ROLLBACK_FAILED/);
  assert.match(source, /ROLLBACK_COMPOSE_FILE="\$PREVIOUS_RELEASE_ROOT\/infra\/compose\/docker-compose\.prod\.yml"/);
  assert.match(source, /ROLLBACK_COMPOSE_MODE="first-transition-adapter"/);
  assert.match(source, /-f \$ROLLBACK_COMPOSE_FILE up -d --force-recreate/);
  assert.match(source, /rm -f \$REMOTE_ROOT\/\.release-id/);
  assert.match(source, /\.release-failed/);
  assert.match(source, /test ! -e \$REMOTE_ROOT\/\.release-failed/);
  assert.match(source, /set -euo pipefail; containers=\\\$\(docker ps -aq\)/);
  assert.match(source, /mounts=\\\$\(docker inspect --format=/);
  assert.ok(source.includes(String.raw`printf '%s\n' \"\$mounts\" | grep -q '^/opt/openscience-releases/'`));
  assert.doesNotMatch(source, /systemctl reload nginx" \|\| exit 1/);
});

test('worker and parser images are immutable per release and legacy images are preserved', () => {
  assert.match(productionCompose, /image: openscience-agent-worker:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(productionCompose, /image: openscience-document-parser:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(source, /docker compose[^\n]+ps -q agent-worker/);
  assert.match(source, /docker compose[^\n]+ps -q document-parser/);
  assert.match(source, /docker inspect --format='\{\{\.Image\}\}'/);
  assert.ok(source.includes(String.raw`docker tag \"\$worker_image\" openscience-agent-worker:$PREVIOUS_RELEASE_SHA`));
  assert.ok(source.includes(String.raw`docker tag \"\$parser_image\" openscience-document-parser:$PREVIOUS_RELEASE_SHA`));
  assert.match(source, /XGS_RELEASE_SHA="\$PREVIOUS_RELEASE_SHA" node/);
  assert.match(source, /cd \$PREVIOUS_RELEASE_ROOT && npx pnpm@9\.15\.0 install && npx pnpm@9\.15\.0 build/);
  assert.match(source, /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA/);
  assert.match(source, /XGS_RELEASE_IMAGE_TAG=\$PREVIOUS_RELEASE_SHA/);
});

test('application containers run non-root with read-only release mounts', () => {
  for (const serviceName of ['api', 'agent-worker', 'web']) {
    const section = productionCompose.split(`\n  ${serviceName}:`)[1]?.split(/\n  [a-z]/)[0] ?? '';
    assert.match(section, /user: node/);
    assert.match(section, /:\/opt\/openscience:ro/);
  }
  const web = productionCompose.split('\n  web:')[1]?.split(/\n  [a-z]/)[0] ?? '';
  assert.match(web, /tmpfs:[\s\S]*\/opt\/openscience\/apps\/web\/\.next\/cache:[^\n]*uid=1000[^\n]*gid=1000/);
});

test('an already-active SHA exits before install or build', () => {
  assert.match(source, /ACTIVE_RELEASE_SHA/);
  assert.match(source, /already active/);
  assert.ok(source.indexOf('already active') < source.indexOf('npx pnpm@9.15.0 install'));
});

test('scheduled backup resolves the active immutable release and is refreshed by deployment', () => {
  assert.match(backup, /RELEASE_SHA=.*\.release-id/);
  assert.match(backup, /XGS_RELEASE_ROOT="\$RELEASE_ROOT" XGS_RELEASE_IMAGE_TAG="\$RELEASE_SHA" docker compose/);
  assert.match(source, /install -m 0755 \$RELEASE_ROOT\/infra\/scripts\/backup\.sh \/usr\/local\/bin\/backup\.sh/);
  assert.ok(source.indexOf('expect_http_body') < source.lastIndexOf('install -m 0755 $RELEASE_ROOT/infra/scripts/backup.sh'));
});

function expectNonzero(result) {
  assert.notEqual(result.status, 0, result.stderr?.toString());
}

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
