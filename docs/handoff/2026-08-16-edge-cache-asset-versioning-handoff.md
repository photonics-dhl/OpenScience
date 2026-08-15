# Handoff — 2026-08-16 edge cache asset versioning

- Current goal: deploy content-addressed long caching for the two large Landing
  optical PNGs without caching dynamic content.
- Done: added shared manifest, exact Next rewrites and one-year immutable
  headers; SSR, comparison route and WebGL loader use the versioned URLs;
  focused 38/38, full Web 248/248, typecheck and 16-page build pass; local
  production responses prove versioned `immutable` and HTML/canonical paths
  remain non-immutable; production Landing desktop/mobile normal/reduced,
  idle and pointer browser matrix exits 0.
- Constraints: canonical PNGs are not renamed or deleted; no HTML/API/auth cache;
  no personal-computer production origin; no production write without explicit
  confirmation; deploy with `--skip-migrate`.
- Open risks: Cloudflare `CF-Cache-Status` and `Age` remain unverified until the
  candidate is deployed publicly.
- Next action: complete lint/docs/diff review, commit the branch, then request
  production deployment confirmation and run §5.8 of the deployment runbook.
- Read first: `AGENTS.md` → baseline spec → `docs/progress.md` →
  `project_index.md` → cache design → cache plan → this handoff.
