# ADR-013: Administrator Codex image evaluation

Status: implementation candidate, not yet deployed. User explicitly authorized Hermes-to-Codex integration during the current server validation phase (2026-09-06).

## Context

Official CLI 0.153.0 has generated scientific images on the ECS using the account's device login and the existing v2ray/SSH/Squid route. Manual import into a private RO works, but it does not create an automatic Hermes task or bind an image to its storyboard parent. Existing `presentation.generate` already provides administrator permissions, credits, exact Claims, approved storyboard binding, and draft approval.

## Decision

Keep the existing public API and task workflow. Add a selectable `codex-image` provider inside AI Gateway. It submits bounded JSON to a file inbox. A trusted host runner executes the pinned CLI in a network-none container, normalizes its output with existing FFmpeg, and publishes a result for Gateway validation. No database migration or public Codex endpoint is introduced.

- Explicit `HERMES_SCENE_IMAGE_PROVIDER=codex` selects the evaluation provider. Absent selection preserves MiniMax. Existing administrator and workspace write checks remain mandatory.
- Worker mounts only inbox read-write and results read-only. Credentials, claimed requests, started markers, raw images and logs remain in a private runner directory.
- Task UUID identifies a request. Exclusive submission and a private, fsynced started marker prevent automatic repeated execution. Existing Worker retry protection cannot cover a separate runner restarting, so the runner needs its own durable execution record.
- The result carries the existing prompt hash. This verifies that a cross-process result belongs to the task's drawing brief; the former single-process provider validation cannot detect spool result misassociation.
- A request has at most ten minutes to complete. The runner executes one job at a time. Started jobs without a completed result become uncertain after restart; no automatic retry or fallback occurs.
- Codex gets only a bounded drawing brief, through stdin. No request text becomes a command, mount, environment variable or path. Shell, browser, MCP and other data-access tools remain disabled. The bundled code-mode host is enabled because the image tool requires it.
- Only a private Unix socket reaches a trusted CONNECT proxy, restricted to `chatgpt.com:443` and `auth.openai.com:443`. Codex never receives host networking or a Docker socket. The host proxy receives no account credential.
- Account credentials are a nested read-only file mount; caches are separately writable. A refresh that requires changing the credential fails closed and requires operator login maintenance.
- Original images stay private. A separate no-network FFmpeg container contains/pads them to 1280×720, strips metadata, and hands PNG bytes to existing Gateway checks.
- Runner source and compiled Gateway validators are copied from an immutable application release to their own versioned bundle, so application release retention cannot remove a running service's scripts.

## Scope and limitations

This is an administrator-controlled validation integration, not a supported public subscription-backed image API. [Official authentication guidance](https://learn.chatgpt.com/docs/auth) recommends API authentication for programmatic use and warns against exposing Codex execution to untrusted/public environments. [Image guidance](https://learn.chatgpt.com/docs/image-generation) directs programmatic image workloads to the Image API. The current evaluation remains private, bounded and operator-authorized; broader user rollout requires a supported provider/account arrangement and stable server egress.

No exact per-image dollar cost or quota is claimed. CLI JSONL does not provide an independent nested image-tool call ledger. The runner guarantees at most one CLI execution per task, validates exactly one output image, and performs no intentional generation retry; it does not claim enforcement of the model's internal tool-call count.

## Validation and rollback

Verify replay/crash/deadline behavior, file boundaries, proxy destinations, normalized image validation, administrator-only task submission and actual server-generated draft provenance. Roll back by selecting MiniMax or disabling scene images, then stopping the Codex runner after the active job settles. Keep task/output evidence; do not silently resubmit uncertain jobs.
