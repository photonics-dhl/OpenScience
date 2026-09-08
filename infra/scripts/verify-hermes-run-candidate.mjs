#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ISOLATION_ID = 'xgs-hermes-migration-a72b5e1c';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SESSION_TOKEN = 'hermes-run-acceptance-session';

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('arguments must be --name value pairs');
    values.set(key, value);
  }
  return values;
}

function validateConfig(values) {
  const releaseRootArg = values.get('--release-root');
  const databaseUrl = values.get('--database-url');
  const candidateSha = values.get('--candidate-sha');
  const isolationId = values.get('--isolation-id');
  assert.ok(releaseRootArg, 'an explicit --release-root is required');
  assert.match(candidateSha ?? '', SHA_PATTERN, 'candidate SHA must be an explicit full lowercase Git SHA');
  const releaseRoot = realpathSync(releaseRootArg);
  assert.equal(isolationId, ISOLATION_ID, 'isolated PostgreSQL container identity is not the reviewed test target');
  assert.ok(databaseUrl, 'an explicit --database-url is required');

  const parsed = new URL(databaseUrl);
  assert.ok(parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:', 'only PostgreSQL is accepted');
  assert.equal(parsed.hostname, '127.0.0.1', 'database must be the isolated container loopback');
  assert.equal(parsed.port || '5432', '5432', 'database port must be 5432');
  assert.equal(decodeURIComponent(parsed.username), 'postgres', 'database user must be the isolated test role');
  assert.equal(parsed.password, '', 'database URL must not contain credentials');
  assert.equal(parsed.search, '', 'database URL options are not accepted');
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(databaseName, /^(?:postgres|hermes_run_acceptance(?:_[a-z0-9_]+)?)$/u,
    'database name is not an explicit Hermes acceptance database');

  for (const name of ['DATABASE_URL', 'REDIS_URL', 'SEARCH_DATABASE_URL']) {
    assert.equal(Object.hasOwn(process.env, name), false, `${name} must not be present in the acceptance container`);
  }
  assert.notEqual(process.env.NODE_ENV, 'production', 'production NODE_ENV is forbidden');

  const markerPath = join(releaseRoot, '.release-source');
  assert.ok(existsSync(markerPath), 'immutable release source marker is missing');
  assert.equal(statSync(markerPath).mode & 0o222, 0, 'release source marker must be read-only');
  assert.equal(readFileSync(markerPath, 'utf8').trim(), candidateSha, 'release source marker does not match candidate');
  for (const path of [
    join(releaseRoot, 'apps', 'api', 'dist', 'app.js'),
    join(releaseRoot, 'packages', 'database', 'dist', 'index.js'),
    join(releaseRoot, 'packages', 'domain', 'dist', 'index.js'),
  ]) assert.ok(existsSync(path), `required candidate build output is missing: ${path}`);
  return { releaseRoot, databaseUrl, databaseName, candidateSha, isolationId };
}

function runtime(config) {
  const require = createRequire(join(config.releaseRoot, 'package.json'));
  const { createPrismaClient } = require(join(config.releaseRoot, 'packages', 'database', 'dist', 'index.js'));
  const { buildApp } = require(join(config.releaseRoot, 'apps', 'api', 'dist', 'app.js'));
  const { reconcileHermesResearchRuns } = require(join(config.releaseRoot, 'packages', 'domain', 'dist', 'index.js'));
  return { prisma: createPrismaClient({ datasourceUrl: config.databaseUrl }), buildApp, reconcileHermesResearchRuns };
}

function fakeRedis(userId) {
  const store = new Map([[`sess:${SESSION_TOKEN}`, JSON.stringify({
    userId,
    status: 'email_verified',
    createdAt: new Date().toISOString(),
  })]]);
  return {
    set: async (key, value) => { store.set(key, value); return 'OK'; },
    get: async (key) => store.get(key) ?? null,
    del: async (key) => (store.delete(key) ? 1 : 0),
    expire: async () => 1,
  };
}

async function withApi(config, userId, callback) {
  const { prisma, buildApp } = runtime(config);
  let app;
  try {
    app = await buildApp({
      prisma,
      redis: fakeRedis(userId),
      mailer: { send: async () => undefined },
      cookieSecret: 'hermes-run-acceptance-only',
      secureCookies: false,
    });
    return await callback(app);
  } finally {
    await app?.close();
    await prisma.$disconnect();
  }
}

async function childAction(action, config, input) {
  if (action === 'api-create') {
    return withApi(config, input.userId, async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: `/research-objects/${input.researchObjectId}/hermes-runs`,
        cookies: { openscience_session: SESSION_TOKEN },
        headers: { 'idempotency-key': input.idempotencyKey },
        payload: { ingestionTaskIds: input.ingestionTaskIds },
      });
      return { statusCode: response.statusCode, body: response.json() };
    });
  }
  if (action === 'api-get') {
    return withApi(config, input.userId, async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: `/research-objects/${input.researchObjectId}/hermes-runs/${input.runId}`,
        cookies: { openscience_session: SESSION_TOKEN },
      });
      return { statusCode: response.statusCode, cacheControl: response.headers['cache-control'], body: response.json() };
    });
  }
  if (action === 'reconcile') {
    const { prisma, reconcileHermesResearchRuns } = runtime(config);
    try {
      return await reconcileHermesResearchRuns({ prisma, mailer: { send: async () => undefined } }, { limit: 100 });
    } finally {
      await prisma.$disconnect();
    }
  }
  throw new Error('unknown internal acceptance action');
}

