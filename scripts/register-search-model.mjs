import { pathToFileURL } from 'node:url';

import { createSearchPrismaClient } from '../packages/search/dist/index.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function required(env, name, pattern) {
  const value = env[name];
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

export function searchModelIdentityFromEnv(env = process.env) {
  if (env.BGE_M3_ENABLED !== 'true') throw new Error('BGE_M3_ENABLED must be true');
  return {
    id: required(env, 'BGE_M3_MODEL_VERSION_ID', UUID),
    provider: 'BAAI',
    model: 'bge-m3',
    revision: required(env, 'BGE_M3_MODEL_REVISION', SHA1),
    dimension: 1_024,
    sourceSha256: required(env, 'BGE_M3_SOURCE_SHA256', SHA256),
    packageFreezeSha256: required(env, 'BGE_M3_PACKAGE_FREEZE_SHA256', SHA256),
    modelManifestSha256: required(env, 'BGE_M3_MODEL_MANIFEST_SHA256', SHA256),
  };
}

function sameIdentity(row, expected) {
  return row.id === expected.id
    && row.provider === expected.provider
    && row.model === expected.model
    && row.revision === expected.revision
    && row.dimension === expected.dimension
    && row.sourceSha256 === expected.sourceSha256
    && row.packageFreezeSha256 === expected.packageFreezeSha256
    && row.modelManifestSha256 === expected.modelManifestSha256;
}

export async function registerSearchModel(client, identity) {
  return client.$transaction(async (tx) => {
    const [byId, byNaturalKey, active] = await Promise.all([
      tx.searchModelVersion.findUnique({ where: { id: identity.id } }),
      tx.searchModelVersion.findUnique({
        where: { provider_model_revision: {
          provider: identity.provider,
          model: identity.model,
          revision: identity.revision,
        } },
      }),
      tx.searchModelVersion.findMany({ where: { status: 'active' }, take: 2 }),
    ]);
    const existing = byId ?? byNaturalKey;
    if ((byId && !sameIdentity(byId, identity))
      || (byNaturalKey && !sameIdentity(byNaturalKey, identity))
      || active.some((row) => !sameIdentity(row, identity))) {
      throw new Error('search model identity conflicts with the active registry');
    }
    if (!existing) {
      await tx.searchModelVersion.create({ data: { ...identity, status: 'active' } });
      return { created: true };
    }
    if (existing.status === 'retired') throw new Error('retired search model cannot be reactivated implicitly');
    if (existing.status !== 'active') {
      await tx.searchModelVersion.update({ where: { id: identity.id }, data: { status: 'active', retiredAt: null } });
    }
    return { created: false };
  });
}

async function main() {
  const client = createSearchPrismaClient();
  try {
    const identity = searchModelIdentityFromEnv();
    const result = await registerSearchModel(client, identity);
    process.stdout.write(`SEARCH_MODEL_REGISTERED id=${identity.id} created=${result.created}\n`);
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
