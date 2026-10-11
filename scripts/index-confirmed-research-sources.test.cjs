const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, 'index-confirmed-research-sources.cjs'), 'utf8');
const TASK = '96b0dbe8-b5cc-4784-a9c2-0b62d12cb766';
const OLD_TASK = '049c8b89-7cb0-431c-ae52-2e5303de4c30';
const GENERATION = 'd357d0b2-3c45-47d4-a83a-0afef7cfa972';
const RO = 'c896802c-35dd-4b59-8db1-5f374f83a6d8';
const ARTIFACT = '72abd165-3382-4600-8ed5-b2bf6d427baa';
const SOURCE = '63683675-0395-482c-9bbb-8112a883d119';
const VERSION = '20471968-f746-4a56-89d2-6e1d0fde2830';
const MODEL = '44444444-4444-4444-8444-444444444444';
const createdAt = new Date('2026-09-28T12:00:00Z');

function fixture() {
  // Historical target IDs are real; owner/source/model details here are synthetic.
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: ARTIFACT,
    contentHash: 'a'.repeat(64), serializedSha256: 'b'.repeat(64),
    objectKey: 'derived/source-maps/' + 'b'.repeat(64) + '.json', size: 123 };
  const identity = { modelVersionId: MODEL, modelRevision: '5617a9f61b028005a4858fdac845db406aefb181',
    sourceSha256: '1'.repeat(64), packageFreezeSha256: '2'.repeat(64), modelManifestSha256: '3'.repeat(64) };
  const owner = { id: TASK, kind: 'search.index', status: 'succeeded', deletedAt: null, retryCount: 0,
    executionAttempt: 1, createdAt, result: { status: 'needs_review', errorCode: 'token_limit_exceeded', chunkCount: 69 },
    payload: { artifactId: ARTIFACT, versionId: VERSION, sourceTaskId: SOURCE, sourceExecutionAttempt: 1, sourceMapRef },
    session: { userId: 'current-owner', status: 'active', deletedAt: null, researchObjectId: RO,
      researchObject: { id: RO, workspaceId: 'current-workspace', deletedAt: null } } };
  const generation = { id: GENERATION, status: 'needs_review', errorCode: 'embedding_unavailable',
    isCurrent: true, attemptCount: 1, fenceOwnerTaskId: TASK, fenceOwnerAttempt: 1, fenceOwnerCreatedAt: createdAt,
    workspaceId: 'current-workspace', researchObjectId: RO, artifactId: ARTIFACT, sourceVersionId: VERSION,
    contentHash: sourceMapRef.contentHash, modelVersionId: MODEL, sourceGenerationSha256: 'c'.repeat(64),
    modelVersion: { id: MODEL, provider: 'BAAI', model: 'bge-m3', revision: identity.modelRevision,
      dimension: 1024, status: 'active', sourceSha256: identity.sourceSha256,
      packageFreezeSha256: identity.packageFreezeSha256, modelManifestSha256: identity.modelManifestSha256 } };
  return { owner, generation, identity };
}

