# Handoff — 2026-08-16 edge cache asset versioning

- Current goal: preserve the deployed content-addressed cache contract for the
  two large Landing optical PNGs without caching dynamic content.
- Done: added shared manifest, exact Next rewrites and one-year immutable
  headers; SSR, comparison route and WebGL loader use the versioned URLs;
  focused 38/38, full Web 249/249, typecheck and 16-page build pass; local
  production responses prove versioned `immutable` and HTML/canonical paths
  remain non-immutable; production Landing desktop/mobile normal/reduced,
  idle and pointer browser matrix exits 0; release `b93fa9d` is deployed after
  backup and `--skip-migrate`, with no migration or seed.
- Constraints: canonical PNGs are not renamed or deleted; no HTML/API/auth cache;
  no personal-computer production origin; future asset changes must update the
  full digest and publish a new versioned URL.
- Open risks: canonical compatibility URLs receive Cloudflare `max-age=14400`,
  but are not referenced by production HTML/WebGL and are not immutable.
- Next action: begin the next product task from release `b93fa9d`; use
  `48809d6` as the rollback anchor for this cache deployment.
- Production evidence: versioned requests progressed `MISS → HIT` with
  `Age=13/12`; Tunnel HA=`4`, origin=`200`, public route/auth checks and the
  Landing browser matrix passed; local/remote manifest SHA-256 match.
- Read first: `AGENTS.md` → baseline spec → `docs/progress.md` →
  `project_index.md` → cache design → cache plan → this handoff.