function runChild(action, config, input = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(SCRIPT_PATH, ['--internal-action', action], {
      env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', TZ: 'UTC' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('message', (message) => {
      if (message?.ok) resolve(message.result);
      else reject(new Error(message?.error ?? 'acceptance child failed'));
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `acceptance child exited ${code}`));
    });
    child.send({ config, input });
  });
}

async function seedFixture(prisma) {
  const fixtureId = randomUUID();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const primary = { researchObjectId: randomUUID(), artifactId: randomUUID(), agentSessionId: randomUUID(), agentTaskId: randomUUID(), batchId: randomUUID(), ingestionTaskId: randomUUID() };
  const revoked = { researchObjectId: randomUUID(), artifactId: randomUUID(), agentSessionId: randomUUID(), agentTaskId: randomUUID(), batchId: randomUUID(), ingestionTaskId: randomUUID() };
  const blobHash = createHash('sha256').update(fixtureId).digest('hex');
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { id: userId, email: `hermes-${fixtureId}@acceptance.invalid`, passwordHash: 'acceptance-fixture', displayName: 'Hermes Acceptance', status: 'email_verified' } });
    await tx.workspace.create({ data: { id: workspaceId, type: 'team', name: `Hermes acceptance ${fixtureId}`, ownerId: userId } });
    await tx.membership.create({ data: { workspaceId, userId, role: 'author' } });
    await tx.blob.create({ data: { sha256: blobHash, storageKey: `acceptance/${fixtureId}`, size: 1n } });
    for (const [ordinal, source] of [primary, revoked].entries()) {
      await tx.researchObject.create({ data: { id: source.researchObjectId, workspaceId, title: `Hermes acceptance ${ordinal + 1}`, createdBy: userId } });
      await tx.artifact.create({ data: { id: source.artifactId, logicalPath: `paper-${ordinal + 1}.pdf`, mimeType: 'application/pdf', size: 1n, blobSha256: blobHash, uploadedBy: userId, workspaceId } });
      await tx.agentSession.create({ data: { id: source.agentSessionId, userId, researchObjectId: source.researchObjectId, kind: 'ingestion', title: 'Hermes acceptance ingestion' } });
      await tx.agentTask.create({ data: { id: source.agentTaskId, sessionId: source.agentSessionId, kind: 'artifact.extract', status: 'succeeded', progress: 100, payload: {} } });
      await tx.ingestionBatch.create({ data: { id: source.batchId, researchObjectId: source.researchObjectId, userId, agentSessionId: source.agentSessionId, requestDigest: blobHash } });
      await tx.ingestionTask.create({ data: { id: source.ingestionTaskId, batchId: source.batchId, artifactId: source.artifactId, agentTaskId: source.agentTaskId, state: 'parsing' } });
    }
  });
  return { fixtureId, userId, workspaceId, primary, revoked };
}