async function run(args, change = () => {}) {
  const state = fixture();
  const calls = { ownerReads: [], generationReads: [], legacyReads: 0, enqueues: [], retries: [],
    redisCreated: 0, coreClosed: 0, searchClosed: 0, redisClosed: 0 };
  const messages = [];
  const process = { argv: ['node', 'index-confirmed-research-sources.cjs', ...args], env: {}, cwd: () => '/fixture' };
  const core = {
    agentTask: { findUnique: async query => { calls.ownerReads.push(query); return state.owner; } },
    ingestionTask: { findMany: async () => { calls.legacyReads += 1; return []; } },
    $disconnect: async () => { calls.coreClosed += 1; },
  };
  const search = {
    searchIndexTask: {
      findUnique: async query => { calls.generationReads.push(query); return state.generation; },
      findMany: async query => { calls.generationReads.push(query); return state.generations ?? [state.generation]; },
    },
    $disconnect: async () => { calls.searchClosed += 1; },
  };
  const domain = {
    parseDocumentSourceMapReference: reference => reference,
    parseSourceMapSearchIndexPayload: payload => payload?.sourceMapRef ? payload : undefined,
    enqueueSourceMapSearchIndex: async (...input) => { calls.enqueues.push(input); return { taskId: TASK, status: 'succeeded' }; },
    retryAgentTask: async (_deps, input) => {
      calls.retries.push(input); return { id: input.taskId, status: 'pending', retryCount: state.owner.retryCount + 1 };
    },
  };
  const database = { createPrismaClient: () => core, createPrismaAuditSink: () => ({}),
    createRedisClient: () => { calls.redisCreated += 1; return { quit: async () => { calls.redisClosed += 1; } }; } };
  const searchModule = { createSearchPrismaClient: () => search,
    loadSearchIndexRuntimeConfig: () => ({ enabled: true, modelIdentity: state.identity }) };
  change({ state, core, search, domain, searchModule });
  const read = id => {
    if (id === '@openscience/database') return database;
    if (id === '@prisma/client') return { Prisma: { sql: (...parts) => parts } };
    if (id === '@openscience/domain') return domain;
    if (id === '@openscience/search' || id === '../packages/search/dist/index.js') return searchModule;
    throw new Error('unexpected module: ' + id);
  };
  const result = vm.runInNewContext(script, {
    require: id => id === 'node:module' ? { createRequire: () => read } : read(id),
    process,
    console: { log: value => messages.push(JSON.parse(value)), error: value => messages.push({ error: value }) },
  });
  await result;
  return { state, calls, messages, exitCode: process.exitCode ?? 0 };
}

test('explicit token-limit CLI reads the exact owner and both budgets without pre-enqueue', async () => {
  const { calls, messages, exitCode } = await run(['--apply', '--recover-token-limit-task', TASK]);
  assert.equal(exitCode, 0);
  assert.equal(calls.ownerReads[0]?.where.id, TASK);
  assert.equal(calls.ownerReads.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.generationReads)), [{
    where: { workspaceId: 'current-workspace', researchObjectId: RO, artifactId: ARTIFACT, isCurrent: true },
    include: { modelVersion: true }, take: 2,
  }]);
  assert.equal(calls.legacyReads, 0);
  assert.equal(calls.enqueues.length, 0);
  assert.equal(calls.retries.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.retries[0])), {
    userId: 'current-owner', taskId: TASK, sourceIndexRecovery: 'token-limit-after-upgrade',
  });
  assert.equal(messages.at(-1).status, 'pending');
  assert.equal(messages[0].generationId, GENERATION);
  assert.equal(calls.coreClosed, 1);
  assert.equal(calls.searchClosed, 1);
  assert.equal(calls.redisClosed, 1);
});

test('exact-task dry-run reads current state but never enables recovery', async () => {
  const { calls, messages } = await run(['--recover-token-limit-task', TASK]);
  assert.equal(calls.ownerReads[0]?.where.id, TASK);
  assert.equal(calls.ownerReads.length, 1);
  assert.equal(calls.generationReads[0]?.where.isCurrent, true);
  assert.equal(calls.enqueues.length, 0);
  assert.equal(calls.retries.length, 0);
  assert.equal(calls.redisCreated, 0);
  assert.equal(messages[0].mode, 'plan');
  assert.equal(messages[0].taskId, TASK);
});

