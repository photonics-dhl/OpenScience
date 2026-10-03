#!/usr/bin/env bash
# Explicit host installation only; credentials are provisioned separately.
set -euo pipefail
[[ ( $# == 5 || ( $# == 6 && ${6:-} == --defer-timers ) ) && ${1:-} == --confirm && ${2:-} == --source && ${4:-} == --renderer-image ]] || {
  echo 'Usage: install.sh --confirm --source /opt/openscience-releases/<full-sha> --renderer-image <sha256:id> [--defer-timers]' >&2; exit 64;
}
[[ $(id -u) == 0 ]] || exit 65
source_root=$(readlink -f -- "$3"); sha=$(basename -- "$source_root"); renderer_image=$5
[[ $sha =~ ^[a-f0-9]{40}$ && $source_root == "/opt/openscience-releases/$sha" && $renderer_image =~ ^([a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$ ]] || exit 66
node "$source_root/scripts/release-input-manifest.mjs" verify --root "$source_root" --sha "$sha"
[[ -d "$source_root/packages/ai-gateway/dist" && ! -L "$source_root/packages/ai-gateway/dist" ]] || exit 66
root=/opt/openscience-synclip
bundle="$root/releases/$sha"
[[ -d $root && ! -L $root && $(readlink -f -- "$root") == "$root" && $(stat -c '%u %a' "$root") == '0 700' ]] || exit 67
# Metadata only: never read, copy, print, rewrite or put the key in config/env.
[[ -f "$root/api-key" && -s "$root/api-key" && ! -L "$root/api-key" && $(stat -c '%u %a' "$root/api-key") == '0 600' ]] || exit 67
docker image inspect "$renderer_image" >/dev/null
if ! timeout 25 docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint /usr/bin/ffmpeg "$renderer_image" -version >/dev/null 2>&1; then
  echo 'SYNCLIP_RENDERER_UNAVAILABLE; installation unchanged' >&2; exit 66
fi
for path in "$root/releases" "$root/spool" "$root/spool/inbox" "$root/spool/results" "$root/private"; do
  [[ ! -L $path && ( ! -e $path || -d $path ) ]] || exit 68
done
[[ ! -e $bundle && ! -L $bundle ]] || { echo 'SYNCLIP_BUNDLE_EXISTS; inspect before reuse' >&2; exit 69; }
service=/etc/systemd/system/openscience-synclip-image.service
timer=/etc/systemd/system/openscience-synclip-image.timer
config="$root/config.json"
ready="$root/spool/results/.ready"
for path in "$service" "$timer" "$config" "$ready" "$root/runner.lock"; do
  [[ ! -L $path && ( ! -e $path || -f $path ) ]] || exit 68
done
if [[ ! -e "$root/runner.lock" ]]; then
  (umask 077; set -o noclobber; : > "$root/runner.lock")
fi
[[ $(stat -c '%u %a' "$root/runner.lock") == '0 600' ]] || exit 68
exec 9<>"$root/runner.lock"
# Only this provider's lock is needed. No nested browser/review lock inversion,
# and no running paid task is stopped to install a new bundle.
flock -n 9 || { echo 'SYNCLIP_RUNNER_ACTIVE; installation unchanged' >&2; exit 71; }
[[ ! -e $bundle && ! -L $bundle ]] || exit 69
install -d -o root -g root -m 0700 "$root/releases" "$root/spool" "$root/private"
install -d -o 1000 -g 1000 -m 0700 "$root/spool/inbox"
install -d -o root -g 1000 -m 2750 "$root/spool/results"
install -d -m 0755 "$bundle/infra/synclip-image" "$bundle/infra/chatgpt-browser" "$bundle/infra/codex-image-runner" "$bundle/packages/ai-gateway/dist"
for file in broker.mjs transport.mjs; do install -m 0444 "$source_root/infra/synclip-image/$file" "$bundle/infra/synclip-image/$file"; done
install -m 0444 "$source_root/infra/chatgpt-browser/broker.mjs" "$bundle/infra/chatgpt-browser/broker.mjs"
install -m 0444 "$source_root/infra/codex-image-runner/core.mjs" "$bundle/infra/codex-image-runner/core.mjs"
find "$source_root/packages/ai-gateway/dist" -maxdepth 1 -type f -name '*.js' -exec install -m 0444 -t "$bundle/packages/ai-gateway/dist" {} +
# This imports only; it cannot run the guarded broker or read the host key.
node --input-type=module - "$bundle/infra/synclip-image/broker.mjs" "$bundle/infra/synclip-image/transport.mjs" <<'NODE'
import { pathToFileURL } from 'node:url';
const broker = await import(pathToFileURL(process.argv[2]).href);
const transport = await import(pathToFileURL(process.argv[3]).href);
if (typeof broker.runSynclipBrokerOnce !== 'function' || typeof broker.validateSynclipBrokerConfig !== 'function'
  || typeof transport.executeSynclipImage !== 'function' || typeof transport.resumeSynclipImage !== 'function') throw Error('SYNCLIP_RUNTIME_INVALID');
NODE
printf '%s\n' "$sha" > "$bundle/source-id"
printf '{"inbox":"%s/spool/inbox","results":"%s/spool/results","privateRoot":"%s/private","rendererImage":"%s"}\n' \
  "$root" "$root" "$root" "$renderer_image" > "$bundle/config.json"
chmod 0444 "$bundle/source-id"
chmod 0600 "$bundle/config.json"
cat > "$bundle/service" <<EOF
[Unit]
Description=OpenScience Synclip image spool broker
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
User=root
Group=1000
ExecStart=/usr/bin/flock -n $root/runner.lock /usr/bin/node $bundle/infra/synclip-image/broker.mjs --config $config
TimeoutStartSec=780
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$root
ReadOnlyPaths=$bundle $root/api-key $config
UMask=0027
EOF
cat > "$bundle/timer" <<EOF
[Unit]
Description=Poll OpenScience Synclip image spool
[Timer]
OnBootSec=5
OnUnitActiveSec=15
AccuracySec=1
Unit=openscience-synclip-image.service
[Install]
WantedBy=timers.target
EOF
chmod 0444 "$bundle/service" "$bundle/timer"
prior_active=$(systemctl is-active openscience-synclip-image.timer 2>/dev/null || true)
prior_enabled=$(systemctl is-enabled openscience-synclip-image.timer 2>/dev/null || true)
case "$prior_active" in active|inactive|failed|unknown|'') ;; *) echo 'SYNCLIP_TIMER_STATE_UNKNOWN' >&2; exit 72;; esac
case "$prior_enabled" in enabled|enabled-runtime|disabled|not-found|'') ;; *) echo 'SYNCLIP_TIMER_STATE_UNKNOWN' >&2; exit 72;; esac
install -d -m 0700 "$bundle/previous"
for name in service timer config; do
  path=${!name}
  if [[ -f $path ]]; then cp -p -- "$path" "$bundle/previous/$name"; fi