async function main(values) {
  const config = validateConfig(values);
  const { prisma } = runtime(config);
  let fixture;
  try {
    const identity = await prisma.$queryRaw`SELECT current_database() AS database, current_user AS role`;
    assert.equal(identity[0]?.database, config.databaseName, 'connected database does not match the explicit target');
    assert.equal(identity[0]?.role, 'postgres', 'connected role does not match the isolated test role');
    for (const model of ['user', 'workspace', 'researchObject', 'ingestionTask', 'hermesResearchRun']) {
      assert.equal(await prisma[model].count(), 0, `acceptance target is not empty (${model})`);
    }
    fixture = await seedFixture(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const primaryRequest = {
    userId: fixture.userId,
    researchObjectId: fixture.primary.researchObjectId,
    ingestionTaskIds: [fixture.primary.ingestionTaskId],
    idempotencyKey: `hermes-acceptance-primary-${fixture.fixtureId}`,
  };
  const duplicateCreates = await Promise.all([
    runChild('api-create', config, primaryRequest),
    runChild('api-create', config, primaryRequest),
  ]);
  for (const result of duplicateCreates) assert.equal(result.statusCode, 202, 'concurrent API create did not return 202');
  const primaryRunId = duplicateCreates[0].body.run.id;
  assert.equal(duplicateCreates[1].body.run.id, primaryRunId, 'concurrent idempotent creates persisted different runs');

  const persisted = await runChild('api-get', config, { userId: fixture.userId, researchObjectId: fixture.primary.researchObjectId, runId: primaryRunId });
  assert.equal(persisted.statusCode, 200, 'a separate API process could not read the persisted run');
  assert.equal(persisted.cacheControl, 'private, no-store');
  assert.equal(persisted.body.run.status, 'running');

  const conflict = await runChild('api-create', config, { ...primaryRequest, ingestionTaskIds: [fixture.revoked.ingestionTaskId] });
  assert.equal(conflict.statusCode, 409, 'idempotency key reuse with a different request was not rejected');
  assert.equal(conflict.body.error?.code, 'IDEMPOTENCY_CONFLICT');

  const revokedCreate = await runChild('api-create', config, {
    userId: fixture.userId,
    researchObjectId: fixture.revoked.researchObjectId,
    ingestionTaskIds: [fixture.revoked.ingestionTaskId],
    idempotencyKey: `hermes-acceptance-revoked-${fixture.fixtureId}`,
  });
  assert.equal(revokedCreate.statusCode, 202);
  const revokedRunId = revokedCreate.body.run.id;

  const mutation = runtime(config).prisma;
  try {
    await mutation.ingestionTask.update({ where: { id: fixture.primary.ingestionTaskId }, data: { state: 'needs_review' } });
  } finally {
    await mutation.$disconnect();
  }
  const reconcileRace = await Promise.all([runChild('reconcile', config), runChild('reconcile', config)]);
  assert.equal(reconcileRace.reduce((sum, result) => sum + result.advanced, 0), 1, 'reconcile CAS did not advance exactly once');

  const verification = runtime(config).prisma;
  try {
    const primaryRun = await verification.hermesResearchRun.findUnique({ where: { id: primaryRunId }, include: { steps: true } });
    assert.equal(primaryRun?.status, 'awaiting_source_review');
    assert.equal(primaryRun?.version, 2, 'source-review transition did not increment the CAS version exactly once');
    assert.deepEqual(primaryRun?.steps.map((step) => step.status), ['succeeded']);
    await verification.membership.update({ where: { workspaceId_userId: { workspaceId: fixture.workspaceId, userId: fixture.userId } }, data: { role: 'viewer' } });
    await verification.hermesResearchRun.update({ where: { id: revokedRunId }, data: { lastReconciledAt: null } });
  } finally {
    await verification.$disconnect();
  }

  const revokedCounts = await runChild('reconcile', config);
  assert.equal(revokedCounts.stopped, 1, 'write-authority revocation did not stop the running Hermes run');
  const finalDb = runtime(config).prisma;
  try {
    const stopped = await finalDb.hermesResearchRun.findUnique({ where: { id: revokedRunId }, include: { steps: true } });
    assert.equal(stopped?.status, 'stopped');
    assert.equal(stopped?.version, 2);
    assert.equal(stopped?.error, 'authorization or research object scope changed');
    assert.deepEqual(stopped?.steps.map((step) => step.status), ['stopped']);
    assert.equal(await finalDb.hermesResearchRun.count({ where: { idempotencyKey: primaryRequest.idempotencyKey } }), 1);
  } finally {
    await finalDb.$disconnect();
  }

  process.stdout.write(`HERMES_RUN_ACCEPTANCE PASS candidate=${config.candidateSha} isolation=${config.isolationId} database=${config.databaseName} auth=memory-fake\n`);
  process.stdout.write(`fixture_id=${fixture.fixtureId}\nprimary_run_id=${primaryRunId}\nrevoked_run_id=${revokedRunId}\n`);
  process.stdout.write('checks=api_create,cross_process_get,idempotency_conflict,reconcile_cas,awaiting_source_review,write_authority_revocation\n');
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[database-url-redacted]').slice(0, 500);
}

if (process.argv[2] === '--internal-action') {
  const action = process.argv[3];
  process.once('message', async ({ config, input }) => {
    try {
      const result = await childAction(action, config, input);
      process.send?.({ ok: true, result }, () => process.exit(0));
    } catch (error) {
      process.send?.({ ok: false, error: safeError(error) }, () => process.exit(1));
    }
  });
} else {
  main(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`HERMES_RUN_ACCEPTANCE FAIL ${safeError(error)}\n`);
    process.exitCode = 1;
  });
}
