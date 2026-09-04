import assert from 'node:assert/strict';
import test from 'node:test';

import { registerSearchModel, searchModelIdentityFromEnv } from './register-search-model.mjs';

const env = {
  BGE_M3_ENABLED: 'true',
  BGE_M3_MODEL_VERSION_ID: '123e4567-e89b-42d3-a456-426614174000',
  BGE_M3_MODEL_REVISION: '1'.repeat(40),
  BGE_M3_SOURCE_SHA256: '2'.repeat(64),
  BGE_M3_PACKAGE_FREEZE_SHA256: '3'.repeat(64),
  BGE_M3_MODEL_MANIFEST_SHA256: '4'.repeat(64),
};

function client({ byId = null, byNaturalKey = null, active = [] } = {}) {
  const calls = [];
  const tx = {
    searchModelVersion: {
      findUnique: async ({ where }) => ('id' in where ? byId : byNaturalKey),
      findMany: async () => active,
      create: async (input) => { calls.push(['create', input]); },
      update: async (input) => { calls.push(['update', input]); },
    },
  };
  return { calls, $transaction: async (callback) => callback(tx) };
}

test('parses the exact BGE production identity', () => {
  assert.deepEqual(searchModelIdentityFromEnv(env), {
    id: env.BGE_M3_MODEL_VERSION_ID,
    provider: 'BAAI', model: 'bge-m3', revision: env.BGE_M3_MODEL_REVISION, dimension: 1_024,
    sourceSha256: env.BGE_M3_SOURCE_SHA256,
    packageFreezeSha256: env.BGE_M3_PACKAGE_FREEZE_SHA256,
    modelManifestSha256: env.BGE_M3_MODEL_MANIFEST_SHA256,
  });
  assert.throws(() => searchModelIdentityFromEnv({ ...env, BGE_M3_ENABLED: 'false' }), /must be true/);
});

test('creates the missing active model registry row and replays without a write', async () => {
  const identity = searchModelIdentityFromEnv(env);
  const missing = client();
  assert.deepEqual(await registerSearchModel(missing, identity), { created: true });
  assert.deepEqual(missing.calls, [['create', { data: { ...identity, status: 'active' } }]]);

  const replay = client({ byId: { ...identity, status: 'active', retiredAt: null }, byNaturalKey: { ...identity, status: 'active', retiredAt: null }, active: [{ ...identity, status: 'active' }] });
  assert.deepEqual(await registerSearchModel(replay, identity), { created: false });
  assert.deepEqual(replay.calls, []);
});

test('activates an exact candidate but rejects conflicts and retired rows', async () => {
  const identity = searchModelIdentityFromEnv(env);
  const candidate = client({ byId: { ...identity, status: 'candidate' }, byNaturalKey: { ...identity, status: 'candidate' } });
  assert.deepEqual(await registerSearchModel(candidate, identity), { created: false });
  assert.deepEqual(candidate.calls, [['update', { where: { id: identity.id }, data: { status: 'active', retiredAt: null } }]]);

  await assert.rejects(registerSearchModel(client({ active: [{ ...identity, id: '223e4567-e89b-42d3-a456-426614174000', status: 'active' }] }), identity), /conflicts/);
  await assert.rejects(registerSearchModel(client({ byId: { ...identity, status: 'retired' }, byNaturalKey: { ...identity, status: 'retired' } }), identity), /retired/);
});
