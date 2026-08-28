import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
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
    resourceSampling: {
      source: 'host-cgroup-v2', memoryPeak: 'memory.peak', cpuUsage: 'cpu.stat usage_usec',
      clock: 'host-monotonic', intervalCpuQuotaRate: true, cumulativeCpu: true,
      terminalSamples: true, dockerExec: false,
    },
    topologyMaxima: true,
    publicationStateMachine: ['root-owned-unpublished', 'strict-cleanup', 'atomic-no-clobber-publish'],
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

  const source = spawnSync(bash, ['-lc', `sed -n '1,520p' '${script.replaceAll("'", "'\\''")}'`], {
    encoding: 'utf8',
  }).stdout;
  const completedMarker = source.indexOf('WORKER_COMPLETED_MARKER=');
  const waitForCompletion = source.indexOf('[[ ! -f "$WORKER_COMPLETED_MARKER" ]] || break');
  const terminalWorkerSample = source.indexOf('true "$WORKER_SAMPLES"');
  const releaseWorker = source.indexOf(': >"$WORKER_RELEASE_MARKER"');
  assert.ok(completedMarker >= 0, 'worker completion marker is required');
  assert.ok(waitForCompletion > completedMarker, 'host must wait for the controlled worker completion marker');
  assert.ok(terminalWorkerSample > waitForCompletion, 'terminal sample must happen while worker is retained');
  assert.ok(releaseWorker > terminalWorkerSample, 'worker may exit only after terminal sampling');
});

test('Task 8 launcher rejects untrusted roots before invoking release commands or package scripts', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'task8-pretrust-'));
  const marker = join(sandbox, 'release-command-ran');
  const bashEnv = join(sandbox, 'bash-env');
  await writeFile(bashEnv, ['git', 'find', 'npx', 'docker'].map((command) => (
    `${command}() { printf '%s\\n' '${command}' >> '${marker.replaceAll('\\', '/')}'; return 1; }; export -f ${command}`
  )).join('\n'));
  await chmod(bashEnv, 0o700);
  const rejected = spawnSync(bash, [script, 'b'.repeat(40)], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '', BASH_ENV: bashEnv.replaceAll('\\', '/') },
  });
  assert.equal(rejected.status, 65);
  assert.match(rejected.stderr, /trusted|canonical|directory|owner|writable/i);
  assert.equal(existsSync(marker), false, existsSync(marker) ? await readFile(marker, 'utf8') : '');
});

test('Task 8 launcher rejects a symlink and a post-build root replacement before Docker', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'task8-pretrust-replacement-'));
  const bashPath = (path) => process.platform === 'win32'
    ? spawnSync(bash, ['-lc', `cygpath -u '${path.replaceAll("'", "'\\''")}'`], { encoding: 'utf8' }).stdout.trim()
    : path;
  const root = bashPath(sandbox);
  const uid = spawnSync(bash, ['-lc', 'id -u'], { encoding: 'utf8' }).stdout.trim();
  const source = await readFile(script, 'utf8');
  const testScript = join(sandbox, 'launcher.sh');
  await writeFile(testScript, source
    .replaceAll('/opt/openscience-releases', `${root}/releases`)
    .replaceAll('/opt/openscience-acceptance/document-parser', `${root}/acceptance`)
    .replace('EXPECTED_TRUST_UID=0', `EXPECTED_TRUST_UID=${uid}`)
    .replaceAll('/usr/bin/git', 'git')
    .replaceAll('/usr/bin/find', 'find')
    .replaceAll('/usr/bin/npx', 'npx'));
  await chmod(testScript, 0o700);

  const sha = 'c'.repeat(40);
  const marker = join(sandbox, 'commands-ran');
  const bashEnv = join(sandbox, 'bash-env');
  await writeFile(bashEnv, `
git() {
  printf '%s\\n' git >> '${bashPath(marker)}'
  if [[ "$*" == *"rev-parse"* ]]; then printf '%s\\n' '${sha}'; fi
  return 0
}
find() { printf '%s\\n' find >> '${bashPath(marker)}'; return 0; }
npx() {
  printf '%s\\n' npx >> '${bashPath(marker)}'
  mv "$TEST_RELEASE_ROOT" "$TEST_RELEASE_ROOT.replaced"
  mkdir -m 700 "$TEST_RELEASE_ROOT"
  return 0
}
docker() { printf '%s\\n' docker >> '${bashPath(marker)}'; return 1; }
export -f git find npx docker
`);
  await chmod(bashEnv, 0o700);
  const acceptanceRoot = join(sandbox, 'acceptance', sha);
  await mkdir(join(acceptanceRoot, 'corpus'), { recursive: true, mode: 0o700 });
  await chmod(join(sandbox, 'acceptance'), 0o700);
  await chmod(acceptanceRoot, 0o700);
  await chmod(join(acceptanceRoot, 'corpus'), 0o700);
  await mkdir(join(sandbox, 'releases'), { mode: 0o700 });
  const realRelease = join(sandbox, 'real-release');
  await mkdir(realRelease, { mode: 0o700 });
  await symlink(realRelease, join(sandbox, 'releases', sha), process.platform === 'win32' ? 'junction' : 'dir');
  const baseEnv = {
    PATH: process.env.PATH ?? '', BASH_ENV: bashPath(bashEnv),
    TEST_RELEASE_ROOT: `${root}/releases/${sha}`,
  };
  const symlinked = spawnSync(bash, [testScript, sha], { encoding: 'utf8', env: baseEnv });
  assert.equal(symlinked.status, 65);
  assert.match(symlinked.stderr, /trusted|canonical|symlink/i);
  assert.equal(existsSync(marker), false);

  const secondRoot = await mkdtemp(join(tmpdir(), 'task8-pretrust-swap-'));
  const secondBashRoot = bashPath(secondRoot);
  const secondScript = join(secondRoot, 'launcher.sh');
  await writeFile(secondScript, source
    .replaceAll('/opt/openscience-releases', `${secondBashRoot}/releases`)
    .replaceAll('/opt/openscience-acceptance/document-parser', `${secondBashRoot}/acceptance`)
    .replace('EXPECTED_TRUST_UID=0', `EXPECTED_TRUST_UID=${uid}`)
    .replaceAll('/usr/bin/git', 'git')
    .replaceAll('/usr/bin/find', 'find')
    .replaceAll('/usr/bin/npx', 'npx'));
  await chmod(secondScript, 0o700);
  await mkdir(join(secondRoot, 'releases', sha), { recursive: true, mode: 0o700 });
  await mkdir(join(secondRoot, 'acceptance', sha, 'corpus'), { recursive: true, mode: 0o700 });
  for (const path of [
    join(secondRoot, 'releases'), join(secondRoot, 'releases', sha),
    join(secondRoot, 'acceptance'), join(secondRoot, 'acceptance', sha),
    join(secondRoot, 'acceptance', sha, 'corpus'),
  ]) await chmod(path, 0o700);
  const swapped = spawnSync(bash, [secondScript, sha], {
    encoding: 'utf8', env: {
      ...baseEnv, TEST_RELEASE_ROOT: `${secondBashRoot}/releases/${sha}`,
    },
  });
  assert.equal(swapped.status, 65);
  assert.match(swapped.stderr, /identity|replaced|trusted|canonical/i);
  assert.deepEqual((await readFile(marker, 'utf8')).trim().split(/\r?\n/u), ['git', 'git', 'find', 'npx']);
});
