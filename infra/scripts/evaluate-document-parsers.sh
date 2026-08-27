#!/usr/bin/env bash
# ECS-only document parser candidate bake-off. Read-only contract mode is portable.
set -euo pipefail

usage() {
  echo "usage: $0 --print-run-contract|--normalize-outcome|--execute <current-parser|liteparse|docling|tesseract|paddleocr|grobid>" >&2
  exit 64
}

MODE="${1:-}"
CANDIDATE="${2:-}"
[[ "$#" -eq 2 ]] || usage
case "$MODE" in
  --print-run-contract|--normalize-outcome|--execute) ;;
  *) usage ;;
esac
case "$CANDIDATE" in
  current-parser|liteparse|docling|tesseract|paddleocr|grobid) ;;
  *) echo "unsupported candidate: $CANDIDATE" >&2; exit 64 ;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
GIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
[[ "$GIT_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid git sha' >&2; exit 65; }
EVALUATION_ROOT="/opt/openscience-evals/document-parser/$GIT_SHA"

print_run_contract() {
  printf '%s\n' "{
  \"schemaVersion\": 1,
  \"candidate\": \"$CANDIDATE\",
  \"gitSha\": \"$GIT_SHA\",
  \"evaluationRoot\": \"$EVALUATION_ROOT\",
  \"sandbox\": {
    \"network\": \"none\",
    \"readOnlyRoot\": true,
    \"user\": \"10001:10001\",
    \"cpus\": 2,
    \"memoryBytes\": 2147483648,
    \"pidsLimit\": 64,
    \"noNewPrivileges\": true,
    \"capDrop\": \"ALL\",
    \"corpusReadOnly\": true,
    \"outputKind\": \"attached-stdout\",
    \"outputMaxBytes\": 65536
  },
  \"processBoundary\": {
    \"logDriver\": \"none\",
    \"hostCaptureMaxBytes\": 65536,
    \"attachTimeoutSeconds\": 120,
    \"nonzeroExit\": \"failed\",
    \"timeoutAction\": \"kill-container\",
    \"publish\": \"atomic-staging-rename\"
  }
}"
}

normalize_outcome() {
  node -e '
    const chunks = [];
    let bytes = 0;
    process.stdin.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 65536) process.exit(75);
      chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      try {
        const input = Buffer.concat(chunks, bytes).toString("utf8");
        const value = JSON.parse(input);
        const allowed = new Set(["status", "locatorMatches", "elapsedMs", "peakRssBytes", "errorCode"]);
        if (!value || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new Error();
        if (!["succeeded", "needs_review", "failed"].includes(value.status)) throw new Error();
        for (const key of ["locatorMatches", "elapsedMs", "peakRssBytes"]) {
          if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error();
        }
        const errors = ["locator_miss", "parser_exit", "timeout", "limit_exceeded", "invalid_output"];
        if (value.errorCode !== undefined && !errors.includes(value.errorCode)) throw new Error();
        if (value.status === "succeeded" && value.errorCode !== undefined) throw new Error();
        process.stdout.write(JSON.stringify(value));
      } catch { process.exit(1); }
    });
  '
}

if [[ "$MODE" == '--print-run-contract' ]]; then
  print_run_contract
  exit 0
fi
if [[ "$MODE" == '--normalize-outcome' ]]; then
  normalize_outcome
  exit 0
fi

[[ "$(uname -s)" == 'Linux' ]] || { echo 'evaluation execution is restricted to the ECS host' >&2; exit 69; }
[[ -f /opt/openscience/.release-id && -d /opt/openscience-releases ]] \
  || { echo 'evaluation execution is restricted to the ECS host' >&2; exit 69; }
ACTIVE_RELEASE="$(cat /opt/openscience/.release-id)"
[[ "$ACTIVE_RELEASE" =~ ^[a-f0-9]{40}$ && -d "/opt/openscience-releases/$ACTIVE_RELEASE" ]] \
  || { echo 'invalid ECS release marker' >&2; exit 69; }
