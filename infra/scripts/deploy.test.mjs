import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { runInNewContext } from 'node:vm';
import * as deployLock from './production-deploy-lock.mjs';

const launcherSource = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const transactionSource = readFileSync(new URL('./production-deploy-transaction.sh', import.meta.url), 'utf8');
const transactionStateSource = readFileSync(new URL('./production-deploy-transaction-state.sh', import.meta.url), 'utf8');
const retentionSource = readFileSync(new URL('./production-release-retention.mjs', import.meta.url), 'utf8');
const transactionStatePath = fileURLToPath(new URL('./production-deploy-transaction-state.sh', import.meta.url));
const deployLockSource = readFileSync(new URL('./production-deploy-lock.mjs', import.meta.url), 'utf8');
const source = `${launcherSource}\n${transactionSource}\n${transactionStateSource}`;

function nativeJournalFixture() {
  return {
    before: {
      runtimeId: `installed-native-continuation-${'c'.repeat(40)}`,
      skillCatalogueId: `project-catalogue-${'c'.repeat(40)}`,
      timerEnableState: 'enabled-runtime', timerWasActive: true,
      producers: { api: true, web: true, agentWorker: true },
      containers: { api: '1'.repeat(64), web: '2'.repeat(64), agentWorker: '3'.repeat(64) },
    },
    quiesceState: 'not_started', installState: 'not_attempted', restoreState: 'not_started', candidateCheckpoint: null,
  };
}

test('Native journal validates original state and rejects malformed or foreign receipts', () => {
  const candidate = 'b'.repeat(40), original = nativeJournalFixture();
  assert.equal(typeof deployLock.validateNativeJournalState, 'function');
  const validated = deployLock.validateNativeJournalState(original, candidate);
  assert.deepEqual(validated, original);
  validated.before.producers.api = false;
  assert.equal(original.before.producers.api, true);
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  assert.deepEqual(deployLock.validateNativeJournalState({ ...original, quiesceState: 'quiesced', installState: 'installed', installation }, candidate).installation, installation);
  const absent = nativeJournalFixture();
  absent.before.runtimeId = null; absent.before.skillCatalogueId = null;
  absent.before.timerEnableState = 'not-found'; absent.before.timerWasActive = false;
  assert.deepEqual(deployLock.validateNativeJournalState(absent, candidate), absent);
  for (const invalid of [
    { ...original, apiKey: 'must-not-persist' },
    { ...original, before: { ...original.before, timerEnableState: 'static' } },
    { ...original, before: { ...original.before, runtimeId: null } },
    { ...original, before: { ...original.before, producers: { ...original.before.producers, api: 'true' } } },
    { ...original, installation },
    { ...original, installState: 'installed', installation: { ...installation, releaseSha: 'd'.repeat(40) } },
    { ...original, installState: 'installed', installation: { ...installation, timerDeferred: false } },
    { ...original, candidateCheckpoint: 'not-db-time' },
  ]) assert.throws(() => deployLock.validateNativeJournalState(invalid, candidate), /Native deployment state/u);
});

test('Native journal preserves the original capture and rejects reset, late mode and receipt replacement', () => {
  const candidate = 'b'.repeat(40), before = nativeJournalFixture();
  assert.equal(typeof deployLock.preserveNativeJournalState, 'function');
  assert.equal(deployLock.preserveNativeJournalState(null, undefined, candidate, true), undefined);
  assert.deepEqual(deployLock.preserveNativeJournalState(null, before, candidate, true), before);
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: before }, undefined, candidate, false), before);
  const quiesced = { ...before, quiesceState: 'quiesced' };
  const attempted = { ...quiesced, installState: 'install_attempting' };
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: quiesced }, attempted, candidate, false), attempted);
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  const completed = { ...attempted, installState: 'installed', installation };
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: attempted }, completed, candidate, false), completed);
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: completed }, undefined, candidate, false), completed);
  for (const [previous, incoming] of [
    [{}, before],
    [{ nativeRefresh: before }, { ...before, before: { ...before.before, timerWasActive: false } }],
    [{ nativeRefresh: attempted }, quiesced],
    [{ nativeRefresh: quiesced }, completed],
    [{ nativeRefresh: completed }, attempted],
    [{ nativeRefresh: completed }, { ...completed, installation: { ...installation, runtimeId: 'foreign-runtime' } }],
  ]) assert.throws(() => deployLock.preserveNativeJournalState(previous, incoming, candidate, false), /Native deployment state/u);
});

test('Native candidate identities are atomic and immutable without backfilling legacy checkpoints', () => {
  const candidate = 'b'.repeat(40), checkpoint = '2026-10-09T08:00:00.000Z';
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  const installed = { ...nativeJournalFixture(), quiesceState: 'quiesced', installState: 'installed', installation };
  const containers = { api: '4'.repeat(64), web: '5'.repeat(64), agentWorker: '6'.repeat(64) };
  const started = deployLock.transitionNativeJournalState(installed, candidate, 'candidate-start', { checkpoint, containers });
  assert.equal(started.candidateCheckpoint, checkpoint);
  assert.deepEqual(started.candidateContainers, containers);
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: installed }, started, candidate, false), started);
  const legacy = { ...installed, candidateCheckpoint: checkpoint };
  assert.deepEqual(deployLock.validateNativeJournalState(legacy, candidate), legacy);
  const legacyPhase = deployLock.transitionNativeJournalState(legacy, candidate, 'rollback-quiesce-start');
  assert.deepEqual(deployLock.preserveNativeJournalState({ nativeRefresh: legacy }, legacyPhase, candidate, false), legacyPhase);
  assert.equal(Object.hasOwn(legacyPhase, 'candidateContainers'), false);
  for (const bad of [null, { api: containers.api, web: containers.web }, { ...containers, extra: containers.api },
    { ...containers, web: 'bad' }, { ...containers, web: null }]) {
    assert.throws(() => deployLock.validateNativeJournalState({ ...started, candidateContainers: bad }, candidate), /Native deployment state/u);
  }
  for (const detail of [checkpoint, { checkpoint }, { containers }, { checkpoint, containers, extra: true }]) {
    assert.throws(() => deployLock.transitionNativeJournalState(installed, candidate, 'candidate-start', detail), /Native deployment state/u);
  }
  const withoutIds = structuredClone(started); delete withoutIds.candidateContainers;
  for (const [previous, next] of [
    [installed, { ...installed, candidateCheckpoint: checkpoint }],
    [installed, { ...installed, candidateContainers: containers }],
    [legacy, { ...legacy, candidateContainers: containers }],
    [started, withoutIds],
    [started, { ...started, candidateContainers: { ...containers, web: '7'.repeat(64) } }],
  ]) assert.throws(() => deployLock.preserveNativeJournalState({ nativeRefresh: previous }, next, candidate, false), /Native deployment state/u);
  assert.throws(() => deployLock.preserveNativeJournalState(null, started, candidate, true), /Native deployment state/u);
});

test('Native refresh flag defaults off and forwards only the explicit sixth argument', () => {
  assert.match(launcherSource, /^REFRESH_NATIVE_RESOURCES=0$/mu);
  assert.match(launcherSource, /--refresh-native-resources\) REFRESH_NATIVE_RESOURCES=1; shift/u);
  const tail = launcherSource.match(/^NATIVE_REFRESH_ARG=""[\s\S]*$/mu)?.[0];
  assert.ok(tail, 'use the real narrow forwarding code without source/config/SSH preparation');
  const candidate = 'b'.repeat(40), rollback = 'a'.repeat(40);
  for (const selected of [0, 1]) {
    const setup = [
      'fixture_ssh(){ printf "%s\\n" "$@"; }',
      'SSH_EXECUTABLE=fixture_ssh; SSH_OPTS=(); SSH_USER=fixture; SSH_HOST=example.invalid',
      `REMOTE_TRANSACTION_RUNNER='/opt/openscience-releases/${candidate}/infra/scripts/production-deploy-transaction.sh'`,
      `RELEASE_SHA='${candidate}'; ROLLBACK_SHA='${rollback}'; SKIP_MIGRATE=0; NO_TESTS=0; REUSE_UNCHANGED_CAPABILITY_IMAGES=0; REFRESH_NATIVE_RESOURCES=${selected}`,
    ].join('\n');
    const result = spawnSync(bash, ['-c', `${setup}\n${tail}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const expected = `exec /bin/bash '/opt/openscience-releases/${candidate}/infra/scripts/production-deploy-transaction.sh' '${candidate}' '${rollback}' '0' '0' '0'${selected ? " '1'" : ''} </dev/null`;
    assert.equal(result.stdout.trim(), `fixture@example.invalid\n${expected}`);
  }
});

test('Native refresh rejects invalid or excess transaction arguments before host operations', () => {
  const runner = fileURLToPath(new URL('./production-deploy-transaction.sh', import.meta.url)).replaceAll('\\', '/');
  const args = ['b'.repeat(40), 'a'.repeat(40), '0', '0', '0'];
  const invalid = spawnSync(bash, [runner, ...args, '2'], { encoding: 'utf8' });
  assert.equal(invalid.status, 64);
  assert.match(invalid.stderr, /Native/u);
  const excess = spawnSync(bash, [runner, ...args, '0', 'extra'], { encoding: 'utf8' });
  assert.equal(excess.status, 64);
  assert.match(excess.stderr, /runner/u);
});

test('Native transitions persist install and restore intent before accepting exact receipts', () => {
  const candidate = 'b'.repeat(40);
  let state = nativeJournalFixture();
  assert.equal(typeof deployLock.transitionNativeJournalState, 'function');
  const transition = (action, detail) => {
    const next = deployLock.transitionNativeJournalState(state, candidate, action, detail);
    state = deployLock.preserveNativeJournalState({ nativeRefresh: state }, next, candidate, false);
  };
  assert.throws(() => transition('install-start'), /Native deployment state/u);
  transition('quiesce-start'); transition('quiesce-complete'); transition('install-start');
  const installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`,
    skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  assert.throws(() => transition('install-complete', { ...installation, releaseSha: 'd'.repeat(40) }), /Native deployment state/u);
  transition('install-complete', installation);
  transition('candidate-start', { checkpoint: '2026-10-09T08:00:00.000Z', containers: { api: '4'.repeat(64), web: '5'.repeat(64), agentWorker: '6'.repeat(64) } });
  transition('rollback-quiesce-start'); transition('rollback-quiesce-complete');
  assert.throws(() => transition('restore-complete', {}), /Native deployment state/u);
  transition('restore-start');
  const restored = { releaseSha: candidate, restored: true, timerDeferred: true,
    previousRuntimeId: state.before.runtimeId, previousSkillCatalogueId: state.before.skillCatalogueId };
  assert.throws(() => transition('restore-complete', { ...restored, previousRuntimeId: 'foreign' }), /Native deployment state/u);
  transition('restore-complete', restored);
  assert.equal(state.restoreState, 'restored_verified');
  assert.equal(state.candidateCheckpoint, '2026-10-09T08:00:00.000Z');
});

test('Native work classification preserves pending queues and holds unknown, live and candidate-bound work', () => {
  assert.equal(typeof deployLock.classifyNativeWorkSnapshot, 'function');
  const task = { id: 't1', status: 'pending', deletedAt: null, nativePending: true,
    providerUncertain: false, updatedAt: '2026-10-09T07:00:00.000Z' };
  const snapshot = { tasks: [task], queue: ['t1'], processing: ['t1'], journals: [] };
  assert.deepEqual(deployLock.classifyNativeWorkSnapshot(snapshot, null), { safe: true, nativePending: true, nativeBoundPending: false });
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, tasks: [{ ...task, status: 'running' }] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, processing: ['missing'] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, tasks: [{ ...task, providerUncertain: true }] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ tasks: [{ ...task, status: 'failed', providerUncertain: true }], queue: [], processing: [], journals: [] }, null).safe, true);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, journals: [{ state: 'pending', leaseToken: 'live', leaseExpiresAt: null, updatedAt: task.updatedAt }] }, null).safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot(snapshot, '2026-10-09T06:00:00.000Z').safe, false);
  assert.equal(deployLock.classifyNativeWorkSnapshot(snapshot, '2026-10-09T08:00:00.000Z').safe, true);
  assert.equal(deployLock.classifyNativeWorkSnapshot({ ...snapshot, tasks: [{ ...task, status: 'succeeded' }], queue: [], processing: [] }, '2026-10-09T06:00:00.000Z').safe, true);
});

