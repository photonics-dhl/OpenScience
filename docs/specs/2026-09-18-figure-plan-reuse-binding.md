# figurePlan.reuse — paper-original binding

Status: implementation contract. Candidate, deployed version and real evidence are tracked only in [CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md). Earlier placeholder runs do not establish real-paper reuse.

## Purpose

Preserve an original paper figure when figurePlan selects reuse. The original bytes and scientific meaning are retained; no image-provider request is made for this scene. A successfully extracted Claim provides context, not proof that the uploaded pixels came from the paper.

## Upload and registration

1. Upload a PNG through the existing Artifact multipart endpoint, using its workspace authorization, CSRF, quota, idempotency and Blob storage. The presentation page retains the upload key and returned artifactId for retries in the current page instance.
2. POST /research-objects/:researchObjectId/versions/:versionId/paper-figures with { artifactId, figureId, sourceClaimId, caption? }. The previous imageBase64 body is removed; no application caller used that legacy body before this UI was added. Historical one-off scripts are not supported production clients.
3. The server requires a current writable draft, an available Artifact in the same workspace, PNG MIME, size at most 32 MiB, dimensions at most 16,384 per edge and 64 MP total, matching Blob identity and its server-derived storage key. Before taking the write transaction, a bounded stream read verifies byte size/hash and PNG header/end marker; the transaction rechecks the complete Artifact/Blob identity. It does not decode pixels in the API or prove origin.
4. In the existing presentation/reference transaction, register a draft image with generator OpenScience paper-original figure, subtype paper_original_figure, artifactId, figureId, RO/version, sourceClaimId and optional caption. Storage is already owned by the Artifact; registration does not write or delete objects.
5. Repeating the same figure, bytes, Claim and normalized caption returns its existing asset. Conflicting active content or caption produces CONCURRENT_UPDATE. Reposting an unchanged rejected image with the same Claim and caption also conflicts. Correcting the image or its source explanation may create a new draft under the same real figure number when there is no active binding; the rejection record is retained and explicit review is required again.

The response remains { asset: { assetId, contentHash, objectKey } }. The private presentation list additionally exposes paperOriginal: { figureId, caption? }, including originals whose provenance is nested by version-history copy. No credentials or original private provenance is exposed by this view.

## Source review and reuse

- The source section shows the PNG, figure number, caption, Claim and review status. A successful browser image load with nonzero dimensions is required for the approval button; decode failure has explicit feedback and still permits rejection. This is a human-review UI condition, not a server-side proof of origin or complete PNG decoding. The reviewer compares it with the actual source PDF before selecting “核对为论文原图”. Existing review authority, status transitions and updatedAt concurrency checks apply. Approval rechecks the current Claim scope/status and the source Artifact/Blob identity and availability on the server. Referenced source Artifacts are protected from permanent cleanup.
- Only approved, undeleted originals in the requested RO/version can satisfy reuse. A rejected or pending original cannot pass. Lookup failure remains `paper_original_missing_<figureId>`.
- The planner emits one original scene for each bound reuse entry. Execution rechecks the approved source asset and stored key/hash before reading up to 32 MiB and copying its original bytes. Existing generated-image/video inputs keep their smaller bound.
- Storyboard payloads accept only the server-derived Blob key for the recorded hash or a strictly shaped legacy presentation/RO/version/hash.png key; the executor still resolves the actual server-owned asset. Client-supplied arbitrary paths are never accepted.
- Original figure dimensions are retained. Header/hash validation and human source review are distinct from full image decoding or automated scientific verification.

## Publication and history

Source approval makes an original available to reuse; it does not select the source asset as an audience-facing generated image. For new publication snapshots, originals receive publicationIncluded:false in historyMedia, identified by subtype or the preserved generator. Their original status, provenance and Claim links remain frozen for traceability and cross-version carry.

publicHistoryMedia excludes only an explicit false. Old published snapshots lacking this field keep their existing media, URL and hash behavior. New publication previews and their final media reconciliation use the same source exclusion. The public content hash is computed from that selected media. Published but private source records remain roots of reference protection and cannot be deleted through ordinary trash cleanup.

The copied reuse result remains a separate draft output, requiring its own review before it can enter a new public version. Existing public versions and accepted images are not rewritten.

The existing publication POST also accepts optional `presentationAssetIds: string[]`. Omission retains the prior approved-output behavior for existing callers; an empty array publishes no media. The publication UI starts with no media selected and shows the chosen set and count before confirmation. The existing publication transaction checks that IDs are unique, approved, undeleted, in this RO/version, and are publishable outputs rather than storyboard plans or paper-original sources. Unselected entries receive `publicationIncluded:false` in the new snapshot while all history entries and source references remain preserved. Asset status does not change. Media list, download authorization and public content hash continue to consume the same frozen public set; existing publications remain immutable.

## Limits and remaining work

- Parser-side automatic figure extraction/registration is not implemented here. Manual upload uses the same existing Artifact path as other source materials.
- Original lookup remains version-scoped; history copies preserve provenance, but rebinding them for a new figure plan requires an explicitly valid current-version binding.
- Existing Artifact upload owns its prior object-write/DB failure behavior. This change removes the second write path; it does not claim a global crash-proof upload lifecycle.
- Broad tests, preflight and CI remain prohibited by current user instructions. Deployment and targeted real product observations must distinguish completed functionality, actual source evidence and user acceptance.
