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
  Two admitted acquisitions each have at most one serial, kernel-capped 100 MiB source PDF on
  tmpfs; bounded config/protocol/session snapshots fit in the remaining 56 MiB,
  while tmpfs pages still count against the 1 GiB container memory ceiling.
  It has no host port, database, Redis, object-storage, Docker-socket, or broad
  application Secret access.
- The pinned upstream ignores `parallel_sources` and unconditionally calls
  `_run_tiers_parallel`. Before `download`, the wrapper validates its exact
  seven-parameter signature and known parallel AST shape, then replaces it with
  a maximum-64-source serial runner preserving tier/source order and first
  success. Compatibility also requires callable `_neg_blocked/_neg_record`;
  blocked sources skip before path construction, and every truthy non-success
  result is passed unchanged to the pinned recorder. Every attempted failed
  source temp is removed before the next source. Signature, helper, source shape,
  legal flags, grey labels, output path or cleanup drift fails closed; the
  archive/hash remains unchanged.
- Every worker mode, including the no-network/no-Secret runtime probe, traverses
  one common entry that installs and reads back `RLIMIT_FSIZE` before inspecting
  the mode or importing upstream. The probe only reports the already-installed
  stable soft:hard metadata; the verifier invokes the real entry and never calls
  the installer directly. Its no-file request uses the guaranteed mounted `/tmp`
  root, not an acquisition subdirectory that a fresh tmpfs can hide; acquisition
  continues to require its separately created controlled directory. Each
  per-acquisition POSIX subprocess therefore has
  soft and hard limits at the shared exact `MAX_PDF_BYTES = 104857600`. The
  current hard limit must permit that value;
  SIGXFSZ/EFBIG is converted to a redacted source failure, partial expected
  output is removed, and a surviving process may try the next serial source.
  External child writers inherit the kernel limit. Success must reference the
  exact regular non-symlink source temp and finalizes by same-directory rename,
  never a second 100 MiB copy. The parent size/magic check remains defense in
  depth, not the primary source-file bound.
- HTTPS/DNS validation extracts IPv4 from well-known NAT64, IPv4-mapped, 6to4
  and Teredo destinations and applies the same public-address policy. Local-use
  `64:ff9b:1::/48` is rejected entirely; mixed answers fail as a unit.
- The legal service and Agent Worker share only the fixed `internal: true`
  `172.24.0.0/24` `retrieval_net`; the legal service never joins `data_net` or
  `app_net` and keeps no host port. Its only proxy setting is the exact,
  credential-free `SCANSCI_EGRESS_PROXY=http://openscience-egress:7891`.
  The wrapper rejects every alternate value and derives generic proxy variables
  only for the per-acquisition child. The DNS guard permits port 7891 and a
  private answer only for hostname `openscience-egress` resolving exactly to
  the retrieval bridge gateway `172.24.0.1`; all research targets remain credential-free HTTPS on
  port 443 and retain the public-address checks.
- Squid keeps its host-client listener on loopback and adds only the retrieval
  gateway `172.24.0.1:7891`. That listener accepts only the fixed retrieval subnet,
  only CONNECT to port 443, and denies private, loopback, link-local, CGNAT,
  metadata, documentation, multicast, reserved, NAT64-local, 6to4 and Teredo
  destination ranges before either parent or DIRECT routing. Only the verified
  minimal `dstdomain` inventory may use the SSH parent (initially `.arxiv.org`);
  all other ScanSci destinations are forced DIRECT so the ACL and connection use
  the same resolver. It never binds `0.0.0.0`, IPv6 wildcard or a public
  interface. Runtime verification pins the custom environment, exact gateway
  mapping, internal IPAM, proxy TCP peer, allow/deny results and raw-direct failure.
- `scansci-auth` is a release-tagged, stopped-by-default Compose profile. It is
  the sole peer on the fixed internal `172.25.0.0/29` `auth_net`, reaches HTTPS
  destinations through the dedicated Squid listener at `172.25.0.1:7891`, and
  listens at fixed container address `172.25.0.2:6080` without any host port
  publication. The canonical local SSH forward targets that address directly.
  x11vnc remains IPv4-loopback-only inside the container and disables IPv6. The
  browser mounts only the persistent `scansci-session`
  volume; it receives no username, password, service-token or bootstrap Secret.
  The `xgs-auth0` host-input policy allows only the established TCP return flow
  from `.2:6080` to `.1`, then auth-subnet traffic to `.1:7891`, and rejects
  every other host address and port. No application container shares `auth_net`,
  so it cannot reach the passwordless noVNC listener directly.
  Squid configuration publication uses a parsed same-directory temporary,
  fsync plus atomic rename, one durable rollback file and one transactional
  pending marker spanning reload; failure injection proves pre-commit
  preservation, post-commit automatic restoration and failed-reload recovery.
  No Nginx or Cloudflare route is added. Start/remove operations serialize on
  the production deployment lock so a tunnel cannot race switch or rollback.
