# ScanSci Upstream MCP Capability Design

> **CURRENT / APPROVED 2026-09-02.** The user approved execution after the repository audit. This design replaces the private-library ScanSci integration; ECS production evidence is authoritative.

## 1. Goal

Make the complete upstream ScanSci PDF capability available to Hermes through the upstream public Skill/MCP contract, prove real downloads on the CPU-only ECS, and then remove every obsolete private integration artifact.

The implementation must:

- use the upstream `scansci-pdf` public MCP tools rather than importing or patching private Python functions;
- expose the upstream 17-tool MCP surface internally, with no user-visible mode switch;
- let upstream source routing operate for capability and success rather than forcing `legal_only`;
- persist ScanSci configuration, cookies, browser profile, cache metadata, and downloaded files in dedicated server volumes;
- preserve the existing OpenScience asynchronous acquisition, 72-hour object lifecycle, one-use download link, provenance, and four product entry points;
- run and be accepted on the ECS; local Docker is forbidden;
- remove the rejected implementation only after the replacement passes the production journey.

## 2. Upstream lock

The first production candidate uses the latest tagged release, not untagged `main`:

- repository: `https://github.com/Rimagination/scansci-pdf`;
- release: `v1.13.1`, published 2026-08-31;
- GitHub source archive SHA-256: `c5bdec13d5803992968eba9cce72d9e77e6f40e1a77a8277f7986f2f63b2507e`;
- PyPI wheel SHA-256: `f68c30503834fc093eb192bd556090d210241eed48445017fdb3d32f6e1355e5`;
- Python: `>=3.11`; production base remains the pinned Python 3.12 image until a later reviewed release changes it.

The upstream package already owns source racing, login, cookie reuse, browser selection, diagnostics, citation/search helpers, Tor control, and paper download. OpenScience must not duplicate these engines.

## 3. Considered approaches

### 3.1 Chosen: official MCP service plus direct Worker client

Run `scansci-pdf run --mode streamable_http` as the sole long-lived ScanSci engine. Agent Worker uses the official MCP client protocol, calls `scansci_pdf_download`, parses its structured JSON result, and uses a shared paper volume whose group permissions allow only bounded ingestion and exact post-acknowledgement deletion.

This preserves all 17 tools, removes the custom HTTP downloader and private function patches, and keeps the established application lifecycle above the provider boundary.

### 3.2 Rejected: public-looking Python imports

Calling decorated functions from `scansci_pdf.server` in-process would avoid some private names but would still bind OpenScience to Python module layout and bypass the documented MCP transport. It is not the product integration.

### 3.3 Rejected: CLI subprocess per request

The CLI is public but loses the long-lived MCP session, increases process churn, and does not expose the complete Agent tool surface. It remains an operator diagnostic only.

## 4. Runtime topology

### 4.1 `scansci-mcp`

One release-scoped container runs the official MCP server on `retrieval_net`, with no host port. It contains the upstream package, Patchright/Chromium, Xvfb, and only the network/session/file privileges ScanSci itself needs. It has no application, database, object-storage, signing, or service-token secret.

Persistent volumes:

- `scansci-data` → `SCANSCI_PDF_DATA_DIR`, including config, cookies, profiles, session health, and cache metadata;
- `scansci-papers` → upstream output directory.

The data and paper volumes have independent retention. Product ingestion copies a successful PDF into SeaweedFS and deletes the corresponding transient ScanSci output after acknowledgement; session data remains.

Resource ceiling for the first candidate: 2 CPUs, 2 GiB memory, 512 PIDs, read-only root, bounded `/tmp` and `/dev/shm`. The host remains CPU-only.

### 4.2 Agent Worker

Agent Worker connects to the internal streamable-HTTP MCP endpoint and discovers the expected tool names at startup. The acquisition path invokes:

```text
scansci_pdf_download(identifier=<DOI-or-arXiv>)
```

It does not send `strategy`, `scihub_enabled`, or `use_tor` overrides for the default product request. Upstream configuration and source health choose the route. An explicit future user source request may provide a public tool argument without changing UI mode.

The Worker mounts `scansci-papers` read-write under the dedicated shared GID 11000 and accepts only a regular, non-symlink file resolved beneath the mount, bounded to 100 MiB, beginning with `%PDF-`. It records the exact upstream `source`, source URL, content hash, byte count, and ScanSci version before copying bytes to object storage. Only after malware scan, object upload and `TemporaryDocument.state=active` succeed does it identity-check and unlink that exact staging file; a failed durable ingest leaves the file unacknowledged. No other MCP data path is writable by Worker.