REAL_REPOSITORY_ROOT="$(readlink -f "$REPOSITORY_ROOT")"
case "$REAL_REPOSITORY_ROOT" in
  "/opt/openscience-releases/$GIT_SHA"|"$EVALUATION_ROOT/source") ;;
  *) echo 'evaluation source is outside an immutable ECS release or evaluation root' >&2; exit 69 ;;
esac

if [[ "$CANDIDATE" != 'liteparse' ]]; then
  echo "candidate execution is not implemented: $CANDIDATE" >&2
  exit 70
fi

for command in docker node npx timeout; do
  command -v "$command" >/dev/null 2>&1 || { echo "missing ECS command: $command" >&2; exit 69; }
done

CORPUS_DIR="$EVALUATION_ROOT/corpus"
MANIFEST_PATH="$CORPUS_DIR/manifest.json"
CANDIDATE_ROOT="$EVALUATION_ROOT/$CANDIDATE"
IMAGE_TAG="openscience/parser-eval-$CANDIDATE:$GIT_SHA"
DOCKERFILE="$REPOSITORY_ROOT/infra/parser-candidates/$CANDIDATE/Dockerfile"
[[ -f "$DOCKERFILE" ]] || { echo 'candidate Dockerfile is missing' >&2; exit 70; }

validate_owned_directory() {
  node - "$1" "$2" <<'NODE'
const { lstatSync, realpathSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const [target, expectedParent] = process.argv.slice(2);
const stats = lstatSync(target);
if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('evaluation path is not a real directory');
if (realpathSync(target) !== resolve(target)) throw new Error('evaluation path is not canonical');
if (dirname(realpathSync(target)) !== realpathSync(expectedParent)) throw new Error('evaluation parent mismatch');
if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) throw new Error('evaluation path owner mismatch');
if ((stats.mode & 0o022) !== 0) throw new Error('evaluation path is group/world writable');
NODE
}

[[ -e /opt/openscience-evals ]] || install -d -m 0755 /opt/openscience-evals
validate_owned_directory /opt/openscience-evals /opt
[[ -e /opt/openscience-evals/document-parser ]] || install -d -m 0755 /opt/openscience-evals/document-parser
validate_owned_directory /opt/openscience-evals/document-parser /opt/openscience-evals
[[ -e "$EVALUATION_ROOT" ]] || install -d -m 0755 "$EVALUATION_ROOT"
validate_owned_directory "$EVALUATION_ROOT" /opt/openscience-evals/document-parser
if [[ ! -f "$MANIFEST_PATH" ]]; then
  OPENSCIENCE_EVALUATION_CORPUS_DIR="$CORPUS_DIR" \
    npx pnpm@9.15.0 --filter @openscience/agent-worker export:parser-evaluation-corpus
fi
validate_owned_directory "$CORPUS_DIR" "$EVALUATION_ROOT"

node - "$CORPUS_DIR" <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync, statSync } = require('node:fs');
const { basename, join } = require('node:path');
const corpus = process.argv[2];
const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8'));
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 16) throw new Error('invalid evaluation corpus');
for (const item of manifest.cases) {
  if (typeof item.filename !== 'string' || basename(item.filename) !== item.filename) throw new Error('unsafe fixture name');
  const path = join(corpus, item.filename);
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > 50 * 1024 * 1024) throw new Error('invalid fixture');
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== item.sha256) throw new Error('fixture hash mismatch');
}
NODE

[[ ! -e "$CANDIDATE_ROOT" ]] || { echo 'candidate evaluation output already exists; refusing overwrite' >&2; exit 73; }
if docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.openscience.source"}}' "$IMAGE_TAG")" == "$GIT_SHA" ]] \
    || { echo 'candidate image tag has an unexpected source label' >&2; exit 73; }
else
  docker build --pull \
    --label "org.openscience.source=$GIT_SHA" \
    --label "org.openscience.candidate=$CANDIDATE" \
    --file "$DOCKERFILE" --tag "$IMAGE_TAG" "$REPOSITORY_ROOT"