test('Native producer pause uses exact identities and infinite daemon stop; timeout, OOM and replacement remain held', async () => {
  const body = deployLockSource.match(/async function pauseNativeProducers\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const id = '1'.repeat(64);
  const modes = [
    { name: 'graceful', accepted: true },
    { name: 'client-timeout', clientTimeout: true },
    { name: 'oom', stopped: { OOMKilled: true } },
    { name: 'nonzero', exitCode: 137 },
    { name: 'replacement', replacement: true },
    { name: 'original-identity-changed', originalIdentityChanged: true },
    { name: 'web-graceful', service: 'web', accepted: true },
    { name: 'worker-graceful', service: 'agentWorker', accepted: true },
    { name: 'web-npm-exit1', service: 'web', exitCode: 1, accepted: true },
    { name: 'api-exit1', exitCode: 1 },
    { name: 'worker-exit1', service: 'agentWorker', exitCode: 1 },
    { name: 'web-wrong-command', service: 'web', exitCode: 1, config: { Cmd: ['npm', 'run', 'dev'] } },
    { name: 'web-extra-command', service: 'web', exitCode: 1, config: { Cmd: ['npm', 'run', 'start', '--'] } },
    { name: 'web-command-string', service: 'web', exitCode: 1, config: { Cmd: 'npm run start' } },
    { name: 'web-wrong-directory', service: 'web', exitCode: 1, config: { WorkingDir: '/opt/openscience' } },
    { name: 'web-wrong-service', service: 'web', exitCode: 1, config: { Labels: { 'com.docker.compose.service': 'api' } } },
    { name: 'web-oom', service: 'web', exitCode: 1, stopped: { OOMKilled: true } },
    { name: 'web-error', service: 'web', exitCode: 1, stopped: { Error: 'stop failed' } },
    { name: 'web-missing-error', service: 'web', exitCode: 1, stopped: { Error: undefined } },
    { name: 'web-null-error', service: 'web', exitCode: 1, stopped: { Error: null } },
    { name: 'web-exit137', service: 'web', exitCode: 137 },
    { name: 'web-exit143', service: 'web', exitCode: 143 },
    { name: 'web-client-timeout', service: 'web', exitCode: 1, clientTimeout: true },
    { name: 'web-replacement', service: 'web', exitCode: 1, replacement: true },
    { name: 'web-still-running', service: 'web', exitCode: 1, stopped: { Running: true } },
    { name: 'web-after-running', service: 'web', exitCode: 1, afterRunning: true },
    { name: 'web-wrong-status', service: 'web', exitCode: 1, stopped: { Status: 'dead' } },
    { name: 'web-original-stopped', service: 'web', exitCode: 1, originalRunning: false },
    { name: 'web-original-running-string', service: 'web', exitCode: 1, originalRunning: 'true' },
  ];
  for (const mode of modes) {
    const calls = []; let inventory = 0;
    const service = mode.service ?? 'api';
    const originalRunning = mode.originalRunning ?? true;
    const config = {
      Labels: { 'com.docker.compose.service': service === 'agentWorker' ? 'agent-worker' : service },
      Cmd: service === 'web' ? ['npm', 'run', 'start'] : ['node', 'dist/index.js'],
      WorkingDir: service === 'web' ? '/opt/openscience/apps/web' : '/opt/openscience',
      ...mode.config,
    };
    const context = {
      invalidNativeState() { throw new Error('held'); },
      async nativeContainers() {
        inventory += 1;
        return { api: null, web: null, agentWorker: null,
          [service]: { Id: mode.replacement && inventory > 1 ? '2'.repeat(64) : id, Config: config,
            State: { Running: inventory === 1 ? originalRunning : Boolean(mode.afterRunning) } } };
      },
      async nativeCommand(command, args, options) {
        calls.push({ command, args, options });
        if (args[0] === 'stop') {
          if (mode.clientTimeout) throw new Error('held');
          return id;
        }
        return JSON.stringify({ Status: 'exited', Running: false, ExitCode: mode.exitCode ?? 0, OOMKilled: false, Error: '', ...mode.stopped });
      },
    };
    const pause = runInNewContext(`${body}; pauseNativeProducers`, context);
    const state = { before: { containers: { api: null, web: null, agentWorker: null,
      [service]: mode.originalIdentityChanged ? '4'.repeat(64) : id } } };
    if (mode.accepted) await assert.doesNotReject(pause(state, true), mode.name);
    else await assert.rejects(pause(state, true), /held/u, mode.name);
    if (mode.originalIdentityChanged) assert.equal(calls.length, 0);
    else if (originalRunning) {
      assert.equal(calls[0].command, 'docker');
      assert.deepEqual(Array.from(calls[0].args), ['stop', '--time', '-1', id]);
      assert.equal(calls[0].options.timeout, 600_000);
    } else assert.equal(calls.some(call => call.args[0] === 'stop'), false);
    assert.equal(calls.some(call => call.args.includes('kill') || call.args.includes('restart')), false);
  }
});

function nativeRecoverySequenceFixture({ webProducer = true } = {}) {
  const candidate = 'b'.repeat(40), before = nativeJournalFixture().before;
  before.producers.web = webProducer;
  const journal = { phase: 'migrating', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: { ...nativeJournalFixture(), before } };
  const containers = Object.fromEntries(['api', 'web', 'agentWorker'].map(service => [service, {
    Id: before.containers[service],
    Config: { Image: service === 'agentWorker' ? `openscience-agent-worker:${journal.rollbackSha}` : 'node:22',
      StopSignal: 'SIGTERM', Labels: { 'com.docker.compose.project': 'openscience-prod', 'com.docker.compose.service': service === 'agentWorker' ? 'agent-worker' : service,
        'com.docker.compose.project.working_dir': `/opt/openscience-releases/${journal.rollbackSha}` },
      Cmd: service === 'web' ? ['npm', 'run', 'start'] : ['node', 'dist/index.js'],
      WorkingDir: `/opt/openscience/apps/${service === 'agentWorker' ? 'agent-worker' : service}`,
      Env: service === 'web' ? [] : ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${before.runtimeId}`,
        `HERMES_NATIVE_SKILL_CATALOGUE_ID=${before.skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'] },
    State: { Running: service !== 'web' || webProducer, Status: service === 'web' && !webProducer ? 'exited' : 'running', ExitCode: 0, OOMKilled: false, Error: '', StartedAt: '2026-10-09T07:00:00.000Z', FinishedAt: '0001-01-01T00:00:00Z' }, RestartCount: 0,
    HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
    Mounts: [{ Type: 'bind', Source: `/opt/openscience-releases/${journal.rollbackSha}`, Destination: '/opt/openscience', RW: false },
      ...(service === 'agentWorker' ? [{ Type: 'bind', Source: '/opt/openscience-hermes/inbox', Destination: '/native-agent/inbox', RW: true }] : [])],
  }]));
  const calls = [], answers = [], faults = { keepWebRunning: false };
  let imageBuilt = false, migrated = false, timerHeld = false;
  const options = { candidateSha: candidate, rollbackSha: journal.rollbackSha };
  const extract = name => {
    const body = deployLockSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
    assert.ok(body, name); return body;
  };
  const queryDeclaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(queryDeclaration);
  const context = {
    process: { env: {} }, NATIVE_ROOT: '/opt/openscience-hermes',
    verifyNativeContainerBinding: deployLock.verifyNativeContainerBinding,
    validateNativeJournalState: deployLock.validateNativeJournalState, transitionNativeJournalState: deployLock.transitionNativeJournalState,
    invalidNativeState() { throw new Error('held'); },
    async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return structuredClone(journal); },
    async writeProductionDeployJournal(value) {
      journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, value.native, candidate, false);
      calls.push(`journal:${journal.nativeRefresh.quiesceState}`);
    },
    async nativeContainers() { return structuredClone(containers); },
    async holdNativeTimer() { timerHeld = true; calls.push('timer-held'); },
    async verifyNativeIdle() { assert.equal(timerHeld, true); calls.push('idle'); },
    async verifyNativeBinding(value) { assert.deepEqual(value, before); calls.push('old-binding'); },
    async open() { calls.push('resource-write'); throw new Error('unexpected resource write'); }, async rm() {}, randomUUID() { return 'fixture'; },
    async nativeCommand(command, args, commandOptions) {
      if (command === 'docker' && args[0] === 'stop') {
        assert.deepEqual(Array.from(args.slice(0, 3)), ['stop', '--time', '-1']);
        assert.equal(commandOptions.timeout, 600_000);
        calls.push('stop');
        for (const container of Object.values(containers).filter(value => value && args.slice(3).includes(value.Id))) {
          if (faults.keepWebRunning && container === containers.web) continue;
          container.State = { Status: 'exited', Running: false, ExitCode: container === containers.web ? 1 : 0, OOMKilled: false, Error: '' };
        }
        return args.slice(3).join('\n');
      }
      if (command === 'docker' && args[0] === 'inspect') return JSON.stringify(Object.values(containers).find(value => value.Id === args.at(-1)).State);
      if (command === 'docker' && args[0] === 'compose') {
        assert.equal(imageBuilt, true); assert.equal(migrated, true);
        assert.equal(commandOptions.env.XGS_RELEASE_IMAGE_TAG, candidate);
        assert.equal(commandOptions.env.XGS_RELEASE_ROOT, `/opt/openscience-releases/${candidate}`);
        assert.equal(args.at(-2), context.NATIVE_WORK_QUERY);
        calls.push(`query:${args.at(-1)}`);
        return JSON.stringify({ safe: answers.shift() ?? true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' });
      }
      if (command === '/usr/bin/python3' && args.includes('--restore-previous')) {
        calls.push('restore');
        return JSON.stringify({ releaseSha: candidate, restored: true, timerDeferred: true, previousRuntimeId: before.runtimeId, previousSkillCatalogueId: before.skillCatalogueId });
      }
      throw new Error(`unexpected command ${command}:${args[0]}`);
    },
  };
  const createdVerifier = deployLockSource.match(/function verifyNeverStartedCandidate\([^)]*\) \{[\s\S]*?\n\}/u)?.[0] ?? '';
  const operation = runInNewContext(`${extract('exactObjectKeys')}\n${queryDeclaration}\n${createdVerifier}\n${extract('pauseNativeProducers')}\n${extract('queryNativeWork')}\n${extract('nativeOperation')}; nativeOperation`, context);
  context.NATIVE_WORK_QUERY = runInNewContext(`${queryDeclaration}; NATIVE_WORK_QUERY`, {});
  const run = command => operation(command, options);
  return {
    journal, containers, calls, answers, faults, run,
    async quiesce() {
      imageBuilt = true; calls.push('image-built');
      await run('native-pause-original');
      assert.equal(journal.nativeRefresh.quiesceState, 'quiesced');
      migrated = true; journal.phase = 'switching'; calls.push('migration-complete');
    },
    async failBeforeInstall() {
      answers.push(false);
      await assert.rejects(run('native-install'), /held/u);
      assert.equal(journal.nativeRefresh.installState, 'not_attempted');
      assert.equal(calls.includes('resource-write'), false);
      assert.ok(calls.indexOf('image-built') < calls.indexOf('stop'));
      assert.ok(calls.indexOf('migration-complete') < calls.findIndex(value => value.startsWith('query:')));
    },
    async installed(checkpoint = null) {
      let state = deployLock.transitionNativeJournalState(journal.nativeRefresh, candidate, 'install-start');
      state = deployLock.transitionNativeJournalState(state, candidate, 'install-complete', { releaseSha: candidate,
        runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true });
      journal.nativeRefresh = state;
      if (checkpoint) {
        this.createCandidate();
        await run('native-before-start');
        assert.equal(journal.nativeRefresh.candidateCheckpoint, checkpoint);
        this.startCandidate();
      }
    },
    createCandidate(services = ['api', 'web', 'agentWorker']) {
        for (const [index, [service, container]] of Object.entries(containers).entries()) {
          if (!services.includes(service)) continue;
          container.Id = String(index + 4).repeat(64);
          container.Config.Image = service === 'agentWorker' ? `openscience-agent-worker:${candidate}` : 'node:22';
          container.Config.Labels['com.docker.compose.project.working_dir'] = `/opt/openscience-releases/${candidate}`;
          container.Config.Env = service === 'web' ? [] : ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${journal.nativeRefresh.installation.runtimeId}`,
            `HERMES_NATIVE_SKILL_CATALOGUE_ID=${journal.nativeRefresh.installation.skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'];
          container.Mounts[0].Source = `/opt/openscience-releases/${candidate}`;
          container.State = { Running: false, Status: 'created', ExitCode: 0, OOMKilled: false, Error: '', StartedAt: '0001-01-01T00:00:00Z', FinishedAt: '0001-01-01T00:00:00Z' };
          container.RestartCount = 0;
          assert.notEqual(container.Id, before.containers[service]);
          deployLock.verifyNativeContainerBinding(container, { service: service === 'agentWorker' ? 'agent-worker' : service,
            releaseSha: candidate, ...journal.nativeRefresh.installation, running: false });
        }
    },
    startCandidate() {
      timerHeld = false;
      for (const container of Object.values(containers)) container.State = {
        Running: true, Status: 'running', ExitCode: 0, OOMKilled: false, Error: '',
        StartedAt: journal.nativeRefresh.candidateCheckpoint, FinishedAt: '0001-01-01T00:00:00Z', Health: { Status: 'healthy' },
      };
    },
    transition(action) { journal.nativeRefresh = deployLock.transitionNativeJournalState(journal.nativeRefresh, candidate, action); },
  };
}

test('Native recovery repeats certified original Web pause after pre-install failure and held rollback', async t => {
  await t.test('pre-install failure then direct recovery rechecks stopped Web1 without a second stop', async () => {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.failBeforeInstall();
    await assert.doesNotReject(fixture.run('native-prepare-rollback'), 'certified original Web1 must remain recoverable');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.journal.nativeRefresh.installState, 'not_attempted');
    assert.equal(fixture.calls.at(-1), 'old-binding');
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 1);
    assert.equal(fixture.calls.includes('restore'), false);
  });
  await t.test('unsafe queries preserve a candidate checkpoint until a safe reentry', async () => {
    const fixture = nativeRecoverySequenceFixture(), checkpoint = '2026-10-09T08:00:00.000Z';
    await fixture.quiesce(); await fixture.installed(checkpoint); fixture.answers.push(false, false, true);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
      assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiescing');
      assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, checkpoint);
      assert.equal(fixture.journal.nativeRefresh.restoreState, 'not_started');
      assert.equal(fixture.calls.filter(value => value === `query:${checkpoint}`).length, attempt + 1,
        'same stopped candidate Web must reach each readonly work check before eventual recovery');
    }
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, checkpoint);
    assert.equal(fixture.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.equal(fixture.calls.filter(value => value === 'restore').length, 1);
    const callsBefore = fixture.calls.length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
    assert.equal(fixture.calls.length, callsBefore, 'completed rollback has no new resume contract');
  });
  await t.test('repeated hold then prepare completes the already-started rollback transition', async () => {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.failBeforeInstall();
    await fixture.run('native-hold-producers');
    const held = JSON.stringify(fixture.journal.nativeRefresh);
    await fixture.run('native-hold-producers');
    assert.equal(JSON.stringify(fixture.journal.nativeRefresh), held);
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiescing');
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.calls.filter(value => value === 'journal:rollback_quiescing').length, 1);
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 1);
    assert.equal(fixture.calls.at(-1), 'old-binding');
  });
  await t.test('candidate hold preserves captured identities through unsafe and safe prepare', async () => {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed('2026-10-09T08:00:00.000Z');
    const ids = structuredClone(fixture.journal.nativeRefresh.candidateContainers);
    await fixture.run('native-hold-producers'); await fixture.run('native-hold-producers');
    fixture.answers.push(false, true);
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiescing');
    assert.deepEqual(fixture.journal.nativeRefresh.candidateContainers, ids);
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.deepEqual(fixture.journal.nativeRefresh.candidateContainers, ids);
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 2);
  });
});

test('Native before-start captures only complete never-started candidate bindings', async () => {
  const fixture = nativeRecoverySequenceFixture();
  await fixture.quiesce(); await fixture.installed(); fixture.createCandidate();
  const ids = Object.fromEntries(Object.entries(fixture.containers).map(([key, container]) => [key, container.Id]));
  await fixture.run('native-before-start');
  assert.deepEqual(fixture.journal.nativeRefresh.candidateContainers, ids);
  assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, '2026-10-09T08:00:00.000Z');
  assert.equal(Object.values(fixture.containers).some(container => container.State.Running), false);
  for (const damage of [
    f => { f.containers.agentWorker = null; },
    f => { f.containers.web.State.Running = true; f.containers.web.State.Status = 'running'; },
    f => { f.containers.api.Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign'; },
    f => { f.containers.agentWorker.Config.Image = `openscience-agent-worker:${'a'.repeat(40)}`; },
    f => { f.containers.web.Mounts[0].Source = '/foreign'; },
  ]) {
    const bad = nativeRecoverySequenceFixture();
    await bad.quiesce(); await bad.installed(); bad.createCandidate(); damage(bad);
    await assert.rejects(bad.run('native-before-start'), /held|Native deployment state/u);
    assert.equal(bad.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(bad.journal.nativeRefresh, 'candidateContainers'), false);
  }
});

test('Native recovery handles full and partial candidate create before a checkpoint without admitting unknown starts', async () => {
  for (const created of [['api', 'web', 'agentWorker'], ['web'], ['api', 'agentWorker']]) {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed(); fixture.createCandidate(created); fixture.answers.push(false);
    await assert.rejects(fixture.run('native-before-start'), /held/u);
    assert.equal(fixture.journal.nativeRefresh.candidateCheckpoint, null);
    assert.equal(Object.hasOwn(fixture.journal.nativeRefresh, 'candidateContainers'), false);
    await fixture.run('native-prepare-rollback');
    assert.equal(fixture.journal.nativeRefresh.quiesceState, 'rollback_quiesced');
    assert.equal(fixture.journal.nativeRefresh.restoreState, 'restored_verified');
    assert.equal(fixture.calls.filter(value => value === 'stop').length, 1, 'created containers must never be stopped as running workloads');
  }
  for (const damage of [
    f => { f.containers.web.State.Status = 'exited'; },
    f => { f.containers.web.State.StartedAt = '2026-10-09T08:00:00.000Z'; },
    f => { f.containers.web.State.FinishedAt = '2026-10-09T08:00:01.000Z'; },
    f => { f.containers.web.RestartCount = 1; },
    f => { f.containers.web.State.Running = true; f.containers.web.State.Status = 'running'; },
    f => { f.containers.web.State.Error = 'failed'; },
    f => { f.containers.web.State.OOMKilled = true; },
    f => { f.containers.web.Config.Labels['com.docker.compose.project.working_dir'] = '/foreign'; },
    f => { f.containers.agentWorker.Config.Image = `openscience-agent-worker:${'a'.repeat(40)}`; },
  ]) {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed(); fixture.createCandidate(); damage(fixture);
    const callsBefore = fixture.calls.length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held|Native deployment state/u);
    assert.equal(fixture.calls.slice(callsBefore).some(value => value === 'stop' || value.startsWith('query:')), false);
  }
});

test('Native saved candidate identities reject every replacement and legacy records cannot infer live identities', async () => {
  for (const role of ['api', 'web', 'agentWorker']) {
    const fixture = nativeRecoverySequenceFixture();
    await fixture.quiesce(); await fixture.installed('2026-10-09T08:00:00.000Z'); fixture.answers.push(false);
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u);
    fixture.containers[role].Id = '9'.repeat(64);
    const callsBefore = fixture.calls.length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u, role);
    assert.equal(fixture.calls.slice(callsBefore).some(value => value === 'stop' || value.startsWith('query:')), false, role);
  }
  const legacy = nativeRecoverySequenceFixture();
  await legacy.quiesce(); await legacy.installed(); legacy.createCandidate();
  legacy.journal.nativeRefresh.candidateCheckpoint = '2026-10-09T08:00:00.000Z'; legacy.startCandidate();
  assert.equal(Object.hasOwn(legacy.journal.nativeRefresh, 'candidateContainers'), false);
  assert.doesNotThrow(() => deployLock.validateNativeJournalState(legacy.journal.nativeRefresh, 'b'.repeat(40)));
  const callsBefore = legacy.calls.length;
  await assert.rejects(legacy.run('native-prepare-rollback'), /held/u);
  assert.equal(legacy.calls.slice(callsBefore).some(value => value === 'stop' || value.startsWith('query:')), false);
});

test('Native recovery refuses unproven Web exits, foreign identities and interrupted resource transitions', async () => {
  const changes = [
    ['before producer false', fixture => { fixture.containers.web.State.ExitCode = 1; }, { webProducer: false }],
    ['old ID replaced', fixture => { fixture.containers.web.Id = '9'.repeat(64); }],
    ['candidate ID', fixture => { fixture.containers.web.Id = '8'.repeat(64); fixture.containers.web.Config.Labels['com.docker.compose.project.working_dir'] = `/opt/openscience-releases/${'b'.repeat(40)}`; }],
    ['API exit1', fixture => { fixture.containers.api.State.ExitCode = 1; }],
    ['Worker exit1', fixture => { fixture.containers.agentWorker.State.ExitCode = 1; }],
    ['Web exit137', fixture => { fixture.containers.web.State.ExitCode = 137; }],
    ['Web exit143', fixture => { fixture.containers.web.State.ExitCode = 143; }],
    ['Web command', fixture => { fixture.containers.web.Config.Cmd = ['npm', 'run', 'dev']; }],
    ['Web directory', fixture => { fixture.containers.web.Config.WorkingDir = '/foreign'; }],
    ['Web service', fixture => { fixture.containers.web.Config.Labels['com.docker.compose.service'] = 'api'; }],
    ['Web error', fixture => { fixture.containers.web.State.Error = 'failed'; }],
    ['Web OOM', fixture => { fixture.containers.web.State.OOMKilled = true; }],
    ['Web still running after stop', fixture => { fixture.containers.web.State.Running = true; fixture.containers.web.State.Status = 'running'; fixture.faults.keepWebRunning = true; }],
    ['install interrupted', fixture => { fixture.transition('install-start'); }],
    ['restore interrupted', async fixture => { await fixture.installed(); fixture.transition('rollback-quiesce-start'); fixture.transition('rollback-quiesce-complete'); fixture.transition('restore-start'); }],
  ];
  for (const [name, change, options] of changes) {
    const fixture = nativeRecoverySequenceFixture(options);
    await fixture.quiesce(); await fixture.failBeforeInstall(); await change(fixture);
    const queriesBefore = fixture.calls.filter(value => value.startsWith('query:')).length;
    await assert.rejects(fixture.run('native-prepare-rollback'), /held|Native deployment state/u, name);
    assert.equal(fixture.calls.filter(value => value.startsWith('query:')).length, queriesBefore, name);
    assert.equal(fixture.calls.includes('restore'), false, name);
  }
  for (const phase of ['not_started', 'quiescing']) {
    const fixture = nativeRecoverySequenceFixture();
    if (phase === 'quiescing') fixture.transition('quiesce-start');
    for (const [service, container] of Object.entries(fixture.containers)) container.State = {
      Status: 'exited', Running: false, ExitCode: service === 'web' ? 1 : 0, OOMKilled: false, Error: '',
    };
    await assert.rejects(fixture.run('native-prepare-rollback'), /held/u, phase);
    assert.equal(fixture.calls.some(value => value.startsWith('query:')), false);
    assert.equal(fixture.calls.includes('restore'), false);
  }
});

