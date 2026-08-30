# ADR-012: ScanSci Default Literature Acquisition

## Status

Accepted — 2026-08-30. Local implementation complete; production deployment and
CARSI acceptance remain separate gates.

ScanSci `auth_required` state is PostgreSQL-authoritative: a conditional
serializable transition writes the state, audit, and idempotent current-admin
notifications atomically. Only raw provider success clears the state.
Core migration 33 is expand-only and rollback-capable. The Domain primitive
retries `P2034` at most three times; exhausted observation persistence never
turns an otherwise useful retrieval into a permanent task failure, and a later
raw observation can still perform the transition.

## Context

The existing Worker adapter left ScanSci disabled and had no release-scoped
service, persistent CARSI session, or recoverable image identity. Making the
capability available by default requires legal-source enforcement, one explicit
operator login, Secret isolation, and exact rollback without exposing a browser
or upstream provider controls to product users.

Docker Compose file-backed Secrets use bind mounts and silently ignore service
`uid`, `gid`, and `mode` remapping. A host file kept at the required
`root:root 0600` therefore cannot be read directly by the fixed UID 10001
service. This limitation is documented in the official
[Compose service reference](https://docs.docker.com/reference/compose-file/services/#secrets).

## Decision

- `scansci-legal` is a normal SHA-tagged production service. It runs as
  `10001:10001`, with a read-only root filesystem, all capabilities dropped,
  `no-new-privileges`, 1 CPU, 1 GiB RAM, 64 PIDs, and a 256 MiB no-exec tmpfs.
  Two admitted acquisitions each have at most one serial 100 MiB source PDF on
  tmpfs; bounded config/protocol/session snapshots fit in the remaining 56 MiB,
  while tmpfs pages still count against the 1 GiB container memory ceiling.
  It has no host port, database, Redis, object-storage, Docker-socket, or broad
  application Secret access.
- The pinned upstream ignores `parallel_sources` and unconditionally calls
  `_run_tiers_parallel`. Before `download`, the wrapper validates its exact
  seven-parameter signature and known parallel AST shape, then replaces it with
  a maximum-64-source serial runner preserving tier/source order and first
  success. Every failed source temp is removed before the next source. Signature,
  source shape, legal flags, grey labels, output path or cleanup drift fails
  closed; the archive/hash remains unchanged.
- HTTPS/DNS validation extracts IPv4 from well-known NAT64, IPv4-mapped, 6to4
  and Teredo destinations and applies the same public-address policy. Local-use
  `64:ff9b:1::/48` is rejected entirely; mixed answers fail as a unit.
- The legal service and Agent Worker share only `retrieval_net`. This bridge is
  the legal service's controlled egress path; the service never joins
  `data_net` or `app_net`.
- `scansci-auth` is a release-tagged, stopped-by-default Compose profile. It
  uses host networking only, while X11/VNC/noVNC listen on `127.0.0.1`. It joins
  no Docker network and shares only the persistent `scansci-session` volume and
  runtime Secret mount with the legal service. No Nginx or Cloudflare route is
  added. Start/remove operations serialize on the same production deployment
  lock so an operator tunnel cannot race an immutable switch or rollback.
- Host inputs remain exact files below `/opt/openscience-secrets/scansci`, with
  the directory owned by `root:root` at `0700` and files at `0600`.
  `provision-scansci-secrets.mjs` accepts values only as bounded JSON on stdin,
  publishes each file atomically, preserves existing values by default, and
  prints key names and statuses only. Replacement requires
  `--replace-existing`.
- A networkless, read-only, bounded `scansci-secret-init` one-shot reads the
  root-only host directory and copies only the fixed allowlisted filenames into
  separate service-token and auth-credential named volumes. Runtime files are
  atomically published as UID/GID 10001 and mode `0400`; each long-running
  container mounts only the volume it needs, read-only. Stable named volumes
  keep the target readable across daemon restarts, while the fixed root-only
  host files remain the provisioning source of truth. This avoids the
  unsupported file-Secret ownership remap and keeps Secret values out of the
  Compose environment, command arguments, logs, and image layers. Optional
  username/password files must appear as a pair; absence keeps manual browser
  login available.
- Agent Worker rejects the legacy inline token. When ScanSci is enabled it
  opens the fixed token path once with `O_RDONLY | O_NOFOLLOW`, validates the
  descriptor as UID/GID 1000, exact mode `0400`, one regular link and bounded
  non-empty content, reads once from that descriptor, and closes in `finally`.
  Disabled rollback does not open a stale configured path.
- `scansci-session` is a stable named volume and is not release-retained or
  application-rollback data. Recreating the legal or auth image preserves the
  profile and cookies. Credential/session revocation remains an explicit,
  independent operation.
- Both ScanSci images carry the application source SHA, upstream archive hash,
  locked dependency-file hashes, and a distinct legal/auth role as image labels.
  The verifier also pins the expected entrypoint for each role and binds
  the running container to the exact release root and Compose file; checks image
  identity, UID, mounts, networks, ports, limits, policy flags, grey-source/Tor
  absence, runtime Secret ownership/mode, a non-printing host/runtime token hash,
  and bounded session status; and emits statuses without values.
- The production transaction builds legal/auth images before Worker/Parser,
  starts and verifies `scansci-legal` before switching Agent Worker, and records
  `scansci_deploy` in capability schema 3. Catchable failure restores and
  verifies the exact previous SHA when that release contains ScanSci. When the
  previous release predates ScanSci, rollback stops only the candidate service
  and restores the previous application release.
- Exact retention inventories SHA-tagged legal and auth images together with
  Worker, Parser, and optional Embedding images. Active and rollback images are
  protected according to their capability records; inactive tags are removed
  only by exact identity. No broad image, volume, builder, or filesystem prune
  is permitted.

## Consequences

The normal literature path can reuse a persistent institutional session without
placing account, Cookie, SAML, or service-token values in the database or the
general application environment. Initial login and repair remain explicit
operator actions. The one-shot Secret staging container is intentionally root
and receives only the minimum file-read/chown capabilities; it has no network,
writable root, or long-running lifecycle. Production acceptance must still prove
the real CARSI/OA journeys, container recreation, compatibility-checked serial
execution with max concurrency one, 256 MiB runtime identity, zero grey-source/
Tor calls, and exact active/rollback recovery on the ECS. Rollback always uses
the previous release's own Compose/verifier contract, so a pre-change release
retains its original tmpfs identity instead of being reinterpreted as 256 MiB.