for (const failure of ['core-budget', 'storage-budget', 'deleted-owner', 'wrong-ro', 'wrong-kind', 'wrong-status', 'wrong-code',
  'inline-source', 'wrong-workspace', 'wrong-owner', 'wrong-source', 'wrong-fence', 'wrong-version', 'wrong-model', 'wrong-manifest', 'not-current',
  'disabled-model', 'producer-denial']) {
  test('exact-task CLI refuses ' + failure + ' without enqueue or dispatch', async () => {
    const { calls, messages, exitCode } = await run(['--apply', '--recover-token-limit-task', TASK], ({ state, domain, searchModule }) => {
      if (failure === 'core-budget') state.owner.retryCount = 2;
      if (failure === 'storage-budget') state.generation.attemptCount = 3;
      if (failure === 'deleted-owner') state.owner.deletedAt = new Date();
      if (failure === 'wrong-ro') state.owner.session.researchObjectId = 'other-ro';
      if (failure === 'wrong-kind') state.owner.kind = 'sdf.extract';
      if (failure === 'wrong-status') state.owner.status = 'pending';
      if (failure === 'wrong-code') state.owner.result.errorCode = 'embedding_unavailable';
      if (failure === 'inline-source') state.owner.payload = { artifactId: ARTIFACT, sourceMap: {} };
      if (failure === 'wrong-workspace') state.generation.workspaceId = 'other-workspace';
      if (failure === 'wrong-owner') state.generation.fenceOwnerTaskId = OLD_TASK;
      if (failure === 'wrong-source') state.generation.contentHash = '9'.repeat(64);
      if (failure === 'wrong-fence') state.generation.fenceOwnerAttempt = 0;
      if (failure === 'wrong-version') state.generation.sourceVersionId = 'other-version';
      if (failure === 'wrong-model') state.generation.modelVersionId = 'other-model';
      if (failure === 'wrong-manifest') state.generation.modelVersion.modelManifestSha256 = '9'.repeat(64);
      if (failure === 'not-current') state.generation.isCurrent = false;
      if (failure === 'disabled-model') searchModule.loadSearchIndexRuntimeConfig = () => ({ enabled: false });
      if (failure === 'producer-denial') domain.retryAgentTask = async () => { throw new Error('source changed'); };
    });
    assert.equal(calls.enqueues.length, 0);
    assert.equal(exitCode, 1);
    assert.equal(calls.legacyReads, 0);
    assert.equal(calls.retries.length, 0);
    if (failure !== 'producer-denial') assert.equal(calls.redisCreated, 0);
    assert.equal(messages.at(-1).error, 'confirmed_source_index_operation_failed');
    assert.equal(calls.coreClosed, 1);
    if (calls.generationReads.length) assert.equal(calls.searchClosed, 1);
  });
}

test('default plan and retry-incomplete do not activate the explicit mode', async () => {
  for (const args of [[], ['--retry-incomplete'], ['--apply', '--retry-incomplete']]) {
    const { calls } = await run(args);
    assert.equal(calls.ownerReads.length, 0);
    assert.equal(calls.generationReads.length, 0);
    assert.equal(calls.retries.length, 0);
    assert.equal(calls.legacyReads, 1);
  }
});

test('legacy retry-incomplete still enqueues confirmed sources and uses only ordinary retry', async () => {
  const { calls, exitCode } = await run(['--apply', '--retry-incomplete'], ({ state, core, domain }) => {
    const roIds = ['9067a2d5-42ad-4c06-b234-753728b71064', RO];
    core.ingestionTask.findMany = async () => {
      return roIds.map((researchObjectId, index) => ({
        id: 'legacy-ingestion-' + index, artifactId: ARTIFACT, agentTaskId: SOURCE,
        batch: { userId: 'current-owner', researchObjectId, researchObject: { deletedAt: null } },
        artifact: { deletedAt: null, bytesPurgedAt: null, blobSha256: state.owner.payload.sourceMapRef.contentHash },
        agentTask: { status: 'succeeded', executionAttempt: 1, deletedAt: null,
          session: { status: 'active', deletedAt: null } },
      }));
    };
    let queryIndex = 0;
    core.$queryRaw = async () => [{
      reference: state.owner.payload.sourceMapRef, artifact_id: ARTIFACT, research_object_id: roIds[queryIndex++],
    }];
    core.version = { findFirst: async () => ({ id: VERSION, versionNo: 14 }) };
    domain.getAgentTask = async () => ({ canRetry: true });
  });
  assert.equal(exitCode, 0);
  assert.equal(calls.enqueues.length, 2);
  assert.equal(calls.retries.length, 2);
  assert.equal(calls.generationReads.length, 0);
  for (const input of calls.retries) assert.deepEqual(Object.keys(input).sort(), ['taskId', 'userId']);
});

test('a mismatched selected owner, missing selector and mixed modes never fall through to legacy', async () => {
  for (const args of [
    ['--apply', '--recover-token-limit-task', SOURCE],
    ['--apply', '--recover-token-limit-task'],
    ['--apply', '--recover-token-limit-task=' + TASK],
    ['--apply', '--recover-token-limit-task', TASK, '--retry-incomplete'],
  ]) {
    const { calls, messages } = await run(args);
    assert.equal(calls.enqueues.length, 0);
    assert.equal(calls.retries.length, 0);
    assert.equal(calls.legacyReads, 0);
    assert.equal(messages.at(-1).error, 'confirmed_source_index_operation_failed');
  }
});

