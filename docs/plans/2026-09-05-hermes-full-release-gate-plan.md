# Hermes Full Golden-Corpus and Production Release Gate Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Complete Taskmaster `hermes-research-intelligence` Task 12 with one exact-release pass/fail decision assembled from the existing parser, search, lifecycle, presentation, browser and infrastructure gates.

**Architecture:** Existing component tests and ECS acceptance tools remain the evidence producers. A small dependency-free verifier consumes one strict, content-free JSON summary tied to the candidate SHA and enforces every quantitative threshold. It does not create a second parser/search framework, include document text, or accept a local result in place of ECS evidence.

## Task 1: Strict aggregate contract

**Files:**
- Create: `scripts/hermes-full-release-gate.mjs`
- Create: `scripts/hermes-full-release-gate.test.mjs`

- [x] Test the valid exact-release report and each release threshold.
- [x] Reject unknown/missing fields, mismatched source/release SHA, false-ready parser cases, missing evidence references and private/secret-bearing payloads.
- [x] Enforce locator 100%, Claim precision >= 0.90, evidence relation precision >= 0.90, bbox hit rate >= 0.95, search P95 <= 2500 ms, TTL/signed-link 100%, deterministic presentation replay and all production checks.

## Task 2: Reuse component gates

- [ ] Run the 16-case parser acceptance and locator report on ECS.
- [ ] Reuse the retained BGE-M3 exact-model evaluation and run live lexical/dense health/fallback probes.
- [ ] Run Claim/Evidence corpus, identity routing, temporary lifecycle and presentation focused gates.
- [ ] Run the real upload -> parse -> review -> version -> publish -> public reuse browser journey.
- [ ] Run one stable OA acquisition, one institution-entitled acquisition and representative product-entry/API checks; record ScienceDirect as an external entitlement/API capability, not a false platform failure.

## Task 3: Candidate deploy and exact-release decision

- [ ] Full workspace build/typecheck/lint/test/docs gates and CI.
- [ ] Deploy the immutable merged SHA using the canonical release script.
- [ ] Verify core/search migrations, container/model identity, runtime dependencies, internal/public health, kill switches and exact rollback.
- [ ] Produce the content-free report on ECS and pass `hermes-full-release-gate.mjs`.
- [ ] Mark Tasks 10, 11 and 12 done only after their production evidence passes.

## Task 4: Hygiene and handoff

- [ ] Enumerate exact stopped containers and unused images; remove only items proven outside active/rollback.
- [ ] Keep the single shared Chromium, BGE model volume, ScanSci session/data and active/rollback images.
- [ ] Remove the exact local wheel-audit temp directory.
- [ ] Sync capability registry, design status, progress, CURRENT handoff, Taskmaster and project index; run docs sync/lint.
