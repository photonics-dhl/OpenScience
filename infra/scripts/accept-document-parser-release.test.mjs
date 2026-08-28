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

test('Task 8 acceptance launcher exposes its exact isolated topology and rejects unsafe arguments before Docker', () => {
  const syntax = spawnSync(bash, ['-n', script], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  const rejected = spawnSync(bash, [script, 'not-a-sha'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });
  assert.equal(rejected.status, 64);
  assert.match(rejected.stderr, /invalid exact source SHA/);
  assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, /docker:|Cannot connect|daemon/i);

  const sha = 'a'.repeat(40);
  const arbitraryRoots = spawnSync(bash, [script, sha, '/tmp/arbitrary-corpus', '/tmp/report.json'], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '' },
  });
  assert.equal(arbitraryRoots.status, 64);
  assert.match(arbitraryRoots.stderr, /usage: .* <exact-source-sha>/);
  assert.doesNotMatch(`${arbitraryRoots.stdout}${arbitraryRoots.stderr}`, /docker:|Cannot connect|daemon/i);

  const contractRun = spawnSync(bash, [script, '--print-contract', sha], { encoding: 'utf8' });
  assert.equal(contractRun.status, 0, contractRun.stderr);
  const contract = JSON.parse(contractRun.stdout);
  assert.deepEqual(contract, {
    schemaVersion: 2,
    sourceSha: sha,
    corpusCases: 16,
    manifestSha256: '34b46c5405c7d2114183cfb8e3b938a392ddf1e43941fed0818f7a3ab3b7fae6',
    actualPath: 'artifact-backed-sdf.extract',
    paths: {
      releaseRoot: `/opt/openscience-releases/${sha}`,
      acceptanceRoot: `/opt/openscience-acceptance/document-parser/${sha}`,
      corpusRoot: `/opt/openscience-acceptance/document-parser/${sha}/corpus`,
      finalReport: `/opt/openscience-acceptance/document-parser/${sha}/report.json`,
    },
    worker: {
      user: '1000:1000', effectiveEnvCount: 0,
      releaseMount: { source: `/opt/openscience-releases/${sha}`, destination: '/opt/openscience', readOnly: true },
      corpusMount: { source: `/opt/openscience-acceptance/document-parser/${sha}/corpus`, destination: '/acceptance-corpus', readOnly: true },
      exactRunOutputOnly: true,
    },
    parser: { user: '1000:1000', effectiveEnvCount: 0, hostBindMounts: 0, releaseMounts: 0 },
    network: 'none',
    calls: { structuredFake: 10, externalProvider: 0, forbiddenGateway: 0 },
    freshBuildIdentity: { required: true, runnerSha256: true, contractSha256: true },
    deadlineSeconds: 900,
    resourceOwnership: { preflightAbsent: true, randomTokenLabel: true, removeOnlyOwned: true },
    independentCgroupSampling: ['worker', 'parser'],
    topologyMaxima: true,
    atomicPublication: true,
    cleanupScope: 'exact-run-root-and-adjacent-temp-report',
    parserLimits: {
      readOnly: true, capDrop: 'ALL', noNewPrivileges: true,
      memoryBytes: 536870912, cpus: 2, pids: 64, jobVolumeBytes: 67108864, tmpfsBytes: 67108864,
    },
    workerLimits: {
      readOnly: true, capDrop: 'ALL', noNewPrivileges: true,
      memoryBytes: 1073741824, cpus: 2, pids: 64, tmpfsBytes: 67108864,
    },
  });
});
