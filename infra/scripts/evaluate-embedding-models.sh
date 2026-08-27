#!/usr/bin/env bash
# ECS-only embedding candidate evaluation. Contract mode is portable and read-only.
set -euo pipefail

usage() {
  echo "usage: $0 --print-run-contract|--execute bge-m3" >&2
  exit 64
}

MODE="${1:-}"
CANDIDATE="${2:-}"
[[ "$#" -eq 2 ]] || usage
[[ "$MODE" == '--print-run-contract' || "$MODE" == '--execute' ]] || usage
[[ "$CANDIDATE" == 'bge-m3' ]] || usage

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
GIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
[[ "$GIT_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid git sha' >&2; exit 65; }
MODEL_REVISION='5617a9f61b028005a4858fdac845db406aefb181'
WHEEL_SHA256='35e33a08e8ed5e299eabbe3bc23518eb66a424dd29ee08fb3802bf9aef9e9bf2'
EVALUATION_ROOT="/opt/openscience-evals/embedding/$GIT_SHA"

print_run_contract() {
  printf '%s\n' "{
  \"schemaVersion\": 1,
  \"candidate\": \"bge-m3\",
  \"gitSha\": \"$GIT_SHA\",
  \"modelRevision\": \"$MODEL_REVISION\",
  \"wheelSha256\": \"$WHEEL_SHA256\",
  \"evaluationRoot\": \"$EVALUATION_ROOT\",
  \"sandbox\": {
    \"network\": \"none\",
    \"readOnlyRoot\": true,
    \"user\": \"10001:10001\",
    \"cpus\": 2,
    \"memoryBytes\": 6442450944,
    \"pidsLimit\": 128,
    \"outputMaxBytes\": 65536,
    \"queryTimeoutSeconds\": 120
  }
}"
}

if [[ "$MODE" == '--print-run-contract' ]]; then
  print_run_contract
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

for command in docker node timeout; do
  command -v "$command" >/dev/null 2>&1 || { echo "missing ECS command: $command" >&2; exit 69; }
done

CORPUS_PATH="$REPOSITORY_ROOT/test/research-intelligence/search-evaluation.json"
DOCKERFILE="$REPOSITORY_ROOT/infra/embedding-candidates/bge-m3/Dockerfile"
IMAGE_TAG="openscience/embedding-eval-bge-m3:$GIT_SHA"
CANDIDATE_ROOT="$EVALUATION_ROOT/bge-m3"
[[ -f "$CORPUS_PATH" && -f "$DOCKERFILE" ]] || { echo 'candidate source is incomplete' >&2; exit 70; }

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

node - "$CORPUS_PATH" <<'NODE'
const { readFileSync } = require('node:fs');
const corpus = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (corpus.schemaVersion !== 1 || corpus.rights !== 'self-authored') throw new Error('invalid corpus identity');
if (!Array.isArray(corpus.chunks) || corpus.chunks.length < 16) throw new Error('insufficient chunks');
if (!Array.isArray(corpus.queries) || corpus.queries.length < 24) throw new Error('insufficient queries');
const ids = new Set(corpus.chunks.map(({ id }) => id));
if (ids.size !== corpus.chunks.length) throw new Error('duplicate chunks');
for (const query of corpus.queries) {
  if (!Array.isArray(query.relevantChunkIds) || query.relevantChunkIds.length < 1) throw new Error('empty judgment');
  if (!query.relevantChunkIds.every((id) => ids.has(id))) throw new Error('unknown judgment');
}
NODE

[[ -e /opt/openscience-evals ]] || install -d -m 0755 /opt/openscience-evals
validate_owned_directory /opt/openscience-evals /opt
[[ -e /opt/openscience-evals/embedding ]] || install -d -m 0755 /opt/openscience-evals/embedding
validate_owned_directory /opt/openscience-evals/embedding /opt/openscience-evals
[[ -e "$EVALUATION_ROOT" ]] || install -d -m 0755 "$EVALUATION_ROOT"
validate_owned_directory "$EVALUATION_ROOT" /opt/openscience-evals/embedding
[[ ! -e "$CANDIDATE_ROOT" ]] || { echo 'candidate evaluation output already exists; refusing overwrite' >&2; exit 73; }

if docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.openscience.source"}}' "$IMAGE_TAG")" == "$GIT_SHA" ]] \
    || { echo 'candidate image tag has an unexpected source label' >&2; exit 73; }
