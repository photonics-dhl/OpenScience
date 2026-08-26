# Hermes AI Gateway and LLM OCR Routing Implementation Plan

> **Status: in progress (2026-08-27).** Taskmaster tag `hermes-research-intelligence`, Task 5. Production application/release remains `ef043ebb8e51332effe75a5639cb207aec7bfc47` until the exact implementation SHA passes review, CI and ECS acceptance.

**Goal:** Add a provider-neutral, bounded LLM OCR route to the existing AI Gateway with per-provider kill switches, computed prompt/input hashes, page-level provenance, explicit cost/latency audit fields and a MiniMax Coding Plan VLM adapter, without exposing provider payloads to API, Domain or Web.

**Architecture:** Keep text and vision provider pools separate. The Worker supplies only selected raster pages, dimensions and an allowed selection reason; the Gateway owns the versioned deterministic prompts, checks a trusted server-side external-processing policy, validates and hashes inputs, routes each page independently so a partial failure cannot replay already successful pages, stamps every result as an `llm_ocr_candidate`, and records metadata without prompts, bytes, data URLs or keys. MiniMax vision uses the officially published `/v1/coding_plan/vlm` transport inside `packages/ai-gateway`; the existing OpenAI-compatible and Anthropic-compatible text providers remain unchanged. Runtime vision routing is disabled by default and remains operationally blocked until exposed credentials are rotated and a paid canary is approved.

**Official protocol evidence:** MiniMax's current OpenAI-compatible text API explicitly does not accept image input. The official `MiniMax-Coding-Plan-MCP` implementation sends one image plus a prompt to `/v1/coding_plan/vlm`. Therefore Task 5 must not send images through `/chat/completions` or `/v1/messages` and must not install the MCP package merely to copy its thin HTTP transport.

**Constraints:** No database migration, HTTP endpoint, UI change, parser cascade, real research write, paid provider call, new SDK, local Docker or local model. Docker build, runtime inspection and deployment happen only on ECS through canonical Bash scripts.

---

## Task 1: Lock the OCR contract and red tests

**Files:**

- Create: `packages/ai-gateway/src/ocr.ts`
- Create: `packages/ai-gateway/test/ocr-gateway.test.ts`
- Modify: `packages/ai-gateway/src/errors.ts`
- Modify: `packages/ai-gateway/src/index.ts`

- [x] Define explicit raster-page input, source identity, OCR candidate/result, provider result, pricing estimate and kill-switch contracts.
- [x] Reject unknown fields, empty/duplicate/out-of-range selections, unsupported MIME/magic pairs, invalid dimensions, oversized pages/requests, invalid SHA-256 source identities and malformed provider results.
- [x] Accept only allowed low-confidence/formula/table/layout selection reasons; generate versioned prompts inside the Gateway and compute hashes from the exact prompt/page bytes rather than accepting either hash or prompt from a provider/caller.
- [x] Require a server-side external-processing policy decision before any bytes can leave the Worker boundary; policy failure fails closed.
- [x] Prove results contain only canonical candidates labelled `llm_ocr_candidate` and never overwrite an original source-map block.

## Task 2: Implement audited per-page routing and immediate kill switches

**Files:**

- Modify: `packages/ai-gateway/src/gateway.ts`
- Modify: `packages/ai-gateway/test/gateway.test.ts`
- Modify: `packages/ai-gateway/test/ocr-gateway.test.ts`

- [x] Add a separate ordered OCR provider pool and a runtime-evaluated async provider capability policy/kill switch.
- [x] Route every selected page independently through primary/fallback providers; never replay a successful page because a later page failed.
- [x] Record operation, provider/model, page number/count/reason, prompt hash, input content hash, versioned integer micro-USD estimate, actual tokens/cost, per-attempt/total latency, retry count, fallback reason, outcome and normalized error code.
- [x] Keep all audit fields JSON-safe and bounded; record no prompt, page bytes, base64/data URL, output text, key or provider raw response.
- [x] Preserve existing text routing semantics and make its latency per attempt rather than cumulative.

## Task 3: Add the MiniMax Coding Plan VLM adapter

**Files:**

- Modify: `packages/ai-gateway/src/provider.ts`
- Create: `packages/ai-gateway/test/minimax-vision-provider.test.ts`

- [x] Implement a fetch-only MiniMax vision provider inside AI Gateway using `POST /v1/coding_plan/vlm`, Bearer authentication and a bounded JPEG/PNG/WebP data URL.
- [x] Treat non-2xx, non-zero provider status, empty content, timeout and malformed JSON as provider failures without surfacing raw payloads.
- [x] Use a configured stable adapter/model label because the VLM response does not guarantee an underlying model ID.
- [x] Support an optional configured per-page micro-USD estimate; use explicit `null` when pricing is unknown rather than inventing a value.

## Task 4: Wire safe Worker configuration and structural boundaries

**Files:**

- Modify: `apps/agent-worker/src/index.ts`
- Modify: `apps/agent-worker/test/gateway-config.test.ts`
- Modify: `.env.example`
- Modify: `docs/runbooks/hermes-capability-registry.md`
- Modify: `project_index.md`

- [x] Add non-secret `MINIMAX_VISION_ENABLED`, host/model, per-page estimate and page/byte cap configuration; default disabled.
- [x] Instantiate the vision provider only when explicitly enabled and a key exists; never infer vision support from a text provider or Token Plan key prefix.
- [x] Prove the kill switch immediately stops MiniMax vision routing and a missing/disabled vision provider fails closed.
- [x] Scan API, Domain and Web for provider SDK imports/provider-specific payload contracts and keep provider code inside `packages/ai-gateway`.
- [x] Update the capability registry with exact route, data destination, default-disabled state, kill switch and rollback; record no credential value.

## Task 5: Review, ECS acceptance, deployment and closeout

**Files:**

- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `project_index.md`
- Modify: this plan

- [ ] Run focused AI Gateway/Worker tests, full typecheck/lint/unit/build, docs-sync/docs lint and diff/credential checks.
- [ ] Obtain independent architecture/security review; close every Critical/Important finding.
- [ ] Push the exact reviewed implementation and require exact-SHA CI success.
- [ ] On ECS only: preflight, full build, focused tests, a no-secret compiled OCR contract self-test, backup, immutable deploy and independent postdeploy verification.
- [ ] Verify no migration/seed/research write, vision remains disabled without the explicit flag, text providers remain healthy, current core/search migration sets remain unchanged, public/loopback health passes and rollback remains available.
- [ ] Mark Taskmaster Task 5 done only after server acceptance. Then confirm Tasks 4 and 6 become ready, synchronize CURRENT memory, publish docs-only closeout and wait for exact final docs-HEAD CI.

## Acceptance invariants

- Every externally sent page is explicitly selected, bounded and represented by computed hashes in audit evidence.
- A provider result is always a candidate layer; Task 5 provides no API capable of replacing an original block.
- A disabled provider receives zero network calls, including during fallback.
- Paid-call audit failure does not replay the provider call.
- Unknown price/model data is `null` or a configured label, never fabricated.
- Provider outage leaves deterministic parsing, original-file reading and manual editing available; Task 4 decides when a page needs LLM OCR.
- No secret value, prompt, image data, OCR text or raw provider payload enters logs, docs or Domain/API/Web contracts.