test('Native binding rejects stale source, mount, runtime and unhealthy API before producers are permitted', () => {
  const candidate = 'b'.repeat(40), runtimeId = `installed-native-continuation-${candidate}`, skillCatalogueId = `project-catalogue-${candidate}`;
  const expected = { service: 'api', releaseSha: candidate, runtimeId, skillCatalogueId, running: true };
  const container = {
    Config: { Labels: { 'com.docker.compose.service': 'api', 'com.docker.compose.project.working_dir': `/opt/openscience-releases/${candidate}` },
      Env: ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${runtimeId}`, `HERMES_NATIVE_SKILL_CATALOGUE_ID=${skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'] },
    State: { Running: true, Health: { Status: 'healthy' } },
    Mounts: [{ Type: 'bind', Source: `/opt/openscience-releases/${candidate}`, Destination: '/opt/openscience', RW: false }],
  };
  deployLock.verifyNativeContainerBinding(container, expected);
  for (const change of [
    c => { c.Config.Labels['com.docker.compose.project.working_dir'] = '/opt/openscience'; },
    c => { c.Mounts[0].Source = '/opt/openscience'; },
    c => { c.State.Health.Status = 'unhealthy'; },
    c => { c.Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign'; },
    c => { c.Config.Env.push('HERMES_NATIVE_RUNTIME_ID=foreign'); },
  ]) { const changed = structuredClone(container); change(changed); assert.throws(() => deployLock.verifyNativeContainerBinding(changed, expected), /Native deployment state/u); }
});

test('Native actual old-pair capture accepts enabled video flags and rejects cached environment and mounts before journal creation or producer stop', async t => {
  const capture = deployLockSource.match(/async function captureNativeState\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  const inventory = deployLockSource.match(/async function nativeContainers\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  const operation = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(capture && inventory && operation);
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-old-pair-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rollback = 'a'.repeat(40), candidate = 'b'.repeat(40), nativeSha = 'c'.repeat(40);
  const binding = { runtimeId: `installed-native-continuation-${nativeSha}`, skillCatalogueId: `project-catalogue-${nativeSha}` };
  for (const mode of ['matching', 'api-runtime', 'worker-runtime', 'api-catalogue', 'web-mount', 'worker-image', 'worker-inbox', 'working-directory', 'stopped-worker-runtime', 'absent-worker', 'stopped-worker']) {
    const containers = Object.fromEntries(['api', 'web', 'agent-worker'].map((service, index) => [service, {
      Id: String(index + 1).repeat(64),
      Config: { Image: service === 'agent-worker' ? `openscience-agent-worker:${rollback}` : 'node:22', StopSignal: 'SIGTERM',
        Labels: { 'com.docker.compose.project': 'openscience-prod', 'com.docker.compose.service': service, 'com.docker.compose.project.working_dir': `/opt/openscience-releases/${rollback}` },
        Env: service === 'web' ? [] : ['HERMES_NATIVE_AGENT_ENABLED=true', `HERMES_NATIVE_RUNTIME_ID=${binding.runtimeId}`, `HERMES_NATIVE_SKILL_CATALOGUE_ID=${binding.skillCatalogueId}`, 'HERMES_NATIVE_AGENT_MODEL=MiniMax-M3', 'HERMES_NATIVE_AGENT_INBOX=/native-agent/inbox'] },
      HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
      State: { Running: true, Status: 'running', Health: { Status: 'healthy' } },
      Mounts: [{ Type: 'bind', Source: `/opt/openscience-releases/${rollback}`, Destination: '/opt/openscience', RW: false },
        ...(service === 'agent-worker' ? [{ Type: 'bind', Source: '/opt/openscience-hermes/inbox', Destination: '/native-agent/inbox', RW: true }] : [])],
    }]));
    containers['agent-worker'].Config.Env.push('HERMES_VIDEO_ENABLED=true', 'SYNCLIP_VIDEO_ENABLED=true');
    if (mode === 'api-runtime') containers.api.Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign';
    if (['worker-runtime', 'stopped-worker-runtime'].includes(mode)) containers['agent-worker'].Config.Env[1] = 'HERMES_NATIVE_RUNTIME_ID=foreign';
    if (mode === 'api-catalogue') containers.api.Config.Env[2] = 'HERMES_NATIVE_SKILL_CATALOGUE_ID=foreign';
    if (mode === 'web-mount') containers.web.Mounts[0].Source = '/foreign';
    if (mode === 'worker-image') containers['agent-worker'].Config.Image = `openscience-agent-worker:${candidate}`;
    if (mode === 'worker-inbox') containers['agent-worker'].Mounts[1].Source = '/foreign/inbox';
    if (mode === 'working-directory') containers.api.Config.Labels['com.docker.compose.project.working_dir'] = `/opt/openscience-releases/${candidate}`;
    if (['stopped-worker', 'stopped-worker-runtime'].includes(mode)) containers['agent-worker'].State = { Running: false, Status: 'exited' };
    if (mode === 'absent-worker') containers['agent-worker'] = null;
    const reads = [];
    const context = {
      NATIVE_ROOT: '/opt/openscience-hermes', NATIVE_TIMER: 'openscience-hermes-broker.timer',
      validateNativeJournalState: deployLock.validateNativeJournalState,
      verifyNativeContainerBinding: deployLock.verifyNativeContainerBinding,
      invalidNativeState() { throw new Error('Native deployment state is invalid'); },
      async verifyProductionDeployLockOnHost() {}, async nativeBinding() { return binding; }, async verifyNativeBinding(actual) { assert.equal(actual.runtimeId, binding.runtimeId); },
      async nativeCommand(command, args) {
        reads.push(`${command}:${args[0]}`);
        if (command === 'systemctl') {
          if (args[0] === 'show') return 'loaded';
          if (args[0] === 'is-active') return 'active';
          if (args[0] === 'is-enabled') return 'enabled';
        } else if (command === 'docker') {
          if (args[0] === 'ps') return containers[args.at(-1).split('=').at(-1)]?.Id ?? '';
          if (args[0] === 'inspect') return JSON.stringify(Object.values(containers).find(container => container?.Id === args.at(-1)));
        }
        throw new Error('unexpected mutation');
      },
    };
    const run = runInNewContext(`${inventory}\n${capture}\n${operation}; nativeOperation`, context);
    let captured, status = 0;
    const valid = ['matching', 'absent-worker', 'stopped-worker'].includes(mode);
    if (valid) captured = await run('native-capture', { candidateSha: candidate, rollbackSha: rollback });
    else { await assert.rejects(run('native-capture', { candidateSha: candidate, rollbackSha: rollback }), /Native deployment state/u); status = 64; }
    if (valid) {
      const state = JSON.parse(captured);
      assert.deepEqual({ runtimeId: state.before.runtimeId, skillCatalogueId: state.before.skillCatalogueId }, binding);
      assert.equal(state.before.producers.agentWorker, mode === 'matching');
      assert.equal(state.before.containers.agentWorker, mode === 'absent-worker' ? null : '3'.repeat(64));
    }
    assert.equal(reads.some(read => !['docker:ps', 'docker:inspect', 'systemctl:show', 'systemctl:is-active', 'systemctl:is-enabled'].includes(read)), false);
    const trace = join(root, mode).replaceAll('\\', '/');
    const script = ['set -eEuo pipefail', `TRACE='${trace}'; REFRESH_NATIVE_RESOURCES=1; SCRIPT_DIR=/candidate/infra/scripts; DEPLOY_JOURNAL=/unused; RELEASE_SHA=${candidate}; ROLLBACK_SHA=${rollback}`,
      `transaction_native_command(){ printf '%s\\n' '${captured ?? ''}'; return ${status}; }`,
      'node(){ printf "journal\\n" >> "$TRACE"; }; transaction_pause_native_producers(){ printf "stop\\n" >> "$TRACE"; }',
      deploymentFunction('journal_start'), 'journal_start && transaction_pause_native_producers'].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    assert.equal(existsSync(trace), valid);
    if (valid) assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n'), ['journal', 'stop']);
  }
});

test('Native real startup adapter verifies stopped pair then API/Web, timer and Worker in order', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-start-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [target, failure, worker] of [['candidate', '', '1'], ['original', '', '1'], ['candidate', 'native-verify-stopped', '1'], ['candidate', 'native-api-web-ready', '1'], ['candidate', 'native-restore-timer', '1'], ['candidate', '', '0']]) {
    const trace = join(root, `${target}-${failure}-${worker}.log`).replaceAll('\\', '/');
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'; FAIL='${failure}'; WORKER='${worker}'`,
      'RELEASE_ROOT=/candidate; RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; COMPOSE_FILE=/candidate/compose; PROD_ENV=/private',
      'PREVIOUS_RELEASE_ROOT=/original; PREVIOUS_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; ROLLBACK_COMPOSE_FILE=/original/compose; PREVIOUS_RUNTIME_ENV=',
      'run_remote(){ if [[ "$1" = *" create "* ]]; then printf "create\\n" >> "$TRACE"; elif [[ "$1" = *" agent-worker" ]]; then printf "worker\\n" >> "$TRACE"; else printf "api-web\\n" >> "$TRACE"; fi; }',
      'transaction_native_command(){ printf "%s\\n" "$1" >> "$TRACE"; [ "$1" != "$FAIL" ] || return 65; if [ "$1" = native-original-running ]; then if [ "$3" = agent-worker ]; then printf "%s\\n" "$WORKER"; else printf "1\\n"; fi; fi; }',
      deploymentFunction('transaction_start_native_application'),
      `transaction_start_native_application ${target}`,
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    const calls = (await readFile(trace, 'utf8')).trim().split('\n');
    assert.equal(result.status, failure ? 65 : 0, result.stderr);
    assert.equal(calls[0], 'create'); assert.equal(calls[1], 'native-verify-stopped');
    if (failure === 'native-verify-stopped') assert.deepEqual(calls, ['create', failure]);
    else if (failure) {
      assert.equal(calls.at(-1), failure);
      assert.equal(calls.includes('worker'), false);
      if (failure === 'native-api-web-ready') assert.equal(calls.includes('native-restore-timer'), false);
    } else {
      assert.equal(calls.includes('native-before-start'), target === 'candidate');
      assert.ok(calls.indexOf('native-api-web-ready') < calls.indexOf('native-restore-timer'));
      assert.equal(calls.includes('worker'), worker === '1');
      if (worker === '1') assert.ok(calls.indexOf('native-restore-timer') < calls.indexOf('worker'));
      assert.equal(calls.at(-1), 'native-worker-ready');
    }
  }
});

test('Native real rollback adapter checks feasibility before restore and never starts old pair on held recovery', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-rollback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const failure of ['', 'preflight', 'restore']) {
    const trace = join(root, `${failure || 'success'}.log`).replaceAll('\\', '/');
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'; FAIL='${failure}'`,
      'REFRESH_NATIVE_RESOURCES=1; EMBEDDING_DEPLOY=0; PREVIOUS_HAS_EMBEDDING=0; PREVIOUS_HAS_SCANSCI=1; NO_TESTS=1',
      'PREVIOUS_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'PREVIOUS_RELEASE_ROOT=/previous; PREVIOUS_RUNTIME_ENV=; ROLLBACK_COMPOSE_FILE=/previous/compose; PROD_ENV=/private; NGINX_CONF=/nginx; REMOTE_ROOT=/production; RELEASE_ROOT=/candidate',
      'log(){ :; }; run_remote(){ printf "application-command\\n" >> "$TRACE"; }',
      'transaction_preflight_application_rollback(){ printf "preflight\\n" >> "$TRACE"; ROLLBACK_ACTIVE_SHA="$RELEASE_SHA"; [ "$FAIL" != preflight ] || return 70; }',
      'transaction_native_command(){ printf "%s\\n" "$1" >> "$TRACE"; [ "$FAIL" != restore ] || [ "$1" != native-prepare-rollback ] || return 70; }',
      'transaction_restore_scansci_rollback(){ printf "scansci\\n" >> "$TRACE"; }',
      'transaction_start_native_application(){ printf "old-pair-start\\n" >> "$TRACE"; }',
      deploymentFunction('transaction_perform_application_rollback'),
      'transaction_perform_application_rollback',
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    const calls = (await readFile(trace, 'utf8')).trim().split('\n');
    assert.equal(result.status, failure ? 70 : 0, result.stderr);
    assert.equal(calls[0], 'preflight');
    if (failure === 'preflight') assert.deepEqual(calls, ['preflight', 'native-hold-producers']);
    else if (failure === 'restore') assert.deepEqual(calls, ['preflight', 'native-prepare-rollback']);
    else assert.ok(calls.indexOf('native-prepare-rollback') < calls.indexOf('old-pair-start'));
  }
});

test('Native actual rollback feasibility preflight is read-only and refuses reader, stale source and image incompatibility', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const mode of ['healthy', 'reader', 'active', 'source', 'image']) {
    const candidate = join(root, mode, 'candidate'), previous = join(root, mode, 'previous'), trace = join(root, `${mode}.log`).replaceAll('\\', '/');
    await mkdir(candidate, { recursive: true }); await mkdir(previous, { recursive: true });
    if (mode === 'reader') await mkdir(join(candidate, 'infra/migrations/20260913010000_publication_identity'), { recursive: true });
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'; MODE='${mode}'; RELEASE_ROOT='${candidate.replaceAll('\\', '/')}'; PREVIOUS_RELEASE_ROOT='${previous.replaceAll('\\', '/')}'`,
      'PREVIOUS_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; REMOTE_ROOT=/production',
      'run_remote(){ case "$1" in "cat "*) printf "active\\n" >> "$TRACE"; if [ "$MODE" = active ]; then printf "cccccccccccccccccccccccccccccccccccccccc\\n"; else printf "%s\\n" "$RELEASE_SHA"; fi ;; "test "*) printf "source\\n" >> "$TRACE"; [ "$MODE" != source ] ;; "docker image inspect "*) printf "image\\n" >> "$TRACE"; [ "$MODE" != image ] ;; *) printf "unexpected-mutation\\n" >> "$TRACE"; return 90 ;; esac; }',
      deploymentFunction('transaction_preflight_application_rollback'),
      'transaction_preflight_application_rollback',
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    const calls = existsSync(trace) ? (await readFile(trace, 'utf8')).trim().split('\n') : [];
    assert.equal(result.status, mode === 'healthy' ? 0 : ['source', 'image'].includes(mode) ? 71 : 70, result.stderr);
    assert.equal(calls.includes('unexpected-mutation'), false);
    if (mode === 'reader') assert.deepEqual(calls, []);
    if (mode === 'active') assert.deepEqual(calls, ['active']);
    if (mode === 'source') assert.deepEqual(calls, ['active', 'source']);
    if (mode === 'healthy') assert.deepEqual(calls, ['active', 'source', 'image']);
  }
});

test('Native journal CLI rejects unknown fields and malformed JSON without echoing their contents', () => {
  const utility = fileURLToPath(new URL('./production-deploy-lock.mjs', import.meta.url));
  const common = ['journal-start', '--journal', '/opt/openscience/.deploy-transaction.json', '--candidate', 'b'.repeat(40), '--rollback', 'a'.repeat(40), '--phase', 'prepared', '--lock-fd', '9'];
  const sentinel = 'private-content-must-not-appear';
  for (const value of [`{"secret":"${sentinel}"}`, `{"secret":"${sentinel}`, 'x'.repeat(4097)]) {
    const result = spawnSync(process.execPath, [utility, ...common, '--native-state', value], { encoding: 'utf8' });
    assert.equal(result.status, 64);
    assert.match(result.stderr, /Native deployment state/u);
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
  }
  const result = spawnSync(process.execPath, [utility, 'native-restore-timer', '--candidate', 'b'.repeat(40), '--rollback', 'a'.repeat(40), '--lock-fd', '9', '--target', '/arbitrary'], { encoding: 'utf8' });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Native deployment operation failed/u);
});

test('Native work-query loader executes complete imports from Worker without root dependency links', async t => {
  const tempBase = await realpath(tmpdir()), root = await mkdtemp(join(tempBase, 'xgs-native-query-loader-'));
  t.after(async () => {
    const target = await realpath(root);
    assert.equal(dirname(target), tempBase);
    assert.ok(target.startsWith(join(tempBase, 'xgs-native-query-loader-')));
    await rm(target, { recursive: true, force: true });
  });
  const worker = join(root, 'apps/agent-worker'), trace = join(root, 'readonly-calls.log');
  await mkdir(join(root, 'infra/scripts'), { recursive: true });
  await mkdir(worker, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(join(worker, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@openscience/database': 'workspace:*', '@openscience/domain': 'workspace:*' } }));
  await writeFile(join(root, 'infra/scripts/production-deploy-lock.mjs'), deployLockSource);
  const modules = {
    database: `
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
const record=value=>appendFileSync(process.env.XGS_NATIVE_QUERY_TEST_TRACE,value+'\\n');
record('load.database');
export function createPrismaClient(){
 record('db.open');
 return {
  async $queryRawUnsafe(sql){
   assert.match(sql,/^SELECT /);
   if(sql==='SELECT clock_timestamp() AS now'){record('db.clock');return [{now:new Date('2026-10-09T08:00:00.000Z')}];}
   assert.match(sql,/FROM agent_tasks/);record('db.tasks');return [];
  },
  journalJob:{async findMany(options){
   assert.deepEqual(options,{select:{state:true,kind:true,leaseToken:true,leaseExpiresAt:true,updatedAt:true}});
   record('db.journals');return [];
  }},
  async $disconnect(){record('db.close');}
 };
}
export function createRedisClient(){
 record('redis.open');
 return {
  async lrange(key,start,end){
   assert.ok(['fixture:queue','fixture:queue:processing'].includes(key));assert.equal(start,0);assert.equal(end,-1);
   record('redis.lrange:'+key);return [];
  },
  async quit(){record('redis.close');}
 };
}
`,
    domain: `
import {appendFileSync} from 'node:fs';
appendFileSync(process.env.XGS_NATIVE_QUERY_TEST_TRACE,'load.domain\\n');
export const AGENT_TASK_QUEUE='fixture:queue';
export function readNativeAgentExecution(){throw Error('unexpected task in empty readonly fixture');}
`,
  };
  for (const [name, body] of Object.entries(modules)) {
    const directory = join(worker, 'node_modules/@openscience', name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: `@openscience/${name}`, type: 'module', exports: './index.js' }));
    await writeFile(join(directory, 'index.js'), body);
  }
  assert.equal(existsSync(join(root, 'node_modules')), false);
  const env = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', DATABASE_URL: 'fixture-only', REDIS_URL: 'fixture-only', XGS_NATIVE_QUERY_TEST_TRACE: trace };
  const oldEntry = spawnSync(process.execPath, ['--input-type=module', '-e', "import '@openscience/database'; import '@openscience/domain';"], { cwd: root, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(oldEntry.status, 1);
  assert.match(oldEntry.stderr, /ERR_MODULE_NOT_FOUND/u);
  assert.equal(existsSync(trace), false, 'failed root imports must invoke no mock clients');
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const completeQuery = runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {});
  const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', completeQuery, 'none'], { cwd: worker, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.deepEqual(JSON.parse(loaded.stdout), { safe: true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' });
  assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n').sort(), [
    'load.database', 'load.domain', 'db.open', 'redis.open', 'db.tasks', 'db.journals',
    'redis.lrange:fixture:queue', 'redis.lrange:fixture:queue:processing', 'db.clock', 'db.close', 'redis.close',
  ].sort());
});

test('Native query command selects Worker import origin and its real classifier path', async () => {
  const extract = name => {
    const body = deployLockSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
    assert.ok(body); return body;
  };
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const candidate = 'b'.repeat(40), checkpoint = '2026-10-09T07:00:00.000Z';
  const result = { safe: true, nativePending: false, nativeBoundPending: false, dbTime: '2026-10-09T08:00:00.000Z' };
  let calls = 0;
  const query = runInNewContext(`${extract('exactObjectKeys')}\n${declaration}\n${extract('queryNativeWork')}; queryNativeWork`, {
    process: { env: {} }, invalidNativeState() { throw new Error('held'); },
    async nativeCommand(command, args, options) {
      calls += 1;
      assert.equal(command, 'docker');
      assert.equal(args[args.indexOf('-w') + 1], '/opt/openscience/apps/agent-worker');
      assert.equal(args[args.indexOf('--entrypoint') + 1], 'node');
      assert.equal(args[args.indexOf('--entrypoint') + 2], 'agent-worker');
      assert.match(args.at(-2), /import \{classifyNativeWorkSnapshot\} from '\.\.\/\.\.\/infra\/scripts\/production-deploy-lock\.mjs'/u);
      assert.equal(args.at(-1), checkpoint);
      assert.equal(options.env.XGS_RELEASE_ROOT, `/opt/openscience-releases/${candidate}`);
      assert.equal(options.env.XGS_RELEASE_IMAGE_TAG, candidate);
      assert.equal(options.timeout, 120_000);
      return JSON.stringify(result);
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await query(candidate, checkpoint))), result);
  assert.equal(calls, 1);
});

