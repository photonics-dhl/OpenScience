#!/usr/bin/env bash
# Preparation only: builds and tests an image, never changes live services.
set -euo pipefail
umask 077
if [[ $# != 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'usage: verify-isolated.sh <already-pushed-source-commit-full-sha>' >&2
  exit 2
fi
packet_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_sha="$1"
base='langfuse/langfuse-worker:4.35.0@sha256:5e35e625a214dd868bb22adad90fc52e8f83cc856c3750e47f9a922622c207fb'
base_id='sha256:52388ae1c2d4ea0e2fd9d347c97c97bd90612eedfdb5d1434610e62eba04433a'
test_file="$packet_dir/../server-resource-maintenance-20261015-worker-lifecycle.test.cjs"
image="openscience-development/langfuse-worker:otel-shutdown-$source_sha"
docker_cmd=(env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  DOCKER_BUILDKIT=0 docker --host unix:///var/run/docker.sock)
[[ -f "$test_file" && -f "$packet_dir/instrumentation.js" && -f "$packet_dir/shutdown.js" ]]
[[ "$("${docker_cmd[@]}" context inspect default --format '{{.Endpoints.docker.Host}}')" == 'unix:///var/run/docker.sock' ]]
# Explicit existing same-daemon legacy builder; no plugin bootstrap or fallback.
[[ "$("${docker_cmd[@]}" image inspect --format '{{.Id}}' "$base")" == "$base_id" ]]
# Do not replace an existing local artifact under the same source name.
if "${docker_cmd[@]}" image inspect "$image" >/dev/null 2>&1; then
  echo 'candidate tag already exists; retain evidence and ask controller to inspect it' >&2
  exit 1
fi
chmod 0644 "$packet_dir/instrumentation.js" "$packet_dir/shutdown.js" "$test_file"
"${docker_cmd[@]}" build --pull=false --network none --tag "$image" "$packet_dir"
candidate_id="$("${docker_cmd[@]}" image inspect --format '{{.Id}}' "$image")"
printf 'BASE_IMAGE_ID=%s\nCANDIDATE_IMAGE_ID=%s\nSOURCE_COMMIT=%s\n' "$base_id" "$candidate_id" "$source_sha"
common=(--rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges
  --memory 256m --cpus 0.25 --pids-limit 64 --no-healthcheck
  --env NODE_OPTIONS= --env NODE_PATH= --env XGS_LIFECYCLE_IMAGE_SDK=1
  --entrypoint node --mount "type=bind,src=$test_file,dst=/work/test.cjs,readonly")
# Check the actual image bytes, not only the separate mounted fixtures.
"${docker_cmd[@]}" run "${common[@]}" \
  --mount "type=bind,src=$packet_dir/instrumentation.js,dst=/work/instrumentation.js,readonly" \
  --mount "type=bind,src=$packet_dir/shutdown.js,dst=/work/shutdown.js,readonly" \
  "$candidate_id" -e 'const fs=require("node:fs"),a=require("node:assert/strict"); for(const [x,y] of [["/work/instrumentation.js","/app/worker/dist/instrumentation.js"],["/work/shutdown.js","/app/worker/dist/utils/shutdown.js"]])a(fs.readFileSync(x).equals(fs.readFileSync(y))); console.log("ACTUAL_IMAGE_TWO_FILES_MATCH");'
# Reuse the same fixed 2s child negative control; no production timeout change.
set +e
"${docker_cmd[@]}" run "${common[@]}" --env XGS_LIFECYCLE_TEST_MODE=original "$base_id" \
  --test --test-reporter=tap /work/test.cjs >"$packet_dir/image-original.tap" 2>&1
original_status=$?
set -e
[[ "$original_status" == 1 ]]
grep -qx '# tests 7' "$packet_dir/image-original.tap"
grep -qx '# pass 1' "$packet_dir/image-original.tap"
grep -qx '# fail 6' "$packet_dir/image-original.tap"
grep -qx '# skipped 0' "$packet_dir/image-original.tap"
grep -qE '^[[:space:]]*# CONTROL_DRAIN_COMPLETE:synthetic$' "$packet_dir/image-original.tap"
grep -qE '^[[:space:]]*# CONTROL_DRAIN_COMPLETE:native$' "$packet_dir/image-original.tap"
"${docker_cmd[@]}" run "${common[@]}" --env XGS_LIFECYCLE_TEST_MODE=candidate "$candidate_id" \
  --test --test-reporter=tap /work/test.cjs >"$packet_dir/image-candidate.tap" 2>&1
grep -qx '# tests 7' "$packet_dir/image-candidate.tap"
grep -qx '# pass 7' "$packet_dir/image-candidate.tap"
grep -qx '# fail 0' "$packet_dir/image-candidate.tap"
grep -qx '# skipped 0' "$packet_dir/image-candidate.tap"
echo 'ISOLATED_IMAGE_CONTRACT_PASS; full Worker shutdown and deployment remain unproven'
