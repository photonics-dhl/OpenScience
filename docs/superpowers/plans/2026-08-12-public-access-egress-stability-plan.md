# Public Access and Egress Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the public site independent from visual-development work while making ECS outbound traffic prefer the home SSH tunnel and fall back to Alibaba Cloud direct egress without restarting Docker or application services.

**Architecture:** Public ingress remains DNS → ECS Nginx → Web/API and never depends on the developer workstation. ECS egress clients use a loopback-only Squid forward proxy on `127.0.0.1:7891`; Squid tries the SSH reverse-tunnel parent at `127.0.0.1:7890` first and uses DIRECT when that parent is unavailable. Visual prototypes remain isolated and are not deployed until an explicit acceptance gate.

**Tech Stack:** Alibaba Cloud Linux 4, Squid 7.2, OpenSSH reverse forwarding, Docker 24, Nginx 1.30, shell verification scripts.

## Global Constraints

- Do not expose either proxy port publicly; both listeners must remain bound to `127.0.0.1`.
- Do not route public inbound requests through the workstation or the SSH tunnel.
- Do not restart Nginx, Web, API, databases, or Docker while validating Squid.
- Do not switch dockerd to port 7891 until parent-first and direct-fallback probes both pass.
- Preserve the existing port 7890 tunnel and Tailscale prohibition.
- Every production mutation requires a rollback command and post-change public-browser probe.

---

### Task 1: Record and validate the egress boundary

**Files:**
- Create: `docs/decisions/ADR-005-public-ingress-and-egress-failover.md`
- Create: `infra/squid/openscience-egress.conf`
- Create: `infra/scripts/check-egress-path.sh`
- Create: `infra/scripts/test-egress-fallback.sh`
- Modify: `docs/runbooks/monitoring.md`
- Modify: `project_index.md`

- [x] Write a RED source-contract check requiring loopback-only 7891, parent 7890, parent-first selection, direct fallback, and localhost-only ACLs.
- [x] Add the minimal Squid configuration, probe script, ADR, runbook prechecks/steps/rollback/verification, and index entries.
- [x] Run shell syntax checks, source-contract checks, docs lint, and docs sync.

### Task 2: Deploy Squid without switching clients

**Files:**
- Deploy reviewed `infra/squid/openscience-egress.conf` to `/etc/squid/squid.conf`.

- [x] Install the repository-provided Squid 7.2 package and back up its original configuration.
- [x] Validate with `squid -k parse`, enable the loopback-only service, and confirm port 7891 is not publicly bound.
- [x] Probe through 7891 with the tunnel online; require a successful response and Squid hierarchy evidence that the 7890 parent was selected.
- [x] Launch an isolated second Squid test instance with a deliberately unavailable parent; require the same target to succeed using DIRECT, then stop only that test instance.

### Task 3: Switch ECS egress clients and verify public isolation

**Files:**
- Modify server dockerd proxy drop-in only after Task 2 passes.
- Deploy `infra/scripts/check-egress-path.sh` to `/usr/local/bin/`.

- [x] Enable Docker live-restore, point dockerd's HTTP/HTTPS proxy at `127.0.0.1:7891`, and record the observed two-request 502 publication gap during the authorized daemon restart.
- [x] Update `with-proxy` deployment guidance so ordinary commands use 7891 while retaining its direct fallback semantics.
- [x] Verify tunnel-online parent selection, isolated parent-down DIRECT fallback, Docker registry reachability, and return to parent selection.
- [x] Run 60 Chromium public probes, Nginx 5xx/499 checks, container restart-count checks, and `checkup.sh`.
- [x] Update `docs/progress.md` and the runbook with exact evidence before resuming visual Task 3.
