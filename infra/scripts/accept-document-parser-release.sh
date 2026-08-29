#!/usr/bin/env bash
set -euo pipefail
umask 077

MANIFEST_SHA256='db62ae00bb3fb7ecb0b2daba5815d75b1960d4ff1e5ef9549dd1e7617925ac03'

print_contract() {
  local source_sha="$1"
  printf '%s\n' "{
  \"schemaVersion\": 3,
  \"acceptanceProfile\": \"hermes-parser-14-2-v1\",
  \"sourceSha\": \"$source_sha\",
  \"corpusCases\": 16,
  \"manifestSha256\": \"$MANIFEST_SHA256\",
  \"actualPath\": \"artifact-backed-sdf.extract\",
  \"paths\": {
    \"releaseRoot\": \"/opt/openscience-releases/$source_sha\",
    \"acceptanceRoot\": \"/opt/openscience-acceptance/document-parser/$source_sha\",
    \"corpusRoot\": \"/opt/openscience-acceptance/document-parser/$source_sha/corpus\",
    \"finalReport\": \"/opt/openscience-acceptance/document-parser/$source_sha/report.json\"
  },
  \"worker\": {
    \"user\": \"1000:1000\", \"effectiveEnvCount\": 0,
    \"releaseMount\": { \"source\": \"/opt/openscience-releases/$source_sha\", \"destination\": \"/opt/openscience\", \"readOnly\": true },
    \"corpusMount\": { \"source\": \"/opt/openscience-acceptance/document-parser/$source_sha/corpus\", \"destination\": \"/acceptance-corpus\", \"readOnly\": true },
    \"exactRunOutputOnly\": true
  },
  \"parser\": { \"user\": \"1000:1000\", \"effectiveEnvCount\": 0, \"hostBindMounts\": 0, \"releaseMounts\": 0 },
  \"network\": \"none\",
  \"calls\": { \"structuredFake\": 14, \"externalProvider\": 0, \"forbiddenGateway\": 0 },
  \"freshBuildIdentity\": {
    \"required\": true, \"runnerSha256\": true, \"contractSha256\": true,
    \"runtimeGraphManifest\": true,
    \"runtimeGraphScope\": \"agent-worker-and-workspace-dist-js\",
    \"runtimeInputsDigest\": \"worker-node-modules-workspace-dist-search-generated-bytes-modes-owners\",
    \"verifyAt\": [\"immediately-after-build\", \"before-container-start\", \"after-worker-completion\", \"before-publication\"]
  },
  \"deadlineSeconds\": 900,
  \"resourceOwnership\": { \"preflightAbsent\": true, \"randomTokenLabel\": true, \"removeOnlyOwned\": true },
  \"independentCgroupSampling\": [\"worker\", \"parser\"],
  \"resourceSampling\": {
    \"source\": \"host-cgroup-v2\", \"memoryPeak\": \"memory.peak\", \"cpuUsage\": \"cpu.stat usage_usec\",
    \"clock\": \"host-monotonic\", \"intervalCpuQuotaRate\": true, \"cumulativeCpu\": true,
    \"terminalSamples\": true, \"dockerExec\": false
  },
  \"topologyMaxima\": true,
  \"publicationStateMachine\": [\"root-owned-unpublished\", \"strict-cleanup\", \"atomic-no-clobber-publish\"],
  \"cleanupScope\": \"exact-run-root-and-adjacent-temp-report\",
  \"parserLimits\": { \"readOnly\": true, \"capDrop\": \"ALL\", \"noNewPrivileges\": true, \"memoryBytes\": 536870912, \"cpus\": 2, \"pids\": 64, \"jobVolumeBytes\": 67108864, \"tmpfsBytes\": 67108864 },
  \"workerLimits\": { \"readOnly\": true, \"capDrop\": \"ALL\", \"noNewPrivileges\": true, \"memoryBytes\": 1073741824, \"cpus\": 2, \"pids\": 64, \"tmpfsBytes\": 67108864 }
}"
}