done
# Keep the config backup's familiar name for operator rollback inspection.
if [[ -f "$bundle/previous/config" ]]; then mv -- "$bundle/previous/config" "$bundle/previous/config.json"; fi
rollback() {
  code=$?; trap - ERR; set +e
  systemctl stop openscience-synclip-image.timer
  for name in service timer; do
    path=${!name}
    if [[ -f "$bundle/previous/$name" ]]; then install -m 0644 "$bundle/previous/$name" "$path"; else rm -f -- "$path"; fi
  done
  if [[ -f "$bundle/previous/config.json" ]]; then install -m 0600 "$bundle/previous/config.json" "$config"; else rm -f -- "$config"; fi
  if [[ -f "$bundle/previous/ready" ]]; then mv -- "$bundle/previous/ready" "$ready"; fi
  systemctl daemon-reload
  case "$prior_enabled" in
    enabled) systemctl enable openscience-synclip-image.timer;;
    enabled-runtime) systemctl enable --runtime openscience-synclip-image.timer;;
    *) systemctl disable openscience-synclip-image.timer;;
  esac
  if [[ $prior_active == active ]]; then systemctl start openscience-synclip-image.timer; fi
  echo 'SYNCLIP_INSTALL_FAILED; prior configuration and timer restoration attempted' >&2
  exit "$code"
}
trap rollback ERR
if [[ $prior_active == active ]]; then systemctl stop openscience-synclip-image.timer; fi
if [[ -f $ready ]]; then mv -- "$ready" "$bundle/previous/ready"; fi
# Readers never see a partially written config. The same host lock excludes all
# broker execution until the matching config, service and timer are installed.
node --input-type=module - "$bundle/infra/codex-image-runner/core.mjs" "$bundle/config.json" "$config" <<'NODE'
import { pathToFileURL } from 'node:url';
const { atomicWrite, safeRead } = await import(pathToFileURL(process.argv[2]).href);
await atomicWrite(process.argv[4], await safeRead(process.argv[3], 16384), 0o600);
NODE
install -m 0644 "$bundle/service" "$service"
install -m 0644 "$bundle/timer" "$timer"
systemctl daemon-reload
if [[ ${6:-} != --defer-timers ]]; then systemctl enable --now openscience-synclip-image.timer; fi
trap - ERR
echo "SYNCLIP_IMAGE_PROVIDER_INSTALLED source=$sha"
