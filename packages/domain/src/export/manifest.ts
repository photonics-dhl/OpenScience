import { computeContentSha256 } from '../identity/identifiers';
import type { ManifestEntryInput } from '@openscience/versioning';
import type { SdfManifest } from '@openscience/sdf-schema';

/** §5.3 manifest 序列化输入。 */
export interface BuildManifestInput {
  objectId: string; // OSR-YYYY-NNNNNN
  versionId: string; // OSR-YYYY-NNNNNN-vN
  version: number;
  title: string;
  visibility: 'private' | 'invite_only' | 'public';
  publishedAt?: string; // ISO UTC
  authors?: string[]; // Phase 1C 填实
  licenses?: { text: string; code: string; data: string }; // Phase 1C 许可选择
  artifacts: ManifestEntryInput[];
  parentVersion?: string | null;
  forkedFrom?: string | null;
}

/** §5.3 manifest.json 最小结构（contentHash = P1B-6 排序聚合哈希）。 */
export function buildManifest(input: BuildManifestInput): SdfManifest {
  return {
    schema: 'openscience-sdf',
    schemaVersion: '0.1.0',
    objectId: input.objectId,
    versionId: input.versionId,
    version: input.version,
    title: input.title,
    visibility: input.visibility,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    contentHash: `sha256:${computeContentSha256(input.artifacts)}`,
    authors: input.authors ?? [],
    licenses: input.licenses ?? { text: '', code: '', data: '' },
    artifacts: input.artifacts.map((a) => ({ logicalPath: a.logicalPath, blobSha256: a.blobSha256 })),
    parentVersion: input.parentVersion ?? null,
    forkedFrom: input.forkedFrom ?? null,
  };
}