if [[ "${1:-}" == '--print-contract' ]]; then
  [[ "$#" -eq 2 ]] || { echo 'usage: accept-document-parser-release.sh --print-contract <exact-source-sha>' >&2; exit 64; }
  [[ "$2" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid exact source SHA' >&2; exit 64; }
  print_contract "$2"
  exit 0
fi

[[ "$#" -eq 1 ]] || { echo 'usage: accept-document-parser-release.sh <exact-source-sha>' >&2; exit 64; }
SOURCE_SHA="$1"
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid exact source SHA' >&2; exit 64; }

RELEASE_BASE='/opt/openscience-releases'
ACCEPTANCE_BASE='/opt/openscience-acceptance/document-parser'
RELEASE_ROOT="$RELEASE_BASE/$SOURCE_SHA"
ACCEPTANCE_ROOT="$ACCEPTANCE_BASE/$SOURCE_SHA"
CORPUS_ROOT="$ACCEPTANCE_ROOT/corpus"
FINAL_REPORT="$ACCEPTANCE_ROOT/report.json"
CONTRACT_JS="$RELEASE_ROOT/apps/agent-worker/dist/parser-acceptance-contract.js"
RUNNER_JS="$RELEASE_ROOT/apps/agent-worker/dist/parser-acceptance-runner.js"
SOURCE_MANIFEST_TOOL="$RELEASE_ROOT/scripts/release-input-manifest.mjs"
EXPECTED_TRUST_UID=0

trusted_directory_snapshot() {
  local path="$1" canonical metadata uid mode
  [[ -d "$path" && ! -L "$path" ]] \
    || { echo "trusted directory is missing, a symlink or not a directory: $path" >&2; return 1; }
  canonical="$(/usr/bin/readlink -f -- "$path")" \
    || { echo "trusted directory cannot be canonicalized: $path" >&2; return 1; }
  [[ "$canonical" == "$path" ]] \
    || { echo "trusted directory is noncanonical or has a symlink component: $path" >&2; return 1; }
  metadata="$(/usr/bin/stat -Lc '%u %g %a %d %i' -- "$path")" \
    || { echo "trusted directory metadata is unavailable: $path" >&2; return 1; }
  read -r uid _ mode _ _ <<<"$metadata"
  [[ "$uid" == "$EXPECTED_TRUST_UID" && "$mode" =~ ^[0-7]{3,4}$ ]] \
    || { echo "trusted directory owner or mode is invalid: $path" >&2; return 1; }
  (( (8#$mode & 8#22) == 0 )) \
    || { echo "trusted directory is group/world writable: $path" >&2; return 1; }
  printf '%s|%s\n' "$canonical" "$metadata"
}

capture_trust_snapshot() {
  trusted_directory_snapshot "$RELEASE_BASE" || return
  trusted_directory_snapshot "$RELEASE_ROOT" || return
  trusted_directory_snapshot "$ACCEPTANCE_BASE" || return
  trusted_directory_snapshot "$ACCEPTANCE_ROOT" || return
  trusted_directory_snapshot "$CORPUS_ROOT" || return
}

TRUST_SNAPSHOT="$(capture_trust_snapshot)" \
  || { echo 'acceptance trusted-root preflight failed' >&2; exit 65; }
verify_release_inputs() {
  local stage="$1"
  /usr/bin/node "$SOURCE_MANIFEST_TOOL" verify --root "$RELEASE_ROOT" --sha "$SOURCE_SHA" \
    || { echo "release source marker or input manifest changed at $stage" >&2; return 1; }
}
verify_release_inputs 'before-build' || exit 65
if /usr/bin/find "$RELEASE_ROOT" -xdev -type f \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' -print -quit | grep -q .; then
  echo 'exact release root contains an environment secret file' >&2
  exit 65
fi
/usr/bin/npx pnpm@9.15.0 --dir "$RELEASE_ROOT" install --ignore-scripts --frozen-lockfile >/dev/null
verify_release_inputs 'after-runtime-install' || exit 65
(
  umask 022
  /usr/bin/npx pnpm@9.15.0 --dir "$RELEASE_ROOT" --filter @openscience/agent-worker... build >/dev/null
)
[[ "$(capture_trust_snapshot)" == "$TRUST_SNAPSHOT" ]] \
  || { echo 'trusted acceptance path identity was replaced during build' >&2; exit 65; }
verify_release_inputs 'after-build' || exit 65
[[ -f "$CONTRACT_JS" && -f "$RUNNER_JS" ]] \
  || { echo 'fresh acceptance build outputs missing from exact release' >&2; exit 66; }
/usr/bin/node "$SOURCE_MANIFEST_TOOL" runtime-normalize --root "$RELEASE_ROOT" --sha "$SOURCE_SHA" >/dev/null \
  || { echo 'generated runtime permissions could not be normalized' >&2; exit 66; }
verify_release_inputs 'after-runtime-permission-normalization' || exit 65
hash_build_outputs() {
  /usr/bin/node - "$RUNNER_JS" "$CONTRACT_JS" <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const [runner, contract] = process.argv.slice(2);
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
process.stdout.write(`${digest(runner)} ${digest(contract)}`);
NODE
}
BUILD_HASHES="$(hash_build_outputs)"
read -r RUNNER_BUILD_SHA256 CONTRACT_BUILD_SHA256 <<<"$BUILD_HASHES"
[[ "$RUNNER_BUILD_SHA256" =~ ^[a-f0-9]{64}$ && "$CONTRACT_BUILD_SHA256" =~ ^[a-f0-9]{64}$ ]] \
  || { echo 'fresh acceptance build identity missing' >&2; exit 66; }
RUN_ID="${SOURCE_SHA:0:12}-$$"
RUNTIME_GRAPH_JSON="$(/usr/bin/node "$CONTRACT_JS" runtime-manifest "$SOURCE_SHA" "$RUN_ID")" \
  || { echo 'complete acceptance runtime graph could not be fixed' >&2; exit 66; }
RUNTIME_INPUTS_JSON="$(/usr/bin/node "$SOURCE_MANIFEST_TOOL" runtime-snapshot --root "$RELEASE_ROOT" --sha "$SOURCE_SHA")" \
  || { echo 'complete generated runtime inputs could not be fixed' >&2; exit 66; }

WORKER_IMAGE="openscience-agent-worker:$SOURCE_SHA"
PARSER_IMAGE="openscience-document-parser:$SOURCE_SHA"
for image in "$WORKER_IMAGE" "$PARSER_IMAGE"; do
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.openscience.source"}}' "$image")" == "$SOURCE_SHA" ]] \
    || { echo 'image source label mismatch' >&2; exit 65; }
done
WORKER_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$WORKER_IMAGE")"
PARSER_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$PARSER_IMAGE")"
[[ "$WORKER_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ && "$PARSER_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] \
  || { echo 'invalid exact image ID' >&2; exit 65; }

RUN_ROOT="$ACCEPTANCE_ROOT/.run-$RUN_ID"
WORKER_OUTPUT_ROOT="$RUN_ROOT/worker-output"
DRAFT_REPORT="$WORKER_OUTPUT_ROOT/report.draft.json"
WORKER_COMPLETED_MARKER="$WORKER_OUTPUT_ROOT/.worker-completed-$RUN_ID"
WORKER_RELEASE_MARKER="$WORKER_OUTPUT_ROOT/.worker-release-$RUN_ID"
UNPUBLISHED_REPORT="$ACCEPTANCE_ROOT/.report-unpublished-$RUN_ID.json"
FINAL_REPORT="$ACCEPTANCE_ROOT/report.json"
PARSER_NAME="openscience-parser-accept-$RUN_ID"
WORKER_NAME="openscience-worker-accept-$RUN_ID"
JOB_VOLUME="openscience-parser-accept-jobs-$RUN_ID"
OWNERSHIP_TOKEN="$(/usr/bin/node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))')"
PREPARED=false
PARSER_OWNED=false
WORKER_OWNED=false
VOLUME_OWNED=false
PARSER_CONTAINER_ID=''
WORKER_CONTAINER_ID=''

verify_runtime_graph() {
  local stage="$1"
  verify_build_hashes "$stage" || return
  /usr/bin/node "$CONTRACT_JS" verify-runtime-manifest "$SOURCE_SHA" "$RUN_ID" \
    || { echo "complete acceptance runtime graph changed at $stage" >&2; return 1; }
}

verify_runtime_inputs() {
  local stage="$1"
  /usr/bin/node "$SOURCE_MANIFEST_TOOL" runtime-verify \
    --root "$RELEASE_ROOT" --sha "$SOURCE_SHA" --snapshot-json "$RUNTIME_INPUTS_JSON" \
    || { echo "complete generated runtime inputs changed at $stage" >&2; return 1; }
}

verify_build_hashes() {
  local stage="$1"
  [[ "$(hash_build_outputs)" == "$BUILD_HASHES" ]] \
    || { echo "acceptance build outputs changed at $stage" >&2; return 1; }
}

container_owned() {
  [[ "$(docker inspect --format '{{index .Config.Labels "org.openscience.acceptance.sha"}}' "$1" 2>/dev/null)" == "$SOURCE_SHA" \
    && "$(docker inspect --format '{{index .Config.Labels "org.openscience.acceptance.run"}}' "$1" 2>/dev/null)" == "$RUN_ID" \
    && "$(docker inspect --format '{{index .Config.Labels "org.openscience.acceptance.token"}}' "$1" 2>/dev/null)" == "$OWNERSHIP_TOKEN" ]]
}

volume_owned() {
  [[ "$(docker volume inspect --format '{{index .Labels "org.openscience.acceptance.sha"}}' "$1" 2>/dev/null)" == "$SOURCE_SHA" \
    && "$(docker volume inspect --format '{{index .Labels "org.openscience.acceptance.run"}}' "$1" 2>/dev/null)" == "$RUN_ID" \
    && "$(docker volume inspect --format '{{index .Labels "org.openscience.acceptance.token"}}' "$1" 2>/dev/null)" == "$OWNERSHIP_TOKEN" ]]
}

cleanup() {
  if [[ "$WORKER_OWNED" == true ]] && container_owned "$WORKER_CONTAINER_ID"; then
    docker rm -f "$WORKER_CONTAINER_ID" >/dev/null 2>&1 || true
  fi
  if [[ "$PARSER_OWNED" == true ]] && container_owned "$PARSER_CONTAINER_ID"; then
    docker rm -f "$PARSER_CONTAINER_ID" >/dev/null 2>&1 || true
  fi
  if [[ "$VOLUME_OWNED" == true ]] && volume_owned "$JOB_VOLUME"; then
    docker volume rm "$JOB_VOLUME" >/dev/null 2>&1 || true
  fi
  if [[ "$PREPARED" == true ]]; then
    /usr/bin/node "$CONTRACT_JS" cleanup "$SOURCE_SHA" "$RUN_ID" >/dev/null 2>&1 || true
  fi
}
cleanup_strict() {
  [[ "$WORKER_OWNED" == true && "$PARSER_OWNED" == true && "$VOLUME_OWNED" == true ]]
  container_owned "$WORKER_CONTAINER_ID" && docker rm -f "$WORKER_CONTAINER_ID" >/dev/null
  container_owned "$PARSER_CONTAINER_ID" && docker rm -f "$PARSER_CONTAINER_ID" >/dev/null
  volume_owned "$JOB_VOLUME" && docker volume rm "$JOB_VOLUME" >/dev/null
  ! docker inspect "$WORKER_NAME" "$PARSER_NAME" >/dev/null 2>&1
  ! docker volume inspect "$JOB_VOLUME" >/dev/null 2>&1
  /usr/bin/node "$CONTRACT_JS" cleanup-run "$SOURCE_SHA" "$RUN_ID"
  [[ ! -e "$RUN_ROOT" && ! -e "$ACCEPTANCE_ROOT/report.json.tmp-$RUN_ID" \
    && -f "$UNPUBLISHED_REPORT" && ! -e "$FINAL_REPORT" ]]
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if docker inspect "$WORKER_NAME" >/dev/null 2>&1 \
  || docker inspect "$PARSER_NAME" >/dev/null 2>&1 \
  || docker volume inspect "$JOB_VOLUME" >/dev/null 2>&1; then
  echo 'acceptance resource name collision' >&2
  exit 73
fi

/usr/bin/node "$CONTRACT_JS" prepare "$SOURCE_SHA" "$RUN_ID" >/dev/null
PREPARED=true
set -o noclobber
printf '%s\n' "$RUNTIME_GRAPH_JSON" >"$RUN_ROOT/runtime-graph.json"
printf '%s\n' "$RUNTIME_INPUTS_JSON" >"$RUN_ROOT/runtime-inputs.json"
set +o noclobber
verify_runtime_graph 'immediately-after-build' \
  || { echo 'fresh acceptance runtime graph identity missing' >&2; exit 66; }
verify_runtime_inputs 'immediately-after-build' \
  || { echo 'fresh generated runtime input identity missing' >&2; exit 66; }

docker volume create \
  --label "org.openscience.acceptance.sha=$SOURCE_SHA" \
  --label "org.openscience.acceptance.run=$RUN_ID" \
  --label "org.openscience.acceptance.token=$OWNERSHIP_TOKEN" \
  --driver local --opt type=tmpfs --opt device=tmpfs \
  --opt o=size=64m,uid=1000,gid=1000,mode=0770 "$JOB_VOLUME" >/dev/null
VOLUME_OWNED=true
volume_owned "$JOB_VOLUME" || { echo 'acceptance job volume ownership mismatch' >&2; exit 65; }

COMMON_LIMITS=(
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges
  --cpus 2 --pids-limit 64 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m
  --user 1000:1000 --entrypoint /usr/bin/env
)

verify_release_inputs 'before-container-start' \
  || { echo 'release source changed before container start' >&2; exit 70; }
verify_runtime_graph 'before-container-start' \
  || { echo 'acceptance runtime graph changed before container start' >&2; exit 70; }
verify_runtime_inputs 'before-container-start' \
  || { echo 'generated runtime inputs changed before container start' >&2; exit 70; }
PARSER_CONTAINER_ID="$(docker run -d --name "$PARSER_NAME" \
  --label "org.openscience.acceptance.sha=$SOURCE_SHA" \
  --label "org.openscience.acceptance.run=$RUN_ID" \
  --label "org.openscience.acceptance.token=$OWNERSHIP_TOKEN" \
  "${COMMON_LIMITS[@]}" --memory 512m --memory-swap 512m \
  --mount "type=volume,src=$JOB_VOLUME,dst=/parser-jobs" \
  "$PARSER_IMAGE" -i /usr/local/bin/node dist/parser-service.js)"
[[ "$PARSER_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]] \
  || { echo 'invalid acceptance parser container ID' >&2; exit 65; }
PARSER_OWNED=true
container_owned "$PARSER_CONTAINER_ID" || { echo 'acceptance parser ownership mismatch' >&2; exit 65; }

WORKER_CONTAINER_ID="$(docker run -d --name "$WORKER_NAME" \
  --label "org.openscience.acceptance.sha=$SOURCE_SHA" \
  --label "org.openscience.acceptance.run=$RUN_ID" \
  --label "org.openscience.acceptance.token=$OWNERSHIP_TOKEN" \
  "${COMMON_LIMITS[@]}" --memory 1g --memory-swap 1g \
  --workdir /opt/openscience/apps/agent-worker \
  --mount "type=volume,src=$JOB_VOLUME,dst=/parser-jobs" \
  --mount "type=bind,src=$RELEASE_ROOT,dst=/opt/openscience,readonly" \
  --mount "type=bind,src=$CORPUS_ROOT,dst=/acceptance-corpus,readonly" \
  --mount "type=bind,src=$WORKER_OUTPUT_ROOT,dst=/acceptance-output" \
  "$WORKER_IMAGE" -i /bin/sh -c '
    completion="$1"
    release="$2"
    shift 2
    status=0
    /usr/bin/env -i /usr/local/bin/node "$@" || status=$?
    printf "%s\n" "$status" >"$completion"
    while [ ! -f "$release" ]; do /bin/sleep 0.1; done
    exit "$status"
  ' task8-controlled-exit \
    "/acceptance-output/.worker-completed-$RUN_ID" "/acceptance-output/.worker-release-$RUN_ID" \
    dist/parser-acceptance-runner.js /acceptance-corpus /acceptance-output/report.draft.json \
    "$SOURCE_SHA" "$WORKER_IMAGE_ID" "$PARSER_IMAGE_ID")"
[[ "$WORKER_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]] \
  || { echo 'invalid acceptance worker container ID' >&2; exit 65; }
WORKER_OWNED=true
container_owned "$WORKER_CONTAINER_ID" || { echo 'acceptance worker ownership mismatch' >&2; exit 65; }

container_host_identity() {
  local identity pid id
  identity="$(docker inspect --format '{{.State.Pid}} {{.Id}}' "$1")" || return
  read -r pid id <<<"$identity"
  [[ "$id" == "$2" && "$pid" =~ ^[1-9][0-9]*$ && "$pid" -gt 1 ]] || return
  printf '%s\n' "$pid"
}

resolve_host_cgroup() {
  local pid="$1" container_id="$2" entry='' extra='' relative canonical base identity
  [[ -f /sys/fs/cgroup/cgroup.controllers ]] || return
  IFS= read -r entry <"/proc/$pid/cgroup" || return
  IFS= read -r extra < <(/usr/bin/tail -n +2 "/proc/$pid/cgroup") || true
  [[ -z "$extra" && "$entry" == 0::* ]] || return
  relative="${entry#0::}"
  [[ "$relative" == /* && "$relative" != *'..'* ]] || return
  base="$(/usr/bin/readlink -f -- /sys/fs/cgroup)" || return
  canonical="$(/usr/bin/readlink -f -- "/sys/fs/cgroup$relative")" || return
  [[ "$canonical" == "$base/"* && "$canonical" == *"$container_id"* && ! -L "$canonical" ]] || return
  identity="$(/usr/bin/stat -Lc '%u:%d:%i' -- "$canonical")" || return
  [[ "$identity" =~ ^[0-9]+:[0-9]+:[0-9]+$ ]] || return
  printf '%s|%s\n' "$canonical" "$identity"
}

host_process_env_count() {
  /usr/bin/node - "$1" <<'NODE'
const { readFileSync } = require('node:fs');
const value = readFileSync(`/proc/${process.argv[2]}/environ`);
process.stdout.write(String(value.length === 0 ? 0 : value.toString('binary').split('\0').filter(Boolean).length));
NODE
}

sample_host_cgroup() {
  local cgroup="$1" identity="$2" started_ms="$3" terminal="$4" output="$5"
  local canonical current_identity usage='' memory='' now elapsed key value
  canonical="$(/usr/bin/readlink -f -- "$cgroup")" || return
  current_identity="$(/usr/bin/stat -Lc '%u:%d:%i' -- "$cgroup")" || return
  [[ "$canonical" == "$cgroup" && "$current_identity" == "$identity" ]] || return
  while read -r key value; do
    [[ "$key" == usage_usec ]] && usage="$value"
  done <"$cgroup/cpu.stat"
  IFS= read -r memory <"$cgroup/memory.peak" || return
  now="$(monotonic_millis)" || return
  [[ "$usage" =~ ^[0-9]+$ && "$memory" =~ ^[0-9]+$ && "$now" =~ ^[0-9]+$ ]] || return
  elapsed=$((now - started_ms))
  (( elapsed >= 0 )) || return
  printf '%s\t%s\t%s\t%s\n' "$elapsed" "$usage" "$memory" "$terminal" >>"$output"
}

monotonic_millis() {
  local uptime seconds fraction millis
  read -r uptime _ < /proc/uptime || return
  [[ "$uptime" =~ ^([0-9]+)\.([0-9]+)$ ]] || return
  seconds="${BASH_REMATCH[1]}"
  fraction="${BASH_REMATCH[2]}000"
  millis="${fraction:0:3}"
  printf '%s\n' "$((10#$seconds * 1000 + 10#$millis))"
}

PARSER_PID="$(container_host_identity "$PARSER_NAME" "$PARSER_CONTAINER_ID")" \
  || { echo 'acceptance parser host PID identity failed' >&2; exit 70; }
WORKER_PID="$(container_host_identity "$WORKER_NAME" "$WORKER_CONTAINER_ID")" \
  || { echo 'acceptance worker host PID identity failed' >&2; exit 70; }
IFS='|' read -r PARSER_CGROUP PARSER_CGROUP_IDENTITY <<<"$(resolve_host_cgroup "$PARSER_PID" "$PARSER_CONTAINER_ID")" \
  || { echo 'acceptance parser cgroup v2 identity failed' >&2; exit 70; }
IFS='|' read -r WORKER_CGROUP WORKER_CGROUP_IDENTITY <<<"$(resolve_host_cgroup "$WORKER_PID" "$WORKER_CONTAINER_ID")" \
  || { echo 'acceptance worker cgroup v2 identity failed' >&2; exit 70; }
[[ -n "$PARSER_CGROUP" && -n "$PARSER_CGROUP_IDENTITY" ]] \
  || { echo 'acceptance parser cgroup v2 identity failed' >&2; exit 70; }
[[ -n "$WORKER_CGROUP" && -n "$WORKER_CGROUP_IDENTITY" ]] \
  || { echo 'acceptance worker cgroup v2 identity failed' >&2; exit 70; }
PARSER_ENV_COUNT="$(host_process_env_count "$PARSER_PID")" \
  || { echo 'acceptance parser host environment sampling failed' >&2; exit 70; }
WORKER_ENV_COUNT="$(host_process_env_count "$WORKER_PID")" \
  || { echo 'acceptance worker host environment sampling failed' >&2; exit 70; }
PARSER_SAMPLES="$RUN_ROOT/parser.samples.tsv"
WORKER_SAMPLES="$RUN_ROOT/worker.samples.tsv"
set -o noclobber
: >"$PARSER_SAMPLES"
: >"$WORKER_SAMPLES"
set +o noclobber
SAMPLING_STARTED_MS="$(monotonic_millis)"
sample_host_cgroup "$PARSER_CGROUP" "$PARSER_CGROUP_IDENTITY" "$SAMPLING_STARTED_MS" false "$PARSER_SAMPLES" \
  || { echo 'acceptance parser initial host cgroup sampling failed' >&2; exit 70; }
sample_host_cgroup "$WORKER_CGROUP" "$WORKER_CGROUP_IDENTITY" "$SAMPLING_STARTED_MS" false "$WORKER_SAMPLES" \
  || { echo 'acceptance worker initial host cgroup sampling failed' >&2; exit 70; }
ACCEPTANCE_DEADLINE=$((SECONDS + 900))
while true; do
  [[ "$(docker inspect --format '{{.State.Running}}' "$PARSER_NAME")" == true ]] \
    || { echo 'acceptance parser stopped during the run' >&2; exit 70; }
  [[ "$(docker inspect --format '{{.State.Running}}' "$WORKER_NAME")" == true ]] \
    || { echo 'acceptance worker stopped before its completion marker' >&2; exit 70; }
  [[ ! -f "$WORKER_COMPLETED_MARKER" ]] || break
  (( SECONDS < ACCEPTANCE_DEADLINE )) \
    || { echo 'acceptance worker exceeded the 900-second deadline' >&2; exit 70; }
  sleep 0.2
  sample_host_cgroup "$PARSER_CGROUP" "$PARSER_CGROUP_IDENTITY" "$SAMPLING_STARTED_MS" false "$PARSER_SAMPLES" \
    || { echo 'acceptance parser host cgroup sampling failed' >&2; exit 70; }
  sample_host_cgroup "$WORKER_CGROUP" "$WORKER_CGROUP_IDENTITY" "$SAMPLING_STARTED_MS" false "$WORKER_SAMPLES" \
    || { echo 'acceptance worker host cgroup sampling failed' >&2; exit 70; }
done
sleep 0.01
sample_host_cgroup "$WORKER_CGROUP" "$WORKER_CGROUP_IDENTITY" "$SAMPLING_STARTED_MS" true "$WORKER_SAMPLES" \
  || { echo 'acceptance worker terminal host cgroup sampling failed' >&2; exit 70; }
sample_host_cgroup "$PARSER_CGROUP" "$PARSER_CGROUP_IDENTITY" "$SAMPLING_STARTED_MS" true "$PARSER_SAMPLES" \
  || { echo 'acceptance parser terminal host cgroup sampling failed' >&2; exit 70; }

IFS= read -r WORKER_RUNNER_STATUS <"$WORKER_COMPLETED_MARKER" \
  || { echo 'acceptance worker completion marker is unreadable' >&2; exit 70; }
[[ "$WORKER_RUNNER_STATUS" =~ ^[0-9]+$ ]] \
  || { echo 'acceptance worker completion status is invalid' >&2; exit 70; }
verify_runtime_graph 'after-worker-completion' \
  || { echo 'acceptance runtime graph changed after worker completion' >&2; exit 70; }
verify_runtime_inputs 'after-worker-completion' \
  || { echo 'generated runtime inputs changed after worker completion' >&2; exit 70; }
set -o noclobber
: >"$WORKER_RELEASE_MARKER"
set +o noclobber
WORKER_WAIT_STATUS="$(docker wait "$WORKER_NAME")" \
  || { echo 'acceptance worker controlled exit failed' >&2; exit 70; }

[[ "$WORKER_RUNNER_STATUS" == 0 && "$WORKER_WAIT_STATUS" == 0 \
  && "$(docker inspect --format '{{.State.ExitCode}}' "$WORKER_NAME")" == 0 ]] \
  || { echo 'acceptance worker failed' >&2; exit 70; }
[[ -f "$DRAFT_REPORT" ]] || { echo 'acceptance draft report missing' >&2; exit 70; }
[[ "$WORKER_ENV_COUNT" == 0 && "$PARSER_ENV_COUNT" == 0 ]] \
  || { echo 'acceptance container effective environment was not empty' >&2; exit 70; }
set -o noclobber
docker inspect "$WORKER_NAME" >"$RUN_ROOT/worker.inspect.json"
docker inspect "$PARSER_NAME" >"$RUN_ROOT/parser.inspect.json"
docker volume inspect "$JOB_VOLUME" >"$RUN_ROOT/volume.inspect.json"
set +o noclobber

/usr/bin/node - "$RUN_ROOT" "$WORKER_ENV_COUNT" "$PARSER_ENV_COUNT" "$SOURCE_SHA" \
  "$RUNNER_BUILD_SHA256" "$CONTRACT_BUILD_SHA256" \
  "$WORKER_PID" "$WORKER_CGROUP" "$WORKER_CGROUP_IDENTITY" \
  "$PARSER_PID" "$PARSER_CGROUP" "$PARSER_CGROUP_IDENTITY" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const [root, workerEnv, parserEnv, sourceSha, runnerSha256, contractSha256,
  workerPid, workerCgroup, workerCgroupIdentity,
  parserPid, parserCgroup, parserCgroupIdentity] = process.argv.slice(2);
const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'))[0];
const workerInspect = read('worker.inspect.json');
const parserInspect = read('parser.inspect.json');
const volumeInspect = read('volume.inspect.json');
const runtimeGraph = JSON.parse(readFileSync(join(root, 'runtime-graph.json'), 'utf8'));
const runtimeInputs = JSON.parse(readFileSync(join(root, 'runtime-inputs.json'), 'utf8'));
const mount = (item) => ({
  type: item.Type,
  source: item.Type === 'volume' ? item.Name : item.Source,
  destination: item.Destination,
  readOnly: !item.RW,
});
const hasOptions = (value, expected) => expected.every((item) => new RegExp(`(?:^|,)${item}(?:,|$)`).test(value));
const tmpfsBytes = (inspect) => hasOptions(inspect.HostConfig.Tmpfs?.['/tmp'] ?? '', [
  'rw', 'noexec', 'nosuid', 'nodev', 'size=64m',
]) ? 67108864 : 0;
const volumeOptions = volumeInspect.Options ?? {};
const jobVolumeBytes = volumeOptions.type === 'tmpfs' && volumeOptions.device === 'tmpfs'
  && hasOptions(volumeOptions.o ?? '', ['size=64m', 'uid=1000', 'gid=1000', 'mode=0770']) ? 67108864 : 0;
const samples = (name) => {
  const rows = readFileSync(join(root, name), 'utf8').trim().split(/\r?\n/u).filter(Boolean).map((line) => {
    const [elapsed, cpu, memory, terminal] = line.split('\t');
    return {
      elapsedMs: Number(elapsed), cpuUsageMicros: Number(cpu), memoryPeakBytes: Number(memory),
      terminal: terminal === 'true',
    };
  });
  const initial = rows[0]?.elapsedMs ?? 0;
  return rows.map((sample) => ({ ...sample, elapsedMs: sample.elapsedMs - initial }));
};
const roundRate = (value) => Math.round(value * 10_000) / 10_000;
const resource = (inspect, sampleFile, pid, cgroupPath, cgroupIdentity, env) => {
  const series = samples(sampleFile);
  const cpus = inspect.HostConfig.NanoCpus / 1_000_000_000;
  let peakCpuQuotaPercent = 0;
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    const rate = ((current.cpuUsageMicros - previous.cpuUsageMicros)
      / ((current.elapsedMs - previous.elapsedMs) * 1_000)) / cpus * 100;
    peakCpuQuotaPercent = Math.max(peakCpuQuotaPercent, roundRate(rate));
  }
  const terminal = series.at(-1);
  return {
    containerId: inspect.Id,
    imageId: inspect.Image,
    running: inspect.State.Running,
    exitCode: inspect.State.ExitCode,
    user: inspect.Config.User,
    effectiveEnvCount: Number(env),
    networkMode: inspect.HostConfig.NetworkMode,
    readOnlyRootfs: inspect.HostConfig.ReadonlyRootfs,
    capDrop: inspect.HostConfig.CapDrop ?? [],
    noNewPrivileges: (inspect.HostConfig.SecurityOpt ?? []).some((item) => item === 'no-new-privileges'),
    memoryBytes: inspect.HostConfig.Memory,
    memorySwapBytes: inspect.HostConfig.MemorySwap,
    nanoCpus: inspect.HostConfig.NanoCpus,
    pidsLimit: inspect.HostConfig.PidsLimit,
    tmpfsBytes: tmpfsBytes(inspect),
    jobVolumeBytes,
    sampling: {
      source: 'host-cgroup-v2', clock: 'host-monotonic', cgroupVersion: 2, hostPid: Number(pid),
      cgroupPath, cgroupIdentity, samples: series,
    },
    cumulativeCpuUsageMicros: terminal?.cpuUsageMicros ?? 0,
    peakCpuQuotaPercent,
    peakMemoryBytes: terminal?.memoryPeakBytes ?? 0,
    mounts: inspect.Mounts.map(mount),
  };
};
const worker = resource(
  workerInspect, 'worker.samples.tsv', workerPid, workerCgroup, workerCgroupIdentity, workerEnv,
);
const parser = resource(
  parserInspect, 'parser.samples.tsv', parserPid, parserCgroup, parserCgroupIdentity, parserEnv,
);
const report = {
  build: { sourceSha, runnerSha256, contractSha256, runtimeGraph, runtimeInputs },
  worker,
  parser,
  maxima: {
    cumulativeCpuUsageMicros: Math.max(worker.cumulativeCpuUsageMicros, parser.cumulativeCpuUsageMicros),
    peakCpuQuotaPercent: Math.max(worker.peakCpuQuotaPercent, parser.peakCpuQuotaPercent),
    peakMemoryBytes: Math.max(worker.peakMemoryBytes, parser.peakMemoryBytes),
  },
};
writeFileSync(join(root, 'resources.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
NODE

verify_release_inputs 'before-publication' \
  || { echo 'release source changed before publication' >&2; exit 70; }
verify_runtime_graph 'before-publication' \
  || { echo 'acceptance runtime graph changed before publication' >&2; exit 70; }
verify_runtime_inputs 'before-publication' \
  || { echo 'generated runtime inputs changed before publication' >&2; exit 70; }
/usr/bin/node "$CONTRACT_JS" finalize "$SOURCE_SHA" "$RUN_ID"
[[ -f "$UNPUBLISHED_REPORT" && ! -e "$FINAL_REPORT" ]] \
  || { echo 'unpublished acceptance report candidate missing' >&2; exit 70; }
REPORT_RUNTIME_INPUTS_JSON="$(/usr/bin/node - "$UNPUBLISHED_REPORT" <<'NODE'
const { readFileSync } = require('node:fs');
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(JSON.stringify(report?.resources?.build?.runtimeInputs));
NODE
)" || { echo 'unpublished report generated runtime identity is unreadable' >&2; exit 70; }
[[ "$REPORT_RUNTIME_INPUTS_JSON" == "$RUNTIME_INPUTS_JSON" ]] \
  || { echo 'unpublished report generated runtime identity mismatch' >&2; exit 70; }
cleanup_strict
verify_build_hashes 'before-atomic-publication' \
  || { echo 'acceptance contract verifier changed before atomic publication' >&2; exit 70; }
verify_release_inputs 'before-atomic-publication' \
  || { echo 'release source changed before atomic publication' >&2; exit 70; }
verify_runtime_inputs 'before-atomic-publication' \
  || { echo 'generated runtime inputs changed before atomic publication' >&2; exit 70; }
/usr/bin/node "$CONTRACT_JS" publish "$SOURCE_SHA" "$RUN_ID"
[[ -f "$FINAL_REPORT" && ! -e "$UNPUBLISHED_REPORT" ]] \
  || { echo 'atomic acceptance report publication failed' >&2; exit 70; }
trap - EXIT HUP INT TERM
echo "TASK8_PARSER_ACCEPTANCE_OK sha=$SOURCE_SHA report=$FINAL_REPORT"
