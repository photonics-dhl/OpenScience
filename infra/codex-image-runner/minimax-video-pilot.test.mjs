import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runPilot } from './minimax-video-pilot.mjs';
import { MiniMaxVideoError } from '../../packages/ai-gateway/dist/minimax-video.js';

const request = {
  model: 'MiniMax-H3',
  content: [{ type: 'text', text: 'Public promotional concept with Mandarin narration.' }],
  resolution: '768P', duration: 10, ratio: '16:9',
};
const logRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../tmp/video-system-20260929');

async function fixture(t) {
  await mkdir(logRoot, { recursive: true });
  const root = await mkdtemp(join(logRoot, 'minimax-pilot-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const key = join(root, 'secrets/minimax-video.key');
  await mkdir(dirname(key), { mode: 0o700 });
  await writeFile(key, 'test-only-key\n', { mode: 0o600 });
  const configPath = join(root, 'minimax-cloud.json');
  await writeFile(configPath, JSON.stringify({
    baseUrl: 'https://api.minimax.cn', apiKeyFile: key, model: 'MiniMax-H3',
    pilot: { duration: 10, resolution: '768P', ratio: '16:9', maxCreateRequests: 1 },
  }), { mode: 0o600 });
  const requestFile = join(root, 'request-input.json');
  await writeFile(requestFile, JSON.stringify(request), { mode: 0o600 });
  // The runtime is Linux/root only. Emulate POSIX metadata on this Windows host;
  // file contents, exclusive creation, fsync, publication and races remain real.
  const inspect = async path => {
    const stat = await lstat(path);
    stat.uid = 0; stat.gid = 0;
    stat.mode = (stat.mode & ~0o7777) | (stat.isDirectory() ? 0o700 : 0o600);
    return stat;
  };
  const dependencies = { configPath, platform: 'linux', getuid: () => 0, geteuid: () => 0, lstat: inspect };
  return { root, requestFile, dependencies, stateRoot: join(root, 'minimax-h3-pilot') };
}

test('prepare durably saves the exact wire request without creating a paid task', async t => {
  const f = await fixture(t);
  f.dependencies.getClient = () => { throw new Error('prepare must not access credentials or the provider'); };
  const result = await runPilot({ command: 'prepare', requestFile: f.requestFile }, f.dependencies);
  assert.equal(result.status, 'prepared');
  assert.equal(await readFile(join(f.stateRoot, 'request.json'), 'utf8'), JSON.stringify(request));
  await assert.rejects(lstat(join(f.stateRoot, 'create-attempt')), { code: 'ENOENT' });
});

const task = (status = 'running') => ({ id: 'pilot-123', model: 'MiniMax-H3', status,
  resolution: '768P', duration: 10, ratio: '16:9',
  content: status === 'succeeded' ? { url: 'https://cdn.hailuoai.com/video.mp4?private=secret' } : {},
});
async function prepared(t) {
  const f = await fixture(t);
  await runPilot({ command: 'prepare', requestFile: f.requestFile }, f.dependencies);
  return f;
}

test('concurrent submit and repeated invocations create exactly once', async t => {
  const f = await prepared(t); let calls = 0;
  f.dependencies.getClient = () => ({ create: async value => {
    calls++; assert.deepEqual(value, request);
    assert.deepEqual(JSON.parse(await readFile(join(f.stateRoot, 'create-attempt'), 'utf8')).request, request);
    return { task_id: 'pilot-123' };
  } });
  const options = { command: 'submit', requestFile: f.requestFile };
  const results = await Promise.all([runPilot(options, f.dependencies), runPilot(options, f.dependencies)]);
  assert.equal(calls, 1);
  assert.ok(results.some(result => result.status === 'submitted'));
  const resumed = await runPilot(options, f.dependencies);
  assert.equal(resumed.taskId, 'pilot-123'); assert.equal(calls, 1);
});

for (const outcome of ['uncertain', 'rejected']) test(`${outcome} create can never be resubmitted`, async t => {
  const f = await prepared(t); let calls = 0;
  f.dependencies.getClient = () => ({ create: async () => {
    calls++;
    throw new MiniMaxVideoError('VIDEO_HTTP_FAILED', outcome, outcome === 'rejected' ? 402 : 503, 'insufficient_balance_error');
  } });
  const options = { command: 'submit', requestFile: f.requestFile };
  assert.equal((await runPilot(options, f.dependencies)).status, outcome);
  assert.equal((await runPilot(options, f.dependencies)).status, outcome);
  assert.equal((await runPilot({ command: 'status' }, f.dependencies)).status, outcome);
  assert.equal(calls, 1);
});

test('status resumes the original task with GET only and never exposes signed media URLs', async t => {
  const f = await prepared(t); let creates = 0, queries = 0;
  f.dependencies.getClient = () => ({ create: async () => { creates++; return { task_id: 'pilot-123' }; },
    query: async id => { queries++; assert.equal(id, 'pilot-123'); return task('succeeded'); } });
  await runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies);
  const result = await runPilot({ command: 'status' }, f.dependencies);
  assert.equal(result.status, 'succeeded'); assert.equal(result.hasVideo, true);
  assert.equal(creates, 1); assert.equal(queries, 1);
  assert.equal(JSON.stringify(result).includes('private=secret'), false);
  assert.equal(JSON.parse(await readFile(join(f.stateRoot, 'terminal.json'), 'utf8')).content.url, task('succeeded').content.url);
  await runPilot({ command: 'status' }, f.dependencies);
  assert.equal(queries, 1);
});

test('a query failure keeps the saved task recoverable without another POST', async t => {
  const f = await prepared(t); let creates = 0, unavailable = true;
  f.dependencies.getClient = () => ({ create: async () => { creates++; return { task_id: 'pilot-123' }; },
    query: async () => { if (unavailable) throw new MiniMaxVideoError('VIDEO_TIMEOUT', 'uncertain'); return task(); } });
  await runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies);
  const failedQuery = await runPilot({ command: 'status' }, f.dependencies);
  assert.equal(failedQuery.status, 'query_failed'); assert.equal(failedQuery.taskId, 'pilot-123');
  unavailable = false;
  assert.equal((await runPilot({ command: 'status' }, f.dependencies)).status, 'running');
  assert.equal(creates, 1);
});

