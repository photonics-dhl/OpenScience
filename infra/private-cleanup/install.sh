#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 && $# == 2 && $1 == --source ]] || { echo 'Usage: install.sh --source <existing release directory>'; exit 64; }
source_dir=$(readlink -f -- "$2")
source_sha=$(basename -- "$source_dir")
[[ $2 == "$source_dir" && $source_sha =~ ^[a-f0-9]{40}$ && $source_dir == "/opt/openscience-releases/$source_sha" ]] || exit 66
[[ -f $source_dir/.release-source && ! -L $source_dir/.release-source && $(cat -- "$source_dir/.release-source") == "$source_sha" ]] || exit 66
root=/opt/openscience-private-cleanup
bundle="$root/releases/$source_sha"
backup="$root/backups/$source_sha"
for binary in /usr/bin/node /usr/bin/flock /usr/bin/systemctl; do [[ -x $binary ]] || { echo 'Existing Node, flock and systemd are required'; exit 65; }; done
for file in runner.mjs run.sh; do [[ -f $source_dir/infra/private-cleanup/$file && ! -L $source_dir/infra/private-cleanup/$file ]] || exit 66; done
for path in "$root" "$root/inbox" "$root/results" "$root/state" "$root/releases" "$bundle" "$root/backups" "$backup" "$root/runner.lock" "$root/paused.units"; do [[ ! -L $path ]] || exit 67; done
[[ $(readlink -f /opt) == /opt ]] || exit 67
install -d -o root -g root -m 0700 "$root" "$root/state" "$root/releases" "$root/backups"
install -d -o 1000 -g 1000 -m 0700 "$root/inbox"
install -d -o root -g 1000 -m 2750 "$root/results"
if [[ ! -e $root/runner.lock ]]; then install -o root -g root -m 0600 /dev/null "$root/runner.lock"; fi
if [[ ! -e $root/paused.units ]]; then install -o root -g root -m 0600 /dev/null "$root/paused.units"; fi
[[ -f $root/runner.lock && -f $root/paused.units ]] || exit 67
exec 6<"$root/runner.lock"
/usr/bin/flock -w 75 6 || { echo 'Cleanup is still active; installation deferred without interrupting it'; exit 75; }
if [[ -e $bundle ]]; then
  for file in runner.mjs run.sh; do
    [[ -f $bundle/$file && ! -L $bundle/$file ]] && cmp -s -- "$source_dir/infra/private-cleanup/$file" "$bundle/$file" || { echo 'Existing cleanup bundle differs; it was not overwritten'; exit 66; }
  done
else
  install -d -o root -g root -m 0700 "$bundle"
  install -o root -g root -m 0444 "$source_dir/infra/private-cleanup/runner.mjs" "$bundle/runner.mjs"
  install -o root -g root -m 0500 "$source_dir/infra/private-cleanup/run.sh" "$bundle/run.sh"
fi
service=/etc/systemd/system/openscience-private-cleanup.service
timer=/etc/systemd/system/openscience-private-cleanup.timer
[[ ! -L $service && ! -L $timer ]] || exit 67
install -d -o root -g root -m 0700 "$backup"
for unit_path in "$service" "$timer"; do
  filename=$(basename -- "$unit_path")
  [[ ! -L $backup/$filename && ! -L $backup/$filename.absent ]] || exit 67
  if [[ ! -e $backup/$filename && ! -e $backup/$filename.absent ]]; then
    if [[ -f $unit_path ]]; then install -o root -g root -m 0600 "$unit_path" "$backup/$filename"; else install -o root -g root -m 0600 /dev/null "$backup/$filename.absent"; fi
  fi
done
cat > "$service" <<EOF
[Unit]
Description=Erase authorized OpenScience private host job copies
After=docker.service
[Service]
Type=oneshot
ExecStart=$bundle/run.sh
TimeoutStartSec=1200
TimeoutStopSec=90
SendSIGKILL=no
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectControlGroups=true
ReadWritePaths=/opt/openscience-private-cleanup
ReadWritePaths=-/opt/openscience-codex/inbox -/opt/openscience-codex/results -/opt/openscience-codex/private
ReadWritePaths=-/opt/openscience-video/inbox -/opt/openscience-video/results -/opt/openscience-video/private
ReadWritePaths=-/opt/openscience-chatgpt-browser/spool/inbox -/opt/openscience-chatgpt-browser/spool/results -/opt/openscience-chatgpt-browser/private -/opt/openscience-chatgpt-browser/jobs
ReadWritePaths=-/opt/openscience-chatgpt-browser/review-spool/inbox -/opt/openscience-chatgpt-browser/review-spool/results -/opt/openscience-chatgpt-browser/review-private
InaccessiblePaths=-/opt/openscience-chatgpt-browser/profile -/opt/openscience-chatgpt-browser/downloads -/opt/openscience-chatgpt-browser/egress -/opt/openscience-chatgpt-browser/control
UMask=0077
EOF
cat > "$timer" <<'EOF'
[Unit]
Description=Resume pending OpenScience private job cleanup
[Timer]
OnBootSec=90
OnUnitInactiveSec=60
AccuracySec=5
Unit=openscience-private-cleanup.service
[Install]
WantedBy=timers.target
EOF
chmod 0644 "$service" "$timer"
/usr/bin/systemctl daemon-reload
/usr/bin/systemctl enable --now openscience-private-cleanup.timer
echo 'Private cleanup timer installed; no cleanup request was submitted by this installer.'
