#!/usr/bin/env bash
# Explicit operator installation; no account login, dependency installation or production env edits.
set -euo pipefail
if [[ "${1:-}" = '--confirm-video' ]]; then
  [[ $# = 7 && "$2" = '--source' && "$4" = '--tts-image' && "$6" = '--renderer-image' ]] || { echo 'Usage: install.sh --confirm-video --source <immutable release> --tts-image <sha256:id> --renderer-image <sha256:id>'; exit 64; }
  source_root="$(readlink -f -- "$3")"; tts_image="$5"; video_renderer_image="$7"
  sha="$(basename -- "$source_root")"
  [[ "$sha" =~ ^[a-f0-9]{40}$ && "$source_root" = "/opt/openscience-releases/$sha" && "$tts_image" =~ ^sha256:[a-f0-9]{64}$ && "$video_renderer_image" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 65
  [[ "$(id -u)" = 0 ]] || exit 66
  node "$source_root/scripts/release-input-manifest.mjs" verify --root "$source_root" --sha "$sha"
  video_root=/opt/openscience-video; video_bundle="$video_root/releases/$sha"; model=/opt/openscience-models/qwen3-tts-customvoice-0c0e305
  [[ -d "$model" && ! -L "$model" ]] || exit 67
  docker image inspect "$tts_image" "$video_renderer_image" >/dev/null
  for path in "$video_root" "$video_root/releases" "$video_root/inbox" "$video_root/results" "$video_root/private"; do [[ ! -L "$path" ]] || exit 68; done
  install -d -m 0755 "$video_root" "$video_root/releases"
  install -d -o root -g 11000 -m 2770 "$video_root/inbox"
  install -d -o root -g 11000 -m 2750 "$video_root/results"
  install -d -o root -g root -m 0700 "$video_root/private"
  [[ ! -e "$video_bundle" ]] || { echo 'Video bundle already exists; inspect before reuse'; exit 69; }
  install -d -m 0755 "$video_bundle/infra/codex-image-runner" "$video_bundle/packages/ai-gateway/dist"
  for file in core.mjs video-runner.mjs video-tts.py; do install -m 0444 "$source_root/infra/codex-image-runner/$file" "$video_bundle/infra/codex-image-runner/$file"; done
  find "$source_root/packages/ai-gateway/dist" -maxdepth 1 -type f -name '*.js' -exec install -m 0444 -t "$video_bundle/packages/ai-gateway/dist" {} +
  node --input-type=module - "$video_bundle/infra/codex-image-runner/video-runner.mjs" <<'NODE'
import { pathToFileURL } from 'node:url';
const runner = await import(pathToFileURL(process.argv[2]).href);
if (typeof runner.runVideoOne !== 'function') throw Error('VIDEO_RUNNER_RUNTIME_INVALID');
NODE
  script_digest="$({
    printf '%s\0' "$video_bundle/infra/codex-image-runner/core.mjs" "$video_bundle/infra/codex-image-runner/video-runner.mjs" "$video_bundle/infra/codex-image-runner/video-tts.py"
    find "$video_bundle/packages/ai-gateway/dist" -maxdepth 1 -type f -name '*.js' -print0
  } | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)"
  config="$video_root/config-$sha.json"
  printf '{"inbox":"%s/inbox","results":"%s/results","privateRoot":"%s/private","model":"%s","modelRevision":"%s","ttsImage":"%s","rendererImage":"%s","scriptDigest":"%s"}\n' "$video_root" "$video_root" "$video_root" "$model" "$(basename -- "$model")" "$tts_image" "$video_renderer_image" "$script_digest" > "$config"
  chmod 0600 "$config"
  unit=/etc/systemd/system/openscience-video-runner.service
  [[ ! -L "$unit" ]] || exit 68
  prior_active="$(systemctl is-active openscience-video-runner 2>/dev/null || true)"
  prior_enabled="$(systemctl is-enabled openscience-video-runner 2>/dev/null || true)"
  had_unit=false
  if [[ -f "$unit" ]]; then cp -p "$unit" "$video_root/service-before-$sha"; had_unit=true; fi
  rollback_video_service() {
    code=$?
    trap - ERR
    set +e
    systemctl stop openscience-video-runner
    if [[ "$had_unit" = true ]]; then
      install -m 0644 "$video_root/service-before-$sha" "$unit"
      systemctl daemon-reload
      if [[ "$prior_enabled" = enabled ]]; then systemctl enable openscience-video-runner; else systemctl disable openscience-video-runner; fi
      if [[ "$prior_active" = active ]]; then systemctl start openscience-video-runner; fi
    else
      systemctl disable openscience-video-runner
      if [[ -f "$unit" ]]; then mv "$unit" "$video_root/service-failed-$sha"; fi
      systemctl daemon-reload
    fi
    echo 'VIDEO_RUNNER_INSTALL_FAILED; prior service state restoration attempted' >&2
    exit "$code"
  }
  trap rollback_video_service ERR
  cat > "$video_root/service-new-$sha" <<EOF
[Unit]
Description=OpenScience isolated host video runner
After=docker.service
Requires=docker.service
[Service]
Type=simple
ExecStart=/usr/bin/flock -n $video_root/runner.lock /usr/bin/node $video_bundle/infra/codex-image-runner/video-runner.mjs --config $config
Restart=on-failure
RestartSec=10
TimeoutStopSec=600
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$video_root
UMask=0027
[Install]
WantedBy=multi-user.target
EOF
  if [[ "$had_unit" = true ]]; then systemctl stop openscience-video-runner; fi
  if [[ -e "$video_root/results/.ready" ]]; then
    [[ -f "$video_root/results/.ready" && ! -L "$video_root/results/.ready" ]]
    mv "$video_root/results/.ready" "$video_root/ready-before-$sha"
  fi
  install -m 0644 "$video_root/service-new-$sha" "$unit"
  systemctl daemon-reload
  started_at="$(date +%s)"
  systemctl enable --now openscience-video-runner
  ready=false
  for (( attempt=0; attempt<40; attempt++ )); do
    if systemctl is-active --quiet openscience-video-runner && [[ -f "$video_root/results/.ready" ]] && [[ "$(stat -c %Y "$video_root/results/.ready")" -ge "$started_at" ]]; then ready=true; break; fi
    sleep 0.5
  done
  [[ "$ready" = true ]]
  systemctl is-active --quiet openscience-video-runner
  trap - ERR
  echo "VIDEO_RUNNER_INSTALLED source=$sha"
  exit 0
fi
[[ $# = 3 && "$1" = '--confirm' && "$2" = '--source' ]] || { echo 'Usage: install.sh --confirm --source <immutable release>'; exit 64; }
source_root="$(readlink -f -- "$3")"
sha="$(basename -- "$source_root")"
[[ "$sha" =~ ^[a-f0-9]{40}$ && "$source_root" = "/opt/openscience-releases/$sha" ]] || exit 65
[[ "$(id -u)" = 0 ]] || exit 66
node "$source_root/scripts/release-input-manifest.mjs" verify --root "$source_root" --sha "$sha"
root=/opt/openscience-codex
bundle="$root/releases/$sha"
runtime=/opt/openscience-evals/codex-image/runtime
auth=/opt/openscience-evals/codex-image/state/auth.json
node_image=sha256:9aa184189f478192a37d9f5e318aef6bb25690db294b0857c3ea798d76b1bbc7
renderer_image=sha256:1c47a579ceb608f244878b41888eee50bda1135ff325cb7b49de3a275ee2013d
[ -f "$auth" ] && [ ! -L "$auth" ] && [ "$(stat -c '%u %a' "$auth")" = '1000 600' ] || exit 67
[ -f "$runtime/node_modules/@openai/codex/bin/codex.js" ] || exit 67
docker image inspect "$node_image" "$renderer_image" >/dev/null
for path in "$root" "$root/releases" "$root/inbox" "$root/results" "$root/private"; do [ ! -L "$path" ] || exit 68; done
install -d -m 0755 "$root" "$root/releases"
install -d -o root -g 11000 -m 2770 "$root/inbox"
install -d -o root -g 11000 -m 2750 "$root/results"
install -d -o root -g root -m 0700 "$root/private"
[ ! -e "$bundle" ] || { echo 'Bundle already exists; inspect existing service before reuse'; exit 69; }
install -d -m 0755 "$bundle/infra/codex-image-runner" "$bundle/packages/ai-gateway/dist"
for file in core.mjs runner.mjs sandbox.mjs proxy.mjs container-client.mjs; do install -m 0444 "$source_root/infra/codex-image-runner/$file" "$bundle/infra/codex-image-runner/$file"; done
# Compiled Gateway has only built-in Node runtime imports; copy its complete dist to preserve the protocol/validator version.
find "$source_root/packages/ai-gateway/dist" -maxdepth 1 -type f -name '*.js' -exec install -m 0444 -t "$bundle/packages/ai-gateway/dist" {} +
# Load the complete compiled runtime before changing any existing service.
node --input-type=module - "$bundle/infra/codex-image-runner/runner.mjs" <<'NODE'
import { pathToFileURL } from 'node:url';
const runner = await import(pathToFileURL(process.argv[2]).href);
if (typeof runner.executeImage !== 'function') throw Error('RUNNER_RUNTIME_INVALID');
NODE
printf '%s\n' "$sha" > "$bundle/source-id"
config="$root/config-$sha.json"
printf '{"inbox":"%s/inbox","results":"%s/results","privateRoot":"%s/private","runtime":"%s","auth":"%s","nodeImage":"%s","rendererImage":"%s"}\n' "$root" "$root" "$root" "$runtime" "$auth" "$node_image" "$renderer_image" > "$config"
chmod 0600 "$config"
unit=/etc/systemd/system/openscience-codex-image.service
[ ! -L "$unit" ] || exit 68
prior_active="$(systemctl is-active openscience-codex-image 2>/dev/null || true)"
prior_enabled="$(systemctl is-enabled openscience-codex-image 2>/dev/null || true)"
had_unit=false
if [ -f "$unit" ]; then cp -p "$unit" "$root/service-before-$sha"; had_unit=true; fi
rollback_service() {
  code=$?
  trap - ERR
  set +e
  systemctl stop openscience-codex-image
  if [ "$had_unit" = true ]; then
    install -m 0644 "$root/service-before-$sha" "$unit"
    systemctl daemon-reload
    if [ "$prior_enabled" = enabled ]; then systemctl enable openscience-codex-image; else systemctl disable openscience-codex-image; fi
    if [ "$prior_active" = active ]; then systemctl start openscience-codex-image; fi
  else
    systemctl disable openscience-codex-image
    if [ -f "$unit" ]; then mv "$unit" "$root/service-failed-$sha"; fi
    systemctl daemon-reload
  fi
  echo 'CODEX_RUNNER_INSTALL_FAILED; prior service state restoration attempted' >&2
  exit "$code"
}
trap rollback_service ERR
cat > "$root/service-new-$sha" <<EOF
[Unit]
Description=OpenScience administrator Codex image evaluation runner
After=docker.service squid.service
Requires=docker.service
[Service]
Type=simple
ExecStart=/usr/bin/flock -n $root/runner.lock /usr/bin/node $bundle/infra/codex-image-runner/runner.mjs --config $config
Restart=on-failure
RestartSec=10
TimeoutStopSec=600
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$root
UMask=0027
[Install]
WantedBy=multi-user.target
EOF
if [ "$had_unit" = true ]; then systemctl stop openscience-codex-image; fi
# A previous runner's heartbeat must never satisfy the new service's readiness check.
if [ -e "$root/results/.ready" ]; then
  [ -f "$root/results/.ready" ] && [ ! -L "$root/results/.ready" ]
  mv "$root/results/.ready" "$root/ready-before-$sha"
fi
install -m 0644 "$root/service-new-$sha" "$unit"
systemctl daemon-reload
started_at="$(date +%s)"
systemctl enable --now openscience-codex-image
ready=false
for (( attempt=0; attempt<40; attempt++ )); do
  if systemctl is-active --quiet openscience-codex-image && [ -f "$root/results/.ready" ] && [ "$(stat -c %Y "$root/results/.ready")" -ge "$started_at" ]; then ready=true; break; fi
  sleep 0.5
done
[ "$ready" = true ]
systemctl is-active --quiet openscience-codex-image
trap - ERR
echo "CODEX_RUNNER_INSTALLED source=$sha"
