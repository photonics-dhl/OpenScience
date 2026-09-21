/** Discovery document for public articles and the existing frozen-record API. */
const string = { type: 'string' };
const nullableString = { type: ['string', 'null'] };
const array = (items: object) => ({ type: 'array', items });
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: true });
const integer = { type: 'integer' };
const positiveInteger = { type: 'integer', minimum: 1 };
const nullableInteger = { type: ['integer', 'null'] };
const dateTime = { type: 'string', format: 'date-time' };
const nullableDateTime = { type: ['string', 'null'], format: 'date-time' };
const uriReference = { type: 'string', format: 'uri-reference' };
const stringMap = { type: 'object', additionalProperties: string };
const contribution = object({ displayName: string, creditRole: string });
const metadataCapture = object({ source: { enum: ['publication', 'legacy_captured_at_migration', 'administrative_correction', 'not_recorded'] },
  capturedAt: nullableDateTime, fieldSources: { type: ['object', 'null'], additionalProperties: string,
    description: 'Provenance of displayed metadata, including explicitly authorized administrative corrections. These do not create another scientific publication.' } });
const state = { enum: ['recorded', 'not_recorded'] };
const fields = ['problem','insight','method','results','limitations','reproducibility'];
const mediaReader = object({ order: { type: 'integer', minimum: 0 }, title: string, narration: string }, ['order']);
export const researchRecordSchema = {
  $id: 'https://openscience.428312321.xyz/api/research-record/schema',
  ...object({
    schemaVersion: { const: '1.0.0' }, objectId: string, versionId: string, versionNo: { type: 'integer', minimum: 1 }, recordState: state,
    citation: object({ uri: string, url: string, title: nullableString, createdAt: dateTime,
      publicId: nullableString, publicVersionId: nullableString, publicationNo: nullableInteger, year: nullableInteger, publishedAt: nullableDateTime, text: nullableString,
    }, ['uri', 'url', 'title', 'createdAt']),
    identity: object({ originalAuthors: object({ state: { const: 'not_recorded' }, items: { type: 'array', maxItems: 0, items: string } }),
      originalDoi: object({ state: { const: 'not_recorded' }, value: { type: 'null' } }),
      platformAuthors: array(object({ name: nullableString, affiliation: nullableString, isCorresponding: { type: 'boolean' } })),
      licenses: array(object({ type: string, identifier: string })), contributions: array(contribution),
    }, ['originalAuthors', 'originalDoi', 'platformAuthors', 'licenses']),
    publicationNo: nullableInteger, metadataCapture,
    sdf: { type: 'object', properties: Object.fromEntries([...fields, 'schemaVersion'].map(field => [field,string])), additionalProperties: true },
    media: { ...array(object({ id: string, kind: string, reader: mediaReader }, ['id', 'kind'])),
      description: 'Optional approved output projection for authorized private reading. Reader text and ordering come from this version’s captured history; older records may omit them.' },
    claims: array(object({ id: string, parentClaimId: nullableString, kind: string, statement: string, assessment: string,
      conditions: array(string), limitations: array(string), extractionStatus: string })),
    evidence: array(object({ id: string, claimId: string, artifactId: string, kind: string, title: string, relation: string, contentHash: string,
      extractionConfidence: {type:['number','null']}, extractionStatus: string, verified: { type: 'boolean' }, locator: { type: 'object', additionalProperties: false, properties: {
        page: { type: 'integer', minimum: 1 }, blockId: string,
        boundingBox: object({ x: {type:'number'}, y: {type:'number'}, width: {type:'number'}, height: {type:'number'} }),
        charRange: object({start:{type:'integer'},end:{type:'integer'}}), tableCell: {type:'object'}, codeRange: {type:'object'},
      } }, source: object({ state, url: string }) })),
    manifest: array({ ...object({ logicalPath: string, artifactId: string, blobSha256: string, downloadUrl: string, downloadAccess: { enum: ['workspace_member', 'public'] }, mimeType: nullableString }),
      required: ['logicalPath', 'artifactId', 'blobSha256', 'downloadUrl', 'downloadAccess'] }),
    missing: object({ sdfFields: array({ enum: fields }), claims: state, evidence: state, materials: state }),
    collections: object({ complete: { const: true }, pagination: { const: 'none' }, order: string }),
    links: object({ self: string, export: string, schema: string, openapi: string }),
  }, ['schemaVersion', 'objectId', 'versionId', 'versionNo', 'recordState', 'citation', 'identity', 'sdf', 'claims', 'evidence', 'manifest', 'missing', 'collections', 'links']),
};