test('another explicitly selected eligible owner and generation are not restricted to fixed IDs', async () => {
  const selected = '55555555-5555-4555-8555-555555555555';
  const generation = '66666666-6666-4666-8666-666666666666';
  const { calls, messages, exitCode } = await run(['--apply', '--recover-token-limit-task', selected], ({ state }) => {
    state.owner.id = selected;
    state.owner.session.userId = 'fresh-selected-owner';
    state.generation.id = generation;
    state.generation.fenceOwnerTaskId = selected;
  });
  assert.equal(exitCode, 0);
  assert.equal(calls.ownerReads.length, 1);
  assert.equal(calls.ownerReads[0].where.id, selected);
  assert.equal(calls.retries[0].taskId, selected);
  assert.equal(calls.retries[0].userId, 'fresh-selected-owner');
  assert.equal(messages[0].generationId, generation);
  assert.equal(calls.legacyReads, 0);
  assert.equal(calls.enqueues.length, 0);
});

test('an old selected owner never adopts the current foreign owner', async () => {
  const { calls, exitCode } = await run(['--apply', '--recover-token-limit-task', OLD_TASK], ({ state }) => {
    state.owner.id = OLD_TASK;
  });
  assert.equal(exitCode, 1);
  assert.equal(calls.ownerReads.length, 1);
  assert.equal(calls.ownerReads[0].where.id, OLD_TASK);
  assert.equal(calls.generationReads.length, 1);
  assert.equal(calls.legacyReads, 0);
  assert.equal(calls.enqueues.length, 0);
  assert.equal(calls.retries.length, 0);
  assert.equal(calls.redisCreated, 0);
});

for (const count of [0, 2]) {
  test('exact selection rejects ' + count + ' current generations without hiding conflicts', async () => {
    const { calls, exitCode } = await run(['--apply', '--recover-token-limit-task', TASK], ({ state }) => {
      state.generations = count === 0 ? [] : [
        state.generation, { ...state.generation, id: '77777777-7777-4777-8777-777777777777', fenceOwnerTaskId: OLD_TASK },
      ];
    });
    assert.equal(exitCode, 1);
    assert.equal(calls.enqueues.length, 0);
    assert.equal(calls.retries.length, 0);
    assert.equal(calls.redisCreated, 0);
  });
}

test('explicit UUID case is normalized without changing the selected owner', async () => {
  const { calls, exitCode } = await run(['--apply', '--recover-token-limit-task', TASK.toUpperCase()]);
  assert.equal(exitCode, 0);
  assert.equal(calls.ownerReads[0].where.id, TASK);
  assert.equal(calls.retries[0].taskId, TASK);
});

for (const [name, args] of [
  ['misspelled recovery flag', ['--apply', '--recover-token-limit-tas', TASK]],
  ['conflicting recovery selector', ['--apply', '--recover-token-limit-task', TASK,
    '--recover-token-limit-task=' + SOURCE]],
]) {
  test(name + ' never reads legacy sources or starts recovery', async () => {
    const { calls, exitCode } = await run(args);
    assert.equal(exitCode, 1);
    assert.equal(calls.ownerReads.length, 0);
    assert.equal(calls.legacyReads, 0);
    assert.equal(calls.enqueues.length, 0);
    assert.equal(calls.retries.length, 0);
    assert.equal(calls.redisCreated, 0);
  });
}

test('unknown flags, duplicate flags and stray arguments fail before database reads', async () => {
  for (const args of [
    ['--apply', '--unknown'],
    ['--apply', '--apply'],
    ['--apply', '--retry-incomplete', '--retry-incomplete'],
    [TASK],
  ]) {
    const { calls, exitCode } = await run(args);
    assert.equal(exitCode, 1);
    assert.equal(calls.ownerReads.length, 0);
    assert.equal(calls.legacyReads, 0);
    assert.equal(calls.enqueues.length, 0);
    assert.equal(calls.retries.length, 0);
    assert.equal(calls.redisCreated, 0);
  }
});