### 4.3 Institutional session bootstrap

OpenScience does not operate a second auth/browser service. The administrator completes publisher or CARSI login in a normal browser, exports a Netscape cookie file, and invokes the official MCP `scansci_pdf_login(kind="cookie_import", cookie_file=...)` tool against the sole `scansci-mcp` service. The one-time import file is staged outside the application and removed immediately after import.

The imported cookie/profile state persists only in `scansci-data`; neither account credentials nor the import file enter the repository, image, application database, logs, or browser DTOs. Container recreation must retain the session while upstream considers its cookies valid. When upstream reports expiry, the administrator repeats the same official import flow—there is no noVNC, VNC, custom login wrapper, auth bridge, or second ScanSci image.

## 5. Capability and source semantics

OpenScience no longer forces `legal_only` or rejects upstream Sci-Hub, LibGen, or Tor capabilities. The complete upstream tool catalog remains present. Hermes silently uses the best available path and reports the actual source.

Existing storage metadata must not mislabel a successful source as open access or institutional access. Add neutral source semantics:

- access kind and database basis: `source_retrieval`;
- reason code: `source_retrieval_succeeded`;
- cache allowed: `true`;
- download policy: `downloadable`;
- provenance evidence: exact upstream source, public landing URL when present, ScanSci version, retrieval timestamp, content SHA-256, and byte count.

OA and verified institutional results keep their existing accurate classifications. Large PDF bytes remain in object storage, never PostgreSQL.

## 6. API and product contract

No new public synchronous download endpoint is introduced. Existing `/agent` task creation, polling, retry, and temporary-document link endpoints remain authoritative and idempotent.

The provider result extends internally with `source_retrieval`; browser-facing responses continue to expose normalized provenance and temporary-document metadata. Dashboard/Personal Space, global Hermes, RO Hermes, and RO Files/Evidence continue to submit the same asynchronous retrieval intent.

## 7. Failure handling

- MCP unavailable or malformed result → stable `upstream_error`, retryable;
- upstream login required → `auth_required`, with one administrator notification generation;
- upstream rate limit/timeout → existing retryable stable codes;
- missing/unsafe/oversized/non-PDF result file → `invalid_response`, never copied;
- successful result → copy to SeaweedFS, persist metadata, acknowledge and delete only that ScanSci output file;
- ScanSci failure must not disable Semantic Scholar metadata or existing RO reading.

No raw MCP payload, cookie value, credential, local file path, or upstream exception is returned to the browser.

## 8. Deployment and rollback

The change is an expand-first release:

1. add `source_retrieval` to the database enum with a rollback that refuses while such rows remain;
2. build and start the official MCP container and positive canary before switching Worker configuration;
3. deploy Worker/API/Web using the existing immutable release transaction;
4. retain production `405b85a…` as rollback until the new release passes acceptance;
5. rollback restores the previous application and ScanSci services without deleting `scansci-data`.

No broad Docker prune or filesystem delete is permitted. Exact release identities and mounts determine cleanup.

## 9. Production acceptance

The shortest sufficient positive gate is:

1. MCP initialize/list-tools returns the expected upstream surface including download, login, status, search, citation, diagnostics, and Tor tools.
2. One OA/arXiv DOI downloads through MCP and enters the existing temporary-document lifecycle.
3. Import an administrator-authenticated Netscape cookie file through the official login tool and complete one subscription-only DOI through Zhejiang University access.
4. Recreate `scansci-mcp`; the same institutional route works while the imported upstream session remains valid.
5. One real product request is submitted from each of the four existing entries; all converge on the same task and one-use link contract.
6. Public health/release, migrations, Parser, BGE, Worker, storage, and retention remain healthy.

Negative checks are limited to missing MCP, unsafe returned file, and secret/log leakage because those are release boundaries. The task does not repeat the rejected implementation's large adversarial browser matrix.

## 10. Obsolete-artifact cleanup

After Step 9 passes, delete rather than retain the rejected implementation:

- private ScanSci imports, AST/signature guards, monkey patches, custom legal-source runner, custom browser protocol/worker, custom login/session proof engine, and their tests;
- obsolete legal/browser Dockerfiles, entrypoints, tmpfs job volumes, firewall/network services, tunnel probes, source-lock verifiers, and release-retention branches that exist only for those services;
- obsolete plans/spec references and active-memory claims; Git history is the rollback record;
- superseded server images, stopped containers, empty volumes, temporary evaluation files, and build cache by exact identity.

Keep only components still used by the official MCP topology, product lifecycle, or immutable rollback release.
