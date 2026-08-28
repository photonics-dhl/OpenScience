# Task 1 Implementer Report

## Status

Task 1 remains **in progress**. The isolated evaluation harness and corrected current/LiteParse/Tesseract evidence are complete. Docling and PaddleOCR failed before corpus execution, so neither failure is parser-quality evidence and no candidate was promoted from `APPROVED_PILOT`.

Implementation commits:

- `04178b4146bd234ba1236ed8d3fdd8173c7f02de` (`feat(parser-eval): complete CPU candidate bake-off harness`).
- `7f858e5` (initial evidence and Paddle native-runtime correction).
- `4eabdf76dd245a64c23d196e14f89469439e0ba6` (`fix(parser-eval): enforce isolated OCR evidence`).
- `7ea900dcd802822b39b0b4ee460e04506b8bf78d` (`fix(parser-eval): sync exact evaluation archives`).

Production anchor remained `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback anchor remained `8163f8b4218e529ee4be41bb9fc732ff6497931a`. Production Compose, active/release source trees and release markers were not changed.

## Changed files

- `apps/agent-worker/test/parser-evaluation.test.ts`
- `infra/scripts/evaluate-document-parsers.sh`
- `infra/parser-candidates/current-parser/execution-path.mjs`
- `infra/parser-candidates/current-parser/runner.mjs`
- `infra/parser-candidates/current-parser/runner.test.mjs`
- `infra/parser-candidates/paddleocr/Dockerfile`
- `infra/parser-candidates/paddleocr/runner.py`
- `infra/parser-candidates/paddleocr/runner_test.py`
- `scripts/evaluation-source-sync-command.mjs`
- `scripts/evaluation-source-sync-command.test.mjs`
- `scripts/evaluation-source-sync.mjs`
- `docs/runbooks/hermes-capability-registry.md`
- `project_index.md`
- `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/task-1-implementer.md`

## Review corrections, TDD and local validation

The specification review invalidated the initial current/Tesseract acceptance numbers: the first execution path could read a production release checkout, OCR Y coordinates were still image-top-left coordinates, and RSS only covered the runner process. Those values are historical diagnostics only and are superseded below.

RED was captured before each correction:

- Release-tree sources were accepted by the execution path.
- A real NumPy-like result raised ambiguous truth/shape errors through Paddle `_pages_from_results`.
- Non-symmetric OCR boxes preserved top-left Y for both Tesseract and Paddle.
- OCR child/container memory was absent from the reported candidate peak.
- Archive-only evaluation source could not prove its exact commit identity.
- The source-sync command did not yet have a fail-closed evaluation-root contract.
- An absolute evaluation script invoked from an unrelated workspace left pnpm on the caller's ambient cwd.

GREEN behavior now requires:

- Execution source is exactly `/opt/openscience-evals/document-parser/<sha>/source`; production, active and release-tree paths are refused before any build or evidence write.
- An exact local `git archive <sha>` is streamed to `/source.stage`, validated, marked with `.evaluation-source`, and atomically renamed to `/source`; the helper cannot target `/opt/openscience`, `/opt/openscience-releases` or a mismatched SHA root.
- Paddle ndarray-like values are normalized with `tolist()` without boolean evaluation or `Sequence` assumptions, including NumPy scalar coordinates.
- Tesseract and Paddle convert image top-left boxes to the corpus PDF bottom-left coordinate system. The non-symmetric fixture `[72,147,432,192]` becomes `[72,600,432,645]` on the 792-point page.
- Successful OCR outcomes require the candidate cgroup peak (`memory.peak` or v1 `memory.max_usage_in_bytes`) and report `max(self, container)` so OCR children are included.
- After the dedicated-source validator passes, the script immediately enters `REPOSITORY_ROOT`; all subsequent pnpm workspace commands are therefore rooted in the validated evaluation source even when the absolute script path is invoked from another workspace.

Fresh GREEN evidence after the corrections:

- `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-evaluation.test.ts`: 20/20, including an absolute-script invocation from a temporary unrelated cwd.
- `node --test infra/parser-candidates/current-parser/runner.test.mjs`: 6/6.
- `python infra/parser-candidates/paddleocr/runner_test.py`: 4/4.
- `node --test scripts/evaluation-source-sync-command.test.mjs`: 1/1.
- `python infra/parser-candidates/docling/runner_test.py`: 3/3.
- `node --test infra/parser-candidates/liteparse/runner.test.mjs`: 4/4.
- `npx pnpm@9.15.0 --filter @openscience/agent-worker typecheck`: passed.
- Explicit Git Bash syntax checks for the evaluation scripts and Node/Python syntax checks: passed.
- `git diff --check`: passed before both correction commits.

The current parser and Tesseract runner uses the active production parser image. Candidate execution retains `--network none`, a read-only root, non-root UID/GID 10001, 2 CPU, 2 GiB hard memory/swap, 64 PIDs, no capabilities, no-new-privileges, a single read-only corpus mount, disabled Docker logging, a 120-second attached execution timeout and a 64 KiB normalized output bound.

## Exact ECS commands and evidence

Every ECS command was sent through the repository wrapper using explicit Windows Git Bash:

```text
C:/Program Files/Git/bin/bash.exe infra/scripts/ssh-run.sh '<content-free remote command>'
```

Docker was never run locally. Exact archive sources and all candidate artifacts stayed below `/opt/openscience-evals/document-parser/<git-sha>/`; no global host install, production Compose mutation or release-tree mutation occurred.

### Current production parser baseline

- Evaluation source SHA: `7ea900dcd802822b39b0b4ee460e04506b8bf78d`.
- Candidate version: production release `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`.
- Image: `sha256:88da362b3ca264c6b24eb453c803d82d239942dd81d8b279862273b0b4a75606`.
- Seven PDFs: 1 succeeded, 5 needs review, 1 failed; 7/16 locators.
- P50/P95: 96/241 ms; candidate-wide peak RSS: 104,456,192 bytes.
- Corrupt PDF failed explicitly; the image-only scan remained review, so no false-ready result was accepted.

### LiteParse 2.14.0

- Harness/source SHA: `e50a5603421cfc4aeca0c0afb5c3b3bea02ed717`.
- Image: `sha256:352cf5d985c7fbf11e936c12e8878fc83bee6e08bb3a0fb4fe53c5e1d34c5601`; Apache-2.0; locked npm integrity `sha512-lIFBbTRs87Bpp45Lm986hUDEPndm85pT9l/BM1dtWhQs0zTLEkpHLrgbOxGG2rjBqDgJM5fdChT8LWUd4ZThWA==`.
- Seven PDFs: 5 succeeded, 1 needs review, 1 failed; 13/16 locators.
- P50/P95: 8/163 ms; peak RSS: 61,300,736 bytes.
- Native, dual-column, table, formula and references locators reproduced. The scan remained review because OCR was disabled, and the corrupt PDF failed explicitly.

Compared with the measured current parser, LiteParse improved from 7/16 to 13/16 locators, added exact dual-column/table/formula/reference geometry reproduction, stayed below 30 seconds/page and below 2 GiB RSS, and introduced no false-ready result. It remains `APPROVED_PILOT` because the required Docling comparison is unavailable.

### Tesseract production baseline

- Evaluation source SHA: `7ea900dcd802822b39b0b4ee460e04506b8bf78d`.
- Same production image digest as the current parser.
- Selected scan: 1 succeeded, 0 needs review, 0 failed; 2/2 locators after bottom-left Y normalization.
- P50/P95: 419/419 ms; candidate-wide peak RSS: 141,406,208 bytes.
- The package-license field remains unverified in the captured report; this is retained as an explicit residual rather than silently filled after execution.

### Docling 2.123.0

- Exact source SHA: `e50a5603421cfc4aeca0c0afb5c3b3bea02ed717`.
- Official wheel SHA-256: `95c0a4d9bc1beafc6097c8573ec3a8dc317e8bcf67e3234aa7c050b7d73fde9c`; MIT.
- The exact CPU dependency layer installed, including `torch 2.13.0+cpu` and `torchvision 0.28.0+cpu`.
- The model acquisition step failed on the locked build path with `httpx.ConnectError: [Errno 99] Cannot assign requested address`, followed by an offline-cache miss.
- No final image, model aggregate lock, preflight, corpus result, latency or RSS result exists. The failure is network/model acquisition evidence only, not Docling quality evidence. No uncontrolled retry was made.
- No Docling retry was made in the specification-review fix-loop.

### PaddleOCR 3.7.0

- Corrected evaluation source SHA: `7ea900dcd802822b39b0b4ee460e04506b8bf78d`.
- Official wheel SHA-256: `c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338`; Apache-2.0 package; CPU PaddlePaddle 3.3.1.
- The bounded corrected ECS rebuild installed Debian `libgomp1` and pinned CPU PaddlePaddle 3.3.1. It reached Dockerfile step 6/12, then the agreed cutoff was enforced while the pinned PaddleOCR/PaddleX dependency phase was downloading `opencv-contrib-python` (68.7 MB) through slow PyPI egress.
- The build was stopped before PaddleOCR dependency installation completed. No OCR model download, final image, package/model lock, candidate-lock preflight, scan result, latency or RSS result exists.
- This is dependency-acquisition evidence only, not PaddleOCR quality evidence. No further retry was made.

## Exact secret-free command ledger

All commands below ran from local cwd `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`. Connection values came from the project configuration and were not printed.

Exact archive-sync invocation:

```powershell
$env:XGS_EVALUATION_SHA='7ea900dcd802822b39b0b4ee460e04506b8bf78d'; $env:XGS_CONFIG_ROOT='E:/Miscellaneous/XGS'; try { node scripts/evaluation-source-sync.mjs } finally { Remove-Item Env:XGS_EVALUATION_SHA -ErrorAction SilentlyContinue; Remove-Item Env:XGS_CONFIG_ROOT -ErrorAction SilentlyContinue }
```

That helper streamed `git -c core.autocrlf=false archive --format=tar.gz 7ea900dcd802822b39b0b4ee460e04506b8bf78d` over SSH. The exact materialization payload was generated and tested by `scripts/evaluation-source-sync-command.mjs`: exact target `/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source`, exact stage `/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage`, canonical parent/root checks, absent-target check, stage-only cleanup trap, `tar -xzf - --no-same-owner`, required-file checks, exact `.evaluation-source` marker write, and atomic stage-to-target rename. It contains no active or release-tree path.

```sh
set -eu
test '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source' = '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source'
test '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage' = '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage'
test '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d' = '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d'
test "$(readlink -m '/opt/openscience-evals/document-parser')" = '/opt/openscience-evals/document-parser'
mkdir -p '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d'
test "$(readlink -f '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d')" = '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d'
test ! -e '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source'
if [ -e '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage' ]; then rm -rf -- '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage'; fi
cleanup_stage() { rm -rf -- '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage'; }
trap 'cleanup_stage' EXIT HUP INT TERM
mkdir -p '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage'
tar -xzf - --no-same-owner -C '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage'
test -f '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage/.dockerignore'
test -f '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage/package.json'
test -f '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage/infra/scripts/evaluate-document-parsers.sh'
test -f '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage/infra/parser-candidates/current-parser/execution-path.mjs'
printf '%s\n' '7ea900dcd802822b39b0b4ee460e04506b8bf78d' > '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage/.evaluation-source'
mv '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source.stage' '/opt/openscience-evals/document-parser/7ea900dcd802822b39b0b4ee460e04506b8bf78d/source'
trap - EXIT HUP INT TERM
```

Every direct ECS command used literal wrapper `C:/Program Files/Git/bin/bash.exe infra/scripts/ssh-run.sh '<payload>'`. Exact evidence payloads:

```sh
set -euo pipefail; eval_sha=7ea900dcd802822b39b0b4ee460e04506b8bf78d; eval_root=/opt/openscience-evals/document-parser/$eval_sha; test "$(cat "$eval_root/source/.evaluation-source")" = "$eval_sha"; cd "$eval_root/source"; npx pnpm@9.15.0 install --frozen-lockfile --reporter=silent; echo source-deps-ready-$eval_sha
set -euo pipefail; eval_sha=7ea900dcd802822b39b0b4ee460e04506b8bf78d; cd /opt/openscience-evals/document-parser/$eval_sha/source; bash infra/scripts/evaluate-document-parsers.sh --execute current-parser
set -euo pipefail; eval_sha=7ea900dcd802822b39b0b4ee460e04506b8bf78d; cd /opt/openscience-evals/document-parser/$eval_sha/source; bash infra/scripts/evaluate-document-parsers.sh --execute tesseract
set -euo pipefail; eval_sha=7ea900dcd802822b39b0b4ee460e04506b8bf78d; cd /opt/openscience-evals/document-parser/$eval_sha/source; bash infra/scripts/evaluate-document-parsers.sh --execute paddleocr
```

Exact identity-checked cutoff/cleanup payloads used `ssh-run.sh --confirm`:

```sh
set -euo pipefail; full_id=d5ff0e626bb77f7d90619ac326bdf4513b84165ccf4ae089c7944e4f85645daa; test "$(docker container inspect --format "{{.Image}}" "$full_id")" = sha256:dac715e8416321d6076ed0733847f6fb47b13cac296217a24aca51a4cf147ac7; docker container rm -f "$full_id" >/dev/null; test -z "$(docker ps -aq --filter id=$full_id)"; echo exact-build-container-removed
set -euo pipefail; for id in dac715e8416321d6076ed0733847f6fb47b13cac296217a24aca51a4cf147ac7 f43c55f35570e9ccba7f5c3e1477cf739707ee70295f8681319c288959d92a58 e23c8761fbc44da79a6024b82d1aec37f669c916c8e20d58f7b34330e040d17b; do if docker image inspect "$id" >/dev/null 2>&1; then test "$(docker image inspect --format "{{json .RepoTags}}" "$id")" = "[]"; docker image rm "$id" >/dev/null; fi; done; eval_sha=7ea900dcd802822b39b0b4ee460e04506b8bf78d; eval_root=/opt/openscience-evals/document-parser/$eval_sha; test "$(realpath -m "$eval_root")" = "$eval_root"; test "$(dirname "$eval_root")" = /opt/openscience-evals/document-parser; if test -e "$eval_root"; then test "$(cat "$eval_root/source/.evaluation-source")" = "$eval_sha"; rm -rf --one-file-system "$eval_root"; fi; test ! -e "$eval_root"; release_id=$(cat /opt/openscience/.release-id); test "$release_id" = e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f; container_count=$(docker ps -aq --filter label=org.openscience.evaluation-source=$eval_sha | wc -l); image_count=$(docker image ls -q --filter label=org.openscience.evaluation-source=$eval_sha | wc -l); test "$container_count" -eq 0; test "$image_count" -eq 0; for id in dac715e8416321d6076ed0733847f6fb47b13cac296217a24aca51a4cf147ac7 f43c55f35570e9ccba7f5c3e1477cf739707ee70295f8681319c288959d92a58 e23c8761fbc44da79a6024b82d1aec37f669c916c8e20d58f7b34330e040d17b; do ! docker image inspect "$id" >/dev/null 2>&1; done; printf "release=%s eval_root_absent=true containers=%s images=%s intermediates_absent=true\n" "$release_id" "$container_count" "$image_count"
```

## Cleanup

Only exact task resources were removed after bounded summaries were captured.

Final ECS verification:

- Evaluation root `e50a560…`: absent.
- Evaluation root `04178b4…`: absent.
- Evaluation root `4eabdf7…`: absent.
- Evaluation root `7ea900d…`: absent.
- `7ea900d…` task-labeled containers: 0.
- `7ea900d…` task-labeled images: 0.
- Exact Paddle build container and its three verified untagged intermediate images: absent.
- Production parser image: retained.
- Active release: unchanged at `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`.

## Retention result and residual risk

- LiteParse meets the measured current-baseline quality/resource gate but remains `APPROVED_PILOT`; the required Docling result is missing.
- Docling remains `APPROVED_PILOT`; exact blocker is model download connectivity before lock/preflight/corpus.
- PaddleOCR remains `APPROVED_PILOT`; native `libgomp1` is corrected, but dependency acquisition reached the bounded cutoff before model lock/preflight/corpus.
- Tesseract remains the production scan fallback; corrected evidence is 2/2 locators with candidate-wide peak RSS, while its captured license field remains unverified.
- No parser candidate was retained in or routed into production. `progress.md` was deliberately not marked `Task 1: complete` because the Docling and PaddleOCR gates are incomplete.
