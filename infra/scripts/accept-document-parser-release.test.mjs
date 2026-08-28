import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'accept-document-parser-release.sh');
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';

test('Task 8 acceptance launcher is valid shell and rejects before Docker without an exact SHA', () => {
  const syntax = spawnSync(bash, ['-n', script], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  const rejected = spawnSync(bash, [script, 'not-a-sha', 'missing-corpus', 'report.json'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });
  assert.equal(rejected.status, 64);
  assert.match(rejected.stderr, /invalid exact source SHA/);
  assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, /docker:|Cannot connect|daemon/i);

  const sha = 'a'.repeat(40);
  const contractRun = spawnSync(bash, [script, '--print-contract', sha], { encoding: 'utf8' });
  assert.equal(contractRun.status, 0, contractRun.stderr);
  const contract = JSON.parse(contractRun.stdout);
  assert.deepEqual(contract, {
    schemaVersion: 2,
    sourceSha: sha,
    corpusCases: 16,
    actualPath: 'artifact-backed-sdf.extract',
    workerReleaseMount: '/opt/openscience:ro',
    network: 'none',
    providerCalls: 0,
    atomicPublication: true,
    cleanupScope: 'exact-run-id',
    parserLimits: {
      readOnly: true, capDrop: 'ALL', noNewPrivileges: true,
      memoryBytes: 536870912, cpus: 2, pids: 64, jobVolumeBytes: 67108864, tmpfsBytes: 67108864,
    },
    workerLimits: {
      readOnly: true, capDrop: 'ALL', noNewPrivileges: true,
      memoryBytes: 1073741824, cpus: 2, pids: 64, tmpfsBytes: 67108864,
    },
  });
  const source = spawnSync(bash, ['-c', `grep -F -- '--mount "type=bind,src=/opt/openscience,dst=/opt/openscience,readonly"' "${script.replaceAll('\\', '/')}"`], { encoding: 'utf8' });
  assert.equal(source.status, 0, source.stderr);
});
