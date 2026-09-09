#!/usr/bin/env bash
set -euo pipefail
[[ ${1:-} == --confirm && ( $# == 1 || ( $# == 2 && $2 == --resume-build ) ) ]] || exit 64
[[ $(id -u) == 0 ]] || exit 65
source_root=$(cd "$(dirname "$0")" && pwd)
root=/opt/openscience-chatgpt-browser
if [[ -e "$root" ]]; then
  [[ ${2:-} == --resume-build && ! -e /etc/systemd/system/openscience-chatgpt-browser-bridge.service ]] || exit 66
  ! docker container inspect openscience-chatgpt-browser >/dev/null 2>&1 || exit 66
fi
install -d -m 0755 "$root" "$root/scripts"
install -d -o 11040 -g 11040 -m 0700 "$root/profile" "$root/downloads" "$root/egress" "$root/control"
for file in Dockerfile start.sh relay.mjs host.mjs seccomp.json; do install -m 0444 "$source_root/$file" "$root/scripts/$file"; done
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
  --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 --shm-size 256m \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,mode=1777 \
  -v "$root/profile:/profile:rw" -v "$root/downloads:/profile/Downloads:rw" \
  -v "$root/egress:/egress:ro" -v "$root/control:/control:rw" \
  openscience-chatgpt-browser:initial
echo 'BROWSER_STARTED UI=127.0.0.1:6081; login and image generation not yet observed'
