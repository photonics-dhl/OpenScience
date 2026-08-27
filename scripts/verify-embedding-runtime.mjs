import { Buffer } from 'node:buffer';
import { EmbeddingClient } from '../packages/search/dist/index.js';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const EXPECTED_HEALTH_KEYS = [
  'computePlatform',
  'dimension',
  'modelManifestSha256',
  'modelRevision',
  'packageFreezeSha256',
  'schemaVersion',
  'sourceSha256',
  'status',
];

function required(name) {
  const value = process.env[name]?.trim() ?? '';
  if (value === '') throw new Error(`embedding_canary_config_missing:${name}`);
  return value;
}

function expectedIdentity() {
  const identity = {
    modelRevision: required('BGE_M3_MODEL_REVISION'),
    sourceSha256: required('BGE_M3_SOURCE_SHA256'),
    packageFreezeSha256: required('BGE_M3_PACKAGE_FREEZE_SHA256'),
    modelManifestSha256: required('BGE_M3_MODEL_MANIFEST_SHA256'),
  };
  for (const [name, value] of Object.entries(identity)) {
    if (name !== 'modelRevision' && !HASH_PATTERN.test(value)) {
      throw new Error(`embedding_canary_config_invalid:${name}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(identity.modelRevision)) {
    throw new Error('embedding_canary_config_invalid:modelRevision');
  }
  return identity;
}

async function readBoundedJson(response, limit = 16 * 1024) {
  if (response.body === null) throw new Error('embedding_canary_health_empty');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > limit) throw new Error('embedding_canary_health_too_large');
      chunks.push(Buffer.from(item.value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
}

function assertIdentity(actual, expected) {
  for (const [name, value] of Object.entries(expected)) {
    if (actual?.[name] !== value) throw new Error(`embedding_canary_identity_mismatch:${name}`);
  }
}

async function main() {
  const baseUrl = required('EMBEDDING_WORKER_URL').replace(/\/$/, '');
  const expected = expectedIdentity();
  const healthResponse = await globalThis.fetch(`${baseUrl}/health`, {
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  if (healthResponse.status !== 200 || healthResponse.headers.get('content-type')?.split(';', 1)[0] !== 'application/json') {
    throw new Error('embedding_canary_health_unavailable');
  }
  const health = await readBoundedJson(healthResponse);
  if (
    typeof health !== 'object'
    || health === null
    || Array.isArray(health)
    || Object.keys(health).sort().join('\0') !== EXPECTED_HEALTH_KEYS.join('\0')
    || health.schemaVersion !== 1
    || health.status !== 'ready'
    || health.dimension !== 1024
    || health.computePlatform !== 'cpu'
  ) {
    throw new Error('embedding_canary_health_invalid');
  }
  assertIdentity(health, expected);

  const result = await new EmbeddingClient({ baseUrl }).embed({
    purpose: 'query',
    texts: ['OpenScience BGE-M3 production canary'],
  });
  assertIdentity(result, expected);
  if (result.dimension !== 1024 || result.vectors.length !== 1 || result.vectors[0]?.length !== 1024) {
    throw new Error('embedding_canary_vector_invalid');
  }
  process.stdout.write('EMBEDDING_RUNTIME_OK\n');
}

await main();