const box = object({ x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } });
const nullableBox = { ...box, type: ['object', 'null'] };
const sourceLocator = object({
  blockId: string, page: positiveInteger, boundingBox: box,
  charRange: object({ start: integer, end: integer }),
  tableCell: object({ sheet: string, row: integer, column: integer }, ['row', 'column']),
  codeRange: object({ commit: string, path: string, startLine: positiveInteger, endLine: positiveInteger }),
}, []);
const publicClaim = object({ id: string, parentClaimId: nullableString, kind: string, statement: string,
  conditions: array(string), limitations: array(string), assessment: string });
const publicEvidence = object({ id: string, claimId: string, kind: string, title: string, exactQuote: nullableString,
  relation: string, locator: sourceLocator, extractionConfidence: { type: ['number', 'null'] }, verified: { type: 'boolean' },
  artifact: object({ logicalPath: string, mediaType: string, contentHash: string }) });
const publicEvidenceSource = object({ text: { ...string, maxLength: 20_000 }, page: nullableInteger, region: nullableBox,
  locator: sourceLocator, artifact: object({ logicalPath: string, mediaType: string }) });
const publicArticleProperties = {
  publicId: string, recordUrl: uriReference, title: string, url: uriReference, visibility: { const: 'public' },
  version: object({ versionNo: positiveInteger, publicationNo: positiveInteger, publicVersionId: string, status: string,
    publishedAt: nullableDateTime, contentSha256: { ...nullableString,
      description: 'Original issuance receipt hash, retained with the original publishedAt. It is not a hash of this HTTP response and is not recomputed after an administrative metadata correction; inspect metadataCapture for corrected fields.' }, legalDisclaimer: nullableString,
    core: { type: 'object', properties: Object.fromEntries(fields.map(field => [field, string])), additionalProperties: true,
      description: 'Frozen SDF core. Empty when this issued version is withdrawn or restricted.' },
  }),
  authors: array(object({ displayName: string, identityStatus: nullableString, isCorresponding: { type: 'boolean' }, affiliation: nullableString, sortOrder: integer })),
  contributions: array(contribution), licenses: stringMap, metadataCapture,
  aiReview: { ...object({ status: string, hardBlocks: {}, warnings: {} }), type: ['object', 'null'],
    description: 'Platform automated review metadata; this is not a claim of peer-review approval.' },
  citation: string,
  artifactPaths: array(object({ logicalPath: string, artifactId: string, blobSha256: string,
    downloadAccess: { enum: ['workspace_member', 'public'] }, downloadUrl: uriReference,
  }, ['logicalPath', 'artifactId', 'blobSha256', 'downloadAccess'])),
  claims: array(publicClaim), evidence: array(publicEvidence),
  presentationAssets: array(object({ id: string, kind: string, label: string, contentHash: string,
    generator: object({ name: string, version: string }), sourceClaimIds: array(string), url: uriReference, reader: mediaReader },
  ['id', 'kind', 'label', 'contentHash', 'generator', 'sourceClaimIds', 'url'])),
  history: { ...array(object({ versionNo: nullableInteger, publicationNo: nullableInteger, status: string, title: nullableString,
    publicVersionId: string, publishedAt: dateTime, contentSha256: string, url: uriReference })),
    maxItems: 100, description: 'Up to 100 issued versions, newest publication number first. Private editing versions are omitted.' },
  links: object({ self: { ...uriReference, description: 'API URL of the exact resolved publication.' }, latest: uriReference, human: uriReference, openapi: uriReference }),
};
const publicArticle = object({ ...publicArticleProperties,
  latestVersion: { ...positiveInteger, description: 'Compatibility field on the latest-publication response; equal to version.versionNo.' },
}, Object.keys(publicArticleProperties));
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: object) => ({ 'application/json': { schema } });
const correctedPublicationRedirect = { '307': {
  description: 'Temporary alias for an explicitly corrected legacy publication label, only while no canonical publication exists at the requested number. A real canonical publication always wins. Follow Location, then retain the returned canonical URL; never cache the old alias.',
  headers: { Location: { schema: uriReference }, 'Cache-Control': { schema: { const: 'no-store' } } },
} };
const errorSchema = object({ error: object({ code: string, message: string, requestId: string }, ['code', 'message']) });
const responseError = (description: string) => ({ description, content: jsonContent(ref('Error')) });
const errors = {
  '400': responseError('Invalid path or request parameter.'),
  '404': responseError('Unknown or inaccessible object, publication, source, or attachment. Private existence is not disclosed.'),
  '429': { ...responseError('Rate limited. Wait for Retry-After before retrying.'),
    headers: { 'Retry-After': { description: 'Seconds until another request may be sent.', schema: { type: 'string', pattern: '^[0-9]+$' } } } },
};
const unavailable = responseError('Frozen original, source locator, or stored media is temporarily unavailable. No live-content fallback.');
const pathParameter = (name: string, schema: object, description?: string) => ({ name, in: 'path', required: true, schema, ...(description ? { description } : {}) });
const publicIdParameter = pathParameter('publicId', string, 'Permanent research-object identifier, for example OSR-2026-000022.');
const publicVersionParameters = [publicIdParameter, pathParameter('versionNo', positiveInteger, 'Public publication number, not a private editing version number.')];
const uuid = { type: 'string', format: 'uuid' };
const recordParameters = [pathParameter('id', uuid), pathParameter('versionId', { anyOf: [uuid, { const: 'latest' }] },
  'Exact internal version UUID or latest. On a public object, latest resolves an available issued version; on an authorized private object, it resolves a private version. Retain links.self.')];
