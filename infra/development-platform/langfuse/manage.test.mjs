import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const q = s => `'${s.replaceAll("'", "'\\''")}'`;
for (const operation of ['stop', 'backup']) {
  for (const lifecycle of ['running', 'restarting', 'paused', 'removing', 'unknown', 'created', 'inspect-error', 'list-error', 'wrong-label', 'exited', 'absent']) {
  test(`${operation}: telemetry ${lifecycle} ${['exited', 'absent'].includes(lifecycle) ? 'allows' : 'refuses'} backend operation`, async () => {
    const tmp = fileURLToPath(new URL('../../../tmp/architecture-remediation/', import.meta.url));
    await mkdir(tmp, { recursive: true }); const root = await mkdtemp(path.join(tmp, 'langfuse-guard-'));
    const fake = path.join(root, 'docker').replaceAll('\\', '/');
    const allowed = ['exited', 'absent'].includes(lifecycle);
    const state = ['inspect-error', 'wrong-label'].includes(lifecycle) ? 'exited' : lifecycle;
    await writeFile(fake, `#!/usr/bin/env bash
if [[ "$1" == ps ]]; then
  [[ "$*" == *'--all'* && "$*" == *'name=^/openscience-development-gateway-audit$'* ]] || exit 91
  ${lifecycle === 'list-error' ? 'exit 19' : lifecycle === 'absent' ? 'exit 0' : 'printf "abcdef123456\\n"'}
elif [[ "$1" == inspect ]]; then
  ${lifecycle === 'inspect-error' ? 'exit 19' : `printf '/openscience-development-gateway-audit|${state}|${state === 'running' || state === 'paused' ? 'true' : 'false'}|${state === 'paused' ? 'true' : 'false'}|${state === 'restarting' ? 'true' : 'false'}|${lifecycle === 'wrong-label' ? 'another-project' : 'openscience-development-telemetry'}|gateway-audit\\n'`}
elif [[ "$1" == compose && "$*" == *'ps --status running --services'* ]]; then exit 0
elif [[ "$1" == compose && "$*" == *' stop'* ]]; then
  printf 'BACKEND_CHANGED\\n'
  exit ${operation === 'backup' ? '88' : '0'}
else exit 99
fi
`, { mode: 0o700 });
    let source = (await readFile(new URL('./manage.sh', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
    // Only relocate host/environment guards in this fixture. Command dispatch
    // and the producer-before-backend check execute unchanged.
    source = source.replace(/^\[\[ \$\(uname -s\).*$/m, ': # host guard replaced in local fixture');
    source = source.replace(/^\[\[ \$release_dir =~.*$/m, ': # installed path guard replaced in local fixture');
    source = source.replace(/^docker_cmd=.*$/m, `docker_cmd=(${q(fake)})`);
    source = source.replace('backup_root=/opt/openscience-development/langfuse/backups', `backup_root=${q(root.replaceAll('\\', '/') + '/backups')}`);
    if (process.platform === 'win32') source = source.replace('install -d -m 0700 "$backup_root"', 'mkdir -p -- "$backup_root"');
    const script = path.join(root, 'manage.sh'); await writeFile(script, source);
    const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash', [script, operation, '--confirm'], { cwd: root, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, allowed ? operation === 'backup' ? 88 : 0 : 75, result.stderr);
    assert.equal(result.stdout.includes('BACKEND_CHANGED'), allowed);
    if (!allowed) assert.match(result.stderr, /Telemetry is not confirmed stopped/);
  });
  }
}