else
  docker build --pull \
    --label "org.openscience.source=$GIT_SHA" \
    --label 'org.openscience.candidate=bge-m3' \
    --label "org.openscience.model-revision=$MODEL_REVISION" \
    --file "$DOCKERFILE" --tag "$IMAGE_TAG" "$REPOSITORY_ROOT"
fi
IMAGE_DIGEST="$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")"
[[ "$IMAGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'invalid candidate image digest' >&2; exit 70; }

STAGING_ROOT="$(mktemp -d "$EVALUATION_ROOT/.bge-m3.staging.XXXXXX")"
chmod 0755 "$STAGING_ROOT"
validate_owned_directory "$STAGING_ROOT" "$EVALUATION_ROOT"
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

normalize_lock() {
  node -e '
    const chunks=[]; let bytes=0;
    process.stdin.on("data", chunk => { bytes += chunk.length; if (bytes > 65536) process.exit(75); chunks.push(chunk); });
    process.stdin.on("end", () => { try {
      const value=JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
      const keys=["candidate","computePlatform","dimension","gpuPackageCount","modelManifestSha256","modelRevision","packageFreezeSha256","schemaVersion"];
      if (!value || Array.isArray(value) || Object.keys(value).sort().join("\0") !== keys.sort().join("\0")) throw new Error();
      if (value.schemaVersion!==1 || value.candidate!=="bge-m3" || value.computePlatform!=="cpu" || value.dimension!==1024 || value.gpuPackageCount!==0) throw new Error();
      if (!/^[a-f0-9]{40}$/.test(value.modelRevision) || !/^[a-f0-9]{64}$/.test(value.modelManifestSha256) || !/^[a-f0-9]{64}$/.test(value.packageFreezeSha256)) throw new Error();
      process.stdout.write(JSON.stringify(value));
    } catch { process.exit(1); } });
  '
}

normalize_report() {
  node -e '
    const chunks=[]; let bytes=0;
    process.stdin.on("data", chunk => { bytes += chunk.length; if (bytes > 65536) process.exit(75); chunks.push(chunk); });
    process.stdin.on("end", () => { try {
      const value=JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
      const keys=["candidate","chunkCount","corpusSha256","dimension","modelRevision","ndcgAt10","p50Ms","p95Ms","peakRssBytes","queryCount","recallAt10","schemaVersion"];
      if (!value || Array.isArray(value) || Object.keys(value).sort().join("\0") !== keys.sort().join("\0")) throw new Error();
      if (value.schemaVersion!==1 || value.candidate!=="bge-m3" || value.dimension!==1024 || value.chunkCount<16 || value.queryCount<24) throw new Error();
      if (!/^[a-f0-9]{64}$/.test(value.corpusSha256) || !/^[a-f0-9]{40}$/.test(value.modelRevision)) throw new Error();
      for (const key of ["p50Ms","p95Ms","peakRssBytes"]) if (!Number.isSafeInteger(value[key]) || value[key]<0) throw new Error();
      for (const key of ["ndcgAt10","recallAt10"]) if (typeof value[key]!=="number" || value[key]<0 || value[key]>1) throw new Error();
      process.stdout.write(JSON.stringify(value));
    } catch { process.exit(1); } });
  '
}

run_candidate() {
  local mode="$1"
  shift
  local container_name="openscience-embedding-eval-bge-m3-${GIT_SHA:0:12}-${mode}-${STAGING_ROOT##*.}"
  ACTIVE_CONTAINER_ID="$(docker create \
    --name "$container_name" \
    --label "org.openscience.source=$GIT_SHA" \
    --label 'org.openscience.candidate=bge-m3' \
    --label "org.openscience.mode=$mode" \
    --log-driver none \
    --restart no \
    --stop-timeout 1 \
    --network none \
    --read-only \
    --user 10001:10001 \
    --cpus 2 \
    --memory 6g \
    --memory-swap 6g \
    --pids-limit 128 \
    --security-opt no-new-privileges \
    --cap-drop ALL \
    --ulimit nofile=256:256 \
    --ulimit nproc=128:128 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=268435456,uid=10001,gid=10001,mode=0700 \
    "$@" "$IMAGE_TAG" "${RUN_ARGUMENTS[@]}")"
  [[ "$ACTIVE_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]] || { echo 'invalid candidate container id' >&2; exit 70; }
}

RUN_ARGUMENTS=(--print-lock)
run_candidate lock
set +e
LOCK_CAPTURE="$({
  timeout --signal=TERM --kill-after=5s 120s docker start --attach "$ACTIVE_CONTAINER_ID" 2>/dev/null \
    | normalize_lock
  LOCK_PIPE_STATUSES=("${PIPESTATUS[@]}")
  printf '\n%s %s' "${LOCK_PIPE_STATUSES[0]}" "${LOCK_PIPE_STATUSES[1]}"
})"
set -e
LOCK_STATUS_LINE="${LOCK_CAPTURE##*$'\n'}"
NORMALIZED_LOCK="${LOCK_CAPTURE%$'\n'*}"
read -r LOCK_START_STATUS LOCK_NORMALIZE_STATUS <<< "$LOCK_STATUS_LINE"
[[ "$LOCK_START_STATUS" =~ ^[0-9]+$ && "$LOCK_NORMALIZE_STATUS" =~ ^[0-9]+$ \
  && "$LOCK_START_STATUS" -eq 0 && "$LOCK_NORMALIZE_STATUS" -eq 0 ]] \
  || { cleanup_active_container; echo 'candidate lock preflight failed' >&2; exit 70; }
[[ "$(docker inspect --format '{{.State.Running}}' "$ACTIVE_CONTAINER_ID")" == 'false' \
  && "$(docker inspect --format '{{.State.ExitCode}}' "$ACTIVE_CONTAINER_ID")" -eq 0 ]] \
  || { cleanup_active_container; echo 'candidate lock did not exit cleanly' >&2; exit 70; }
cleanup_active_container
(set -o noclobber; printf '%s\n' "$NORMALIZED_LOCK" > "$STAGING_ROOT/candidate-lock.json")

RUN_ARGUMENTS=(--evaluate /corpus/search-evaluation.json)
run_candidate evaluation --mount "type=bind,src=$CORPUS_PATH,dst=/corpus/search-evaluation.json,readonly"
set +e
REPORT_CAPTURE="$({
  timeout --signal=TERM --kill-after=5s 7200s docker start --attach "$ACTIVE_CONTAINER_ID" 2>/dev/null \
    | normalize_report
  REPORT_PIPE_STATUSES=("${PIPESTATUS[@]}")
  printf '\n%s %s' "${REPORT_PIPE_STATUSES[0]}" "${REPORT_PIPE_STATUSES[1]}"
})"
set -e
REPORT_STATUS_LINE="${REPORT_CAPTURE##*$'\n'}"
NORMALIZED_REPORT="${REPORT_CAPTURE%$'\n'*}"
read -r REPORT_START_STATUS REPORT_NORMALIZE_STATUS <<< "$REPORT_STATUS_LINE"
[[ "$REPORT_START_STATUS" =~ ^[0-9]+$ && "$REPORT_NORMALIZE_STATUS" =~ ^[0-9]+$ \
  && "$REPORT_START_STATUS" -eq 0 && "$REPORT_NORMALIZE_STATUS" -eq 0 ]] \
  || { cleanup_active_container; echo 'candidate evaluation failed' >&2; exit 70; }
