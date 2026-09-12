/** Shared machine-readable contract for the frozen record response. */
const string = { type: 'string' };
const nullableString = { type: ['string', 'null'] };
const array = (items: object) => ({ type: 'array', items });
const object = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const state = { enum: ['recorded', 'not_recorded'] };
const fields = ['problem','insight','method','results','limitations','reproducibility'];
export const researchRecordSchema = {
  $id: 'https://openscience.428312321.xyz/api/research-record/schema',
  ...object({
    schemaVersion: { const: '1.0.0' }, objectId: string, versionId: string, versionNo: { type: 'integer', minimum: 1 }, recordState: state,
    citation: object({ uri: string, url: string, title: nullableString, createdAt: { type: 'string', format: 'date-time' } }),
    identity: object({ originalAuthors: object({ state: { const: 'not_recorded' }, items: { type: 'array', maxItems: 0, items: string } }),
      originalDoi: object({ state: { const: 'not_recorded' }, value: { type: 'null' } }),
      platformAuthors: array(object({ name: nullableString, affiliation: nullableString, isCorresponding: { type: 'boolean' } })),
      licenses: array(object({ type: string, identifier: string })) }),
    sdf: { type: 'object', properties: Object.fromEntries([...fields, 'schemaVersion'].map(field => [field,string])), additionalProperties: true },
    claims: array(object({ id: string, parentClaimId: nullableString, kind: string, statement: string, assessment: string,
      conditions: array(string), limitations: array(string), extractionStatus: string })),
    evidence: array(object({ id: string, claimId: string, artifactId: string, kind: string, title: string, relation: string, contentHash: string,
      extractionConfidence: {type:['number','null']}, extractionStatus: string, verified: { type: 'boolean' }, locator: { type: 'object', additionalProperties: false, properties: {
        page: { type: 'integer', minimum: 1 }, blockId: string,
        boundingBox: object({ x: {type:'number'}, y: {type:'number'}, width: {type:'number'}, height: {type:'number'} }),
        charRange: object({start:{type:'integer'},end:{type:'integer'}}), tableCell: {type:'object'}, codeRange: {type:'object'},
      } }, source: object({ state, url: string }) })),
    manifest: array(object({ logicalPath: string, artifactId: string, blobSha256: string, downloadUrl: string, downloadAccess: {const: 'workspace_member'} })),
    missing: object({ sdfFields: array({ enum: fields }), claims: state, evidence: state, materials: state }),
    collections: object({ complete: { const: true }, pagination: { const: 'none' }, order: string }),
    links: object({ self: string, export: string, schema: string, openapi: string }),
  }),
};
const parameters = [
  { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  { name: 'versionId', in: 'path', required: true, schema: { type: 'string' }, description: 'Exact version UUID, or latest. Resolve latest once and retain links.self.' },
];
const errors = { '401': { description: 'Invalid or expired session cookie' }, '404': { description: 'Unknown or inaccessible object/version/evidence' }, '429': { description: 'Rate limited; honor Retry-After seconds' } };
export const researchRecordOpenApi = {
  openapi: '3.1.0', info: { title: 'OpenScience frozen research record API', version: '1.0.0' }, servers: [{ url: '/api' }],
  components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'openscience_session' } }, schemas: { ResearchRecord: researchRecordSchema } },
  paths: Object.fromEntries(['', '/export', '/evidence/{evidenceId}/source'].map(suffix => [`/research-objects/{id}/versions/{versionId}/record${suffix}`, { get: {
    summary: suffix.includes('source') ? 'Resolve the frozen source locator' : 'Read the complete frozen research record',
    security: [{}, { session: [] }], parameters: [...parameters, ...(suffix.includes('source') ? [{ name: 'evidenceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] : [])],
    responses: { '200': { description: 'Complete response. No pagination or truncation. Private responses are no-store.', content: { 'application/json': { schema: suffix.includes('source')
      ? object({ source: object({ text: nullableString, page: {type:['integer','null']}, region: {type:['object','null']} }) })
      : suffix === '/export' ? { $ref: '#/components/schemas/ResearchRecord' } : object({ record: { $ref: '#/components/schemas/ResearchRecord' } }) } } }, ...errors,
      ...(suffix.includes('source') ? { '503': { description: 'Frozen original, SourceMap or locator unavailable; no current source fallback' } } : {}) },
  } }])),
};
