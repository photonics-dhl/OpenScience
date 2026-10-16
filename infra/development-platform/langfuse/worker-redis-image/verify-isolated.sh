#!/usr/bin/env bash
# Preparation only. Controller owns any Docker/SSH execution; no live service operations.
set -euo pipefail
umask 077
if [[ $# != 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'usage: verify-isolated.sh <already-pushed-source-commit-full-sha>' >&2
  exit 2
fi
packet_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_sha="$1"
prefix="$packet_dir/../server-resource-maintenance-20261015-worker-redis-"
base='langfuse/langfuse-worker:4.35.0@sha256:5e35e625a214dd868bb22adad90fc52e8f83cc856c3750e47f9a922622c207fb'
base_id='sha256:52388ae1c2d4ea0e2fd9d347c97c97bd90612eedfdb5d1434610e62eba04433a'
sdk_only_id='sha256:86f268d0e315b0cce74f4cb6804c2863f0b9238bd1f956750c6f4cf2a87e6763'
image="openscience-development/langfuse-worker:redis-sdk-shutdown-$source_sha"
docker_cmd=(env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  DOCKER_BUILDKIT=0 docker --host unix:///var/run/docker.sock)
[[ "$("${docker_cmd[@]}" context inspect default --format '{{.Endpoints.docker.Host}}')" == 'unix:///var/run/docker.sock' ]]
[[ "$("${docker_cmd[@]}" image inspect --format '{{.Id}}' "$base")" == "$base_id" ]]
[[ "$("${docker_cmd[@]}" image inspect --format '{{.Id}}' "$sdk_only_id")" == "$sdk_only_id" ]]
# Reuse cached images only. Keep old A and prior test receipts immutable.
for fixed_id in "$base_id" "$sdk_only_id"; do
  volumes="$("${docker_cmd[@]}" image inspect --format '{{json .Config.Volumes}}' "$fixed_id")"
  [[ "$volumes" == null || "$volumes" == '{}' ]]
done
if "${docker_cmd[@]}" image inspect "$image" >/dev/null 2>&1; then
  echo 'candidate tag already exists; preserve it and return to controller' >&2; exit 1
fi
for name in lifecycle.test.cjs fixture.cjs native.test.cjs sdk.test.cjs; do
  [[ -f "${prefix}${name}" ]]; chmod 0644 "${prefix}${name}"
done
chmod 0644 "$packet_dir/instrumentation.js" "$packet_dir/shutdown.js" "$packet_dir/redis.js"
"${docker_cmd[@]}" build --pull=false --network none --tag "$image" "$packet_dir"
candidate_id="$("${docker_cmd[@]}" image inspect --format '{{.Id}}' "$image")"
volumes="$("${docker_cmd[@]}" image inspect --format '{{json .Config.Volumes}}' "$candidate_id")"
[[ "$volumes" == null || "$volumes" == '{}' ]]
printf 'BASE_IMAGE_ID=%s\nSDK_ONLY_IMAGE_ID=%s\nCANDIDATE_IMAGE_ID=%s\nSOURCE_COMMIT=%s\n' "$base_id" "$sdk_only_id" "$candidate_id" "$source_sha"
common=(--pull=never --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges
  --memory 256m --cpus 0.25 --pids-limit 64 --no-healthcheck
  --env NODE_OPTIONS= --env NODE_PATH= --env XGS_REDIS_IMAGE=1 --env XGS_LIFECYCLE_IMAGE_SDK=1
  --entrypoint node)
for name in lifecycle.test.cjs fixture.cjs native.test.cjs sdk.test.cjs; do
  common+=(--mount "type=bind,src=${prefix}${name},dst=/work/server-resource-maintenance-20261015-worker-redis-${name},readonly")
done
"${docker_cmd[@]}" run "${common[@]}" \
  --mount "type=bind,src=$packet_dir/instrumentation.js,dst=/work/instrumentation.js,readonly" \
  --mount "type=bind,src=$packet_dir/shutdown.js,dst=/work/shutdown.js,readonly" \
  --mount "type=bind,src=$packet_dir/redis.js,dst=/work/redis.js,readonly" \
  "$candidate_id" -e 'const fs=require("node:fs"),a=require("node:assert/strict"),p=require("node:path"); const publicEntry=require.resolve("@langfuse/shared/src/server",{paths:["/app/worker/dist"]}); const expected="/app/worker/node_modules/.pnpm/@langfuse+shared@file++++app+packages+shared/node_modules/@langfuse/shared/dist/src/server/index.js"; a.equal(fs.realpathSync(publicEntry),expected); const factory=p.join(p.dirname(publicEntry),"redis/redis.js"); for(const [x,y] of [["/work/instrumentation.js","/app/worker/dist/instrumentation.js"],["/work/shutdown.js","/app/worker/dist/utils/shutdown.js"],["/work/redis.js",factory]])a(fs.readFileSync(x).equals(fs.readFileSync(y))); a.match(fs.readFileSync(publicEntry,"utf8"),/__exportStar\(require\("\.\/redis\/redis"\), exports\);/); console.log("ACTUAL_IMAGE_THREE_FILES_AND_PUBLIC_PATH_MATCH");'
test_root='/work/server-resource-maintenance-20261015-worker-redis-'
set +e
"${docker_cmd[@]}" run "${common[@]}" --env XGS_REDIS_MODE=original "$sdk_only_id" \
  --test --test-reporter=tap "${test_root}lifecycle.test.cjs" >"$packet_dir/image-original-redis.tap" 2>&1
original_status=$?
set -e
[[ "$original_status" == 1 ]]
grep -qx '# tests 9' "$packet_dir/image-original-redis.tap"
grep -qx '# pass 1' "$packet_dir/image-original-redis.tap"
grep -qx '# fail 8' "$packet_dir/image-original-redis.tap"
grep -qx '# skipped 0' "$packet_dir/image-original-redis.tap"
"${docker_cmd[@]}" run "${common[@]}" --env XGS_REDIS_MODE=candidate "$candidate_id" \
  --test --test-reporter=tap "${test_root}lifecycle.test.cjs" >"$packet_dir/image-candidate-redis.tap" 2>&1
grep -qx '# tests 9' "$packet_dir/image-candidate-redis.tap"
grep -qx '# pass 9' "$packet_dir/image-candidate-redis.tap"
grep -qx '# fail 0' "$packet_dir/image-candidate-redis.tap"
grep -qx '# skipped 0' "$packet_dir/image-candidate-redis.tap"
# Original 7 SDK assertions and native SDK test are unchanged; only the Redis I/O stub was extended.
"${docker_cmd[@]}" run "${common[@]}" --env XGS_LIFECYCLE_TEST_MODE=candidate "$candidate_id" \
  --test --test-reporter=tap "${test_root}sdk.test.cjs" >"$packet_dir/image-candidate-sdk.tap" 2>&1
grep -qx '# tests 7' "$packet_dir/image-candidate-sdk.tap"
grep -qx '# pass 7' "$packet_dir/image-candidate-sdk.tap"
grep -qx '# fail 0' "$packet_dir/image-candidate-sdk.tap"
grep -qx '# skipped 0' "$packet_dir/image-candidate-sdk.tap"
set +e
"${docker_cmd[@]}" run "${common[@]}" --env XGS_REDIS_MODE=original "$sdk_only_id" \
  --test --test-reporter=tap "${test_root}native.test.cjs" >"$packet_dir/image-original-native.tap" 2>&1
native_status=$?
set -e
[[ "$native_status" == 1 ]]
grep -qx '# tests 1' "$packet_dir/image-original-native.tap"
grep -qx '# pass 0' "$packet_dir/image-original-native.tap"
grep -qx '# fail 1' "$packet_dir/image-original-native.tap"
grep -qx '# skipped 0' "$packet_dir/image-original-native.tap"
grep -qE '^[[:space:]]*# CONTROL_NATIVE_CLIENTS_READY_AND_DRAIN_COMPLETE$' "$packet_dir/image-original-native.tap"
"${docker_cmd[@]}" run "${common[@]}" --env XGS_REDIS_MODE=candidate "$candidate_id" \
  --test --test-reporter=tap "${test_root}native.test.cjs" >"$packet_dir/image-candidate-native.tap" 2>&1
grep -qx '# tests 1' "$packet_dir/image-candidate-native.tap"
grep -qx '# pass 1' "$packet_dir/image-candidate-native.tap"
grep -qx '# fail 0' "$packet_dir/image-candidate-native.tap"
grep -qx '# skipped 0' "$packet_dir/image-candidate-native.tap"
echo 'ISOLATED_COMBINED_LIFECYCLE_PASS; full Worker shutdown, old137 cause and B/C remain unproven'