- Pinned ScanSci invokes Patchright through `channel=chrome` without forwarding
  its config. The image therefore binds `/opt/google/chrome/chrome` to the fixed
  wrapper rather than relying on `browser_executable`. The wrapper removes
  conflicting proxy switches, adds `--no-sandbox` only inside the hardened
  container, fixes the Squid proxy, disables QUIC and non-proxied WebRTC UDP,
  and preserves the remaining upstream arguments. ScanSci alone owns the
  browser lifecycle and persists only its publisher Cookie JSON/Netscape files in the
  session volume; no second blank browser or shared Chromium profile is used.
- Tunnel readiness requires the exact noVNC page, a WebSocket upgrade with an
  RFB 3.x banner, and remote runtime proof of Xvfb/x11vnc/websockify/Chromium,
  fixed proxy arguments, PID headroom, absent host publication, exact fixed-IP
  return path and all container hardening controls. Static HTML alone is never
  a successful start.
- Host inputs remain exact files below `/opt/openscience-secrets/scansci`, with
  the directory owned by `root:root` at `0700` and files at `0600`.
  `provision-scansci-secrets.mjs` accepts only the service token as bounded JSON
  on stdin, publishes it atomically, preserves it by default, and prints the
  key name and status only. Replacement requires
  `--replace-existing`.
- A networkless, read-only, bounded `scansci-secret-init` one-shot reads the
  root-only host directory and copies only the internal service token into
  separate legal-service and Worker named volumes. Runtime files are atomically
  published at the consuming UID and mode `0400`; the browser mounts neither
  volume. The provisioner rejects username, password and session-bootstrap
  fields because the pinned interactive flow does not consume them. This avoids
  unsupported file-Secret ownership remap and keeps Secret values out of the
  Compose environment, command arguments, logs, and image layers.
- Agent Worker rejects the legacy inline token. When ScanSci is enabled it
  opens the fixed token path once with `O_RDONLY | O_NOFOLLOW`, validates the
  descriptor as UID/GID 1000, exact mode `0400`, one regular link and bounded
  non-empty content, reads once from that descriptor, and closes in `finally`.
  Disabled rollback does not open a stale configured path.
- Candidate production Compose pins the Worker to exact
  `SCANSCI_ENABLED=true` and
  `SCANSCI_BASE_URL=http://scansci-legal:8080`; it does not mutate `.env.prod`
  or a persistent global environment. Runtime verification inspects these
  actual container values together with Worker image, command, working
  directory, Compose labels, networks and release/Secret mounts.
- `scansci-session` is a stable named volume and is not release-retained or
  application-rollback data. Recreating the legal or auth image preserves the
  publisher Cookie files. Credential/session revocation remains an explicit,
  independent operation.
- Both ScanSci images carry the application source SHA, upstream archive hash,
  locked dependency-file hashes, and a distinct legal/auth role as image labels.
  The verifier also pins the expected entrypoint for each role and binds
  the running container to the exact release root and Compose file; checks image
  identity, UID, mounts, networks, ports, limits, policy flags, grey-source/Tor
  absence, runtime Secret ownership/mode, a non-printing host/runtime token hash,
  and bounded session status; and emits statuses without values.
- The production transaction builds legal/auth images before Worker/Parser and
  starts `scansci-legal` before switching Agent Worker. A distinct
  prepublication verifier requires the exact candidate SHA plus built
  legal/auth image IDs, rejects any pre-existing candidate capability sidecar,
  and verifies actual ScanSci/Worker runtime without reading a sidecar. Only
  after those checks pass does the existing locked active-release CAS publish
  `scansci_deploy` capability schema 3, followed immediately by canonical
  sidecar verification. Normal active/rollback verification remains
  canonical-sidecar-only and keeps its legacy CLI. Catchable failure restores
  the previous marker before deleting only the exact candidate sidecar and
  staging file, then verifies the exact previous SHA when that release contains
  ScanSci. A previous release always uses its own Compose and verifier. When the
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
execution with max concurrency one, negative-cache parity, exact 100 MiB
soft+hard file limits, 256 MiB runtime identity, zero grey-source/
Tor calls, and exact active/rollback recovery on the ECS. Rollback always uses
the previous release's own Compose/verifier contract, so a pre-change release
retains its original tmpfs identity instead of being reinterpreted as 256 MiB.
