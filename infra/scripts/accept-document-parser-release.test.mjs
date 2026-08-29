import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'accept-document-parser-release.sh');
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';

const manifestTool = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/release-input-manifest.mjs');
const canonicalManifest = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../test/research-intelligence/manifest.json',
);

function bashPath(path) {
  return process.platform === 'win32'
    ? spawnSync(bash, ['-lc', `cygpath -u '${path.replaceAll("'", "'\\''")}'`], { encoding: 'utf8' }).stdout.trim()
    : path;
}

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
    schemaVersion: 3,
    acceptanceProfile: 'hermes-parser-14-2-v1',
    sourceSha: sha,
    corpusCases: 16,
    manifestSha256: createHash('sha256').update(readFileSync(canonicalManifest)).digest('hex'),
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
    calls: { structuredFake: 14, externalProvider: 0, forbiddenGateway: 0 },
    freshBuildIdentity: {
      required: true,
      runnerSha256: true,
      contractSha256: true,
      runtimeGraphManifest: true,
      runtimeGraphScope: 'agent-worker-and-workspace-dist-js',
      runtimeInputsDigest: 'worker-node-modules-workspace-dist-search-generated-bytes-modes-owners',
      verifyAt: ['immediately-after-build', 'before-container-start', 'after-worker-completion', 'before-publication'],
    },
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

  const source = spawnSync(bash, ['-lc', `sed -n '1,760p' '${script.replaceAll("'", "'\\''")}'`], {
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
  assert.match(source, /\/usr\/bin\/env -i \/usr\/local\/bin\/node "\$@"/u,
    'the worker shell must clear its automatically exported PWD before starting the acceptance runner');

  const runtimeInstall = source.indexOf('install --ignore-scripts --frozen-lockfile');
  const build = source.indexOf('--filter @openscience/agent-worker... build');
  assert.ok(runtimeInstall >= 0 && runtimeInstall < build,
    'acceptance must stabilize the frozen dependency tree without arbitrary install scripts before hashing it');
  assert.match(source, /\(\s*umask 022\s*\/usr\/bin\/npx pnpm@9\.15\.0 --dir "\$RELEASE_ROOT" --filter @openscience\/agent-worker\.\.\. build >\/dev\/null\s*\)/u,
    'fresh runtime build must use a readable umask for the non-root worker');
  const sourceBeforeBuild = source.indexOf("verify_release_inputs 'before-build'");
  const sourceAfterBuild = source.indexOf("verify_release_inputs 'after-build'");
  const sourceBeforeStart = source.indexOf("verify_release_inputs 'before-container-start'");
  const sourceBeforePublication = source.indexOf("verify_release_inputs 'before-publication'");
  const sourceBeforeAtomicPublication = source.indexOf("verify_release_inputs 'before-atomic-publication'");
  const normalizeRuntimePermissions = source.indexOf('runtime-normalize --root "$RELEASE_ROOT" --sha "$SOURCE_SHA"');
  const immediatelyAfterBuild = source.indexOf("verify_runtime_graph 'immediately-after-build'");
  const runtimeInputsAfterBuild = source.indexOf("verify_runtime_inputs 'immediately-after-build'");
  const beforeContainerStart = source.indexOf("verify_runtime_graph 'before-container-start'");
  const runtimeInputsBeforeStart = source.indexOf("verify_runtime_inputs 'before-container-start'");
  const parserStart = source.indexOf('PARSER_CONTAINER_ID="$(docker run');
  const afterWorkerCompletion = source.indexOf("verify_runtime_graph 'after-worker-completion'");
  const runtimeInputsAfterWorker = source.indexOf("verify_runtime_inputs 'after-worker-completion'");
  const beforePublication = source.indexOf("verify_runtime_graph 'before-publication'");
  const runtimeInputsBeforePublication = source.indexOf("verify_runtime_inputs 'before-publication'");
  const finalize = source.indexOf('"$CONTRACT_JS" finalize');
  const strictCleanup = source.indexOf('cleanup_strict', finalize);
  const reportRuntimeIdentity = source.indexOf('REPORT_RUNTIME_INPUTS_JSON=', finalize);
  const publish = source.indexOf('"$CONTRACT_JS" publish', strictCleanup);
  const publishVerifierIdentity = source.indexOf("verify_build_hashes 'before-atomic-publication'", strictCleanup);
  const runtimeInputsBeforePublish = source.indexOf("verify_runtime_inputs 'before-atomic-publication'", strictCleanup);
  assert.ok(immediatelyAfterBuild > build, 'complete runtime graph must be fixed immediately after build');
  assert.ok(sourceBeforeBuild >= 0 && sourceBeforeBuild < runtimeInstall,
    'archived source must be verified before dependency stabilization');
  assert.ok(sourceBeforeBuild >= 0 && sourceBeforeBuild < build,
    'archived source marker and manifest must be verified before build');
  assert.ok(sourceAfterBuild > build && sourceAfterBuild < immediatelyAfterBuild,
    'archived source marker and manifest must be reverified after build');
  assert.ok(normalizeRuntimePermissions > sourceAfterBuild && normalizeRuntimePermissions < immediatelyAfterBuild,
    'restrictive retry outputs must be normalized before runtime identity is fixed');
  assert.ok(sourceBeforeStart > sourceAfterBuild && sourceBeforeStart < parserStart,
    'archived source marker and manifest must be reverified before container start');
  assert.ok(sourceBeforePublication > afterWorkerCompletion && sourceBeforePublication < finalize,
    'archived source marker and manifest must be reverified before finalization');
  assert.ok(sourceBeforeAtomicPublication > strictCleanup && sourceBeforeAtomicPublication < publish,
    'archived source marker and manifest must be reverified immediately before atomic publication');
  assert.ok(beforeContainerStart > immediatelyAfterBuild && beforeContainerStart < parserStart,
    'complete runtime graph must be reverified before either container starts');
  assert.ok(runtimeInputsAfterBuild > immediatelyAfterBuild && runtimeInputsAfterBuild < parserStart,
    'complete generated runtime inputs must be fixed immediately after build');
  assert.ok(runtimeInputsBeforeStart > runtimeInputsAfterBuild && runtimeInputsBeforeStart < parserStart,
    'complete generated runtime inputs must be reverified before either container starts');
  assert.ok(afterWorkerCompletion > waitForCompletion,
    'complete runtime graph must be reverified after worker completion');
  assert.ok(beforePublication > afterWorkerCompletion && beforePublication < finalize,
    'complete runtime graph must be reverified before finalization');
  assert.ok(runtimeInputsAfterWorker > afterWorkerCompletion && runtimeInputsAfterWorker < finalize,
    'complete generated runtime inputs must be reverified after worker completion');
  assert.ok(runtimeInputsBeforePublication > runtimeInputsAfterWorker && runtimeInputsBeforePublication < finalize,
    'complete generated runtime inputs must be reverified before finalization');
  assert.ok(publish > strictCleanup,
    'the publish command must reverify the embedded runtime graph immediately after strict cleanup');
  assert.ok(reportRuntimeIdentity > finalize && reportRuntimeIdentity < strictCleanup,
    'the unpublished report must retain the exact verified generated runtime identity before cleanup');
  assert.ok(publishVerifierIdentity > strictCleanup && publishVerifierIdentity < publish,
    'the independently hashed contract verifier must retain its build identity at atomic publication');
  assert.ok(runtimeInputsBeforePublish > strictCleanup && runtimeInputsBeforePublish < publish,
    'complete generated runtime inputs must be reverified immediately before atomic publication');
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

test('archive-style source manifest replaces Git metadata and is reverified after build', async (t) => {
  async function setup() {
    const sandbox = await mkdtemp(join(tmpdir(), 'task8-manifest-preflight-'));
    const root = bashPath(sandbox);
    const uid = spawnSync(bash, ['-lc', 'id -u'], { encoding: 'utf8' }).stdout.trim();
    const sha = 'd'.repeat(40);
    const releaseRoot = join(sandbox, 'releases', sha);
    const acceptanceRoot = join(sandbox, 'acceptance', sha);
    await mkdir(join(releaseRoot, 'scripts'), { recursive: true, mode: 0o700 });
    await mkdir(join(acceptanceRoot, 'corpus'), { recursive: true, mode: 0o700 });
    for (const path of [
      join(sandbox, 'releases'), releaseRoot, join(sandbox, 'acceptance'), acceptanceRoot,
      join(acceptanceRoot, 'corpus'),
    ]) await chmod(path, 0o700);
    await cp(manifestTool, join(releaseRoot, 'scripts', 'release-input-manifest.mjs'));
    await writeFile(join(releaseRoot, 'package.json'), '{"name":"fixture"}\n');
    await writeFile(join(releaseRoot, '.release-source'), `${sha}\n`);
    const created = spawnSync(process.execPath, [manifestTool, 'create', '--root', releaseRoot, '--sha', sha], {
      encoding: 'utf8',
    });
    assert.equal(created.status, 0, created.stderr);
    const source = await readFile(script, 'utf8');
    const launcher = join(sandbox, 'launcher.sh');
    await writeFile(launcher, source
      .replaceAll('/opt/openscience-releases', `${root}/releases`)
      .replaceAll('/opt/openscience-acceptance/document-parser', `${root}/acceptance`)
      .replace('EXPECTED_TRUST_UID=0', `EXPECTED_TRUST_UID=${uid}`)
      .replaceAll('/usr/bin/node', 'node')
      .replaceAll('/usr/bin/find', 'find')
      .replaceAll('/usr/bin/npx', 'npx'));
    await chmod(launcher, 0o700);
    return { sandbox, sha, releaseRoot, launcher };
  }

  await t.test('clean archived source reaches the package build without .git', async () => {
    const state = await setup();
    try {
      const marker = join(state.sandbox, 'commands');
      const bashEnv = join(state.sandbox, 'bash-env');
      await writeFile(bashEnv, `
npx() { printf '%s\\n' npx >> '${bashPath(marker)}'; return 91; }
docker() { printf '%s\\n' docker >> '${bashPath(marker)}'; return 92; }
export -f npx docker
`);
      const run = spawnSync(bash, [state.launcher, state.sha], {
        encoding: 'utf8', env: { PATH: process.env.PATH ?? '', BASH_ENV: bashPath(bashEnv) },
      });
      assert.equal(run.status, 91, run.stderr);
      assert.deepEqual((await readFile(marker, 'utf8')).trim().split(/\r?\n/u), ['npx']);
      assert.doesNotMatch(`${run.stdout}${run.stderr}`, /not a git repository/i);
    } finally {
      await rm(state.sandbox, { recursive: true, force: true });
    }
  });

  await t.test('tracked tampering is rejected before package build or Docker', async () => {
    const state = await setup();
    try {
      await writeFile(join(state.releaseRoot, 'package.json'), '{"name":"tampered"}\n');
      const marker = join(state.sandbox, 'commands');
      const bashEnv = join(state.sandbox, 'bash-env');
      await writeFile(bashEnv, `
npx() { printf '%s\\n' npx >> '${bashPath(marker)}'; return 0; }
docker() { printf '%s\\n' docker >> '${bashPath(marker)}'; return 0; }
export -f npx docker
`);
      const run = spawnSync(bash, [state.launcher, state.sha], {
        encoding: 'utf8', env: { PATH: process.env.PATH ?? '', BASH_ENV: bashPath(bashEnv) },
      });
      assert.equal(run.status, 65, run.stderr);
      assert.equal(existsSync(marker), false);
    } finally {
      await rm(state.sandbox, { recursive: true, force: true });
    }
  });

  await t.test('source changed by the build is rejected before Docker', async () => {
    const state = await setup();
    try {
      const marker = join(state.sandbox, 'commands');
      const bashEnv = join(state.sandbox, 'bash-env');
      await writeFile(bashEnv, `
npx() {
  printf '%s\\n' npx >> '${bashPath(marker)}'
  printf '%s\\n' '{"name":"changed-during-build"}' > '${bashPath(join(state.releaseRoot, 'package.json'))}'
  return 0
}
docker() { printf '%s\\n' docker >> '${bashPath(marker)}'; return 0; }
export -f npx docker
`);
      const run = spawnSync(bash, [state.launcher, state.sha], {
        encoding: 'utf8', env: { PATH: process.env.PATH ?? '', BASH_ENV: bashPath(bashEnv) },
      });
      assert.equal(run.status, 65, run.stderr);
      assert.deepEqual((await readFile(marker, 'utf8')).trim().split(/\r?\n/u), ['npx']);
    } finally {
      await rm(state.sandbox, { recursive: true, force: true });
    }
  });
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
    .replaceAll('/usr/bin/node', 'node')
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
  mkdir "$TEST_RELEASE_ROOT"
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
    .replaceAll('/usr/bin/node', 'node')
    .replaceAll('/usr/bin/git', 'git')
    .replaceAll('/usr/bin/find', 'find')
    .replaceAll('/usr/bin/npx', 'npx'));
  await chmod(secondScript, 0o700);
  await mkdir(join(secondRoot, 'releases', sha), { recursive: true, mode: 0o700 });
  await mkdir(join(secondRoot, 'releases', sha, 'scripts'), { recursive: true, mode: 0o700 });
  await mkdir(join(secondRoot, 'acceptance', sha, 'corpus'), { recursive: true, mode: 0o700 });
  for (const path of [
    join(secondRoot, 'releases'), join(secondRoot, 'releases', sha),
    join(secondRoot, 'acceptance'), join(secondRoot, 'acceptance', sha),
    join(secondRoot, 'acceptance', sha, 'corpus'),
  ]) await chmod(path, 0o700);
  await cp(manifestTool, join(secondRoot, 'releases', sha, 'scripts', 'release-input-manifest.mjs'));
  await writeFile(join(secondRoot, 'releases', sha, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(secondRoot, 'releases', sha, '.release-source'), `${sha}\n`);
  const manifested = spawnSync(process.execPath, [manifestTool, 'create',
    '--root', join(secondRoot, 'releases', sha), '--sha', sha], { encoding: 'utf8' });
  assert.equal(manifested.status, 0, manifested.stderr);
  const swapped = spawnSync(bash, [secondScript, sha], {
    encoding: 'utf8', env: {
      ...baseEnv, TEST_RELEASE_ROOT: `${secondBashRoot}/releases/${sha}`,
    },
  });
  assert.equal(swapped.status, 65, swapped.stderr);
  assert.match(swapped.stderr, /identity|replaced|trusted|canonical|source marker|input manifest/i);
  assert.deepEqual((await readFile(marker, 'utf8')).trim().split(/\r?\n/u), ['find', 'npx']);
});
