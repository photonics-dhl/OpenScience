import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, writeFile, readFile, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { runSynclipBrokerOnce, validateSynclipBrokerConfig, SYNCLIP_ROOT } from './broker.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fixtureRoot = join(repo, 'tmp/hermes-cleanup-20261003');
const fixtureDirectories = [];
after(async () => {
  if (!fixtureDirectories.length) return;
  const expectedRoot = join(await realpath(repo), 'tmp/hermes-cleanup-20261003');
  assert.equal(await realpath(fixtureRoot), expectedRoot);
  for (const base of fixtureDirectories) {
    assert.equal((await lstat(base)).isSymbolicLink(), false);
    const target = await realpath(base);
    assert.equal(dirname(target), expectedRoot);
    assert.match(basename(target), /^independent-domain-synclip-broker-[A-Za-z0-9]{6}$/u);
    await rm(target, { recursive: true, force: true });
  }
});

const id = '88888888-8888-4888-8888-888888888888';
function chunk(type, payload) {
  const data = Buffer.concat([Buffer.from(type), payload]); let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  const bytes = Buffer.alloc(payload.length + 12); bytes.writeUInt32BE(payload.length); data.copy(bytes, 4);
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4); return bytes;
}
const header = Buffer.alloc(13); header.writeUInt32BE(1280); header.writeUInt32BE(720, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.alloc((1280 * 4 + 1) * 720))), chunk('IEND', Buffer.alloc(0))]);
const rootConfig = { inbox: `${SYNCLIP_ROOT}/spool/inbox`, results: `${SYNCLIP_ROOT}/spool/results`,
  privateRoot: `${SYNCLIP_ROOT}/private`, rendererImage: `sha256:${'a'.repeat(64)}` };
