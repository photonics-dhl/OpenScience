import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const scriptPath = fileURLToPath(new URL('./deploy-science-video-demo.sh', import.meta.url));
const snippetPath = fileURLToPath(new URL('../nginx/science-video-demo.location.conf', import.meta.url));
const bashScriptPath = scriptPath.replaceAll('\\', '/');
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : '/bin/bash';

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function bashPath(value) {
  const normalized = value.replaceAll('\\', '/');
  return process.platform === 'win32'
    ? normalized.replace(/^([A-Za-z]):/u, (_match, drive) => `/${drive.toLowerCase()}`)
    : normalized;
}

function runShell(source, env = {}) {
  return spawnSync(bash, ['-c', source], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('science-video demo deployment script has valid Bash syntax', () => {
  const result = spawnSync(bash, ['-n', bashScriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('renderer is invoked without network, secrets, privileges, or writable source input', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-media-demo-docker-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const capture = join(root, 'docker-args.txt');
  const fakeDocker = join(root, 'docker');
  await writeFile(fakeDocker, '#!/usr/bin/env bash\nif [ "$1 $2" = "container inspect" ]; then exit 1; fi\nprintf "%s\\n" "$@" > "$TEST_DOCKER_CAPTURE"\n');
  await chmod(fakeDocker, 0o755);
  const input = join(root, 'input');
  const output = join(root, 'output');
  const command = [
    'set -euo pipefail',
    `source ${shellQuote(bashScriptPath)}`,
    `DOCKER_BIN=${shellQuote(fakeDocker.replaceAll('\\', '/'))}`,
    `run_renderer openscience-media-demo:${'a'.repeat(40)} ${shellQuote(input.replaceAll('\\', '/'))} ${shellQuote(output.replaceAll('\\', '/'))} science-video-demo-test`,
  ].join('\n');
  const result = runShell(command, { TEST_DOCKER_CAPTURE: capture });
  assert.equal(result.status, 0, result.stderr);
  const args = (await readFile(capture, 'utf8')).trim().split('\n');
  assert.ok(args.includes('none'), 'renderer must use the none network');
  assert.ok(args.includes('ALL'), 'renderer must drop all Linux capabilities');
  assert.ok(args.includes('no-new-privileges'), 'renderer must disable privilege escalation');
  assert.ok(args.includes('10001:10001'), 'renderer must run as the fixed unprivileged user');
  assert.ok(args.includes('type=bind,src=' + input.replaceAll('\\', '/') + ',dst=/input,readonly'));
  assert.ok(args.includes('type=bind,src=' + output.replaceAll('\\', '/') + ',dst=/output'));
  assert.equal(args.some((arg) => arg === '--env-file' || arg.startsWith('--secret')), false);
});

test('renderer timeout stops only the named demo container and retains it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-media-demo-timeout-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const capture = join(root, 'docker-args.txt');
  const fakeDocker = join(root, 'docker');
  const fakeTimeout = join(root, 'timeout');
  await writeFile(fakeDocker, '#!/usr/bin/env bash\nif [ "$1 $2" = "container inspect" ]; then exit 1; fi\nprintf "%s\\n" "$@" >> "$TEST_DOCKER_CAPTURE"\n');
  await writeFile(fakeTimeout, '#!/usr/bin/env bash\nexit 124\n');
  await Promise.all([chmod(fakeDocker, 0o755), chmod(fakeTimeout, 0o755)]);
  const command = [
    'set -euo pipefail',
    `source ${shellQuote(bashScriptPath)}`,
    `DOCKER_BIN=${shellQuote(fakeDocker.replaceAll('\\', '/'))}`,
    `TIMEOUT_BIN=${shellQuote(fakeTimeout.replaceAll('\\', '/'))}`,
    `if run_renderer openscience-media-demo:${'a'.repeat(40)} /input /output science-video-demo-exact; then exit 92; fi`,
  ].join('\n');
  const result = runShell(command, { TEST_DOCKER_CAPTURE: capture });
  assert.equal(result.status, 0, result.stderr);
  const args = (await readFile(capture, 'utf8')).trim().split('\n');
  assert.deepEqual(args, ['stop', '--time', '30', 'science-video-demo-exact']);
});

test('an existing container name is rejected without running or stopping it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-media-demo-existing-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const capture = join(root, 'docker-args.txt');
  const fakeDocker = join(root, 'docker');
  await writeFile(fakeDocker, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" >> "$TEST_DOCKER_CAPTURE"\nif [ "$1 $2" = "container inspect" ]; then exit 0; fi\nexit 93\n');
  await chmod(fakeDocker, 0o755);
  const command = [
    'set -euo pipefail',
    `source ${shellQuote(bashScriptPath)}`,
    `DOCKER_BIN=${shellQuote(fakeDocker.replaceAll('\\', '/'))}`,
    'if run_renderer openscience-media-demo:' + 'a'.repeat(40) + ' /input /output science-video-demo-existing; then exit 94; fi',
  ].join('\n');
  const result = runShell(command, { TEST_DOCKER_CAPTURE: capture });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readFile(capture, 'utf8')).trim().split('\n'), ['container', 'inspect', 'science-video-demo-existing']);
});

test('demo nginx mutation holds the canonical production deployment flock', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-media-demo-lock-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const lockDirectory = bashPath(join(root, 'openscience-production-deploy'));
  const lockPath = join(root, 'openscience-production-deploy', 'lock');
  await mkdir(join(root, 'openscience-production-deploy'));
  await writeFile(lockPath, '');
  const fakeFlock = join(root, 'flock');
  await writeFile(fakeFlock, '#!/usr/bin/env bash\nfor value in "$@"; do [ "$value" != "-c" ] || exit 73; done\nexit 0\n');
  await chmod(fakeFlock, 0o755);
  const command = [
    'set -euo pipefail',
    `source ${shellQuote(bashScriptPath)}`,
    `FLOCK_BIN=${shellQuote(fakeFlock.replaceAll('\\', '/'))}`,
    `DEPLOY_LOCK_DIRECTORY=${shellQuote(lockDirectory)}`,
    'DEPLOY_LOCK_PATH="$DEPLOY_LOCK_DIRECTORY/lock"',
    'DEPLOY_LOCK_REQUIRED_UID="$(id -u)"',
    'DEPLOY_LOCK_DIRECTORY_MODE="$(stat -c %a "$DEPLOY_LOCK_DIRECTORY")"',
    'DEPLOY_LOCK_FILE_MODE="$(stat -c %a "$DEPLOY_LOCK_PATH")"',
    'acquire_production_deploy_lock',
    'assert_production_deploy_lock',
    'set +e',
    '"$FLOCK_BIN" -n -E 73 "$DEPLOY_LOCK_PATH" -c :',
    'probe_status=$?',
    'set -e',
    'test "$probe_status" -eq 73',
  ].join('\n');
  const result = runShell(command);
  assert.equal(result.status, 0, result.stderr);
});

test('failed nginx validation restores the prior managed snippet', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-media-demo-nginx-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const target = join(root, 'science-video-demo.location.conf');
  const candidate = join(root, 'candidate.conf');
  const backup = join(root, 'backup.conf');
  const fakeNginx = join(root, 'nginx');
  const fakeSystemctl = join(root, 'systemctl');
  const mainTarget = join(root, 'openscience.conf');
  const mainCandidate = join(root, 'openscience.candidate.conf');
  const mainBackup = join(root, 'openscience.backup.conf');
  const prior = '# OpenScience managed science-video demo location\n# prior\n';
  const priorMain = 'server {\n    location = /__release {\n        return 200;\n    }\n}\n';
  await writeFile(target, prior);
  await writeFile(candidate, '# OpenScience managed science-video demo location\n# candidate-invalid\n');
  await writeFile(mainTarget, priorMain);
  await writeFile(mainCandidate, 'server {\n    include /etc/nginx/snippets/science-video-demo*.location.conf;\n    location = /__release {\n        return 200;\n    }\n}\n');
  await writeFile(fakeNginx, '#!/usr/bin/env bash\nif grep -q candidate-invalid "$TEST_NGINX_TARGET"; then exit 1; fi\n');
  await writeFile(fakeSystemctl, '#!/usr/bin/env bash\nexit 0\n');
  await Promise.all([chmod(fakeNginx, 0o755), chmod(fakeSystemctl, 0o755)]);
  const command = [
    'set -euo pipefail',
    `source ${shellQuote(bashScriptPath)}`,
    `NGINX_BIN=${shellQuote(fakeNginx.replaceAll('\\', '/'))}`,
    `SYSTEMCTL_BIN=${shellQuote(fakeSystemctl.replaceAll('\\', '/'))}`,
    `if install_nginx_transaction ${shellQuote(candidate.replaceAll('\\', '/'))} ${shellQuote(target.replaceAll('\\', '/'))} ${shellQuote(backup.replaceAll('\\', '/'))} ${shellQuote(mainCandidate.replaceAll('\\', '/'))} ${shellQuote(mainTarget.replaceAll('\\', '/'))} ${shellQuote(mainBackup.replaceAll('\\', '/'))}; then exit 90; fi`,
    `cmp ${shellQuote(target.replaceAll('\\', '/'))} ${shellQuote(backup.replaceAll('\\', '/'))}`,
    `cmp ${shellQuote(mainTarget.replaceAll('\\', '/'))} ${shellQuote(mainBackup.replaceAll('\\', '/'))}`,
  ].join('\n');
  const result = runShell(command, { TEST_NGINX_TARGET: target });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(target, 'utf8'), prior);
  assert.equal(await readFile(mainTarget, 'utf8'), priorMain);
});

