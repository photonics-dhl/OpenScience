/**
 * SDF manifest JSON Schema（§5.3 最小结构）。
 *
 * 技术债务（同 core，P1B-4 manifest 定型时收紧）：additionalProperties 宽容。
 */
export const SDF_MANIFEST_SCHEMA_NAME = 'openscience-sdf';
export const SDF_MANIFEST_VERSION = '0.1.0';

export const SDF_VISIBILITIES = ['private', 'invite_only', 'public'] as const;

export const manifestSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'OpenScience SDF Manifest',
  type: 'object',
  required: [
    'schema',
    'schemaVersion',
    'objectId',
    'versionId',
    'version',
    'title',
    'visibility',
    'contentHash',
    'authors',
    'licenses',
    'artifacts',
    'parentVersion',
    'forkedFrom',
  ],
  properties: {
    schema: { const: SDF_MANIFEST_SCHEMA_NAME },
    schemaVersion: { const: SDF_MANIFEST_VERSION },
    objectId: { type: 'string', pattern: '^OSR-\\d{4}-\\d{6}$' },
    versionId: { type: 'string', pattern: '^OSR-\\d{4}-\\d{6}-v\\d+$' },
    version: { type: 'integer', minimum: 1 },
    title: { type: 'string', minLength: 1 },
    visibility: { enum: [...SDF_VISIBILITIES] },
    publishedAt: { type: 'string', format: 'date-time' },
    contentHash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    authors: { type: 'array', items: { type: 'string' } },
    licenses: {
      type: 'object',
      required: ['text', 'code', 'data'],
      properties: {
        text: { type: 'string' },
        code: { type: 'string' },
        data: { type: 'string' },
      },
    },
    artifacts: { type: 'array' },
    parentVersion: { type: ['string', 'null'] },
    forkedFrom: { type: ['string', 'null'] },
  },
  // 债务：宽容未知键
} as const;

/** TS 类型：§5.3 最小结构。publishedAt optional（draft 态无发布）。 */
export type SdfManifest = {
  schema: typeof SDF_MANIFEST_SCHEMA_NAME;
  schemaVersion: typeof SDF_MANIFEST_VERSION;
  objectId: string;
  versionId: string;
  version: number;
  title: string;
  visibility: (typeof SDF_VISIBILITIES)[number];
  publishedAt?: string;
  contentHash: string;
  authors: string[];
  licenses: {
    text: string;
    code: string;
    data: string;
  };
  artifacts: unknown[];
  parentVersion: string | null;
  forkedFrom: string | null;
};