async function fixture(taskId = id) {
  await mkdir(fixtureRoot, { recursive: true });
  const base = await mkdtemp(join(fixtureRoot, 'independent-domain-synclip-broker-'));
  fixtureDirectories.push(base);
  const config = { ...rootConfig, inbox: join(base, 'inbox'), results: join(base, 'results'), privateRoot: join(base, 'private') };
  for (const path of [config.inbox, config.results, config.privateRoot]) await mkdir(path);
  const now = Date.now(); const request = { schemaVersion: 1, provider: 'synclip', id: taskId, prompt: 'Original accepted Native illustration prompt.',
    promptHash: createHash('sha256').update('Original accepted Native illustration prompt.').digest('hex'), createdAt: now - 2000, deadlineAt: now + 598000 };
  await writeFile(join(config.inbox, `${taskId}.submitted.json`), JSON.stringify(request));
  const privateDir = join(config.privateRoot, taskId); const resultDir = join(config.results, taskId);
  const calls = []; const deps = { now: () => now, readKey: async () => { calls.push('key'); return 'host-only-test-key'; },
    transportDependencies: { now: () => now, client: {
      create: async prompt => { calls.push(['POST', prompt]); return { task_id: 'remote-original', status: 'processing' }; },
      query: async task_id => { calls.push(['GET', task_id]); return { task_id, status: 'completed', output: { type: 'image', url: 'https://cdn.synclip.ai/original?private' }, url_expires_at: '2099-01-01T00:00:00Z' }; },
    }, download: async () => png, normalize: async (_config, _id, _raw, normalized) => { await mkdir(normalized, { recursive: true }); await writeFile(join(normalized, 'result.png'), png); return png; } },
  };
  const identity = { schemaVersion: 1, requestId: taskId, promptHash: request.promptHash, model: 'gpt-image-2.5', aspectRatio: '16:9' };
  async function claimed({ known = true, result = 'uncertain' } = {}) {
    await mkdir(privateDir); await writeFile(join(privateDir, 'request.json'), JSON.stringify(request));
    await writeFile(join(privateDir, 'started'), String(now - 1000));
    await writeFile(join(privateDir, 'synclip-attempt.json'), JSON.stringify(identity));
    if (known) await writeFile(join(privateDir, 'synclip-receipt.json'), JSON.stringify({ ...identity, taskId: 'remote-original' }));
    if (result) {
      await mkdir(resultDir);
      await writeFile(join(resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, provider: 'synclip', id: taskId,
        promptHash: request.promptHash, status: result, ...(result !== 'succeeded' ? { errorCode: result === 'failed' ? 'EXECUTION_FAILED' : 'UNCERTAIN' } : {}) }));
    }
  }
  return { config, deps, request, calls, privateDir, resultDir, claimed, identity, now };
}
test('public broker config accepts only fixed roots and pinned renderer, never a key or provider override', () => {
  assert.deepEqual(validateSynclipBrokerConfig(rootConfig), rootConfig);
  for (const config of [{ ...rootConfig, apiKey: 'secret' }, { ...rootConfig, provider: 'codex' },
    { ...rootConfig, inbox: '/tmp/inbox' }, { ...rootConfig, results: rootConfig.inbox }, { ...rootConfig, rendererImage: 'latest' }]) {
    assert.throws(() => validateSynclipBrokerConfig(config));
  }
});
test('fresh submission uses actual runOne and transport and publishes only the original spool identity', async () => {
  const f = await fixture(); await writeFile(join(f.config.inbox, `${id}.json`), JSON.stringify(f.request));
  assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id, status: 'succeeded' });
  assert.deepEqual(f.calls.filter(Array.isArray).map(call => call[0]), ['POST', 'GET']);
  const result = JSON.parse(await readFile(join(f.resultDir, 'result.json'), 'utf8'));
  assert.deepEqual(result, { schemaVersion: 1, provider: 'synclip', id, promptHash: f.request.promptHash, status: 'succeeded' });
  assert.deepEqual(await readFile(join(f.resultDir, 'result.png')), png);
  assert.ok(!JSON.stringify(result).includes('host-only-test-key')); assert.ok(!JSON.stringify(result).includes('remote-original'));
});
test('known-ID recovery runs before core, performs GET only and preserves the previous uncertain receipt', async () => {
  const f = await fixture(); await f.claimed(); const previous = await readFile(join(f.resultDir, 'result.json'));
  assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id, status: 'reconciled' });
  assert.deepEqual(f.calls.filter(Array.isArray), [['GET', 'remote-original']]);
  assert.deepEqual(await readFile(join(f.resultDir, 'result.before-synclip-recovery.json')), previous);
  assert.equal(JSON.parse(await readFile(join(f.resultDir, 'result.json'), 'utf8')).status, 'succeeded');
  f.calls.length = 0; assert.equal(await runSynclipBrokerOnce(f.config, f.deps), null); assert.deepEqual(f.calls, []);
});
test('saved remote ID recovers a crash before any public result without going through POST', async () => {
  const f = await fixture(); await f.claimed({ result: null });
  assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id, status: 'reconciled' });
  assert.deepEqual(f.calls.filter(Array.isArray), [['GET', 'remote-original']]);
});
test('pending GET and query failure preserve uncertainty without renewed POST permission', async () => {
  for (const shouldThrow of [false, true]) {
    const f = await fixture(); await f.claimed(); const previous = await readFile(join(f.resultDir, 'result.json'));
    f.deps.transportDependencies.client.query = async task_id => { f.calls.push(['GET', task_id]); if (shouldThrow) throw Error('private-error'); return { task_id, status: 'processing' }; };
    assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id, status: 'recovery_pending' });
    assert.deepEqual(await readFile(join(f.resultDir, 'result.json')), previous);
    assert.deepEqual(f.calls.filter(Array.isArray), [['GET', 'remote-original']]);
  }
});
test('missing remote ID never calls recovery, POST, or reads the credential', async () => {
  const f = await fixture(); await f.claimed({ known: false });
  assert.equal(await runSynclipBrokerOnce(f.config, f.deps), null); assert.deepEqual(f.calls, []);
});
test('recovery grace is based on the original started/deadline and does not renew after each scan', async () => {
  const f = await fixture(); await f.claimed(); const previous = await readFile(join(f.resultDir, 'result.json'));
  f.deps.now = () => f.request.deadlineAt + 3600001;
  assert.equal(await runSynclipBrokerOnce(f.config, f.deps), null); assert.deepEqual(f.calls, []);
  assert.deepEqual(await readFile(join(f.resultDir, 'result.json')), previous);
});
test('known-ID recovery is allowed after the original execution deadline within the fixed grace', async () => {
  const f = await fixture(); await f.claimed({ result: 'failed' });
  f.deps.now = () => f.request.deadlineAt + 1000; f.deps.transportDependencies.now = f.deps.now;
  assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id, status: 'reconciled' });
  assert.deepEqual(f.calls.filter(Array.isArray), [['GET', 'remote-original']]);
});
test('mismatched original reservation, receipt, or public result blocks GET and leaves evidence unchanged', async () => {
  for (const target of ['reservation', 'receipt', 'result']) {
    const f = await fixture(); await f.claimed();
    const path = target === 'reservation' ? join(f.config.inbox, `${id}.submitted.json`)
      : target === 'receipt' ? join(f.privateDir, 'synclip-receipt.json') : join(f.resultDir, 'result.json');
    const value = JSON.parse(await readFile(path, 'utf8')); await writeFile(path, JSON.stringify({ ...value, promptHash: '0'.repeat(64) }));
    const saved = await readFile(path); await runSynclipBrokerOnce(f.config, f.deps);
    assert.deepEqual(f.calls, []); assert.deepEqual(await readFile(path), saved);
  }
});
test('recovery never overwrites a different original published image', async () => {
  const f = await fixture(); await f.claimed(); const existing = Buffer.from('retained-original');
  await writeFile(join(f.resultDir, 'result.png'), existing);
  await runSynclipBrokerOnce(f.config, f.deps);
  assert.deepEqual(await readFile(join(f.resultDir, 'result.png')), existing);
  assert.equal(JSON.parse(await readFile(join(f.resultDir, 'result.json'), 'utf8')).status, 'uncertain');
});
test('no-work broker run is inert and does not read any key', async () => {
  const f = await fixture(); assert.equal(await runSynclipBrokerOnce(f.config, f.deps), null); assert.deepEqual(f.calls, []);
  assert.deepEqual(await readdir(f.config.results), []);
});
test('linked private task directory cannot trigger a remote call', async () => {
  const f = await fixture(); const target = join(f.config.privateRoot, 'outside'); await mkdir(target);
  await symlink(target, f.privateDir, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runSynclipBrokerOnce(f.config, f.deps), /UNSAFE_DIRECTORY/); assert.deepEqual(f.calls, []);
});