test('a crash after durable attempt reservation remains uncertain', async t => {
  const f = await prepared(t); let calls = 0;
  f.dependencies.getClient = () => ({ create: async () => { calls++; return { task_id: 'pilot-123' }; } });
  f.dependencies.afterReservation = async () => { throw new Error('simulated crash'); };
  await assert.rejects(runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies));
  delete f.dependencies.afterReservation;
  assert.equal((await runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies)).status, 'uncertain');
  assert.equal(calls, 0);
});

test('reservation sync failure prevents execution and consumes the local attempt', async t => {
  const f = await prepared(t); let calls = 0;
  f.dependencies.getClient = () => ({ create: async () => { calls++; return { task_id: 'pilot-123' }; } });
  f.dependencies.syncDirectory = async () => { throw new Error('simulated fsync failure'); };
  await assert.rejects(runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies));
  delete f.dependencies.syncDirectory;
  assert.equal((await runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies)).status, 'uncertain');
  assert.equal(calls, 0);
});

test('changing the prepared request or attempt identity is rejected', async t => {
  const f = await prepared(t);
  await writeFile(f.requestFile, JSON.stringify({ ...request, content: [{ type: 'text', text: 'different' }] }));
  await assert.rejects(runPilot({ command: 'prepare', requestFile: f.requestFile }, f.dependencies), /PILOT_REQUEST_MISMATCH/);
  await assert.rejects(runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies), /PILOT_REQUEST_MISMATCH/);
  await writeFile(f.requestFile, JSON.stringify(request));
  await writeFile(join(f.stateRoot, 'create-attempt'), JSON.stringify({ schemaVersion: 1, request: { ...request, duration: 15 } }));
  await assert.rejects(runPilot({ command: 'status' }, f.dependencies));
});

for (const change of [ { model: 'MiniMax-H3-Max' }, { pilot: { duration: 15, resolution: '768P', ratio: '16:9', maxCreateRequests: 1 } },
  { pilot: { duration: 10, resolution: '768P', ratio: '16:9', maxCreateRequests: 2 } }, { baseUrl: 'https://example.com' },
  { apiKeyFile: '/some-other-key' } ]) test(`configuration rejects unauthorized alteration ${JSON.stringify(change)}`, async t => {
  const f = await fixture(t);
  const original = JSON.parse(await readFile(f.dependencies.configPath, 'utf8'));
  await writeFile(f.dependencies.configPath, JSON.stringify({ ...original, ...change }));
  await assert.rejects(runPilot({ command: 'prepare', requestFile: f.requestFile }, f.dependencies));
});

test('non-root execution, permissive config and linked state are refused', async t => {
  const f = await fixture(t);
  await assert.rejects(runPilot({ command: 'prepare', requestFile: f.requestFile }, { ...f.dependencies, getuid: () => 1000 }), /PILOT_ROOT_REQUIRED/);
  const inspect = f.dependencies.lstat;
  await assert.rejects(runPilot({ command: 'prepare', requestFile: f.requestFile }, { ...f.dependencies, lstat: async path => {
    const stat = await inspect(path); if (path === f.dependencies.configPath) stat.mode |= 0o040; return stat;
  } }), /PILOT_FILE_PERMISSIONS/);
  const other = join(f.root, 'other'); await mkdir(other);
  await symlink(other, f.stateRoot, 'junction');
  await assert.rejects(runPilot({ command: 'prepare', requestFile: f.requestFile }, f.dependencies), /PILOT_DIRECTORY_PERMISSIONS/);
});

test('malformed receipts and unexpected query task identities never drive new requests', async t => {
  const f = await prepared(t); let creates = 0;
  f.dependencies.getClient = () => ({ create: async () => { creates++; return { task_id: 'pilot-123' }; },
    query: async () => ({ ...task(), id: 'other' }) });
  await runPilot({ command: 'submit', requestFile: f.requestFile }, f.dependencies);
  assert.equal((await runPilot({ command: 'status' }, f.dependencies)).status, 'query_failed');
  await writeFile(join(f.stateRoot, 'receipt.json'), '{}');
  await assert.rejects(runPilot({ command: 'status' }, f.dependencies));
  assert.equal(creates, 1);
});