test('nginx main candidate inserts one managed include immediately before the release marker', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-media-demo-main-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const source = join(root, 'openscience.conf');
  const candidate = join(root, 'candidate.conf');
  const duplicate = join(root, 'duplicate.conf');
  await writeFile(source, 'server {\n    location = /__release {\n        return 200;\n    }\n}\n');
  await writeFile(duplicate, 'server {\n    include /etc/nginx/snippets/science-video-demo*.location.conf;\n    include /etc/nginx/snippets/science-video-demo*.location.conf;\n    location = /__release {\n        return 200;\n    }\n}\n');
  const command = [
    'set -euo pipefail',
    `source ${shellQuote(bashScriptPath)}`,
    `prepare_nginx_main_candidate ${shellQuote(source.replaceAll('\\', '/'))} ${shellQuote(candidate.replaceAll('\\', '/'))}`,
    `test "$(grep -Fxc '    include /etc/nginx/snippets/science-video-demo*.location.conf;' ${shellQuote(candidate.replaceAll('\\', '/'))})" -eq 1`,
    `test "$(grep -Fn '    include /etc/nginx/snippets/science-video-demo*.location.conf;' ${shellQuote(candidate.replaceAll('\\', '/'))} | cut -d: -f1)" -lt "$(grep -Fn '    location = /__release {' ${shellQuote(candidate.replaceAll('\\', '/'))} | cut -d: -f1)"`,
    `if prepare_nginx_main_candidate ${shellQuote(duplicate.replaceAll('\\', '/'))} ${shellQuote(candidate.replaceAll('\\', '/'))}; then exit 91; fi`,
  ].join('\n');
  const result = runShell(command);
  assert.equal(result.status, 0, result.stderr);
});