test('Native actual work-query code only reads queues and task markers and returns bounded nonsecret status', async () => {
  const declaration = deployLockSource.match(/const NATIVE_WORK_QUERY = `[\s\S]*?`;/u)?.[0];
  assert.ok(declaration);
  const code = runInNewContext(`${declaration}; NATIVE_WORK_QUERY`, {});
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  for (const [kind, queued, bound] of [['sdf.extract', true, false], ['sdf.extract', true, true], ['sdf.extract', false, true], ['presentation.generate', true, true], ['presentation.generate', false, true]]) {
  const calls = []; let output = '';
  const oldMarker = { kind: 'hermes-agent', profile: 'paper-understanding', runtimeId: `installed-native-continuation-${'c'.repeat(40)}`, skillCatalogueId: `project-catalogue-${'c'.repeat(40)}`, model: 'MiniMax-M3' };
  const context = {
    process: { env: { DATABASE_URL: 'fixture', REDIS_URL: 'fixture' }, argv: ['node', 'none'], stdout: { write(value) { output += value; } } },
    AGENT_TASK_QUEUE: 'agent:queue', classifyNativeWorkSnapshot: deployLock.classifyNativeWorkSnapshot,
    readNativeAgentExecution(result) { return result?.nativeAgentExecution; },
    createPrismaClient() { return {
      async $queryRawUnsafe(sql) {
        calls.push(sql); assert.match(sql, /^SELECT /u);
        if (sql.includes('clock_timestamp')) return [{ now: new Date('2026-10-09T08:00:00.000Z') }];
        assert.ok(sql.includes("jsonb_build_object('nativeAgentExecution',result->'nativeAgentExecution')"));
        return [{ id: 't1', status: 'pending', kind, deleted_at: null, updated_at: new Date('2026-10-09T07:00:00.000Z'), error: null, result: bound ? { nativeAgentExecution: oldMarker } : null }];
      },
      journalJob: { async findMany() { calls.push('journal-read'); return []; } },
      async $disconnect() { calls.push('db-close'); },
    }; },
    createRedisClient() { return { async lrange(key) { calls.push(key); return key.endsWith(':processing') || !queued ? [] : ['t1']; }, async quit() { calls.push('redis-close'); } }; },
  };
  await runInNewContext(`(async()=>{${code.replace(/^import[^\n]+\n/gmu, '')}})()`, context);
  assert.deepEqual(JSON.parse(output), { safe: true, nativePending: true, nativeBoundPending: bound, dbTime: '2026-10-09T08:00:00.000Z' });
  assert.equal(calls.at(-2), 'db-close'); assert.equal(calls.at(-1), 'redis-close');
  assert.equal(output.includes('t1'), false);
  assert.equal(output.includes(oldMarker.runtimeId), false);
  }
});

test('Native actual pause defers candidate-schema reads until migration and install rejects old-bound pending before resource writes', async () => {
  const body = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const candidate = 'b'.repeat(40), installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  for (const [kind, location, bound] of [['sdf.extract', 'queue', true], ['sdf.extract', 'outbox', true], ['presentation.generate', 'queue', true], ['presentation.generate', 'outbox', true], ['search.index', 'queue', false], ['journal.generate', 'outbox', false]]) {
    let journal = { phase: 'migrating', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: nativeJournalFixture() }, migrated = false;
    const calls = [], task = { id: 't1', kind, status: 'pending', deletedAt: null, nativeBound: bound, nativePending: bound, providerUncertain: false, updatedAt: '2026-10-09T07:00:00.000Z' };
    const snapshot = { tasks: kind === 'journal.generate' ? [] : [task], queue: kind !== 'journal.generate' && location === 'queue' ? ['t1'] : [], processing: [], journals: kind === 'journal.generate' ? [{ state: 'pending', kind: 'generate', leaseToken: null, leaseExpiresAt: null, updatedAt: task.updatedAt }] : [] };
    const preserved = JSON.stringify(snapshot);
    const context = {
      validateNativeJournalState: deployLock.validateNativeJournalState, transitionNativeJournalState: deployLock.transitionNativeJournalState,
      invalidNativeState() { throw new Error('Native deployment state held'); },
      async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return structuredClone(journal); },
      async writeProductionDeployJournal(options) { calls.push(`journal:${options.native.installState}:${options.native.quiesceState}`); journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, options.native, candidate, false); },
      async pauseNativeProducers() { calls.push('pause'); }, async holdNativeTimer() { calls.push('timer-hold'); }, async verifyNativeIdle() { calls.push('idle'); },
      async nativeContainers() { return {}; }, async verifyNativeBinding() {},
      async queryNativeWork() {
        calls.push('candidate-db-read'); assert.equal(migrated, true, 'new Prisma must not query the pre-migration database');
        return { ...deployLock.classifyNativeWorkSnapshot(snapshot, null), dbTime: '2026-10-09T08:00:00.000Z' };
      },
      async open() { calls.push('resource-write'); return { async writeFile() {}, async sync() {}, async close() {} }; },
      async rm() {}, randomUUID() { return 'fixture'; },
      async nativeCommand(command) { if (command === '/usr/bin/node') return '{}'; calls.push('installer'); return JSON.stringify(installation); },
    };
    const operation = runInNewContext(`${body}; nativeOperation`, context), options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
    assert.equal(await operation('native-pause-original', options), 'NATIVE_OPERATION_OK');
    assert.equal(calls.includes('candidate-db-read'), false);
    await assert.rejects(operation('native-install', options), /Native deployment state/u);
    assert.equal(calls.includes('candidate-db-read'), false);
    migrated = true; journal.phase = 'switching'; calls.push('migration-complete');
    if (bound) {
      await assert.rejects(operation('native-install', options), /Native deployment state/u);
      assert.equal(journal.nativeRefresh.installState, 'not_attempted');
      assert.equal(calls.includes('resource-write'), false); assert.equal(calls.includes('installer'), false);
      assert.equal(calls.some(call => call.startsWith('journal:install_attempting')), false);
    } else {
      assert.equal(await operation('native-install', options), 'NATIVE_OPERATION_OK');
      assert.ok(calls.indexOf('candidate-db-read') < calls.indexOf('resource-write'));
      assert.ok(calls.indexOf('candidate-db-read') < calls.findIndex(call => call.startsWith('journal:install_attempting')));
    }
    assert.ok(calls.indexOf('migration-complete') < calls.indexOf('candidate-db-read'));
    assert.equal(JSON.stringify(snapshot), preserved, 'pending rows/outbox and queues remain unchanged');
  }
});

test('Native actual installer operation holds interrupted and unpersisted success instead of invoking restore', async () => {
  const body = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const candidate = 'b'.repeat(40), installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  for (const mode of ['success', 'installer-interrupted', 'receipt-persistence-failed', 'foreign-receipt']) {
    const initial = { ...nativeJournalFixture(), quiesceState: 'quiesced' };
    let journal = { phase: 'switching', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: initial };
    const calls = [];
    const context = {
      validateNativeJournalState: deployLock.validateNativeJournalState,
      transitionNativeJournalState: deployLock.transitionNativeJournalState,
      invalidNativeState() { throw new Error('held'); },
      async verifyProductionDeployLockOnHost() {}, async readTrustedJournal() { return structuredClone(journal); },
      async writeProductionDeployJournal(options) {
        calls.push(options.native.installState);
        if (mode === 'receipt-persistence-failed' && options.native.installState === 'installed') throw new Error('held');
        journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, options.native, candidate, false);
      },
      async nativeContainers() { return {}; }, async verifyNativeIdle() { calls.push('idle'); }, async verifyNativeBinding() { calls.push('binding'); },
      async queryNativeWork() { calls.push('work-check'); return { safe: true, nativePending: false, nativeBoundPending: false }; },
      async open() { return { async writeFile() {}, async sync() {}, async close() {} }; },
      async rm() { calls.push('snapshot-cleanup'); }, randomUUID() { return 'fixture'; },
      async nativeCommand(command, args) {
        if (command === '/usr/bin/node') return '{}';
        calls.push('installer');
        assert.ok(args.includes('--defer-timer'));
        if (mode === 'installer-interrupted') throw new Error('held');
        return JSON.stringify(mode === 'foreign-receipt' ? { ...installation, releaseSha: 'd'.repeat(40) } : installation);
      },
    };
    const operation = runInNewContext(`${body}; nativeOperation`, context);
    const options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
    if (mode === 'success') {
      assert.equal(await operation('native-install', options), 'NATIVE_OPERATION_OK');
      assert.equal(journal.nativeRefresh.installState, 'installed');
    } else {
      await assert.rejects(operation('native-install', options), /held|Native deployment state/u);
      assert.equal(journal.nativeRefresh.installState, 'install_attempting');
      await assert.rejects(operation('native-prepare-rollback', options), /held/u);
      assert.equal(calls.filter(call => call === 'installer').length, 1);
    }
    assert.ok(calls.indexOf('install_attempting') < calls.indexOf('installer'));
    assert.ok(calls.includes('snapshot-cleanup'));
  }
});

