# Hermes Full Golden-Corpus and Production Release Gate Plan

> **COMPLETED / PRODUCTION.** Taskmaster Task 12 passed on exact application release `b32d81c3474a0ba3c7cead5d4cacbc4a0e8fc4f7`; rollback is `0aaf52fed29e79bb19b15517ba9ef50545510f72`.
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

- [x] Run the 16-case parser acceptance and locator report on ECS.
- [x] Reuse the retained BGE-M3 exact-model evaluation and run live lexical/dense health/fallback probes.
- [x] Run Claim/Evidence corpus, identity routing, temporary lifecycle and presentation focused gates.
- [x] Run a fresh real 2,215,244-byte PDF through upload -> parser/source map -> review/confirm -> version -> 3 core Claims -> publication review -> R3 publish -> anonymous public 200 on the current release (`OSR-2026-000021`). Keep unsupported Claims `missing`. Record the earlier 24.7 MB upload as source-map-complete but SDF-proposal-unavailable `needs_review`, then archive it without misreporting either failure or publication.
- [x] Run one stable OA acquisition, one institution-entitled acquisition and representative product-entry/API checks; record ScienceDirect as an external entitlement/API capability, not a false platform failure.

## Task 3: Candidate deploy and exact-release decision

- [x] Full workspace build/typecheck/lint/test/docs gates and CI.
- [x] Deploy the immutable merged SHA using the canonical release script.
- [x] Verify core/search migrations, container/model identity, runtime dependencies, internal/public health, kill switches and exact rollback.
- [x] Produce the content-free report on ECS and pass `hermes-full-release-gate.mjs`. Final report SHA-256: `1ca3b0e1e3f730a94ba49a4e0e9959041d2b98e20d2778227c909ccae55a08f2`; evidence refs include the fresh input and publication hashes.
- [x] Mark Tasks 10, 11 and 12 done only after their production evidence passes.

## Task 4: Hygiene and handoff

- [x] Enumerate exact stopped containers and unused images; remove only items proven outside active/rollback.
- [x] Keep the single shared Chromium, BGE model volume, ScanSci session/data and active/rollback images.
- [x] Remove the exact local wheel-audit temp directory.
- [x] Sync capability registry, design status, progress, CURRENT handoff, Taskmaster and project index; run docs sync/lint.