const discoveryHeaders = {
  'Content-Location': { description: 'Root-relative API URL of the exact publication returned, including when requested through latest.', schema: uriReference },
  Link: { description: 'OpenAPI service-desc and human-readable service-doc links.', schema: string },
  'Cache-Control': { description: 'no-store; lifecycle availability is evaluated on each request.', schema: string },
};
const binaryContent = { '*/*': { schema: { type: 'string', format: 'binary' } } };
const binaryHeaders = {
  'Content-Disposition': { description: 'inline for supported approved media; attachment for downloads and other media.', schema: string },
  'Content-Length': { schema: { type: 'string', pattern: '^[0-9]+$' } },
  'Cache-Control': { schema: string },
};
const articleDescription = 'Anonymous read of an issued publication on a public research object. Scientific content, authors, licences, citation and media membership come from the published version. Withdrawn or restricted publications still return identity and lifecycle metadata with HTTP 200; core is {}, and claims, evidence, artifactPaths and presentationAssets are empty. Links are root-relative URLs; resolve them against the service origin, not against the /api path.';

export const researchRecordOpenApi = {
  openapi: '3.1.0',
  info: { title: 'OpenScience public article and research record API', version: '1.1.0',
    description: 'Read published research as JSON, resolve frozen source excerpts, and access approved media or explicitly shared attachments. Existing private-record authorization is unchanged.' },
  servers: [{ url: 'https://openscience.428312321.xyz/api' }],
  externalDocs: { description: 'Developer guide', url: 'https://openscience.428312321.xyz/developers' },
  components: {
    securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'openscience_session', description: 'Existing session cookie, required only when accessing an authorized private record.' } },
    schemas: { ResearchRecord: researchRecordSchema, PublicArticle: publicArticle, PublicClaim: publicClaim, PublicEvidence: publicEvidence,
      PublicEvidenceSource: publicEvidenceSource, Error: errorSchema },
  },
  paths: {
    '/research/{publicId}': { get: {
      operationId: 'getLatestPublicArticle', summary: 'Read the latest issued article as complete JSON', security: [], parameters: [publicIdParameter],
      description: `${articleDescription} Resolves the highest issued publication number, including a withdrawn or restricted latest publication. Returns the same research body as the fixed-version endpoint, plus research.latestVersion for compatibility. Retain research.links.self or Content-Location to cite or fetch the resolved publication again.`,
      responses: { '200': { description: 'Complete public article; the latest pointer may resolve a different publication in a future request.', headers: discoveryHeaders,
        content: jsonContent(object({ research: { allOf: [ref('PublicArticle'), { type: 'object', required: ['latestVersion'] }] } })) }, ...errors },
    } },
    '/research/{publicId}/v/{versionNo}': { get: {
      operationId: 'getPublicArticleVersion', summary: 'Read a fixed public article version', security: [], parameters: publicVersionParameters, description: articleDescription,
      responses: { '200': { description: 'Version-bound public article or its withdrawn/restricted identity and status.', headers: discoveryHeaders, content: jsonContent(object({ research: ref('PublicArticle') })) }, ...correctedPublicationRedirect, ...errors },
    } },
    '/research/{publicId}/v/{versionNo}/evidence/{evidenceId}/source': { get: {
      operationId: 'getPublicEvidenceSource', summary: 'Read a frozen evidence source excerpt', security: [], parameters: [...publicVersionParameters, pathParameter('evidenceId', uuid)],
      description: 'Requires an available published/revised version and a verified evidence entry with frozen public-reuse permission. Returns an unwrapped source excerpt of at most 20,000 characters, public locator fields and frozen artifact display metadata. It is not the complete source document and does not expose private storage or SourceMap references.',
      responses: { '200': { description: 'Resolved source excerpt, without a source wrapper.', content: jsonContent(ref('PublicEvidenceSource')) }, ...correctedPublicationRedirect, ...errors, '503': unavailable },
    } },
    '/research/{publicId}/v/{versionNo}/presentation-assets/{assetId}': { get: {
      operationId: 'getPublicPresentationAsset', summary: 'Read approved media from a published version', security: [],
      parameters: [...publicVersionParameters, pathParameter('assetId', uuid),
        { name: 'Range', in: 'header', required: false, schema: string, description: 'One bytes range for MP4/WebM video; other public media returns the complete body.' },
        { name: 'If-Range', in: 'header', required: false, schema: string, description: 'Exact strong ETag for a video range. A mismatch returns the complete body.' },
      ],
      description: 'Only approved media in the frozen public membership of an available published/revised version is served. Stored bytes are verified before delivery. Supported images and videos render inline; other media downloads as an attachment.',
      responses: {
        '200': { description: 'Complete media bytes with the stored safe MIME type, or application/octet-stream. Public media is cached immutable.', content: binaryContent,
          headers: { ...binaryHeaders, 'Accept-Ranges': { schema: string, description: 'bytes for supported video.' }, ETag: { schema: string, description: 'Strong content-hash ETag for supported video.' } } },
        '206': { description: 'One verified MP4/WebM byte range.', content: binaryContent, headers: { ...binaryHeaders, 'Content-Range': { schema: string }, ETag: { schema: string } } },
        '416': { description: 'Invalid or unsatisfiable video byte range; empty response body.', headers: { 'Content-Range': { schema: string, description: 'bytes */total-size' }, 'Content-Length': { schema: { const: '0' } } } },
        ...correctedPublicationRedirect, ...errors, '503': unavailable,
      },
    } },
    '/research/{publicId}/v/{versionNo}/artifacts/{artifactId}/download': { get: {
      operationId: 'downloadPublicArtifact', summary: 'Download an explicitly shared publication attachment', security: [], parameters: [...publicVersionParameters, pathParameter('artifactId', uuid)],
      description: 'Requires an available published/revised version, a unique frozen manifest entry with downloadAccess=public, and the retained matching artifact. Legacy or workspace_member entries do not grant anonymous access. The response is always an attachment with a safely encoded frozen filename; the private download endpoint remains protected.',
      responses: { '200': { description: 'Frozen original bytes, streamed with no-store and the safe frozen MIME type or application/octet-stream.', content: binaryContent,
        headers: { ...binaryHeaders, 'Content-Disposition': { schema: string, description: 'attachment; ASCII fallback filename and UTF-8 filename*.' } } }, ...correctedPublicationRedirect, ...errors, '503': unavailable },
    } },
    ...Object.fromEntries(['', '/export', '/evidence/{evidenceId}/source'].map(suffix => [`/research-objects/{id}/versions/{versionId}/record${suffix}`, { get: {
      operationId: suffix.includes('source') ? 'getResearchRecordEvidenceSource' : suffix ? 'exportResearchRecord' : 'getResearchRecord',
      summary: suffix.includes('source') ? 'Resolve a frozen record source' : suffix ? 'Download the frozen research record as JSON' : 'Read the complete frozen research record',
      description: 'Available issued public records are readable anonymously. A private record requires the existing workspace membership or explicit visibility grant; unknown or inaccessible objects return 404. This API does not make private drafts public. Complete frozen collections have no pagination. All responses are private, no-store and vary by Cookie. Source reads require the frozen locator and, for public access, frozen public-reuse permission.',
      security: [{}, { session: [] }], parameters: [...recordParameters, ...(suffix.includes('source') ? [pathParameter('evidenceId', uuid)] : [])],
      responses: { '200': { description: suffix.includes('source') ? 'Source result under source; text, region and page may be null.' : suffix ? 'Unwrapped research record JSON attachment.' : 'Complete record under record.',
        headers: { 'Cache-Control': { schema: string }, Vary: { schema: string }, ...(suffix === '/export' ? { 'Content-Disposition': { schema: string } } : {}) },
        content: jsonContent(suffix.includes('source') ? object({ source: object({ text: nullableString, page: nullableInteger, region: nullableBox }) })
          : suffix === '/export' ? ref('ResearchRecord') : object({ record: ref('ResearchRecord') })) },
        ...errors, '401': responseError('Invalid or expired session cookie.'), ...(suffix.includes('source') ? { '503': unavailable } : {}),
      },
    } }])),
  },
};