test('Native actual restore operation records intent and holds partial or unverified restoration', async () => {
  const body = deployLockSource.match(/async function nativeOperation\([^)]*\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(body);
  const candidate = 'b'.repeat(40), installation = { releaseSha: candidate, runtimeId: `installed-native-continuation-${candidate}`, skillCatalogueId: `project-catalogue-${candidate}`, timerDeferred: true };
  for (const mode of ['success', 'restore-interrupted', 'binding-failed', 'restored-receipt-persistence-failed']) {
    let journal = { phase: 'switching', candidateSha: candidate, rollbackSha: 'a'.repeat(40), nativeRefresh: {
      ...nativeJournalFixture(), quiesceState: 'quiesced', installState: 'installed', installation,
      candidateCheckpoint: '2026-10-09T08:00:00.000Z',
    } };
    const calls = [], old = journal.nativeRefresh.before;
    const context = {
      transitionNativeJournalState: deployLock.transitionNativeJournalState,
      invalidNativeState() { throw new Error('held'); }, async verifyProductionDeployLockOnHost() {},
      async readTrustedJournal() { return structuredClone(journal); },
      async writeProductionDeployJournal(options) {
        calls.push(options.native.restoreState);
        if (mode === 'restored-receipt-persistence-failed' && options.native.restoreState === 'restored_verified') throw new Error('held');
        journal.nativeRefresh = deployLock.preserveNativeJournalState(journal, options.native, candidate, false);
      },
      async pauseNativeProducers() { calls.push('pause'); }, async holdNativeTimer() { calls.push('timer-hold'); },
      async verifyNativeIdle() { calls.push('idle'); },
      async queryNativeWork(sha, checkpoint) { assert.equal(checkpoint, journal.nativeRefresh.candidateCheckpoint); calls.push('work-check'); return { safe: true }; },
      async nativeCommand(command, args) {
        assert.ok(args.includes('--restore-previous')); calls.push('restore');
        if (mode === 'restore-interrupted') throw new Error('held');
        return JSON.stringify({ releaseSha: candidate, restored: true, timerDeferred: true, previousRuntimeId: old.runtimeId, previousSkillCatalogueId: old.skillCatalogueId });
      },
      async verifyNativeBinding(binding) {
        assert.equal(binding.runtimeId, old.runtimeId); calls.push('old-binding');
        if (mode === 'binding-failed') throw new Error('held');
      },
    };
    const operation = runInNewContext(`${body}; nativeOperation`, context), options = { candidateSha: candidate, rollbackSha: 'a'.repeat(40) };
    if (mode === 'success') {
      assert.equal(await operation('native-prepare-rollback', options), 'NATIVE_OPERATION_OK');
      assert.equal(journal.nativeRefresh.restoreState, 'restored_verified');
    } else {
      await assert.rejects(operation('native-prepare-rollback', options), /held/u);
      assert.equal(journal.nativeRefresh.restoreState, 'restore_attempting');
      await assert.rejects(operation('native-prepare-rollback', options), /held/u);
    }
    assert.ok(calls.indexOf('pause') < calls.indexOf('restore'));
    assert.ok(calls.indexOf('work-check') < calls.indexOf('restore'));
    assert.ok(calls.indexOf('restore_attempting') < calls.indexOf('restore'));
    assert.equal(calls.filter(call => call === 'restore').length, 1);
  }
});

test('Native quiesce persists switching before stopping producers and prepared uncertainty retains its journal', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-phase-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const trace = join(root, 'trace').replaceAll('\\', '/');
  const setup = ['set -eEuo pipefail', `TRACE='${trace}'`, transactionStateSource,
    'transaction_initialize_state; REFRESH_NATIVE_RESOURCES=1; TRANSACTION_PHASE=prepared',
    'transaction_journal_update(){ printf "phase:%s\\n" "$1" >> "$TRACE"; }',
    'transaction_pause_native_producers(){ printf "pause:%s\\n" "$TRANSACTION_PHASE" >> "$TRACE"; }',
  ];
  let result = spawnSync(bash, ['-c', [...setup, 'transaction_quiesce_native_refresh', 'trap - HUP INT TERM'].join('\n')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n'), ['phase:switching', 'pause:switching']);
  result = spawnSync(bash, ['-c', [...setup,
    'TRANSACTION_NATIVE_STARTED=1; TRANSACTION_JOURNAL_ACTIVE=1',
    'transaction_assert_lock(){ return 0; }; transaction_journal_clear(){ printf "cleared\\n" >> "$TRACE"; }',
    'transaction_rollback_application 143',
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(result.status, 70);
  assert.match(result.stderr, /ROLLBACK_FAILED_NATIVE_UNCERTAIN/u);
  assert.equal((await readFile(trace, 'utf8')).includes('cleared'), false);
});

test('Native real journal preserves metadata on phase updates and refuses clearing interrupted installation under FD9', async t => {
  if (process.platform === 'win32' || spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('Linux CI executes the real Native inherited-FD atomic-journal behavior'); return;
  }
  const root = await mkdtemp(join(tmpdir(), 'xgs-native-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockDirectory = join(root, 'private'), journalPath = join(root, 'journal.json'), helperPath = join(root, 'helper.mjs');
  const fixture = nativeJournalFixture(), candidateSha = 'b'.repeat(40), rollbackSha = 'a'.repeat(40);
  const helper = `
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {writeProductionDeployJournal,clearProductionDeployJournal} from ${JSON.stringify(new URL('./production-deploy-lock.mjs', import.meta.url).href)};
const original=${JSON.stringify(fixture)};
const common=${JSON.stringify({ lockDirectory, journalPath, candidateSha, rollbackSha, requiredUid: process.getuid(), lockFd: 9 })};
await writeProductionDeployJournal({...common,phase:'prepared',create:true,native:original});
await writeProductionDeployJournal({...common,phase:'switching',create:false});
assert.deepEqual(JSON.parse(await readFile(common.journalPath,'utf8')).nativeRefresh,original);
await assert.rejects(writeProductionDeployJournal({...common,candidateSha:'c'.repeat(40),phase:'switching',create:false}),/another transaction/);
const quiescing={...original,quiesceState:'quiescing'};
await writeProductionDeployJournal({...common,phase:'switching',create:false,native:quiescing});
const quiesced={...quiescing,quiesceState:'quiesced'};
await writeProductionDeployJournal({...common,phase:'switching',create:false,native:quiesced});
const attempted={...quiesced,installState:'install_attempting'};
await writeProductionDeployJournal({...common,phase:'switching',create:false,native:attempted});
await writeProductionDeployJournal({...common,phase:'published',create:false});
assert.deepEqual(JSON.parse(await readFile(common.journalPath,'utf8')).nativeRefresh,attempted);
await assert.rejects(clearProductionDeployJournal(common),/uncertain; journal retained/);
assert.equal((await stat(common.journalPath)).mode & 0o777,0o600);
process.stdout.write('NATIVE_JOURNAL_PRESERVED\\n');
`;
  await writeFile(helperPath, helper);
  const result = spawnSync(bash, ['-c', transactionLockHarness(lockDirectory, process.getuid(), `node '${helperPath}'`)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'NATIVE_JOURNAL_PRESERVED');
  assert.deepEqual(JSON.parse(await readFile(journalPath, 'utf8')).nativeRefresh.before, fixture.before);
});

function deploymentFunction(name) {
  const body = transactionSource.match(new RegExp(`${name}\\(\\) \\{[\\s\\S]*?\\n\\}`, 'u'))?.[0];
  assert.ok(body, `${name} production function is missing`);
  return body;
}

test('production commit publishes durable rollback identity before exact retention', () => {
  const preflight = transactionSource.indexOf('production-release-retention.mjs" preflight');
  const sameSha = transactionSource.indexOf('if [ "$ACTIVE_RELEASE_SHA" = "$RELEASE_SHA" ]');
  const backupRefresh = transactionSource.indexOf('backup.sh.next');
  const prepare = transactionSource.indexOf('production-release-retention.mjs" prepare');
  const commit = transactionSource.lastIndexOf('transaction_commit');
  const complete = transactionSource.indexOf('production-release-retention.mjs" complete');
  const unlock = transactionSource.indexOf('exec 9>&-');
  assert.ok(preflight > 0 && preflight < sameSha, 'rollback identity must be checked before same-SHA exit');
  assert.ok(prepare > backupRefresh && prepare < commit, 'pending intent must follow acceptance and precede commit');
  assert.ok(complete > commit && complete < unlock, 'post-commit retention must finish under inherited FD9');
  assert.match(transactionStateSource, /transaction_abort_rollback_intent[\s\S]*transaction_journal_clear/u);
  assert.doesNotMatch(retentionSource, /docker\s+(?:system|image|volume|builder)\s+prune/u);
});

test('normal publication prunes inactive releases only after acceptance and keeps committed cleanup failure visible', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-retention-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const begin = transactionSource.indexOf('node "$SCRIPT_DIR/production-release-retention.mjs" prepare');
  const end = transactionSource.indexOf('exec 9>&-', begin);
  assert.ok(begin > 0 && end > begin);
  const finish = transactionSource.slice(begin, end);
  for (const mode of ['success', 'prepare-failed', 'complete-failed']) {
    const trace = join(root, `${mode}.txt`).replaceAll('\\', '/');
    const script = [
      'set -eEuo pipefail', `TRACE='${trace}'`, `MODE='${mode}'`,
      'SCRIPT_DIR=/unused; RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; PREVIOUS_RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'node() {',
      '  local phase="$2"; shift 2',
      '  if [ "$phase" = prepare ]; then',
      '    local prune=0; while [ "$#" -gt 0 ]; do [ "$1" != --prune-unused ] || prune="$2"; shift 2; done',
      '    [ "$prune" = 1 ] || return 65',
      '    printf "%s\\n" prepare >> "$TRACE"',
      '    [ "$MODE" != prepare-failed ] || return 66',
      '  else',
      '    printf "%s\\n" complete >> "$TRACE"',
      '    [ "$MODE" != complete-failed ] || return 78',
      '  fi',
      '}',
      'transaction_commit() { printf "%s\\n" commit >> "$TRACE"; }',
      finish,
    ].join('\n');
    const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
    const observed = existsSync(trace) ? (await readFile(trace, 'utf8')).trim().split('\n') : [];
    if (mode === 'success') {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(observed, ['prepare', 'commit', 'complete']);
    } else if (mode === 'prepare-failed') {
      assert.equal(result.status, 66, result.stderr);
      assert.deepEqual(observed, ['prepare']);
    } else {
      assert.equal(result.status, 78, result.stderr);
      assert.deepEqual(observed, ['prepare', 'commit', 'complete']);
      assert.match(result.stderr, /DEPLOY_COMMITTED_RETENTION_PENDING/u);
    }
  }
});
const workerDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile', import.meta.url), 'utf8');
const parserDockerfile = readFileSync(new URL('../../apps/agent-worker/Dockerfile.parser', import.meta.url), 'utf8');
const productionCompose = readFileSync(new URL('../compose/docker-compose.prod.yml', import.meta.url), 'utf8');
const developmentCompose = readFileSync(new URL('../compose/docker-compose.dev.yml', import.meta.url), 'utf8');

function webReadinessCode() {
  const web = productionCompose.split('\n  web:')[1]?.split('\nnetworks:')[0] ?? '';
  const check = web.match(/test:\s*(\[.*\])/u)?.[1];
  assert.ok(check, 'Compose wait must check actual Web HTTP readiness');
  const [kind, executable, option, code] = JSON.parse(check);
  assert.deepEqual([kind, executable, option], ['CMD', 'node', '-e']);
  return code;
}

test('public status acceptance reports the observed status and transport outcome while still denying failure', () => {
  const run = (status, curlExit) => spawnSync(bash, ['-c', [
    `curl() { printf '%s' '${status}'; return ${curlExit}; }; export -f curl`,
    deploymentFunction('run_remote'), deploymentFunction('expect_http_status'),
    "expect_http_status 'https://public.invalid/' '200'",
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(run(200, 0).status, 0);
  const mismatch = run(502, 0); assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /url=https:\/\/public\.invalid\/ observed=502 expected=200 curl_exit=0/u);
  const unavailable = run('000', 28); assert.notEqual(unavailable.status, 0);
  assert.match(unavailable.stderr, /observed=000 expected=200 curl_exit=28/u);
});

test('exact public release acceptance reports only an observed SHA or length, never the response body', () => {
  const expected = 'a'.repeat(40);
  const run = body => spawnSync(bash, ['-c', [
    `curl() { printf '%s' '${body}'; }; export -f curl`,
    deploymentFunction('run_remote'), deploymentFunction('expect_http_body'),
    `expect_http_body 'https://public.invalid/__release' '${expected}'`,
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(run(expected).status, 0);
  const different = run('b'.repeat(40)); assert.notEqual(different.status, 0);
  assert.match(different.stderr, new RegExp(`observed=${'b'.repeat(40)} expected=${expected}`, 'u'));
  const unexpected = run('UNEXPECTED_RESPONSE_CONTENT'); assert.notEqual(unexpected.status, 0);
  assert.match(unexpected.stderr, /observed=not-sha/u);
  assert.doesNotMatch(unexpected.stderr, /UNEXPECTED_RESPONSE_CONTENT/u);
});

async function runWebReadiness(origin, options = {}) {
  const calls = [];
  const outcome = new Promise(resolve => {
    runInNewContext(webReadinessCode(), {
      fetch: (url, init) => {
        const requested = new URL(url);
        assert.equal(requested.origin, 'http://127.0.0.1:3000');
        assert.equal(requested.pathname, '/');
        calls.push({ url, init });
        return fetch(origin + requested.pathname, init);
      },
      AbortSignal: options.signal ?? AbortSignal,
      process: { exit: resolve },
    });
  });
  return { exit: await outcome, calls };
}

test('Web readiness rejects an HTTP server that is running but not ready, then accepts its actual homepage', async t => {
  let status = 503;
  const server = createServer((_request, response) => { response.writeHead(status); response.end(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await runWebReadiness(origin)).exit, 1);
  status = 200;
  assert.equal((await runWebReadiness(origin)).exit, 0);
});

test('Web readiness does not hide a redirect behind a successful destination', async t => {
  const routes = [];
  const server = createServer((request, response) => {
    routes.push(request.url);
    response.writeHead(request.url === '/' ? 302 : 200, request.url === '/' ? { location: '/ready' } : {}); response.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await runWebReadiness(`http://127.0.0.1:${server.address().port}`)).exit, 1);
  assert.deepEqual(routes, ['/']);
});

test('Web readiness bounds an unresponsive HTTP request and denies connection failure', async t => {
  const server = createServer(() => {}); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const result = await runWebReadiness(origin, { signal: { timeout: ms => {
    assert.ok(ms > 0 && ms < 5000, 'native request deadline must fit the healthcheck timeout');
    return AbortSignal.timeout(10);
  } } });
  assert.equal(result.exit, 1);
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.equal((await runWebReadiness(origin)).exit, 1);
});
const cloudSync = readFileSync(new URL('../../scripts/cloud-sync.mjs', import.meta.url), 'utf8');
const releaseSyncCommand = readFileSync(new URL('../../scripts/release-sync-command.mjs', import.meta.url), 'utf8');
const backup = readFileSync(new URL('./backup.sh', import.meta.url), 'utf8');
const sshRun = readFileSync(new URL('./ssh-run.sh', import.meta.url), 'utf8');
const backupRunbook = readFileSync(new URL('../../docs/runbooks/backup-restore.md', import.meta.url), 'utf8');
const embeddingDockerfile = readFileSync(new URL('../../apps/embedding-worker/Dockerfile', import.meta.url), 'utf8');
const embeddingRequirements = readFileSync(new URL('../../apps/embedding-worker/requirements.lock', import.meta.url), 'utf8');
const embeddingEvaluatorDockerfile = readFileSync(new URL('../embedding-candidates/bge-m3/Dockerfile', import.meta.url), 'utf8');
const squidConfig = readFileSync(new URL('../squid/openscience-egress.conf', import.meta.url), 'utf8');
const atomicSquidConfig = readFileSync(new URL('./atomic-squid-config.mjs', import.meta.url), 'utf8');
const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : '/bin/bash';

function composeService(name, nextName, compose = productionCompose) {
  const start = compose.indexOf(`\n  ${name}:`);
  assert.ok(start >= 0, `${name} service is missing`);
  const end = nextName ? compose.indexOf(`\n  ${nextName}:`, start + 1) : compose.indexOf('\nnetworks:', start + 1);
  assert.ok(end > start, `${name} service boundary is missing`);
  return compose.slice(start, end);
}

test('ScanSci controlled egress is private to the fixed retrieval subnet', () => {
  assert.match(squidConfig, /^http_port 127\.0\.0\.1:7891 name=loopback_listener$/mu);
  assert.match(squidConfig, /^http_port 172\.24\.0\.1:7891 name=scansci_listener$/mu);
  assert.match(squidConfig, /^acl scansci_retrieval src 172\.24\.0\.0\/24$/mu);
  assert.match(
    squidConfig,
    /^acl scansci_parent_domains dstdomain \.arxiv\.org \.elsevier\.com \.sciencedirect\.com \.sciencedirectassets\.com \.carsi\.edu\.cn \.zju\.edu\.cn$/mu,
  );
  assert.equal([...squidConfig.matchAll(/^acl scansci_parent_domains\b.*$/gmu)].length, 1);
  assert.match(squidConfig, /^http_access deny scansci_retrieval !CONNECT$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval !SSL_ports$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval blocked_ipv4$/mu);
  assert.match(squidConfig, /^http_access deny scansci_retrieval blocked_ipv6$/mu);
  assert.match(squidConfig, /^http_access allow scansci_retrieval scansci_listener CONNECT SSL_ports$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel allow loopback$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel allow scansci_retrieval scansci_parent_domains$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel deny scansci_retrieval$/mu);
  assert.match(squidConfig, /^cache_peer_access home_tunnel deny all$/mu);
  assert.match(squidConfig, /^always_direct allow scansci_retrieval !scansci_parent_domains$/mu);
  assert.doesNotMatch(squidConfig, /^cache_peer_access home_tunnel allow all$/mu);
  assert.doesNotMatch(squidConfig, /^http_port (?:0\.0\.0\.0|\[::\]):7891$/mu);
  assert.doesNotMatch(squidConfig, /172\.26\.0\.|scansci_browser|browser_listener/u);
  assert.doesNotMatch(`${productionCompose}\n${developmentCompose}`, /browser_net|auth_net|scansci-(?:auth|legal|browser|secret-init)/u);
  assert.ok(squidConfig.indexOf('http_access allow scansci_retrieval scansci_listener CONNECT SSL_ports') < squidConfig.indexOf('http_access deny all'));
});

test('candidate capability stays absent through prepublication and is exact-cleaned on either publish failure boundary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-candidate-capability-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const oldSha = 'a'.repeat(40);
  const candidateSha = 'b'.repeat(40);
  const statePath = transactionStatePath.replaceAll('\\', '/');
  const run = async (name, mode) => {
    const fixture = join(root, name);
    const remote = join(fixture, 'remote');
    const capabilities = join(remote, '.release-capabilities');
    await mkdir(capabilities, { recursive: true });
    await writeFile(join(remote, '.release-id'), `${oldSha}\n`);
    const shell = [
      'set -eEuo pipefail',
      `source '${statePath}'`,
      `REMOTE_ROOT='${remote.replaceAll('\\', '/')}'`,
      `RELEASE_CAPABILITIES_DIR='${capabilities.replaceAll('\\', '/')}'`,
      `RELEASE_SHA='${candidateSha}'`, `PREVIOUS_RELEASE_SHA='${oldSha}'`,
      `DEPLOY_JOURNAL='${join(remote, '.deploy-transaction').replaceAll('\\', '/')}'`,
      `XGS_TEST_PUBLISH_MODE='${mode}'`,
      'CANDIDATE_CAPABILITY="$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA"',
      'transaction_assert_lock(){ :; }',
      'transaction_journal_start(){ : > "$DEPLOY_JOURNAL"; }',
      'transaction_journal_update(){ printf "%s\\n" "$1" > "$DEPLOY_JOURNAL"; }',
      'transaction_journal_clear(){ rm -- "$DEPLOY_JOURNAL"; }',
      'transaction_journal_clear_after_rollback(){ [ ! -e "$DEPLOY_JOURNAL" ] || rm -- "$DEPLOY_JOURNAL"; }',
      'transaction_abort_rollback_intent(){ :; }',
      'transaction_perform_application_rollback(){ printf "%s\\n" "$PREVIOUS_RELEASE_SHA" > "$REMOTE_ROOT/.release-id"; }',
      'transaction_cleanup_candidate_capability(){ [ "$(cat "$REMOTE_ROOT/.release-id")" = "$PREVIOUS_RELEASE_SHA" ]; rm -f -- "$CANDIDATE_CAPABILITY" "$CANDIDATE_CAPABILITY.next"; }',
      'transaction_publish_capability_and_cas(){ [ ! -e "$CANDIDATE_CAPABILITY" ]; printf "schema=3\\n" > "$CANDIDATE_CAPABILITY.next"; mv "$CANDIDATE_CAPABILITY.next" "$CANDIDATE_CAPABILITY"; [ "$XGS_TEST_PUBLISH_MODE" != before-cas ] || return 65; [ "$(cat "$REMOTE_ROOT/.release-id")" = "$PREVIOUS_RELEASE_SHA" ]; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id"; }',
      'transaction_initialize_state', 'transaction_install_traps', 'transaction_begin',
      'transaction_mark_phase switching', '[ ! -e "$CANDIDATE_CAPABILITY" ]',
      'transaction_publish_candidate',
      '[ "$XGS_TEST_PUBLISH_MODE" != after-publish ] || false',
      'transaction_commit',
    ].join('\n');
    const result = spawnSync(bash, ['-c', shell], { encoding: 'utf8' });
    return { result, remote, capability: join(capabilities, candidateSha) };
  };

  const success = await run('success', 'success');
  assert.equal(success.result.status, 0, success.result.stderr);
  assert.equal((await readFile(join(success.remote, '.release-id'), 'utf8')).trim(), candidateSha);
  assert.equal(await readFile(success.capability, 'utf8'), 'schema=3\n');

  for (const mode of ['before-cas', 'after-publish']) {
    const failed = await run(mode, mode);
    assert.notEqual(failed.result.status, 0, `${mode} unexpectedly succeeded`);
    assert.equal((await readFile(join(failed.remote, '.release-id'), 'utf8')).trim(), oldSha);
    assert.equal(existsSync(failed.capability), false, `${mode} left a candidate capability sidecar`);
    assert.equal(existsSync(`${failed.capability}.next`), false, `${mode} left a candidate capability staging file`);
  }
});

test('protected rollback sidecar survives candidate rejection and cleanup byte-for-byte', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-protected-capability-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const activeSha = 'a'.repeat(40);
  const protectedSha = 'b'.repeat(40);
  const remote = join(root, 'remote');
  const capabilities = join(remote, '.release-capabilities');
  const activeMarker = join(remote, '.release-id');
  const rollbackMarker = join(remote, '.rollback-id');
  const protectedSidecar = join(capabilities, protectedSha);
  await mkdir(capabilities, { recursive: true });
  await writeFile(activeMarker, `${activeSha}\n`);
  await writeFile(rollbackMarker, `${protectedSha}\n`);
  await writeFile(protectedSidecar, 'schema=3\nprotected=rollback\n');

  const shell = [
    'set -eEuo pipefail',
    `REMOTE_ROOT='${remote.replaceAll('\\', '/')}'`,
    `RELEASE_CAPABILITIES_DIR='${capabilities.replaceAll('\\', '/')}'`,
    `RELEASE_SHA='${protectedSha}'`,
    `PREVIOUS_RELEASE_SHA='${activeSha}'`,
    'run_remote(){ bash -c "$1"; }',
    deploymentFunction('transaction_prepare_candidate_capability'),
    deploymentFunction('transaction_cleanup_candidate_capability'),
    'if transaction_prepare_candidate_capability; then exit 99; fi',
    'transaction_cleanup_candidate_capability',
  ].join('\n');
  const result = spawnSync(bash, ['-c', shell], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(activeMarker, 'utf8'), `${activeSha}\n`);
  assert.equal(await readFile(rollbackMarker, 'utf8'), `${protectedSha}\n`);
  assert.equal(await readFile(protectedSidecar, 'utf8'), 'schema=3\nprotected=rollback\n');
});

test('failed candidate CAS cleans only the sidecar created by the real publish path', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-owned-capability-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const activeSha = 'a'.repeat(40);
  const candidateSha = 'b'.repeat(40);
  const remote = join(root, 'remote');
  const releaseRoot = join(root, 'release');
  const capabilities = join(remote, '.release-capabilities');
  const helper = join(releaseRoot, 'infra', 'scripts', 'production-deploy-lock.mjs');
  await mkdir(capabilities, { recursive: true });
  await mkdir(join(releaseRoot, 'infra', 'scripts'), { recursive: true });
  await writeFile(join(remote, '.release-id'), `${activeSha}\n`);
  await writeFile(helper, 'process.exitCode = 65;\n');

  const publish = deploymentFunction('transaction_publish_capability_and_cas')
    .replaceAll('/usr/bin/node', 'node');
  const shell = [
    'set -eEuo pipefail',
    `REMOTE_ROOT='${remote.replaceAll('\\', '/')}'`,
    `RELEASE_ROOT='${releaseRoot.replaceAll('\\', '/')}'`,
    `RELEASE_CAPABILITIES_DIR='${capabilities.replaceAll('\\', '/')}'`,
    `RELEASE_SHA='${candidateSha}'`, `ROLLBACK_SHA='${activeSha}'`,
    `PREVIOUS_RELEASE_SHA='${activeSha}'`,
    `BGE_M3_DEPLOY_VALUE='false'`, `BGE_M3_ENABLED_VALUE='false'`,
    `BGE_M3_MODEL_VERSION_ID=''`, `BGE_M3_MODEL_REVISION=''`,
    `BGE_M3_SOURCE_SHA256=''`, `BGE_M3_PACKAGE_FREEZE_SHA256=''`, `BGE_M3_MODEL_MANIFEST_SHA256=''`,
    `FINAL_SCANSCI_MCP_IMAGE_ID='sha256:${'f'.repeat(64)}'`,
    'run_remote(){ bash -c "$1"; }',
    deploymentFunction('transaction_prepare_candidate_capability'),
    publish,
    deploymentFunction('transaction_cleanup_candidate_capability'),
    'transaction_prepare_candidate_capability',
    'if transaction_publish_capability_and_cas; then exit 99; fi',
    '[ "$CANDIDATE_CAPABILITY_CREATED" -eq 1 ]',
    'transaction_cleanup_candidate_capability',
    '[ ! -e "$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA" ]',
    '[ ! -e "$CANDIDATE_CAPABILITY_STAGING" ]',
  ].join('\n');
  const result = spawnSync(bash, ['-c', shell], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('SSH runner does not misclassify a remote permission error as key authentication failure', () => {
  assert.match(sshRun, /\[ \$rc -eq 255 \]/u);
  assert.match(sshRun, /permission denied \\?\([^)]*(?:publickey|password|keyboard-interactive)[^)]*\\?\)/iu);
  assert.doesNotMatch(sshRun, /permission denied\|host key verification/iu);
});

function observeSignalFixture(child) {
  const state = { output: '', closed: false, error: null, exit: { code: null, signal: null } };
  const checks = new Set();
  const notify = () => { for (const check of checks) check(); };
  const onError = (error) => { state.error = error.message; notify(); };
  child.stderr.on('data', (chunk) => { state.output += chunk.toString(); notify(); });
  child.stderr.on('error', onError);
  child.stdin?.on('error', onError);
  child.on('error', onError);
  child.once('close', (code, signal) => { state.closed = true; state.exit = { code, signal }; notify(); });
  const wait = (ready, label, failEarly = true) => new Promise((resolvePromise, rejectPromise) => {
    let timeout;
    const finish = (reason) => {
      clearTimeout(timeout);
      checks.delete(check);
      if (reason) rejectPromise(new Error(`${label} ${reason}; output=${JSON.stringify(state.output)}; exit=${JSON.stringify(state.exit)}; spawnError=${JSON.stringify(state.error)}`));
      else resolvePromise(state.output);
    };
    const check = () => {
      if (ready()) finish();
      else if (failEarly && (state.closed || state.error)) finish('closed or failed before readiness');
    };
    timeout = setTimeout(() => finish('timed out'), 5000);
    checks.add(check);
    check();
  });
  const waitForExit = async (label = 'fixture exit') => {
    await wait(() => state.closed, label, false);
    return state.exit;
  };
  return {
    child,
    waitFor: (pattern, label) => wait(() => pattern.test(state.output), label),
    waitForExit,
    stop: async () => {
      if (!state.closed && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      child.stdin?.destroy();
      await waitForExit('fixture cleanup');
    },
  };
}

test('Tesseract is packaged only in the isolated document parser image', () => {
  assert.doesNotMatch(workerDockerfile, /tesseract(?:-ocr)?/i);
  assert.match(parserDockerfile, /tesseract-ocr/);
  assert.match(parserDockerfile, /USER node/);
  assert.match(workerDockerfile, /LABEL org\.openscience\.source=\$XGS_RELEASE_IMAGE_TAG/);
  assert.match(parserDockerfile, /LABEL org\.openscience\.source=\$XGS_RELEASE_IMAGE_TAG/);
  const releaseImages = `${composeService('agent-worker', 'scansci-mcp')}\n${composeService('document-parser', 'embedding-model-init')}`;
  assert.equal(releaseImages.match(/XGS_RELEASE_IMAGE_TAG: \$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/g)?.length, 2);
});

test('production search runtime is isolated, bounded and source locked', () => {
  const api = productionCompose.split('\n  api:')[1]?.split('\n  malware-scanner:')[0] ?? '';
  const agentWorker = productionCompose.split('\n  agent-worker:')[1]?.split('\n  document-parser:')[0] ?? '';
  const embeddingInit = productionCompose.split('\n  embedding-model-init:')[1]?.split('\n  embedding-worker:')[0] ?? '';
  const embeddingWorker = productionCompose.split('\n  embedding-worker:')[1]?.split('\n  web:')[0] ?? '';
  assert.match(productionCompose, /embedding-model-init:/);
  assert.match(embeddingInit, /profiles:\s*\["embedding"\]/);
  assert.match(embeddingWorker, /profiles:\s*\["embedding"\]/);
  assert.match(embeddingWorker, /read_only: true/);
  assert.match(embeddingWorker, /user: "10001:10001"/);
  assert.match(embeddingWorker, /pids_limit: 128/);
  assert.match(embeddingWorker, /mem_limit: 6g/);
  assert.match(embeddingWorker, /cpus: 2/);
  assert.match(embeddingWorker, /cap_drop:[\s\S]*- ALL/);
  assert.match(embeddingWorker, /no-new-privileges:true/);
  assert.doesNotMatch(embeddingWorker, /env_file:|ports:|data_net/);
  assert.match(embeddingInit + embeddingWorker, /network: host/);
  assert.match(embeddingInit + embeddingWorker, /http:\/\/127\.0\.0\.1:7891/);
  assert.match(
    embeddingInit + embeddingWorker,
    /bge-m3-5617a9f61b028005a4858fdac845db406aefb181-08cc5a668e89:\/models\/bge-m3/,
  );
  assert.match(api, /EMBEDDING_WORKER_URL: http:\/\/embedding-worker:8080/u);
  assert.match(api, /networks:[\s\S]*- embedding_net/u);
  assert.doesNotMatch(agentWorker, /embedding-worker:\s*\n\s*condition:/);
  assert.match(productionCompose, /embedding_net:[\s\S]*internal: true/);
  assert.match(source, /build agent-worker document-parser/);
  assert.match(source, /EMBEDDING_DEPLOY=/);
  assert.match(source, /--profile embedding/);
  assert.match(source, /if \[ "\$EMBEDDING_DEPLOY" -eq 1 \]/);
  assert.match(transactionSource, /migrate status --schema \/opt\/openscience\/infra\/search\/schema\.prisma/u);
  assert.match(source, /scripts\/register-search-model\.mjs/);
  assert.ok(
    source.indexOf('scripts/register-search-model.mjs') < source.indexOf('初始化并验证 BGE-M3 模型卷'),
    'the exact search model identity must be registered before the embedding worker switch',
  );
  assert.match(transactionSource, /node scripts\/verify-embedding-runtime\.mjs/u);
  assert.match(transactionSource, /model-init\.py --validate --seed \/opt\/bge-m3-seed --target \/models\/bge-m3/u);
});

test('embedding Python supply chain is complete, immutable and hash enforced', () => {
  const requirementLines = embeddingRequirements
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('--'));
  assert.ok(requirementLines.length >= 60, 'the complete resolved package set must be locked');
  assert.ok(requirementLines.every((line) => /--hash=sha256:[0-9a-f]{64}|#sha256=[0-9a-f]{64}/.test(line)));
  assert.match(embeddingDockerfile, /--require-hashes/);
  assert.match(embeddingDockerfile, /--no-deps/);
  assert.match(embeddingDockerfile, /--only-binary=:all:/);
  assert.doesNotMatch(embeddingEvaluatorDockerfile, /COPY --chmod/);
  assert.match(embeddingEvaluatorDockerfile, /RUN chmod 0555 \/app\/runner\.py/);
  assert.match(embeddingEvaluatorDockerfile, /ARG RUNTIME_IMAGE/);
  assert.match(embeddingEvaluatorDockerfile, /FROM \$\{RUNTIME_IMAGE\}/);
  assert.match(readFileSync(new URL('./evaluate-embedding-models.sh', import.meta.url), 'utf8'), /apps\/embedding-worker\/Dockerfile/);
});

test('database backup atomically publishes a private, single-flight dual-database set', () => {
  assert.match(backup, /umask 077/);
  assert.match(backup, /flock -n/);
  assert.match(backup, /install -d -m 0700/);
  assert.match(backup, /\.db-set-\$DATE\.[^\n]*\.staging/);
  assert.match(backup, /trap .*cleanup_db_stage/);
  assert.match(backup, /core\.sql/);
  assert.match(backup, /search\.sql/);
  assert.match(backup, /sha256sum/);
  assert.match(backup, /if ! RETAINED_SET_COUNT="\$\(count_retained_db_sets\)"/);
  assert.match(backup, /sets=\$\{RETAINED_SET_COUNT\}/);
  assert.doesNotMatch(backup, /sets=\$\{#DB_SETS\[@\]\}/);
  assert.ok(
    backup.indexOf('if ! RETAINED_SET_COUNT="$(count_retained_db_sets)"')
      > backup.indexOf('for set_name in "${DB_SETS[@]:$KEEP}"'),
    'retained backup sets must be enumerated after rotation',
  );
  assert.match(backup, /mv -- "\$STAGING_DIR" "\$FINAL_SET_DIR"/);
  assert.doesNotMatch(backup, /> "\$DUMP_DIR\/core-/);
  assert.doesNotMatch(backup, /> "\$DUMP_DIR\/search-/);
  assert.match(backup, /SEARCH_DATABASE_URL/);
  assert.doesNotMatch(backup, /echo[^\n]*(?:DATABASE_URL|POSTGRES_PASSWORD)/i);
  assert.match(backupRunbook, /db-set-<UTC>/);
  assert.match(backupRunbook, /sha256sum -c core\.sql\.sha256/);
  assert.match(backupRunbook, /sha256sum -c search\.sql\.sha256/);
  assert.match(backupRunbook, /核心库.*搜索库|core.*search/i);
  assert.match(backupRunbook, /DB_ADMIN_ROLE/);
  assert.doesNotMatch(backupRunbook, /-U openscience/);
  assert.match(backupRunbook, /set -euo pipefail/);
  assert.match(backupRunbook, /\^openscience_core_restore_\[a-z0-9\]\{8,40\}\$/);
  assert.match(backupRunbook, /\^openscience_search_restore_\[a-z0-9\]\{8,40\}\$/);
  assert.match(backupRunbook, /PROD_DATABASES/);
  assert.match(backupRunbook, /CORE_PROD_DB/);
  assert.match(backupRunbook, /SEARCH_PROD_DB/);
  assert.match(backupRunbook, /createdb --username="\$DB_ADMIN_ROLE" --/);
  assert.match(backupRunbook, /--dbname="\$CORE_RESTORE"/);
  assert.match(backupRunbook, /--dbname="\$SEARCH_RESTORE"/);
});

test('database backup retention inventory fails closed when its producer fails', () => {
  const inventoryFunction = backup.match(/count_retained_db_sets\(\) \{[\s\S]*?^\}/m)?.[0];
  assert.ok(inventoryFunction, 'backup must expose the exact retention inventory function under test');
  const result = spawnSync(bash, ['-c', `
set -euo pipefail
${inventoryFunction}
DUMP_DIR=/tmp
find() { printf '.\\n'; return 42; }
if count_retained_db_sets >/dev/null; then
  echo BACKUP_OK
else
  echo BACKUP_FAIL >&2
  exit 42
fi
`], { encoding: 'utf8' });
  assert.equal(result.status, 42, result.stderr);
  assert.doesNotMatch(result.stdout, /BACKUP_OK/);
  assert.match(result.stderr, /BACKUP_FAIL/);
});

test('embedding capability is strict, release-versioned and rollback-safe', () => {
  assert.match(source, /count=\\\$\(grep -c '\^\$\{key\}='/);
  assert.match(source, /read_prod_value BGE_M3_DEPLOY/);
  assert.match(source, /case "\$BGE_M3_DEPLOY_VALUE" in[\s\S]*true\)[\s\S]*false\)[\s\S]*\*\)/);
  assert.doesNotMatch(source, /BGE_M3_DEPLOY=\(true\|1\)/);
  assert.match(source, /schema=6/);
  for (const key of [
    'embedding_deploy',
    'bge_m3_enabled',
    'model_version_id',
    'model_revision',
    'source_sha256',
    'package_freeze_sha256',
    'model_manifest_sha256',
  ]) {
    assert.match(source, new RegExp(`${key}=`));
  }
  assert.match(source, /PREVIOUS_BGE_M3_MODEL_VERSION_ID/);
  assert.match(source, /PREVIOUS_BGE_M3_MODEL_REVISION/);
  assert.match(source, /PREVIOUS_BGE_M3_SOURCE_SHA256/);
  assert.match(source, /PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256/);
  assert.match(source, /PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256/);
  assert.match(source, /PREVIOUS_RUNTIME_ENV[^\n]*BGE_M3_ENABLED/);
  assert.match(source, /PREVIOUS_RUNTIME_ENV[\s\S]*verify-embedding-runtime\.mjs/);
  assert.match(source, /grep -q '\^  embedding-worker:'/);
  assert.match(source, /停止上一 release 的 embedding-worker/);
  assert.ok(
    source.indexOf('公网与精确 release 验收') < source.indexOf('停止上一 release 的 embedding-worker'),
    'disabled cleanup must only happen after public acceptance',
  );
  assert.match(source, /same_sha_verification_failed\(\)/);
  assert.match(source, /model_version_id="\$\(read_capability_value[^\n]+" \|\| return/);
  assert.match(source, /reason=same-sha-verification/);
  assert.match(source, /same-SHA disabled：收敛残留 embedding-worker/);
  assert.match(source, /services=\\\$\(XGS_RELEASE_ROOT=[^\n]+ps --status running --services\)/);
  assert.doesNotMatch(source, /ps --status running --services \| if grep -qx embedding-worker/);
  assert.ok(
    source.indexOf('expect_http_body https://OpenScience.428312321.xyz/__release "$RELEASE_SHA"')
      < source.indexOf('same-SHA disabled：收敛残留 embedding-worker'),
    'same-SHA cleanup must only happen after public identity verification',
  );
});

test('production compose up receives the same env file used by migrate and validation', () => {
  assert.match(
    source,
    /XGS_RELEASE_IMAGE_TAG=\$RELEASE_SHA docker compose --project-directory \$RELEASE_ROOT --env-file \$PROD_ENV -f \$COMPOSE_FILE \$1/,
  );
  assert.match(source, /compose_current "up -d --wait --wait-timeout 300 \$\{services\[\*\]\}"/);
  assert.match(source, /compose_current "run --rm --no-deps[^"]+verify-database-isolation\.mjs"/);
  assert.match(source, /compose_current "run --rm --no-deps[^"]+migrate-cli\.js deploy"/);
  assert.match(
    source,
    /compose_current "run --rm --no-deps[^"]+node_modules\/prisma\/build\/index\.js migrate deploy --schema \/opt\/openscience\/infra\/search\/schema\.prisma"/,
  );
  assert.match(source, /grep -q '\^SEARCH_DATABASE_URL=\.' \$PROD_ENV/);
  assert.match(source, /拒绝把搜索索引写入核心数据库/);
  assert.doesNotMatch(source, /-e (?:SEARCH_)?DATABASE_URL=/);
  assert.ok(
    source.indexOf('verify-database-isolation.mjs') < source.indexOf('migrate-cli.js deploy'),
    'database identity must be checked before the first migration',
  );
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
  assert.match(source, /verify-embedding-runtime\.mjs/);
  assert.match(source, /expect_http_status .*auth\/me 401/);
  assert.doesNotMatch(source, /curl[^\n]+\|\| true/);
});

test('clean release uses the frozen lockfile and generates Prisma before compiling any workspace package', () => {
  const candidateBuild = 'cd $RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install --ignore-scripts --frozen-lockfile && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build';
  assert.ok(source.includes(candidateBuild));
  assert.doesNotMatch(source, /首次版本化发布|first-transition-adapter/);
});

test('deployment publishes and verifies the exact immutable release identity', () => {
  assert.match(source, /verify-release-source\.mjs" --root "\$PROJECT_ROOT" --ref "\$RELEASE_REF"/);
  assert.match(source, /cas-active --marker '\$REMOTE_ROOT\/\.release-id' --expected '\$ROLLBACK_SHA' --next '\$RELEASE_SHA' --lock-fd 9/);
  assert.match(source, /expect_http_body .*\/__release "\$RELEASE_SHA"/);
  assert.match(launcherSource, /ANCESTRY_ARGS=\(--ancestor "\$ROLLBACK_SHA"\)/);
  assert.ok(launcherSource.indexOf('"${ANCESTRY_ARGS[@]}"') < launcherSource.indexOf('scripts/cloud-sync.mjs'));
});

test('release source guard accepts forward history and rejects missing, backward or sibling releases', async t => {
  const root = await mkdtemp(join(tmpdir(), 'xgs-release-ancestry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const guard = fileURLToPath(new URL('../../scripts/verify-release-source.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.email', 'gate@example.invalid'); git('config', 'user.name', 'Release Gate');
  git('commit', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('commit', '--allow-empty', '-m', 'active');
  const active = git('rev-parse', 'HEAD');
  git('commit', '--allow-empty', '-m', 'forward');
  const forward = git('rev-parse', 'HEAD');
  const check = ancestor => spawnSync(process.execPath, [guard, '--root', root, '--ref', 'HEAD', '--ancestor', ancestor], { encoding: 'utf8' });
  assert.equal(check(active).status, 0);
  assert.equal(check(forward).status, 0, 'same-SHA verification remains available');
  git('checkout', '--detach', base);
  assert.notEqual(check(active).status, 0, 'normal deployment cannot silently roll back');
  git('commit', '--allow-empty', '-m', 'sibling');
  const sibling = check(active);
  assert.notEqual(sibling.status, 0);
  assert.match(sibling.stderr, /integrate the current release/);
  const missing = check('f'.repeat(40));
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /fetch its history/);
  git('merge', '--no-ff', active, '-m', 'integrate active');
  assert.equal(check(active).status, 0, 'integrating both branches restores forward deployment');
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
  assert.match(
    cloudSync,
    /\['-c', 'core\.autocrlf=false', 'archive', '--format=tar\.gz', releaseSha\]/,
  );
  assert.doesNotMatch(cloudSync, /\['archive', '--format=tar\.gz', releaseSha\]/);
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
  assert.match(command, /if \[ -d '[^']+' \]; then tar -tzf - >\/dev\/null; test[^\n]+release-input-manifest\.mjs' verify[^\n]+exit 0; fi/);
  assert.doesNotMatch(command, new RegExp(`rm -rf -- '${releaseRoot.replaceAll('/', '\\/')}'`));
  const parsed = spawnSync(bash, ['-n', '-c', command], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.throws(() => buildReleaseMaterializeCommand('/tmp/not-production', 'a'.repeat(40)));
});

test('deployment keeps an application rollback trap until public health succeeds', () => {
  assert.match(source, /--rollback-ref/);
  assert.match(source, /ROLLBACK_SHA=/);
  assert.match(source, /ACTIVE_RELEASE_SHA=.*\.release-id/);
  assert.match(source, /PREVIOUS_RELEASE_SHA="\$ACTIVE_RELEASE_SHA"/);
  assert.match(source, /transaction_rollback_application\(\)/);
  assert.match(source, /trap 'transaction_rollback_application \$\?' ERR/);
  assert.match(transactionStateSource, /trap - ERR EXIT HUP INT TERM/);
  assert.ok(
    transactionSource.lastIndexOf('transaction_commit') < transactionSource.lastIndexOf('部署完成'),
    'rollback traps remain installed until the final locked commit point',
  );
  assert.match(source, /ROLLBACK_FAILED/);
  assert.match(source, /ROLLBACK_COMPOSE_FILE="\$PREVIOUS_RELEASE_ROOT\/infra\/compose\/docker-compose\.prod\.yml"/);
  assert.match(source, /ROLLBACK_COMPOSE_MODE="previous-release"/);
  assert.doesNotMatch(source, /ROLLBACK_COMPOSE_MODE="first-transition-adapter"/);
  assert.match(source, /PREVIOUS_HAS_EMBEDDING=/);
  assert.match(source, /\.release-capabilities/);
  assert.match(source, /embedding_deploy=%s/);
  assert.match(source, /openscience-embedding-worker:\$PREVIOUS_RELEASE_SHA/);
  assert.match(source, /--profile embedding[^\n]+embedding-worker/);
  assert.match(source, /-f \$ROLLBACK_COMPOSE_FILE up -d --force-recreate/);
  assert.match(source, /rm -f \$REMOTE_ROOT\/\.release-id/);
  assert.match(source, /\.release-failed/);
  assert.match(source, /! -e "\$REMOTE_ROOT\/\.release-failed"/);
  assert.match(source, /云上缺少 active release identity，拒绝猜测 rollback/);
  assert.doesNotMatch(source, /systemctl reload nginx" \|\| exit 1/);
});

test('confirmed deployment materializes only an immutable candidate before the lock-in active check', () => {
  assert.match(source, /--require-parser-acceptance/);
  assert.match(source, /REQUIRE_PARSER_ACCEPTANCE=1/);
  assert.match(source, /--confirm[^\n]+--require-parser-acceptance|--require-parser-acceptance[^\n]+--confirm/);
  assert.match(source, /\[ "\$ROLLBACK_SHA" = "\$ACTIVE_RELEASE_SHA" \]/);
  const materialize = launcherSource.indexOf('node "$PROJECT_ROOT/scripts/cloud-sync.mjs"');
  const transactionSsh = launcherSource.indexOf("exec /bin/bash '$REMOTE_TRANSACTION_RUNNER'", materialize);
  const activeRead = transactionSource.indexOf('ACTIVE_RELEASE_SHA=');
  const rollbackMatch = transactionSource.indexOf('[ "$ROLLBACK_SHA" = "$ACTIVE_RELEASE_SHA" ]');
  const build = transactionSource.indexOf('npx pnpm@9.15.0 install', rollbackMatch);
  assert.ok(materialize >= 0 && transactionSsh > materialize, 'immutable materialization precedes the one transaction SSH');
  assert.ok(activeRead >= 0 && rollbackMatch > activeRead, 'active identity must be read before rollback comparison');
  assert.ok(build > rollbackMatch, 'wrong rollback must block before package/image build');
  assert.doesNotMatch(
    transactionSource,
    /\$SCRIPT_DIR\/release-input-manifest\.mjs/,
    'the source verifier lives under the immutable release root scripts directory',
  );
});

test('one foreground SSH runs the complete transaction under its own inherited FD9', () => {
  const runRemote = transactionSource.match(/run_remote\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.equal((launcherSource.match(/^"\$SSH_EXECUTABLE" /gm) ?? []).length, 1);
  assert.match(launcherSource, /System32\/OpenSSH\/ssh\.exe/u);
  assert.match(launcherSource, /exec \/bin\/bash '\$REMOTE_TRANSACTION_RUNNER'[^\n]+<\/dev\/null/);
  assert.doesNotMatch(launcherSource, /\| ssh |bash -s/);
  assert.match(transactionSource, /exec 9<>/);
  assert.match(transactionSource, /flock -n -E 73 9/);
  assert.match(runRemote, /bash -c/);
  assert.doesNotMatch(runRemote, /\bssh\b/);
  assert.doesNotMatch(source, /coproc|DEPLOY_LOCK_ASSERT_COMMAND|lock-command|assert-command/);
  assert.doesNotMatch(transactionSource, /release-contract-test|TRANSACTION_TEST|XGS_TEST/);
  assert.match(transactionSource, /\[ "\$#" -ge 3 \] && \[ "\$#" -le 6 \]/u);
  assert.match(transactionSource, /NO_TESTS="\$\{4:-0\}"/u);
  assert.match(transactionSource, /REUSE_UNCHANGED_CAPABILITY_IMAGES="\$\{5:-0\}"/u);
  assert.match(transactionSource, /\[\[ "\$NO_TESTS" =~ \^\[01\]\$ \]\]/u);
  assert.match(transactionSource, /\[\[ "\$REUSE_UNCHANGED_CAPABILITY_IMAGES" =~ \^\[01\]\$ \]\]/u);
  assert.doesNotMatch(transactionStateSource, /release-contract-test|TRANSACTION_TEST|XGS_TEST|^\s*\[ "\$#"/m);
  const manifestVerify = transactionSource.indexOf('release-input-manifest.mjs" verify');
  const stateSource = transactionSource.indexOf('source "$SCRIPT_DIR/production-deploy-transaction-state.sh"');
  assert.ok(manifestVerify >= 0 && stateSource > manifestVerify, 'state module loads only after locked source verification');
  assert.match(transactionSource, /cas-active[^\n]+--lock-fd 9/);
  assert.match(transactionSource, /journal-start[\s\S]*journal-update[\s\S]*journal-clear/);
});

function transactionLockHarness(lockDirectory, requiredUid, body) {
  const acquire = transactionSource.match(/acquire_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const assertion = transactionSource.match(/assert_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const functions = `${acquire}\n${assertion}`.replaceAll('[ "$1" = 0 ]', `[ "$1" = ${requiredUid} ]`);
  return [
    'set -eEuo pipefail',
    `DEPLOY_LOCK_DIRECTORY='${lockDirectory}'`,
    `DEPLOY_LOCK_PATH='${lockDirectory}/lock'`,
    functions,
    'acquire_production_deploy_lock',
    'assert_production_deploy_lock',
    body,
  ].join('\n');
}

function transactionStateHarness(root, requiredUid, phase, event) {
  const acquire = transactionSource.match(/acquire_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const assertion = transactionSource.match(/assert_production_deploy_lock\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  const lockFunctions = `${acquire}\n${assertion}`.replaceAll('[ "$1" = 0 ]', `[ "$1" = ${requiredUid} ]`);
  const quote = (value) => `'${value.replaceAll("'", "'\"'\"'")}'`;
  return [
    'set -eEuo pipefail',
    `TEST_ROOT=${quote(root)}`,
    'REMOTE_ROOT="$TEST_ROOT/remote"',
    'RELEASE_ROOT="$TEST_ROOT/release"',
    'PROD_ENV="$TEST_ROOT/prod.env"',
    'COMPOSE_FILE="$TEST_ROOT/compose.yml"',
    'DEPLOY_LOCK_DIRECTORY="$TEST_ROOT/lock-private"',
    'DEPLOY_LOCK_PATH="$DEPLOY_LOCK_DIRECTORY/lock"',
    'DEPLOY_JOURNAL="$REMOTE_ROOT/.deploy-transaction.json"',
    `TRANSACTION_PHASE_UNDER_TEST=${quote(phase)}`,
    `TRANSACTION_EVENT_UNDER_TEST=${quote(event)}`,
    `RELEASE_SHA=${quote('b'.repeat(40))}`,
    `ROLLBACK_SHA=${quote('a'.repeat(40))}`,
    'PREVIOUS_RELEASE_SHA="$ROLLBACK_SHA"',
    'ACTIVE_RELEASE_SHA="$RELEASE_SHA"',
    'EMBEDDING_DEPLOY=0',
    lockFunctions,
    'transaction_assert_lock() { assert_production_deploy_lock; }',
    'transaction_journal_start() { [ ! -e "$DEPLOY_JOURNAL" ] || return 75; printf "phase=prepared\\n" > "$DEPLOY_JOURNAL.next"; chmod 0600 "$DEPLOY_JOURNAL.next"; mv "$DEPLOY_JOURNAL.next" "$DEPLOY_JOURNAL"; }',
    'transaction_journal_update() { [ -f "$DEPLOY_JOURNAL" ] || return 75; printf "phase=%s\\n" "$1" > "$DEPLOY_JOURNAL.next"; chmod 0600 "$DEPLOY_JOURNAL.next"; mv "$DEPLOY_JOURNAL.next" "$DEPLOY_JOURNAL"; }',
    'transaction_journal_clear() { if [ "${XGS_TEST_TERM_DURING_CLEAR:-0}" = 1 ]; then kill -TERM $$; fi; rm -- "$DEPLOY_JOURNAL"; [ "${XGS_TEST_CLEAR_AFTER_UNLINK_FAIL:-0}" != 1 ] || return 70; }',
    'transaction_journal_clear_after_rollback() { [ ! -e "$DEPLOY_JOURNAL" ] || transaction_journal_clear; }',
    'transaction_perform_application_rollback() { active="$(cat "$REMOTE_ROOT/.release-id")"; case "$active" in "$ROLLBACK_SHA"|"$RELEASE_SHA") ;; *) echo ROLLBACK_FAILED_STALE_ACTIVE >&2; return 70 ;; esac; printf "ROLLBACK_IN_LOCK\\n" >&2; if [ "${XGS_TEST_ROLLBACK_DELAY:-0}" != 0 ]; then sleep "$XGS_TEST_ROLLBACK_DELAY"; fi; [ "${XGS_TEST_ROLLBACK_FAIL:-0}" != 1 ] || return 70; printf "%s\\n" "$ROLLBACK_SHA" > "$REMOTE_ROOT/.release-id"; }',
    'transaction_cleanup_candidate_capability() { :; }',
    'transaction_abort_rollback_intent() { [ ! -e "$REMOTE_ROOT/.rollback-id.pending" ] || { [ "${XGS_TEST_PENDING_ABORT_FAIL:-0}" != 1 ] || return 70; rm -- "$REMOTE_ROOT/.rollback-id.pending"; }; }',
    `source ${quote(transactionStatePath.replaceAll('\\', '/'))}`,
    'mkdir -p "$REMOTE_ROOT" "$RELEASE_ROOT"',
    'acquire_production_deploy_lock',
    'assert_production_deploy_lock',
    'transaction_initialize_state',
    'transaction_install_traps',
    '[ ! -e "$DEPLOY_JOURNAL" ] || exit 75',
    'if [ "$TRANSACTION_EVENT_UNDER_TEST" = already-active ]; then',
    '  require_match() { [[ "$2" =~ $3 ]]; }',
    '  log() { printf "%s\\n" "$*"; }',
    '  run_remote() { case "$1" in *"cat \'$RELEASE_ROOT/.release-source\'"*) [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != source ] ;; *"docker image inspect --format=\'{{.Id}}\' openscience-agent-worker"*) if [ "${XGS_TEST_SAME_SHA_FAILURE:-}" = tag ]; then printf "sha256:bad\\n"; else printf "sha256:%064d\\n" 0; fi ;; *"docker image inspect --format=\'{{.Id}}\' openscience-document-parser"*) printf "sha256:%064d\\n" 1 ;; *verify-document-parser-acceptance.mjs*) printf called > "$TEST_ROOT/formal-verifier-called"; case "${XGS_TEST_SAME_SHA_FAILURE:-}" in report|runtime) return 65 ;; esac ;; *"docker inspect --format=\'{{.Image}}\'"*111111111111*) if [ "${XGS_TEST_SAME_SHA_FAILURE:-}" = running ]; then printf "sha256:%064d\\n" 9; else printf "sha256:%064d\\n" 0; fi ;; *"docker inspect --format=\'{{.Image}}\'"*222222222222*) printf "sha256:%064d\\n" 1 ;; *production-deploy-lock.mjs*verify-state*) [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != running ] ;; *"ps --status running --services"*) printf "\\n" ;; *) return 0 ;; esac; }',
    '  compose_current() { case "$1" in "ps -q agent-worker") printf "111111111111\\n" ;; "ps -q document-parser") printf "222222222222\\n" ;; *) return 0 ;; esac; }',
    '  compose_embedding_current() { return 0; }',
    '  verify_release_capability() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != capability ]; }',
    '  verify_scansci_current() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != scansci ]; }',
    '  expect_http_status() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != public ]; }',
    '  expect_http_body() { [ "${XGS_TEST_SAME_SHA_FAILURE:-}" != public ]; }',
    '  transaction_verify_already_active_release',
    '  printf "ALREADY_ACTIVE_OK\\n"',
    '  exit 0',
    'fi',
    '[ -e "$REMOTE_ROOT/.release-id" ] || printf "%s\\n" "$ROLLBACK_SHA" > "$REMOTE_ROOT/.release-id"',
    'transaction_begin',
    'case "$TRANSACTION_PHASE_UNDER_TEST" in migrating) transaction_mark_phase migrating ;; switching) transaction_mark_phase switching; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id" ;; published) transaction_mark_phase switching; printf "%s\\n" "$RELEASE_SHA" > "$REMOTE_ROOT/.release-id"; transaction_mark_phase published ;; esac',
    'if [ "${XGS_TEST_PENDING_INTENT:-0}" = 1 ]; then printf "pending\\n" > "$REMOTE_ROOT/.rollback-id.pending"; fi',
    'if [ -n "${XGS_TEST_FORCE_ACTIVE_SHA:-}" ]; then printf "%s\\n" "$XGS_TEST_FORCE_ACTIVE_SHA" > "$REMOTE_ROOT/.release-id"; fi',
    'case "$TRANSACTION_EVENT_UNDER_TEST" in stdin) bash -c "cat >/dev/null"; printf "AFTER_STDIN\\n"; transaction_commit ;; err) false ;; term) kill -TERM $$ ;; hup) kill -HUP $$ ;; exit) exit 42 ;; sigkill) printf "READY_FOR_SIGKILL\\n" >&2; sleep 30 ;; commit-term) XGS_TEST_TERM_DURING_CLEAR=1; transaction_commit; printf "COMMIT_SURVIVED_TERM\\n" ;; esac',
  ].join('\n');
}

test('production transaction lock is nonblocking and remains held throughout its payload', async (t) => {
  if (spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('flock is unavailable in the local Git Bash; Linux CI executes this behavior gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-lock-'));
  const lockDirectory = join(sandbox, 'private').replaceAll('\\', '/');
  const requiredUid = process.getuid?.() ?? 0;
  const start = async () => {
    const child = spawn(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, 'printf "LOCKED\\n"; cat >/dev/null',
    )], { stdio: ['pipe', 'pipe', 'pipe'] });
    const [chunk] = await once(child.stdout, 'data');
    assert.equal(chunk.toString().trim(), 'LOCKED');
    return child;
  };
  try {
    const missingFlock = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8', env: { ...process.env, PATH: sandbox } });
    assert.equal(missingFlock.error, undefined, 'absolute Bash path must survive the missing-flock PATH fixture');
    assert.equal(missingFlock.status, 69, missingFlock.stderr);
    const first = await start();
    for (const attempt of [1, 2]) {
      const blocked = spawnSync(bash, ['-c', transactionLockHarness(
        lockDirectory, requiredUid, `printf 'unexpected-${attempt}\\n'`,
      )], { encoding: 'utf8' });
      assert.equal(blocked.status, 73, blocked.stderr);
    }
    first.stdin.end();
    const [status] = await once(first, 'exit');
    assert.equal(status, 0);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('production transaction lock rejects pre-positioned directory and lock symlinks without truncating targets', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Linux ownership and no-follow semantics are enforced by this gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-lock-symlink-'));
  const requiredUid = process.getuid();
  const target = join(sandbox, 'sentinel');
  const privatePath = join(sandbox, 'private');
  try {
    await mkdir(target);
    await writeFile(join(target, 'unchanged'), 'sentinel\n');
    await symlink(target, privatePath, 'dir');
    let rejected = spawnSync(bash, ['-c', transactionLockHarness(privatePath, requiredUid, ':')], { encoding: 'utf8' });
    assert.equal(rejected.status, 71, rejected.stderr);
    assert.equal(await readFile(join(target, 'unchanged'), 'utf8'), 'sentinel\n');

    await rm(privatePath);
    await mkdir(privatePath, { mode: 0o700 });
    await chmod(privatePath, 0o700);
    const outsideOwner = join(sandbox, 'outside-lock');
    await writeFile(outsideOwner, 'do-not-truncate\n');
    await symlink(outsideOwner, join(privatePath, 'lock'));
    rejected = spawnSync(bash, ['-c', transactionLockHarness(privatePath, requiredUid, ':')], { encoding: 'utf8' });
    assert.equal(rejected.status, 71, rejected.stderr);
    assert.equal(await readFile(outsideOwner, 'utf8'), 'do-not-truncate\n');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('terminating the transaction connection process group stops its in-lock payload', async (t) => {
  if (spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('flock is unavailable in the local Git Bash; Linux CI executes this behavior gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-lock-death-'));
  const lockDirectory = join(sandbox, 'private').replaceAll('\\', '/');
  const requiredUid = process.getuid?.() ?? 0;
  const unsafeMarker = join(sandbox, 'unsafe').replaceAll('\\', '/');
  const child = spawn(bash, ['-c', transactionLockHarness(
    lockDirectory,
    requiredUid,
    `printf 'PAYLOAD_STARTED\\n' >&2; sleep 2; printf unsafe > '${unsafeMarker}'`,
  )], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  try {
    const [chunk] = await once(child.stderr, 'data');
    assert.match(chunk.toString(), /PAYLOAD_STARTED/);
    const childExit = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    await childExit;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2200));
    assert.equal(existsSync(unsafeMarker), false);
    const replacement = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8' });
    assert.equal(replacement.status, 0, replacement.stderr);
  } finally {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('durable journal and active CAS stay on inherited FD9 across crash and TERM recovery', async (t) => {
  if (process.platform === 'win32'
    || spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('Linux CI executes the real inherited-FD, signal and durable-journal gate');
    return;
  }
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-production-journal-'));
  const lockDirectory = join(sandbox, 'private').replaceAll('\\', '/');
  const journalPath = join(sandbox, 'journal.json').replaceAll('\\', '/');
  const markerPath = join(sandbox, '.release-id').replaceAll('\\', '/');
  const helperPath = join(sandbox, 'journal-helper.mjs').replaceAll('\\', '/');
  const utilityUrl = new URL('./production-deploy-lock.mjs', import.meta.url).href;
  const requiredUid = process.getuid();
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  const helper = `
import {
  clearProductionDeployJournal,
  compareAndSwapActiveRelease,
  writeProductionDeployJournal,
} from ${JSON.stringify(utilityUrl)};
const [operation, lockDirectory, journalPath, markerPath, requiredUidText, candidateSha, rollbackSha] = process.argv.slice(2);
const common = { lockDirectory, requiredUid: Number(requiredUidText), lockFd: 9 };
try {
  if (operation === 'start') await writeProductionDeployJournal({ ...common, journalPath, candidateSha, rollbackSha, phase: 'prepared', create: true });
  else if (operation === 'clear') await clearProductionDeployJournal({ ...common, journalPath, candidateSha, rollbackSha });
  else if (operation === 'cas') await compareAndSwapActiveRelease({ ...common, markerPath, expectedSha: rollbackSha, nextSha: candidateSha });
  else throw new Error('unknown helper operation');
} catch (error) {
  console.error(error.message);
  process.exitCode = 65;
}
`;
  const invoke = (operation, candidate = newSha, rollback = oldSha) => (
    `node '${helperPath}' '${operation}' '${lockDirectory}' '${journalPath}' '${markerPath}' '${requiredUid}' '${candidate}' '${rollback}'`
  );
  const children = [];
  const startFixture = (body) => {
    const fixture = observeSignalFixture(spawn(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, body,
    )], { stdio: ['pipe', 'pipe', 'pipe'], detached: true }));
    children.push(fixture);
    return fixture;
  };
  let primaryError;
  try {
    await writeFile(helperPath, helper);
    await writeFile(markerPath, `${oldSha}\n`);

    let result = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, invoke('cas', newSha, 'c'.repeat(40)),
    )], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);

    result = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory,
      requiredUid,
      `${invoke('start')}; ${invoke('cas')}; ${invoke('clear')}`,
    )], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), newSha);
    assert.equal(existsSync(journalPath), false);

    result = spawnSync(process.execPath, [helperPath, 'cas', lockDirectory, journalPath,
      markerPath, String(requiredUid), oldSha, newSha], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'CAS without inherited FD9 must fail closed');
    assert.equal((await readFile(markerPath, 'utf8')).trim(), newSha);

    const crash = startFixture(`${invoke('start')}; printf 'JOURNAL_DURABLE\\n' >&2; IFS= read -r crashRelease`);
    assert.match(await crash.waitFor(/JOURNAL_DURABLE/, 'crash readiness'), /JOURNAL_DURABLE/);
    process.kill(-crash.child.pid, 'SIGKILL');
    assert.deepEqual(await crash.waitForExit(), { code: null, signal: 'SIGKILL' });
    assert.equal(existsSync(journalPath), true);
    result = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, `[ ! -e '${journalPath}' ] || exit 75`,
    )], { encoding: 'utf8' });
    assert.equal(result.status, 75, result.stderr);
    await rm(journalPath);

    await writeFile(markerPath, `${oldSha}\n`);
    const rollbackTrap = [
      `rollback_handler() { printf "TRAP_ENTERED\\n" >&2; ${invoke('cas', oldSha, newSha)}; printf "ROLLBACK_IN_LOCK\\n" >&2; local rollbackRelease; IFS= read -r rollbackRelease; [ "$rollbackRelease" = release-rollback ]; ${invoke('clear')}; exit 143; }`,
      'trap rollback_handler TERM',
      invoke('start'),
      invoke('cas'),
      'printf "SWITCHED\\n" >&2',
      // A builtin pause has no foreground-child fork window after the readiness marker.
      'IFS= read -r interruptedRelease',
    ].join('; ');
    const interrupted = startFixture(rollbackTrap);
    assert.match(await interrupted.waitFor(/SWITCHED/, 'TERM readiness'), /SWITCHED/);
    const rollbackOutput = interrupted.waitFor(/ROLLBACK_IN_LOCK/, 'TERM rollback');
    process.kill(-interrupted.child.pid, 'SIGTERM');
    assert.match(await rollbackOutput, /TRAP_ENTERED[\s\S]*ROLLBACK_IN_LOCK/);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
    assert.equal(existsSync(journalPath), true);
    const competitor = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8' });
    assert.equal(competitor.status, 73, competitor.stderr);
    interrupted.child.stdin.end('release-rollback\n');
    assert.deepEqual(await interrupted.waitForExit(), { code: 143, signal: null });
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
    assert.equal(existsSync(journalPath), false);
    const replacement = spawnSync(bash, ['-c', transactionLockHarness(
      lockDirectory, requiredUid, ':',
    )], { encoding: 'utf8' });
    assert.equal(replacement.status, 0, replacement.stderr);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanup = await Promise.allSettled(children.map((fixture) => fixture.stop()));
    const errors = cleanup.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(primaryError ? [primaryError, ...errors] : errors, 'signal fixture cleanup failed; sandbox retained');
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('shared production state machine traps every durable phase and commits without stdin or signal ambiguity', async (t) => {
  if (process.platform === 'win32'
    || spawnSync(bash, ['-c', 'command -v flock >/dev/null 2>&1']).status !== 0) {
    t.skip('Ubuntu CI executes the production state module with isolated test adapters');
    return;
  }
  const oldSha = 'a'.repeat(40);
  const candidateSha = 'b'.repeat(40);
  const staleSha = 'c'.repeat(40);
  const createFixture = async () => {
    const root = await mkdtemp('/tmp/xgs-production-transaction-test-');
    await chmod(root, 0o700);
    return {
      root,
      journal: join(root, 'remote', '.deploy-transaction.json'),
      marker: join(root, 'remote', '.release-id'),
    };
  };
  const requiredUid = process.getuid();
  const run = (fixture, phase, event, env = {}) => spawnSync(
    bash,
    ['-c', transactionStateHarness(fixture.root, requiredUid, phase, event)],
    { encoding: 'utf8', input: 'CONSUME_ME\n', env: { ...process.env, ...env } },
  );

  const fixtures = [];
  try {
    for (const phase of ['prepared', 'migrating', 'switching', 'published']) {
      for (const event of ['err', 'term', 'hup', 'exit']) {
        const fixture = await createFixture();
        fixtures.push(fixture.root);
        const result = run(fixture, phase, event);
        assert.notEqual(result.status, 0, `${phase}/${event} unexpectedly succeeded`);
        if (phase === 'migrating') {
          assert.equal(result.status, 70, result.stderr);
          assert.equal(existsSync(fixture.journal), true, `${phase}/${event} must retain its journal`);
        } else {
          assert.equal(existsSync(fixture.journal), false, `${phase}/${event} must close its journal`);
        }
        assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);
      }
    }

    let fixture = await createFixture();
    fixtures.push(fixture.root);
    let result = run(fixture, 'switching', 'term', { XGS_TEST_ROLLBACK_FAIL: '1' });
    assert.equal(result.status, 70, result.stderr);
    assert.equal(existsSync(fixture.journal), true);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), candidateSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'switching', 'term', { XGS_TEST_FORCE_ACTIVE_SHA: staleSha });
    assert.equal(result.status, 70, result.stderr);
    assert.match(result.stderr, /ROLLBACK_FAILED_STALE_ACTIVE/);
    assert.equal(existsSync(fixture.journal), true);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), staleSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'term', { XGS_TEST_PENDING_INTENT: '1' });
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(existsSync(fixture.journal), false);
    assert.equal(existsSync(join(fixture.root, 'remote', '.rollback-id.pending')), false);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'term', {
      XGS_TEST_PENDING_INTENT: '1',
      XGS_TEST_PENDING_ABORT_FAIL: '1',
    });
    assert.equal(result.status, 70, result.stderr);
    assert.equal(existsSync(fixture.journal), true);
    assert.equal(existsSync(join(fixture.root, 'remote', '.rollback-id.pending')), true);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'stdin', {
      XGS_TEST_PENDING_INTENT: '1',
      XGS_TEST_CLEAR_AFTER_UNLINK_FAIL: '1',
    });
    assert.equal(result.status, 70, result.stderr);
    assert.equal(existsSync(fixture.journal), false);
    assert.equal(existsSync(join(fixture.root, 'remote', '.rollback-id.pending')), false);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), oldSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    await mkdir(join(fixture.root, 'remote'), { recursive: true });
    await writeFile(fixture.journal, 'unfinished\n');
    result = run(fixture, 'prepared', 'err');
    assert.equal(result.status, 75, result.stderr);
    assert.equal(await readFile(fixture.journal, 'utf8'), 'unfinished\n');

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'prepared', 'stdin');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AFTER_STDIN/);
    assert.equal(existsSync(fixture.journal), false);

    for (const failure of ['', 'source', 'report', 'runtime', 'tag', 'running', 'capability', 'scansci', 'public']) {
      fixture = await createFixture();
      fixtures.push(fixture.root);
      result = run(fixture, 'prepared', 'already-active', failure ? { XGS_TEST_SAME_SHA_FAILURE: failure } : {});
      if (failure) {
        assert.notEqual(result.status, 0, `same-SHA ${failure} mismatch must fail closed`);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /ALREADY_ACTIVE_OK/);
      }
      assert.equal(
        existsSync(join(fixture.root, 'formal-verifier-called')),
        !['source', 'tag'].includes(failure),
        `same-SHA ${failure || 'success'} formal verifier reachability differs`,
      );
      assert.equal(existsSync(fixture.journal), false);
    }

    fixture = await createFixture();
    fixtures.push(fixture.root);
    result = run(fixture, 'published', 'commit-term');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /COMMIT_SURVIVED_TERM/);
    assert.equal(existsSync(fixture.journal), false);
    assert.equal((await readFile(fixture.marker, 'utf8')).trim(), candidateSha);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    const interrupted = spawn(
      bash,
      ['-c', transactionStateHarness(fixture.root, requiredUid, 'switching', 'term')],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, XGS_TEST_ROLLBACK_DELAY: '1' } },
    );
    const [rollbackChunk] = await once(interrupted.stderr, 'data');
    assert.match(rollbackChunk.toString(), /ROLLBACK_IN_LOCK/);
    const competitor = run(fixture, 'prepared', 'err');
    assert.equal(competitor.status, 73, competitor.stderr);
    await once(interrupted, 'exit');
    assert.equal(existsSync(fixture.journal), false);

    fixture = await createFixture();
    fixtures.push(fixture.root);
    const crashed = spawn(
      bash,
      ['-c', transactionStateHarness(fixture.root, requiredUid, 'switching', 'sigkill')],
      { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    );
    const [readyChunk] = await once(crashed.stderr, 'data');
    assert.match(readyChunk.toString(), /READY_FOR_SIGKILL/);
    const crashedExit = once(crashed, 'exit');
    process.kill(-crashed.pid, 'SIGKILL');
    await crashedExit;
    assert.equal(existsSync(fixture.journal), true);
    result = run(fixture, 'prepared', 'err');
    assert.equal(result.status, 75, result.stderr);
  } finally {
    for (const root of fixtures) await rm(root, { recursive: true, force: true });
  }
});

test('active release mutator rejects every call without the inherited production FD9', async () => {
  const { compareAndSwapActiveRelease } = await import('./production-deploy-lock.mjs');
  const sandbox = await mkdtemp(join(tmpdir(), 'xgs-active-cas-'));
  const markerPath = join(sandbox, '.release-id');
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  try {
    await writeFile(markerPath, `${oldSha}\n`);
    await assert.rejects(compareAndSwapActiveRelease({
      markerPath, expectedSha: 'c'.repeat(40), nextSha: newSha,
    }), /inherited production lock FD9/i);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
    await assert.rejects(compareAndSwapActiveRelease({
      markerPath, expectedSha: oldSha, nextSha: newSha, lockFd: 8,
    }), /inherited production lock FD9/i);
    assert.equal((await readFile(markerPath, 'utf8')).trim(), oldSha);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('confirmed deployment acquires the remote flock before reading active state and retains it through publication', () => {
  const execution = transactionSource.indexOf('=== 执行单一 SSH/flock');
  const acquire = transactionSource.indexOf('acquire_production_deploy_lock', execution);
  const activeRead = transactionSource.indexOf('ACTIVE_RELEASE_SHA=', acquire);
  const releasePublish = transactionSource.lastIndexOf('cas-active');
  const journalClear = transactionSource.lastIndexOf('transaction_commit');
  const releaseLock = transactionSource.lastIndexOf('exec 9>&-');
  assert.ok(execution >= 0 && acquire > execution && activeRead > acquire);
  assert.ok(releasePublish > activeRead && journalClear > releasePublish && releaseLock > journalClear);
  assert.match(transactionSource, /flock|production-deploy-lock\.mjs/);
  assert.match(transactionStateSource, /ROLLBACK_FAILED_LOCK_UNAVAILABLE/);
  assert.match(transactionStateSource, /trap 'transaction_rollback_application 129' HUP/);
  assert.match(transactionStateSource, /trap 'transaction_rollback_application 143' TERM/);
  assert.match(transactionStateSource, /trap 'transaction_on_exit' EXIT/);
  assert.match(transactionStateSource, /trap - ERR EXIT HUP INT TERM/);
});

test('production Compose operations pin the immutable release as project directory', () => {
  const transactionComposeCalls = transactionSource.match(/docker compose[^\n]*/gu) ?? [];
  assert.ok(transactionComposeCalls.length > 0, 'production transaction must contain Compose operations');
  for (const call of transactionComposeCalls) {
    assert.match(call, /--project-directory (?:\$RELEASE_ROOT|'\$RELEASE_ROOT'|\$PREVIOUS_RELEASE_ROOT|'\$root')/u);
  }
  const native = deploymentFunction('transaction_start_native_application');
  assert.match(native, /candidate\) root="\$RELEASE_ROOT"; sha="\$RELEASE_SHA"/u);
  assert.match(native, /original\) root="\$PREVIOUS_RELEASE_ROOT"; sha="\$PREVIOUS_RELEASE_SHA"/u);
  assert.match(native, /\*\) return 64/u);
  assert.match(
    transactionStateSource,
    /docker compose --project-directory '\$RELEASE_ROOT' --profile embedding/u,
  );
});

test('official-only rollback verifies the legacy schema-5 MCP with the candidate verifier', () => {
  assert.match(
    source,
    /\/usr\/bin\/node '\$RELEASE_ROOT\/infra\/scripts\/verify-scansci-mcp-runtime\.mjs' --release-root '\$PREVIOUS_RELEASE_ROOT'/u,
  );
  assert.doesNotMatch(
    source,
    /\/usr\/bin\/node '\$PREVIOUS_RELEASE_ROOT\/infra\/scripts\/verify-scansci-mcp-runtime\.mjs'/u,
  );
  assert.ok(source.includes('test -z \\"\\$containers\\"'));
});

test('final parser acceptance report and exact image IDs are verified after build and before switch', () => {
  const imageBuild = source.indexOf('compose_current "build agent-worker document-parser"');
  const workerImage = source.indexOf('openscience-agent-worker:$RELEASE_SHA', imageBuild);
  const parserImage = source.indexOf('openscience-document-parser:$RELEASE_SHA', imageBuild);
  const report = source.indexOf('/opt/openscience-acceptance/document-parser/$RELEASE_SHA/report.json', imageBuild);
  const verifier = source.indexOf('verify-document-parser-acceptance.mjs', imageBuild);
  const switchBoundary = transactionSource.indexOf('transaction_mark_phase switching', imageBuild);
  assert.ok(imageBuild >= 0, 'exact worker/parser images must be built');
  assert.ok(workerImage > imageBuild && parserImage > imageBuild, 'final exact image IDs must be inspected after build');
  assert.ok(report > imageBuild && verifier > report, 'fixed acceptance report must be passed to the formal verifier');
  assert.ok(verifier < switchBoundary, 'acceptance mismatch must block before SWITCH_STARTED');
});

test('production rebuild restores the accepted runtime permissions before image and report verification', () => {
  const workspaceBuild = transactionSource.indexOf('npx pnpm@9.15.0 build');
  const normalize = transactionSource.indexOf(
    'runtime-normalize --root "$RELEASE_ROOT" --sha "$RELEASE_SHA"',
    workspaceBuild,
  );
  const imageBuild = transactionSource.indexOf('compose_current "build agent-worker document-parser"', workspaceBuild);
  const verifier = transactionSource.indexOf('verify-document-parser-acceptance.mjs', imageBuild);
  assert.ok(workspaceBuild >= 0, 'production transaction must perform a fresh workspace build');
  assert.ok(normalize > workspaceBuild, 'fresh build outputs must be permission-normalized');
  assert.ok(imageBuild > normalize, 'images must use the normalized runtime closure');
  assert.ok(verifier > imageBuild, 'formal acceptance verification must follow normalization and image build');
});

test('deployment revalidates active source, report and mutable image tags after migrations and checks started container image IDs', () => {
  const migration = transactionSource.indexOf('seed-quota.mjs --confirm');
  const preSwitch = transactionSource.indexOf('verify_candidate_switch_contract pre-switch', migration);
  const switchBoundary = transactionSource.indexOf('transaction_mark_phase switching', preSwitch);
  const parserUp = transactionSource.indexOf('document-parser"', switchBoundary);
  const parserImage = transactionSource.indexOf('verify_running_container_image document-parser', parserUp);
  const workerUp = transactionSource.indexOf('api web agent-worker"', parserImage);
  const workerImage = transactionSource.indexOf('verify_running_container_image agent-worker', workerUp);
  const publication = transactionSource.indexOf('transaction_publish_candidate', workerImage);
  assert.ok(migration >= 0 && preSwitch > migration && switchBoundary > preSwitch);
  assert.ok(parserUp > switchBoundary && parserImage > parserUp);
  assert.ok(workerUp > parserImage && workerImage > workerUp && publication > workerImage);
  assert.match(source, /current_active[\s\S]*ROLLBACK_SHA/);
  assert.match(source, /FINAL_WORKER_IMAGE_ID[\s\S]*FINAL_PARSER_IMAGE_ID/);
});

test('switch identity validator rejects active drift, post-acceptance retags and wrong running images', async () => {
  const { validateProductionSwitchState } = await import('./production-deploy-lock.mjs');
  const activeSha = 'a'.repeat(40);
  const acceptedWorkerImageId = `sha256:${'b'.repeat(64)}`;
  const acceptedParserImageId = `sha256:${'c'.repeat(64)}`;
  const valid = {
    activeSha,
    rollbackSha: activeSha,
    acceptedWorkerImageId,
    acceptedParserImageId,
    currentWorkerImageId: acceptedWorkerImageId,
    currentParserImageId: acceptedParserImageId,
    runningWorkerImageId: acceptedWorkerImageId,
    runningParserImageId: acceptedParserImageId,
  };
  assert.doesNotThrow(() => validateProductionSwitchState(valid));
  assert.throws(() => validateProductionSwitchState({
    ...valid, activeSha: 'd'.repeat(40),
  }), /active release changed/i);
  assert.throws(() => validateProductionSwitchState({
    ...valid, currentWorkerImageId: `sha256:${'e'.repeat(64)}`,
  }), /tag changed/i);
  assert.throws(() => validateProductionSwitchState({
    ...valid, runningParserImageId: `sha256:${'f'.repeat(64)}`,
  }), /container image differs/i);
});

test('root unit-test command includes the release-contract gate exactly once', () => {
  const focused = [
    'scripts/release-input-manifest.test.mjs',
    'infra/scripts/accept-document-parser-release.test.mjs',
    'infra/scripts/verify-document-parser-acceptance.test.mjs',
    'infra/scripts/deploy.test.mjs',
  ];
  assert.equal(typeof rootPackage.scripts['test:release-contract'], 'string');
  for (const path of focused) {
    assert.equal(rootPackage.scripts['test:release-contract'].split(path).length - 1, 1);
  }
  assert.match(rootPackage.scripts.test, /test:release-contract/);
  assert.equal(rootPackage.scripts.test.split('test:release-contract').length - 1, 1);
});

test('worker and parser images are immutable per release and rollback uses exact previous tags', () => {
  assert.match(productionCompose, /image: openscience-agent-worker:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(productionCompose, /image: openscience-document-parser:\$\{XGS_RELEASE_IMAGE_TAG:\?XGS_RELEASE_IMAGE_TAG required\}/);
  assert.match(source, /docker image inspect openscience-agent-worker:\$PREVIOUS_RELEASE_SHA openscience-document-parser:\$PREVIOUS_RELEASE_SHA/);
  assert.doesNotMatch(source, /docker tag "\$worker_image"|docker tag "\$parser_image"/);
  assert.doesNotMatch(source, /cd \$PREVIOUS_RELEASE_ROOT && with-proxy npx pnpm@9\.15\.0 install/);
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
  assert.match(backup, /export XGS_RELEASE_ROOT="\$RELEASE_ROOT" XGS_RELEASE_IMAGE_TAG="\$RELEASE_SHA"/);
  assert.doesNotMatch(backup, /SCANSCI_BROWSER|scansci-legal/u);
  assert.match(backup, /COMPOSE=\(docker compose --project-directory "\$RELEASE_ROOT" --env-file/);
  assert.match(backup, /"\$\{COMPOSE\[@\]\}" exec -T postgres/);
  assert.match(source, /backup\.sh\.next/);
  assert.match(source, /bash -n .*backup\.sh\.next/);
  assert.match(source, /mv .*backup\.sh\.next \/usr\/local\/bin\/backup\.sh/);
  assert.ok(source.indexOf('expect_http_body') < source.lastIndexOf('backup.sh.next'));
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
  assert.match(parserService, /cpus: 2/);
});