[[ "$(docker inspect --format '{{.State.Running}}' "$ACTIVE_CONTAINER_ID")" == 'false' \
  && "$(docker inspect --format '{{.State.ExitCode}}' "$ACTIVE_CONTAINER_ID")" -eq 0 ]] \
  || { cleanup_active_container; echo 'candidate evaluation did not exit cleanly' >&2; exit 70; }
cleanup_active_container

node - "$STAGING_ROOT/report.json" "$NORMALIZED_REPORT" "$IMAGE_DIGEST" "$GIT_SHA" <<'NODE'
const { writeFileSync } = require('node:fs');
const [path, raw, imageDigest, gitSha] = process.argv.slice(2);
const report = JSON.parse(raw);
writeFileSync(path, `${JSON.stringify({ ...report, imageDigest, gitSha }, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
NODE

node - "$STAGING_ROOT" "$CANDIDATE_ROOT" <<'NODE'
const { existsSync, renameSync } = require('node:fs');
const [source, target] = process.argv.slice(2);
if (existsSync(target)) throw new Error('candidate report target already exists');
renameSync(source, target);
NODE

node - "$CANDIDATE_ROOT/report.json" <<'NODE'
const { readFileSync } = require('node:fs');
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(`${JSON.stringify({
  candidate: report.candidate,
  modelRevision: report.modelRevision,
  imageDigest: report.imageDigest,
  ndcgAt10: report.ndcgAt10,
  recallAt10: report.recallAt10,
  p50Ms: report.p50Ms,
  p95Ms: report.p95Ms,
  peakRssBytes: report.peakRssBytes,
})}\n`);
NODE
