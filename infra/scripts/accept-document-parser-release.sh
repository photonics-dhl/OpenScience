#!/usr/bin/env bash
set -euo pipefail
umask 077

MANIFEST_SHA256='34b46c5405c7d2114183cfb8e3b938a392ddf1e43941fed0818f7a3ab3b7fae6'

print_contract() {
  local source_sha="$1"
  printf '%s\n' "{
  \"schemaVersion\": 2,
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
  \"calls\": { \"structuredFake\": 10, \"externalProvider\": 0, \"forbiddenGateway\": 0 },
  \"freshBuildIdentity\": { \"required\": true, \"runnerSha256\": true, \"contractSha256\": true },
  \"deadlineSeconds\": 900,
  \"resourceOwnership\": { \"preflightAbsent\": true, \"randomTokenLabel\": true, \"removeOnlyOwned\": true },
  \"independentCgroupSampling\": [\"worker\", \"parser\"],
  \"topologyMaxima\": true,
  \"atomicPublication\": true,
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

RELEASE_ROOT="/opt/openscience-releases/$SOURCE_SHA"
ACCEPTANCE_ROOT="/opt/openscience-acceptance/document-parser/$SOURCE_SHA"
CORPUS_ROOT="$ACCEPTANCE_ROOT/corpus"
FINAL_REPORT="$ACCEPTANCE_ROOT/report.json"
CONTRACT_JS="$RELEASE_ROOT/apps/agent-worker/dist/parser-acceptance-contract.js"
RUNNER_JS="$RELEASE_ROOT/apps/agent-worker/dist/parser-acceptance-runner.js"
[[ "$(git -C "$RELEASE_ROOT" rev-parse HEAD)" == "$SOURCE_SHA" ]] \
  || { echo 'release root is not the exact source SHA' >&2; exit 65; }
[[ -z "$(git -C "$RELEASE_ROOT" status --porcelain --untracked-files=normal)" ]] \
  || { echo 'exact release root is not immutable and clean' >&2; exit 65; }
if find "$RELEASE_ROOT" -xdev -type f \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' -print -quit | grep -q .; then
  echo 'exact release root contains an environment secret file' >&2
  exit 65
fi
npx pnpm@9.15.0 --dir "$RELEASE_ROOT" --filter @openscience/agent-worker... build >/dev/null
[[ -f "$CONTRACT_JS" && -f "$RUNNER_JS" ]] \
  || { echo 'fresh acceptance build outputs missing from exact release' >&2; exit 66; }
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
RUN_ROOT="$ACCEPTANCE_ROOT/.run-$RUN_ID"
WORKER_OUTPUT_ROOT="$RUN_ROOT/worker-output"
DRAFT_REPORT="$WORKER_OUTPUT_ROOT/report.draft.json"
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
  /usr/bin/node "$CONTRACT_JS" cleanup "$SOURCE_SHA" "$RUN_ID"
  [[ ! -e "$RUN_ROOT" && ! -e "$ACCEPTANCE_ROOT/report.json.tmp-$RUN_ID" ]]
  ! docker inspect "$WORKER_NAME" "$PARSER_NAME" >/dev/null 2>&1
  ! docker volume inspect "$JOB_VOLUME" >/dev/null 2>&1
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

for _ in $(seq 1 60); do
  docker exec "$PARSER_NAME" test -f /parser-jobs/.ready && break
  sleep 1
done
docker exec "$PARSER_NAME" test -f /parser-jobs/.ready \
  || { echo 'document parser sidecar did not become ready' >&2; exit 70; }

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
  "$WORKER_IMAGE" -i /usr/local/bin/node dist/parser-acceptance-runner.js \
    /acceptance-corpus /acceptance-output/report.draft.json \
    "$SOURCE_SHA" "$WORKER_IMAGE_ID" "$PARSER_IMAGE_ID")"
[[ "$WORKER_CONTAINER_ID" =~ ^[a-f0-9]{64}$ ]] \
  || { echo 'invalid acceptance worker container ID' >&2; exit 65; }
WORKER_OWNED=true
container_owned "$WORKER_CONTAINER_ID" || { echo 'acceptance worker ownership mismatch' >&2; exit 65; }

sample_container() {
  docker exec "$1" /usr/local/bin/node -e '
const fs = require("node:fs");
const cpu = fs.readFileSync("/sys/fs/cgroup/cpu.stat", "utf8").match(/^usage_usec (\d+)$/m);
const rss = Number(fs.readFileSync("/sys/fs/cgroup/memory.stat", "utf8").match(/^anon (\d+)$/m)?.[1]);
if (!cpu || !Number.isSafeInteger(rss)) process.exit(1);
process.stdout.write(`${cpu[1]} ${rss}`);'
}

process_env_count() {
  docker exec "$1" /usr/local/bin/node -e '
const value = require("node:fs").readFileSync("/proc/1/environ");
process.stdout.write(String(value.length === 0 ? 0 : value.toString("binary").split("\0").filter(Boolean).length));'
}

