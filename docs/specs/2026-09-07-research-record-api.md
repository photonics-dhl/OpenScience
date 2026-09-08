# Frozen research record API v1

This API exposes a research version captured at commit or import confirmation. A
successful response means the record was retrieved; it does not certify scientific
support, human verification, publication, or reproducibility.

## Discovery and addresses

The public service prefix is `/api`. Direct Fastify connections omit that prefix.
The selected-version page exposes Research API, Export fixed record and OpenAPI
links. Public research pages also expose the exact record URL after publication.

| GET route under `/api` | Response |
|---|---|
| `/research-record/openapi` | OpenAPI 3.1 document with cookie security and response schemas |
| `/research-record/schema` | JSON Schema for the record itself |
| `/research-objects/{id}/versions/{versionId}/record` | `{ "record": ResearchRecord }` |
| `/research-objects/{id}/versions/{versionId}/record/export` | The same ResearchRecord JSON without an envelope; attachment filename includes the version UUID |
| `/research-objects/{id}/versions/{versionId}/record/evidence/{evidenceId}/source` | `{ "source": { "text": string or null, "page": integer or null, "region": object or null } }` |

`id` is the RO UUID. `versionId` is an exact Version UUID or the alias `latest`.
For a public RO, `latest` resolves the newest published version with a Publication
record, including for a logged-in member. A private or invite-only RO resolves its
newest accessible snapshot for an authorized caller. Resolve the alias once, keep
`record.versionId` and `record.links.self`, and use those exact addresses thereafter.
The URI `urn:openscience:{RO UUID}:version:{Version UUID}` identifies a fixed record.
New private drafts never become the public latest version.

The existing `/versions/{versionId}/export` ZIP remains available to authenticated
callers and now includes the identical `research-record.json`. The selected record
page and JSON export both use the record endpoint, not editable Claim/Evidence GETs.
ZIP title metadata uses the frozen title, and its version index describes only the
selected version so exporting an older version cannot leak newer private history.

## Authentication and privacy

Use the existing `openscience_session` cookie established by the application's
login flow. This feature does not issue API keys or introduce bearer authentication.
Do not put cookies in source control, URLs or logs. GET requests need no CSRF token.

Anonymous callers can read only a public RO's published versions with a Publication
row. Workspace members can read their workspace's private snapshots. Existing
invite-only VisibilityGrants also permit record reads. Every source request repeats
these checks. Losing membership or a grant, changing visibility, or removing the
published state blocks subsequent unauthorized access. A public RO alone never
unlocks its unpublished versions.

All record, export and source responses use `Cache-Control: private, no-store` and
`Vary: Cookie`, including responses to anonymous callers. Access and publication
remain live policy; they are not asserted by a frozen record's `recordState`.

Manifest `downloadUrl` points to the existing original-artifact download route;
`downloadAccess: "workspace_member"` declares its existing login/membership boundary.
An anonymous reader may inspect permitted frozen passages using the Evidence source
URL, but this API does not grant anonymous access to original-file downloads.
SourceMap references, object keys and storage-service URLs are never serialized.
Frozen external-source reuse requires its recorded trusted-provider reuse decision;
otherwise a public source request fails closed.

## Record semantics

The machine schema is authoritative for field types. A response includes:

- `schemaVersion: "1.0.0"` for existing records, or `"1.1.0"` for a new record with explicitly reviewed source identity; RO/Version UUIDs, version number and fixed citation.
- Full immutable `sdf` core JSON, retaining its own schemaVersion and extension keys.
- Frozen title and timestamp, separate `platformAuthors`, original-author/DOI
  missing states, and available RO/version license assignments. Platform authors
  are not asserted to be authors of an imported paper. Original authors and original
  DOI currently remain explicitly `not_recorded`; the uploader is never substituted.
- Claims with ID, parent, statement, kind, conditions, limitations, assessment and
  extraction status; Evidence with ID, Claim/Artifact IDs, relation, locator, hash,
  extraction confidence, extraction status, human `verified` flag and source link.
  Scientific assessment, model confidence and human verification are independent.
- Manifest paths, Artifact IDs and SHA-256 hashes. `missing.sdfFields` lists empty
  narrative fields; collection gaps are explicitly `not_recorded`.
- `collections.complete: true` and `pagination: "none"`. Arrays are returned in full,
  with no implicit page, cap or truncation. Claims/Evidence sort by ID; manifest by
  logicalPath; platform authors by recorded author order (ID tie-break); licenses by
  type then identifier. Do not attempt cursor pagination on these routes.

Version 1.1 adds `identity.source` with its own `schemaVersion: "0.1.0"`,
`reviewed: true`, and separate `title`, `authors`, `doi`, `articleLicense` items.
Each item includes `state` (`recorded`, `needs_review`, `not_recorded`), `value`,
and exact quoted `evidenceSegments` with artifact/hash/page/block locators.
Legacy `originalAuthors` / `originalDoi` fields remain unchanged; new consumers
read `identity.source`. Source licensing is distinct from platform licensing.
Recording metadata never marks scientific Claims or Evidence as verified.

