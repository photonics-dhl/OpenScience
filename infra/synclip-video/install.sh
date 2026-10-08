#!/usr/bin/env bash
set -euo pipefail
[[ ( $# == 5 || ( $# == 6 && ${6:-} == --defer-timer ) ) && ${1:-} == --confirm && ${2:-} == --source && ${4:-} == --renderer-image ]] || { echo 'Usage: install.sh --confirm --source /opt/openscience-releases/<full-sha> --renderer-image <sha256:id> [--defer-timer]' >&2; exit 64; }
[[ $(id -u) == 0 ]] || exit 65
source_root=$(readlink -f -- "$3"); sha=$(basename -- "$source_root"); renderer_image=$5
[[ $sha =~ ^[a-f0-9]{40}$ && $source_root == "/opt/openscience-releases/$sha" && $renderer_image =~ ^([a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$ ]] || exit 66
node "$source_root/scripts/release-input-manifest.mjs" verify --root "$source_root" --sha "$sha"
[[ -f "$source_root/infra/synclip-video/broker.mjs" && -f "$source_root/packages/ai-gateway/dist/synclip-video-api.js" && -f "$source_root/packages/ai-gateway/dist/synclip-audio-api.js" ]] || exit 66
root=/opt/openscience-synclip-video; bundle="$root/releases/$sha"; key=/opt/openscience-synclip/api-key
service=/etc/systemd/system/openscience-synclip-video.service; timer=/etc/systemd/system/openscience-synclip-video.timer; config="$root/config.json"
# This is an initial installer. Reject an existing installation before creating a bundle.
[[ ! -e "$service" && ! -e "$timer" && ! -e "$config" ]] || { echo SYNCLIP_VIDEO_EXISTING_INSTALL >&2; exit 69; }
[[ -f "$key" && ! -L "$key" && $(stat -c '%u %a' "$key") == '0 600' ]] || { echo SYNCLIP_SHARED_KEY_UNAVAILABLE >&2; exit 67; }
docker image inspect "$renderer_image" >/dev/null
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint /usr/bin/ffmpeg "$renderer_image" -version >/dev/null 2>&1 || { echo SYNCLIP_VIDEO_RENDERER_UNAVAILABLE >&2; exit 66; }
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint /usr/bin/ffprobe "$renderer_image" -version >/dev/null 2>&1 || { echo SYNCLIP_VIDEO_PROBE_UNAVAILABLE >&2; exit 66; }
install -d -o root -g root -m 0700 "$root" "$root/releases" "$root/spool" "$root/private"
install -d -o 1000 -g 1000 -m 0700 "$root/spool/inbox"
install -d -o root -g 1000 -m 2750 "$root/spool/results"
[[ ! -e "$bundle" && ! -L "$bundle" ]] || { echo SYNCLIP_VIDEO_BUNDLE_EXISTS >&2; exit 69; }
install -d -m 0755 "$bundle/infra/synclip-video" "$bundle/packages/ai-gateway/dist"
install -m 0444 "$source_root/infra/synclip-video/broker.mjs" "$bundle/infra/synclip-video/broker.mjs"
install -m 0444 "$source_root/infra/synclip-video/image-reference.mjs" "$bundle/infra/synclip-video/image-reference.mjs"
for module in synclip-video-api synclip-audio-api synclip-image-api codex-image-protocol image ocr errors; do
  install -m 0444 "$source_root/packages/ai-gateway/dist/$module.js" "$bundle/packages/ai-gateway/dist/$module.js"
done
node --input-type=module - "$bundle/infra/synclip-video/broker.mjs" <<'NODE'
import { pathToFileURL } from 'node:url';
const broker = await import(pathToFileURL(process.argv[2]).href);
if (typeof broker.runSynclipVideoBrokerOnce !== 'function' || typeof broker.validateSynclipVideoBrokerConfig !== 'function') throw Error('SYNCLIP_VIDEO_RUNTIME_INVALID');
NODE
printf '%s\n' "$sha" > "$bundle/source-id"; chmod 0444 "$bundle/source-id"
printf '{"inbox":"%s/spool/inbox","results":"%s/spool/results","privateRoot":"%s/private","keyPath":"%s","rendererImage":"%s","model":"ltx23","resolution":"720p","referenceMode":"synclip-receipt","adminModelsEnabled":false,"adapterRevision":"synclip-video-v2"}\n' "$root" "$root" "$root" "$key" "$renderer_image" > "$bundle/config.json"
chmod 0600 "$bundle/config.json"
install -m 0600 "$bundle/config.json" "$config"
cat > "$bundle/service" <<EOF
[Unit]
Description=OpenScience Synclip commercial video broker
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
User=root
Group=1000
ExecStart=/usr/bin/flock -n $root/runner.lock /usr/bin/node $bundle/infra/synclip-video/broker.mjs --config $config
TimeoutStartSec=1860
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$root
ReadOnlyPaths=$bundle $key $config
UMask=0027
EOF
cat > "$bundle/timer" <<EOF
[Unit]
Description=Poll OpenScience Synclip commercial video jobs
[Timer]
OnBootSec=10
OnUnitActiveSec=15
AccuracySec=1
Unit=openscience-synclip-video.service
[Install]
WantedBy=timers.target
EOF
chmod 0444 "$bundle/service" "$bundle/timer"
: > "$root/runner.lock"; chown root:root "$root/runner.lock"; chmod 0600 "$root/runner.lock"
install -m 0644 "$bundle/service" "$service"; install -m 0644 "$bundle/timer" "$timer"; systemctl daemon-reload
if [[ ${6:-} != --defer-timer ]]; then systemctl enable --now openscience-synclip-video.timer; fi
echo "SYNCLIP_VIDEO_PROVIDER_INSTALLED source=$sha"