WORKER_CPU=0
WORKER_RSS=0
PARSER_CPU=0
PARSER_RSS=0
WORKER_ENV_COUNT=-1
PARSER_ENV_COUNT="$(process_env_count "$PARSER_NAME")"
ACCEPTANCE_DEADLINE=$((SECONDS + 900))
while true; do
  [[ "$(docker inspect --format '{{.State.Running}}' "$PARSER_NAME")" == true ]] \
    || { echo 'acceptance parser stopped during the run' >&2; exit 70; }
  sample="$(sample_container "$PARSER_NAME")" \
    || { echo 'acceptance parser cgroup sampling failed' >&2; exit 70; }
  read -r cpu rss <<<"$sample"
  (( cpu > PARSER_CPU )) && PARSER_CPU="$cpu"
  (( rss > PARSER_RSS )) && PARSER_RSS="$rss"
  WORKER_RUNNING="$(docker inspect --format '{{.State.Running}}' "$WORKER_NAME")"
  [[ "$WORKER_RUNNING" == true ]] || break
  sample="$(sample_container "$WORKER_NAME")" \
    || { echo 'acceptance worker cgroup sampling failed' >&2; exit 70; }
  read -r cpu rss <<<"$sample"
  (( cpu > WORKER_CPU )) && WORKER_CPU="$cpu"
  (( rss > WORKER_RSS )) && WORKER_RSS="$rss"
  if [[ "$WORKER_ENV_COUNT" -lt 0 ]]; then
    WORKER_ENV_COUNT="$(process_env_count "$WORKER_NAME")" \
      || { echo 'acceptance worker environment sampling failed' >&2; exit 70; }
  fi
  (( SECONDS < ACCEPTANCE_DEADLINE )) \
    || { echo 'acceptance worker exceeded the 900-second deadline' >&2; exit 70; }
  sleep 0.2
done

[[ "$(docker inspect --format '{{.State.ExitCode}}' "$WORKER_NAME")" == 0 ]] \
  || { echo 'acceptance worker failed' >&2; exit 70; }
[[ -f "$DRAFT_REPORT" ]] || { echo 'acceptance draft report missing' >&2; exit 70; }
[[ "$WORKER_ENV_COUNT" == 0 && "$PARSER_ENV_COUNT" == 0 ]] \
  || { echo 'acceptance container effective environment was not empty' >&2; exit 70; }
[[ "$(hash_build_outputs)" == "$BUILD_HASHES" ]] \
  || { echo 'acceptance build outputs changed during the run' >&2; exit 70; }

set -o noclobber
docker inspect "$WORKER_NAME" >"$RUN_ROOT/worker.inspect.json"
docker inspect "$PARSER_NAME" >"$RUN_ROOT/parser.inspect.json"
docker volume inspect "$JOB_VOLUME" >"$RUN_ROOT/volume.inspect.json"
set +o noclobber

/usr/bin/node - "$RUN_ROOT" "$WORKER_CPU" "$WORKER_RSS" "$PARSER_CPU" "$PARSER_RSS" \
  "$WORKER_ENV_COUNT" "$PARSER_ENV_COUNT" "$SOURCE_SHA" "$RUNNER_BUILD_SHA256" \
  "$CONTRACT_BUILD_SHA256" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const [root, workerCpu, workerRss, parserCpu, parserRss, workerEnv, parserEnv,
  sourceSha, runnerSha256, contractSha256] = process.argv.slice(2);
const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'))[0];
const workerInspect = read('worker.inspect.json');
const parserInspect = read('parser.inspect.json');
const volumeInspect = read('volume.inspect.json');
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
const resource = (inspect, cpu, rss, env) => ({
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
  cpuUsageMicros: Number(cpu),
  peakRssBytes: Number(rss),
  mounts: inspect.Mounts.map(mount),
});
const worker = resource(workerInspect, workerCpu, workerRss, workerEnv);
const parser = resource(parserInspect, parserCpu, parserRss, parserEnv);
const report = {
  build: { sourceSha, runnerSha256, contractSha256 },
  worker,
  parser,
  maxima: {
    cpuUsageMicros: Math.max(worker.cpuUsageMicros, parser.cpuUsageMicros),
    peakRssBytes: Math.max(worker.peakRssBytes, parser.peakRssBytes),
  },
};
writeFileSync(join(root, 'resources.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
NODE

/usr/bin/node "$CONTRACT_JS" finalize "$SOURCE_SHA" "$RUN_ID"
[[ -f "$FINAL_REPORT" ]] || { echo 'atomic acceptance report publication failed' >&2; exit 70; }

cleanup_strict
trap - EXIT HUP INT TERM
echo "TASK8_PARSER_ACCEPTANCE_OK sha=$SOURCE_SHA report=$FINAL_REPORT"
