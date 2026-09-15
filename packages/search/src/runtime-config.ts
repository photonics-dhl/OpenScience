import type { DenseModelIdentity } from './dense';

const BGE_M3_REVISION = '5617a9f61b028005a4858fdac845db406aefb181';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type SearchIndexRuntimeConfig =
  | { enabled: false }
  | { enabled: true; endpoint: string; modelIdentity: DenseModelIdentity };

/** Indexing and queries must use the same registered embedding identity. */
export function loadSearchIndexRuntimeConfig(env: NodeJS.ProcessEnv = process.env): SearchIndexRuntimeConfig {
  const enabled = env.BGE_M3_ENABLED ?? 'false';
  if (enabled === 'false') return { enabled: false };
  if (enabled !== 'true') throw new Error('BGE_M3_ENABLED must be true or false');

  const modelVersionId = env.BGE_M3_MODEL_VERSION_ID ?? '';
  const modelRevision = env.BGE_M3_MODEL_REVISION ?? '';
  const sourceSha256 = env.BGE_M3_SOURCE_SHA256 ?? '';
  const packageFreezeSha256 = env.BGE_M3_PACKAGE_FREEZE_SHA256 ?? '';
  const modelManifestSha256 = env.BGE_M3_MODEL_MANIFEST_SHA256 ?? '';
  const endpoint = env.EMBEDDING_WORKER_URL ?? 'http://embedding-worker:8080';
  if (!UUID_PATTERN.test(modelVersionId)) throw new Error('BGE_M3_MODEL_VERSION_ID is invalid');
  if (modelRevision !== BGE_M3_REVISION) throw new Error('BGE_M3_MODEL_REVISION is invalid');
  for (const [name, value] of [
    ['BGE_M3_SOURCE_SHA256', sourceSha256],
    ['BGE_M3_PACKAGE_FREEZE_SHA256', packageFreezeSha256],
    ['BGE_M3_MODEL_MANIFEST_SHA256', modelManifestSha256],
  ] as const) {
    if (!SHA256_PATTERN.test(value)) throw new Error(`${name} is invalid`);
  }
  if (env.NODE_ENV === 'production' && endpoint !== 'http://embedding-worker:8080') {
    throw new Error('EMBEDDING_WORKER_URL must use the internal embedding worker in production');
  }
  return {
    enabled: true,
    endpoint,
    modelIdentity: { modelVersionId, modelRevision, sourceSha256, packageFreezeSha256, modelManifestSha256 },
  };
}
