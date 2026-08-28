#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == '--print-contract' ]]; then
  CONTRACT_SHA="${2:-}"
  [[ "$CONTRACT_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid exact source SHA' >&2; exit 64; }
  printf '%s\n' "{
  \"schemaVersion\": 2,
  \"sourceSha\": \"$CONTRACT_SHA\",
  \"corpusCases\": 16,
  \"actualPath\": \"artifact-backed-sdf.extract\",
  \"workerReleaseMount\": \"/opt/openscience:ro\",
  \"network\": \"none\",
  \"providerCalls\": 0,
  \"atomicPublication\": true,
  \"cleanupScope\": \"exact-run-id\",
  \"parserLimits\": { \"readOnly\": true, \"capDrop\": \"ALL\", \"noNewPrivileges\": true, \"memoryBytes\": 536870912, \"cpus\": 2, \"pids\": 64, \"jobVolumeBytes\": 67108864, \"tmpfsBytes\": 67108864 },
  \"workerLimits\": { \"readOnly\": true, \"capDrop\": \"ALL\", \"noNewPrivileges\": true, \"memoryBytes\": 1073741824, \"cpus\": 2, \"pids\": 64, \"tmpfsBytes\": 67108864 }
}"
  exit 0
fi

SOURCE_SHA="${1:-}"
CORPUS_DIR="${2:-}"
REPORT_PATH="${3:-}"
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid exact source SHA' >&2; exit 64; }
[[ -d "$CORPUS_DIR" && -f "$CORPUS_DIR/manifest.json" ]] || { echo 'schema-v2 corpus directory required' >&2; exit 66; }
[[ -n "$REPORT_PATH" && ! -e "$REPORT_PATH" ]] || { echo 'new report path required' >&2; exit 73; }
[[ "$(pwd -P)" == /opt/openscience ]] || { echo 'ECS repository root required' >&2; exit 77; }
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || { echo 'working tree is not the exact source SHA' >&2; exit 65; }

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

RUN_ID="${SOURCE_SHA:0:12}-$$"
PARSER_NAME="openscience-parser-accept-$RUN_ID"
WORKER_NAME="openscience-worker-accept-$RUN_ID"
JOB_VOLUME="openscience-parser-accept-jobs-$RUN_ID"
STAGING_ROOT="/opt/openscience-acceptance/document-parser/$SOURCE_SHA/$RUN_ID"
mkdir -p "$STAGING_ROOT"

cleanup() {
  docker rm -f "$WORKER_NAME" "$PARSER_NAME" >/dev/null 2>&1 || true
  docker volume rm "$JOB_VOLUME" >/dev/null 2>&1 || true
  find "$STAGING_ROOT" -mindepth 1 -maxdepth 1 -type f -name '*.tmp-*' -delete 2>/dev/null || true
  rmdir "$STAGING_ROOT" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

docker volume create \
  --label "org.openscience.acceptance=$SOURCE_SHA" \
  --driver local \
  --opt type=tmpfs \
  --opt device=tmpfs \
  --opt o=size=64m,uid=1000,gid=1000,mode=0770 \
  "$JOB_VOLUME" >/dev/null

docker run -d --name "$PARSER_NAME" \
  --label "org.openscience.acceptance=$SOURCE_SHA" \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --memory-swap 512m --cpus 2 --pids-limit 64 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --mount "type=volume,src=$JOB_VOLUME,dst=/parser-jobs" \
  --mount "type=bind,src=/opt/openscience,dst=/opt/openscience,readonly" \
  -e PARSER_JOB_DIR=/parser-jobs \
  "$PARSER_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  docker exec "$PARSER_NAME" test -f /parser-jobs/.ready && break
  sleep 1
done
docker exec "$PARSER_NAME" test -f /parser-jobs/.ready \
  || { echo 'document parser sidecar did not become ready' >&2; exit 70; }

docker run --name "$WORKER_NAME" \
  --label "org.openscience.acceptance=$SOURCE_SHA" \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 1g --memory-swap 1g --cpus 2 --pids-limit 64 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --mount "type=volume,src=$JOB_VOLUME,dst=/parser-jobs" \
  --mount "type=bind,src=$(realpath "$CORPUS_DIR"),dst=/acceptance-corpus,readonly" \
  --mount "type=bind,src=$(realpath "$(dirname "$REPORT_PATH")"),dst=/acceptance-output" \
  -e PARSER_JOB_DIR=/parser-jobs \
  "$WORKER_IMAGE" \
  node dist/parser-acceptance-runner.js \
    /acceptance-corpus "/acceptance-output/$(basename "$REPORT_PATH")" \
    "$SOURCE_SHA" "$WORKER_IMAGE_ID" "$PARSER_IMAGE_ID"

node - "$REPORT_PATH" "$SOURCE_SHA" "$WORKER_IMAGE_ID" "$PARSER_IMAGE_ID" <<'NODE'
const { readFileSync } = require('node:fs');
const [path, sha, worker, parser] = process.argv.slice(2);
const report = JSON.parse(readFileSync(path, 'utf8'));
if (report.schemaVersion !== 2 || report.sourceSha !== sha
  || report.images?.worker !== worker || report.images?.parser !== parser
  || report.topology?.network !== 'none' || report.topology?.providerCalls !== 0
  || report.topology?.corpusCases !== 16 || report.cases?.length !== 16
  || !Number.isFinite(report.summary?.p50ElapsedMs) || !Number.isFinite(report.summary?.p95ElapsedMs)
  || !Number.isSafeInteger(report.summary?.peakCpuMicros) || !Number.isSafeInteger(report.summary?.peakRssBytes)) {
  throw new Error('acceptance report contract failed');
}
NODE

trap - EXIT HUP INT TERM
cleanup
echo "TASK8_PARSER_ACCEPTANCE_OK sha=$SOURCE_SHA report=$REPORT_PATH"