fi
IMAGE_DIGEST="$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")"
[[ "$IMAGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'invalid candidate image digest' >&2; exit 70; }

npx pnpm@9.15.0 --filter @openscience/database generate
npx pnpm@9.15.0 --filter @openscience/agent-worker... build
PARSER_EVALUATION_MODULE="$REPOSITORY_ROOT/apps/agent-worker/dist/parser-evaluation.js"
[[ -f "$PARSER_EVALUATION_MODULE" ]] || { echo 'parser evaluation module build is missing' >&2; exit 70; }

STAGING_ROOT="$(mktemp -d "$EVALUATION_ROOT/.$CANDIDATE.staging.XXXXXX")"
chmod 0755 "$STAGING_ROOT"
validate_owned_directory "$STAGING_ROOT" "$EVALUATION_ROOT"
RESULTS_DIR="$STAGING_ROOT/results"
REPORT_PATH="$STAGING_ROOT/report.json"
mkdir -m 0755 "$RESULTS_DIR"

ACTIVE_CONTAINER_ID=''
cleanup_active_container() {
  if [[ "$ACTIVE_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]]; then
    docker kill "$ACTIVE_CONTAINER_ID" >/dev/null 2>&1 || true
    docker rm -f "$ACTIVE_CONTAINER_ID" >/dev/null 2>&1 || true
  fi
  ACTIVE_CONTAINER_ID=''
}
trap cleanup_active_container EXIT
trap 'cleanup_active_container; exit 130' HUP INT TERM

CASE_IDS=(
  corrupt-pdf-en
  native-pdf-en
  dual-column-pdf-en
  table-pdf-en
  formula-pdf-en
  references-pdf-en
  scan-pdf-image-only
)
for CASE_ID in "${CASE_IDS[@]}"; do
  CONTAINER_NAME="openscience-parser-eval-$CANDIDATE-${GIT_SHA:0:12}-$CASE_ID-${STAGING_ROOT##*.}"
  ACTIVE_CONTAINER_ID="$(docker create \
    --name "$CONTAINER_NAME" \
    --label "org.openscience.source=$GIT_SHA" \
    --label "org.openscience.candidate=$CANDIDATE" \
    --label "org.openscience.case=$CASE_ID" \
    --log-driver none \
    --restart no \
    --stop-timeout 1 \
    --network none \
    --read-only \
    --user 10001:10001 \
    --cpus 2 \
    --memory 2g \
    --memory-swap 2g \
    --pids-limit 64 \
    --security-opt no-new-privileges \
    --cap-drop ALL \
    --ulimit nofile=256:256 \
    --ulimit nproc=64:64 \
    --mount "type=bind,src=$CORPUS_DIR,dst=/corpus,readonly" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700 \
    "$IMAGE_TAG" /corpus/manifest.json "$CASE_ID")"
  [[ "$ACTIVE_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid candidate container id' >&2; exit 70; }
  STARTED_MS="$(date +%s%3N)"
  set +e
  CAPTURED_OUTPUT="$(
    timeout --signal=TERM --kill-after=5s 120s \
      docker start --attach "$ACTIVE_CONTAINER_ID" 2>/dev/null \
      | normalize_outcome
    PIPE_STATUSES=("${PIPESTATUS[@]}")
    printf '\n%s %s' "${PIPE_STATUSES[0]}" "${PIPE_STATUSES[1]}"
  )"
  set -e
  ELAPSED_MS=$(( $(date +%s%3N) - STARTED_MS ))
  PIPE_STATUS_LINE="${CAPTURED_OUTPUT##*$'\n'}"
  NORMALIZED_OUTPUT="${CAPTURED_OUTPUT%$'\n'*}"
  read -r START_STATUS NORMALIZE_STATUS <<< "$PIPE_STATUS_LINE"
  [[ "$START_STATUS" =~ ^[0-9]+$ && "$NORMALIZE_STATUS" =~ ^[0-9]+$ ]] \
    || { echo 'invalid attached process status' >&2; exit 70; }

  if [[ "$START_STATUS" -eq 124 || "$START_STATUS" -eq 137 ]]; then
    docker kill "$ACTIVE_CONTAINER_ID" >/dev/null 2>&1 || true
    timeout --signal=TERM --kill-after=1s 5s docker wait "$ACTIVE_CONTAINER_ID" >/dev/null 2>&1 || true
    NORMALIZED_OUTPUT="{\"status\":\"failed\",\"locatorMatches\":0,\"elapsedMs\":$ELAPSED_MS,\"peakRssBytes\":0,\"errorCode\":\"timeout\"}"
  else
    RUNNING="$(docker inspect --format '{{.State.Running}}' "$ACTIVE_CONTAINER_ID")"
    RUN_EXIT="$(docker inspect --format '{{.State.ExitCode}}' "$ACTIVE_CONTAINER_ID")"
    [[ "$RUNNING" =~ ^(true|false)$ && "$RUN_EXIT" =~ ^[0-9]+$ ]] \
      || { echo 'invalid candidate terminal state' >&2; exit 70; }
    if [[ "$RUNNING" == 'true' ]]; then
      docker kill "$ACTIVE_CONTAINER_ID" >/dev/null 2>&1 || true
      timeout --signal=TERM --kill-after=1s 5s docker wait "$ACTIVE_CONTAINER_ID" >/dev/null 2>&1 || true
    fi
    if [[ "$NORMALIZE_STATUS" -eq 75 ]]; then
      NORMALIZED_OUTPUT='{"status":"failed","locatorMatches":0,"elapsedMs":0,"peakRssBytes":0,"errorCode":"limit_exceeded"}'
    elif [[ "$NORMALIZE_STATUS" -ne 0 || "$RUNNING" == 'true' ]]; then
      NORMALIZED_OUTPUT='{"status":"failed","locatorMatches":0,"elapsedMs":0,"peakRssBytes":0,"errorCode":"invalid_output"}'
    elif [[ "$RUN_EXIT" -ne 0 || "$START_STATUS" -ne 0 ]]; then
      NORMALIZED_OUTPUT="{\"status\":\"failed\",\"locatorMatches\":0,\"elapsedMs\":$ELAPSED_MS,\"peakRssBytes\":0,\"errorCode\":\"parser_exit\"}"
    fi
  fi
  cleanup_active_container

  if [[ "${#NORMALIZED_OUTPUT}" -gt 65536 ]]; then
    NORMALIZED_OUTPUT='{"status":"failed","locatorMatches":0,"elapsedMs":0,"peakRssBytes":0,"errorCode":"limit_exceeded"}'
  fi

  (set -o noclobber; printf '%s\n' "$NORMALIZED_OUTPUT" > "$RESULTS_DIR/$CASE_ID.json")
done

node - "$PARSER_EVALUATION_MODULE" "$MANIFEST_PATH" "$RESULTS_DIR" "$REPORT_PATH" \
  "$CANDIDATE" '2.14.0' "$IMAGE_DIGEST" 'Apache-2.0' "${CASE_IDS[@]}" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const [modulePath, manifestPath, resultsDir, reportPath, name, version, imageDigest, license, ...caseIds] = process.argv.slice(2);
const { buildCandidateEvaluationReport, parseCandidateRunOutcome, serializeCandidateEvaluationReport } = require(modulePath);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const cases = caseIds.map((id) => {
  const item = manifest.cases.find((candidate) => candidate.id === id);
  if (!item || !Array.isArray(item.expectedLocators) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('invalid selected case');
  const outcome = parseCandidateRunOutcome(JSON.parse(readFileSync(join(resultsDir, `${id}.json`), 'utf8')));
  return { id, contentHash: item.sha256, locatorTotal: item.expectedLocators.length, ...outcome };
});
const input = { candidate: { name, version, imageDigest, license }, cases };
buildCandidateEvaluationReport(input);
writeFileSync(reportPath, serializeCandidateEvaluationReport(input), { flag: 'wx', mode: 0o444 });
NODE

node - "$STAGING_ROOT" "$CANDIDATE_ROOT" <<'NODE'
const { existsSync, renameSync } = require('node:fs');
const [source, target] = process.argv.slice(2);
if (existsSync(target)) throw new Error('candidate report target already exists');
renameSync(source, target);
NODE
REPORT_PATH="$CANDIDATE_ROOT/report.json"

node - "$REPORT_PATH" <<'NODE'
const { readFileSync } = require('node:fs');
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(`${JSON.stringify({ candidate: report.candidate, summary: report.summary })}\n`);
NODE