test('an earlier pending request cannot hide a later completed known-ID request', async () => {
  const f = await fixture(); await f.claimed();
  const secondId = '99999999-9999-4999-8999-999999999999';
  const request = { ...f.request, id: secondId }; const privateDir = join(f.config.privateRoot, secondId);
  await mkdir(privateDir); await writeFile(join(privateDir, 'request.json'), JSON.stringify(request));
  await writeFile(join(f.config.inbox, `${secondId}.submitted.json`), JSON.stringify(request));
  await writeFile(join(privateDir, 'started'), String(f.now - 1000));
  const identity = { ...f.identity, requestId: secondId };
  await writeFile(join(privateDir, 'synclip-attempt.json'), JSON.stringify(identity));
  await writeFile(join(privateDir, 'synclip-receipt.json'), JSON.stringify({ ...identity, taskId: 'remote-second' }));
  const query = f.deps.transportDependencies.client.query;
  f.deps.transportDependencies.client.query = async task_id => {
    if (task_id === 'remote-original') { f.calls.push(['GET', task_id]); return { task_id, status: 'processing' }; }
    return query(task_id);
  };
  assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id: secondId, status: 'reconciled' });
  assert.deepEqual(f.calls.filter(Array.isArray), [['GET', 'remote-original'], ['GET', 'remote-second']]);
  assert.equal(JSON.parse(await readFile(join(f.resultDir, 'result.json'), 'utf8')).status, 'uncertain');
});

test('a remote task ID changed during recovery cannot adopt bytes fetched for the previous ID', async () => {
  const f = await fixture(); await f.claimed(); const previous = await readFile(join(f.resultDir, 'result.json'));
  const query = f.deps.transportDependencies.client.query;
  f.deps.transportDependencies.client.query = async task_id => {
    await writeFile(join(f.privateDir, 'synclip-receipt.json'), JSON.stringify({ ...f.identity, taskId: 'remote-changed' }));
    return query(task_id);
  };
  assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id, status: 'recovery_pending' });
  assert.deepEqual(await readFile(join(f.resultDir, 'result.json')), previous);
  await assert.rejects(readFile(join(f.resultDir, 'result.png')), { code: 'ENOENT' });
});

test('recovery calls share one deadline and cannot publish after the original grace expires', async () => {
  const f = await fixture(); await f.claimed(); let clock = f.request.deadlineAt + 3600000 - 1000;
  f.deps.now = () => clock;
  f.deps.resume = async (_request, _privateDir, config) => {
    assert.equal(config.deadlineAt, f.request.deadlineAt + 3600000); clock += 1001; return png;
  };
  assert.deepEqual(await runSynclipBrokerOnce(f.config, f.deps), { id, status: 'recovery_pending' });
  assert.equal(JSON.parse(await readFile(join(f.resultDir, 'result.json'), 'utf8')).status, 'uncertain');
  await assert.rejects(readFile(join(f.resultDir, 'result.png')), { code: 'ENOENT' });
});