Ingestion detail provides `task.result.sourceIdentity` and `sourceIdentityToken`.
Confirmation requires `sourceIdentityReview: {token, acceptedFields}` when a
proposal exists. Fields are unchecked initially; an empty acceptance list records
that review occurred while leaving proposals `needs_review`. Only `proposed`
fields can be accepted, and the server revalidates exact source segments.
The confirmation response includes the same frozen `sourceIdentity` projection.
Ordinary commits inherit source identity from the branch predecessor; merges use
the source tip. A new import with no identity proposal clears source identity
for that new version instead of borrowing another paper's metadata. Existing
fixed records are never upgraded or backfilled by reads or later imports.

Extraction `missingDetails[field].cause` distinguishes `not_selected`,
`model_no_supported_summary`, `validation_rejected`, and `undetermined`.
These are extraction diagnostics, not claims that a paper lacks information.
The fixed record retains empty SDF fields honestly; task diagnostics remain
available with the original ingestion task.

`source.state: "recorded"` means a source reference was captured, not that storage
is currently reachable or the Evidence is verified. Runtime retrieval may return
503. A missing source reference or missing material binding is `not_recorded`.
Missing narrative fields are pending information, not a finding of "not reported",
"not public" or "not applicable". Those scientific declarations are retained only
when provided in the SDF; the API does not infer them from an empty string.

New ordinary commits capture their branch predecessor's working Claim/Evidence
graph into fresh scoped working rows inside the commit transaction, remapping
Claim parents and Evidence references before freezing the new version's own rows.
Inherited Evidence is `needs_review` and not
verified; an inherited `supported` Claim becomes `missing` pending review against
the new version. IDs identify the captured graph members within this fixed record and its editable
version graph. Subsequent commits copy the immediate predecessor's actual working
rows; deliberately deleted rows are never restored from a frozen snapshot.
Import confirmation captures after graph carry and source matching, before the
same transaction commits. Both paths save metadata once; subsequent editable graph
changes do not rewrite it, including later verification or publication.

For legacy versions lacking a saved record, `recordState: "not_recorded"` is returned.
Only their already immutable SDF and manifest are readable. Title is null and
Claim/Evidence arrays are empty with explicit `not_recorded` states. This never
loads today's graph, invents historical authorship, creates a snapshot during GET,
or auto-publishes an object. Create a new version to capture a new record.

## Minimal client example

This example uses an already authenticated browser session; omit credentials for
an anonymous public reader. Replace the UUID with an accessible object.

```javascript
const roId = '00000000-0000-4000-8000-000000000001';
const response = await fetch(`/api/research-objects/${roId}/versions/latest/record`, {
  credentials: 'same-origin',
  cache: 'no-store',
});
if (!response.ok) throw new Error(`Record request failed: ${response.status}`);
const { record } = await response.json();
const fixedUrl = record.links.self;
const fixed = await fetch(fixedUrl, { credentials: 'same-origin', cache: 'no-store' });
const sameVersion = (await fixed.json()).record;
if (sameVersion.versionId !== record.versionId) throw new Error('Version mismatch');
const claim = record.claims[0];
const evidence = record.evidence.find(item => item.claimId === claim?.id);
if (evidence) {
  const source = await fetch(evidence.source.url, {
    credentials: 'same-origin', cache: 'no-store',
  });
  if (source.ok) {
    const { source: original } = await source.json();
    // original.page is the frozen page; region is normalized, or explicitly null.
    // Neither a source response nor a quote establishes scientific support.
  }
}
```

## Errors, retries and operational limits

Errors follow the existing `{ "error": { "code": "...", "message": "..." } }`
envelope; global errors may additionally include request identity fields.

| HTTP | Code / meaning | Client action |
|---|---|---|
| 400 | Existing validation error; malformed UUID/parameters | Correct request; do not blindly retry |
| 401 / 403 | Existing session/account error | Reauthenticate or resolve account state |
| 404 | `RESEARCH_OBJECT_NOT_FOUND`; inaccessible or unknown record/source ID | Treat as unavailable; never infer that a hidden object exists |
| 429 | Existing rate-limit error; `Retry-After` header in seconds | Wait for the header duration before retrying |
| 503 | `SOURCE_UNAVAILABLE`; missing/restricted original, SourceMap or locator | Retain the record; optionally retry later; never substitute current draft text |

With production rate limiting enabled, record GET allows 120 requests per 60 seconds;
record export and source retrieval each allow 60 per 60 seconds per existing route/IP
bucket. These are service limits, not authorization. Discovery routes are read-only.
No endpoint in this module calls a model, enqueues paid work or writes business data.
Changing schema semantics incompatibly requires a new schema version and migration
instructions; do not silently reinterpret historical snapshots.

## Storage migration

Migration `20260907010000_frozen_research_record` adds nullable JSONB
`versions.research_record`. Existing rows stay null. The database client must be
regenerated before building consumers. Older application releases ignore the new
column, so application rollback can preserve all new snapshots. The provided SQL
rollback drops the column and therefore requires first archiving captured values;
it is an explicit operator fallback, not part of normal application rollback.