test('nginx exposes only the reviewed demo page and two media files', () => {
  const snippet = readFileSync(snippetPath, 'utf8');
  assert.match(snippet, /location = \/demos\/science-video\/d2nn\/ \{/u);
  assert.match(snippet, /d2nn-science-explainer-v2\.mp4/u);
  assert.match(snippet, /poster-v2\.png/u);
  assert.match(snippet, /Content-Security-Policy/u);
  assert.match(snippet, /Accept-Ranges/u);
  assert.doesNotMatch(snippet, /autoindex\s+on|location \^~|alias .*\/input\/|storyboard\.json|metrics\.json/u);
});

test('deployment script retains prior releases and never prunes application state', () => {
  const source = readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /\brm\b|docker\s+(?:system|image|container)\s+prune|(?:install|cp|sed)[^\n]*\/opt\/openscience\//u);
  assert.match(source, /\/opt\/openscience-demos\/science-video\/d2nn/u);
  const render = source.indexOf('run_renderer "$image"');
  const lock = source.lastIndexOf('acquire_production_deploy_lock');
  const snapshot = source.lastIndexOf('app_release_before=');
  const nginxInstall = source.indexOf('install_nginx_transaction "$candidate"');
  const finalSnapshot = source.lastIndexOf('app_release_after=');
  assert.ok(render > 0 && render < lock && lock < snapshot && snapshot < nginxInstall && nginxInstall < finalSnapshot);
});
