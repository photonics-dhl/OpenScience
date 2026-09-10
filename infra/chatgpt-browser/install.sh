#!/usr/bin/env bash
set -euo pipefail
if [[ ${1:-} == --confirm-provider ]]; then
  [[ $# == 5 && $2 == --source && $4 == --renderer-image ]] || { echo 'Usage: install.sh --confirm-provider --source <immutable release> --renderer-image <sha256:id>'; exit 64; }
  [[ $(id -u) == 0 ]] || exit 65
  source_release=$(readlink -f -- "$3"); release_sha=$(basename -- "$source_release"); renderer_image=$5
  [[ $release_sha =~ ^[a-f0-9]{40}$ && $source_release == "/opt/openscience-releases/$release_sha" && $renderer_image =~ ^([a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$ ]] || exit 66
  node "$source_release/scripts/release-input-manifest.mjs" verify --root "$source_release" --sha "$release_sha"
  [[ -f "$source_release/packages/ai-gateway/dist/index.js" && ! -L "$source_release/packages/ai-gateway/dist/index.js" ]] || { echo 'Built AI Gateway dist is required in the immutable release'; exit 66; }
  docker container inspect openscience-chatgpt-browser >/dev/null
  docker image inspect "$renderer_image" >/dev/null
  root=/opt/openscience-chatgpt-browser; bundle="$root/releases/$release_sha"
  for target in "$root" "$root/jobs" "$root/spool" "$root/spool/inbox" "$root/spool/results" "$root/private" "$root/releases"; do [[ ! -L $target ]] || exit 67; done
  install -d -m 0755 "$root/spool" "$root/releases"
  install -d -o 1000 -g 1000 -m 0700 "$root/spool/inbox"
  install -d -o root -g 1000 -m 2750 "$root/spool/results"
  install -d -o root -g root -m 0700 "$root/private"
  [[ $(stat -c '%u %g %a' "$root/jobs") == '11040 11040 700' ]] || exit 68
  if [[ -e "$root/jobs/runner.lock" ]]; then
    [[ -f "$root/jobs/runner.lock" && ! -L "$root/jobs/runner.lock" ]] || exit 68
  else
    install -o 11040 -g 11040 -m 0600 /dev/null "$root/jobs/runner.lock"
  fi
  exec 9<>"$root/jobs/runner.lock"
  flock -n 9 || { echo 'Browser operator is active; provider install did not change it'; exit 71; }
  [[ ! -e $bundle ]] || { echo 'Web image bundle already exists; inspect before reuse'; exit 69; }
  install -d -m 0755 "$bundle/infra/chatgpt-browser" "$bundle/infra/codex-image-runner" "$bundle/packages/ai-gateway/dist"
  install -m 0444 "$source_release/infra/chatgpt-browser/broker.mjs" "$source_release/infra/chatgpt-browser/runner.cjs" "$bundle/infra/chatgpt-browser/"
  install -m 0444 "$source_release/infra/codex-image-runner/core.mjs" "$bundle/infra/codex-image-runner/core.mjs"
  find "$source_release/packages/ai-gateway/dist" -maxdepth 1 -type f -name '*.js' -exec install -m 0444 -t "$bundle/packages/ai-gateway/dist" {} +
  install -d -o root -g 11040 -m 0750 "$root/jobs/provider"
  install -o root -g 11040 -m 0440 "$source_release/infra/chatgpt-browser/runner.cjs" "$root/jobs/provider/runner.cjs"
  config="$root/config-$release_sha.json"
  printf '{"inbox":"%s/spool/inbox","results":"%s/spool/results","privateRoot":"%s/private","jobs":"%s/jobs","browserContainer":"openscience-chatgpt-browser","rendererImage":"%s"}\n' "$root" "$root" "$root" "$root" "$renderer_image" > "$config"
  chmod 0600 "$config"
  service=/etc/systemd/system/openscience-chatgpt-web-image.service
  timer=/etc/systemd/system/openscience-chatgpt-web-image.timer
  [[ ! -L $service && ! -L $timer ]] || exit 70
  cat > "$service" <<EOF
[Unit]
Description=OpenScience ChatGPT web image spool broker
After=docker.service openscience-chatgpt-browser-bridge.service
Requires=docker.service openscience-chatgpt-browser-bridge.service
[Service]
Type=oneshot
ExecStart=/usr/bin/flock -n $root/jobs/runner.lock /usr/bin/node $bundle/infra/chatgpt-browser/broker.mjs --config $config
TimeoutStartSec=660
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$root
InaccessiblePaths=$root/profile $root/downloads $root/egress $root/control
UMask=0027
EOF
  cat > "$timer" <<EOF
[Unit]
Description=Poll OpenScience ChatGPT web image spool
[Timer]
OnBootSec=5
OnUnitActiveSec=15
AccuracySec=1
Unit=openscience-chatgpt-web-image.service
[Install]
WantedBy=timers.target
EOF
  chmod 0644 "$service" "$timer"
  systemctl daemon-reload
  systemctl enable --now openscience-chatgpt-web-image.timer
  echo "CHATGPT_WEB_IMAGE_PROVIDER_INSTALLED source=$release_sha"
  exit 0
fi
[[ ${1:-} == --confirm && ( $# == 1 || ( $# == 2 && $2 == --resume-build ) ) ]] || exit 64
[[ $(id -u) == 0 ]] || exit 65
source_root=$(cd "$(dirname "$0")" && pwd)
root=/opt/openscience-chatgpt-browser
if [[ -e "$root" ]]; then
  [[ ${2:-} == --resume-build && ! -e /etc/systemd/system/openscience-chatgpt-browser-bridge.service ]] || exit 66
  ! docker container inspect openscience-chatgpt-browser >/dev/null 2>&1 || exit 66
fi
# systemd resolves the host account even when User is numeric.
if ! getent group 11040 >/dev/null; then groupadd --gid 11040 xgs-browser; fi
if ! getent passwd 11040 >/dev/null; then
  useradd --uid 11040 --gid 11040 --no-create-home --home-dir "$root/profile" --shell /usr/sbin/nologin xgs-browser
fi
[[ $(getent passwd 11040 | cut -d: -f1) == xgs-browser && $(getent group 11040 | cut -d: -f1) == xgs-browser ]] || exit 67
install -d -m 0755 "$root" "$root/scripts"
install -d -o 11040 -g 11040 -m 0700 "$root/profile" "$root/downloads" "$root/egress" "$root/control" "$root/jobs"
for file in Dockerfile start.sh relay.mjs runner.cjs host.mjs seccomp.json; do install -m 0444 "$source_root/$file" "$root/scripts/$file"; done
docker build --network host --build-arg http_proxy= --build-arg https_proxy= --build-arg HTTP_PROXY= --build-arg HTTPS_PROXY= \
  -t openscience-chatgpt-browser:initial "$root/scripts"
cat > /etc/systemd/system/openscience-chatgpt-browser-bridge.service <<EOF
[Unit]
Description=Private ChatGPT browser UI and allowlisted egress
After=network.target
[Service]
User=11040
Group=11040
ExecStart=/usr/bin/node $root/scripts/host.mjs
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$root/egress
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now openscience-chatgpt-browser-bridge
docker run -d --name openscience-chatgpt-browser --init --restart unless-stopped \
  --network none --user 11040:11040 --read-only --cap-drop ALL \
  --security-opt no-new-privileges --security-opt "seccomp=$root/scripts/seccomp.json" \
  --memory 4g --memory-swap 4g --cpus 4 --pids-limit 1024 --shm-size 512m \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,mode=1777 \
  -v "$root/jobs:/jobs:rw" -v "$root/profile:/profile:rw" -v "$root/downloads:/profile/Downloads:rw" \
  -v "$root/egress:/egress:ro" -v "$root/control:/control:rw" \
  openscience-chatgpt-browser:initial
echo 'BROWSER_STARTED UI=127.0.0.1:6081; login and image generation not yet observed'
