#!/usr/bin/env bash
# install-disk-cache-maintenance.sh — sync the versioned cache-maintenance
# artifacts to the ECS host, and detect drift afterwards.
#
# Mirrors the deploy-cloudflare-tunnel.ps1 precedent: versioned unit + script in
# the repository are the source of truth, and a controlled installer pushes them
# to the host (backup to /var/lib/openscience/*.pre-deploy, bash -n and
# systemd-analyze verify before enabling, read-back verification after).
#
#   install-disk-cache-maintenance.sh            # status: report drift (read-only)
#   install-disk-cache-maintenance.sh --confirm  # deploy the versioned artifacts
#
# The timer itself only reclaims regenerable caches and never touches releases,
# volumes, containers, databases or the live application.
set -euo pipefail

usage() {
  echo "usage: $0 [--confirm]" >&2
  exit 64
}

CONFIRM=0
case "${1:-}" in
  '') ;;
  --confirm) CONFIRM=1 ;;
  *) usage ;;
esac
[ "$#" -le 1 ] || usage

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# .env lives in the configuration root (the main checkout), which may differ
# from this delivery worktree; ssh-run.sh resolves it the same way.
CONFIG_ROOT="${XGS_CONFIG_ROOT:-$PROJECT_ROOT}"
MAINTENANCE="$PROJECT_ROOT/infra/scripts/disk-cache-maintenance.sh"
UNIT_SERVICE="$PROJECT_ROOT/infra/systemd/openscience-disk-cache-maintenance.service"
UNIT_TIMER="$PROJECT_ROOT/infra/systemd/openscience-disk-cache-maintenance.timer"

for f in "$MAINTENANCE" "$UNIT_SERVICE" "$UNIT_TIMER"; do
  [ -f "$f" ] || { echo "missing versioned artifact: $f" >&2; exit 66; }
done
[ -f "$CONFIG_ROOT/.env" ] || { echo "missing .env in configuration root: $CONFIG_ROOT" >&2; exit 66; }

SSH_RUN="$PROJECT_ROOT/infra/scripts/ssh-run.sh"
remote() {
  local confirm_flag=()
  [ "$CONFIRM" -eq 1 ] && confirm_flag=(--confirm)
  XGS_CONFIG_ROOT="$CONFIG_ROOT" "$SSH_RUN" "${confirm_flag[@]}" "$1"
}

local_hashes() {
  sha256sum "$MAINTENANCE" "$UNIT_SERVICE" "$UNIT_TIMER" | awk '{print $1}'
}

read_remote() {
  cat <<'REMOTE'
set -uo pipefail
S=/usr/local/sbin/openscience-disk-cache-maintenance
U=/etc/systemd/system/openscience-disk-cache-maintenance.service
T=/etc/systemd/system/openscience-disk-cache-maintenance.timer
for f in "$S" "$U" "$T"; do
  if [ -f "$f" ]; then printf 'PRESENT %s %s %s\n' "$(stat -c %a "$f")" "$(sha256sum "$f" | cut -d' ' -f1)" "$f"
  else printf 'ABSENT - - %s\n' "$f"; fi
done
printf 'TIMER_ENABLED %s\n' "$(systemctl is-enabled openscience-disk-cache-maintenance.timer 2>&1 || true)"
printf 'TIMER_ACTIVE %s\n' "$(systemctl is-active openscience-disk-cache-maintenance.timer 2>&1 || true)"
systemctl list-timers openscience-disk-cache-maintenance.timer --no-pager 2>/dev/null | sed -n 2p | sed 's/^/NEXT /'
REMOTE
}

if [ "$CONFIRM" -eq 0 ]; then
  echo "=== plan (no changes; re-run with --confirm to deploy) ==="
  echo "  install $MAINTENANCE -> /usr/local/sbin/openscience-disk-cache-maintenance (0755)"
  echo "  install $UNIT_SERVICE -> /etc/systemd/system/ (0644)"
  echo "  install $UNIT_TIMER -> /etc/systemd/system/ (0644)"
  echo "  backup existing to /var/lib/openscience/<name>.pre-deploy"
  echo "  systemd-analyze verify + bash -n before enabling; enable --now the timer; one verification run"
  echo "=== local (versioned) sha256 ==="
  local_hashes | sed 's/^/  /'
  echo "=== remote state ==="
  remote "$(read_remote)" | sed 's/^/  /'
  exit 0
fi

# --- build the payload bundle -------------------------------------------------
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/payload"
mkdir -p "$STAGE"
install -m 0755 "$MAINTENANCE" "$STAGE/disk-cache-maintenance.sh"
install -m 0644 "$UNIT_SERVICE" "$STAGE/openscience-disk-cache-maintenance.service"
install -m 0644 "$UNIT_TIMER" "$STAGE/openscience-disk-cache-maintenance.timer"
( cd "$STAGE" && sha256sum disk-cache-maintenance.sh openscience-disk-cache-maintenance.service openscience-disk-cache-maintenance.timer > SHA256SUMS )
BUNDLE="$(cd "$STAGE" && tar czf - . | base64 -w0)"
[ -n "$BUNDLE" ] || { echo "failed to build payload bundle" >&2; exit 70; }

REMOTE_INSTALL=$(cat <<REMOTE
set -euo pipefail
D=/tmp/xgs-disk-cache-maintenance
BACKUP=/var/lib/openscience
S=/usr/local/sbin/openscience-disk-cache-maintenance
U=/etc/systemd/system/openscience-disk-cache-maintenance.service
T=/etc/systemd/system/openscience-disk-cache-maintenance.timer

printf %s '$BUNDLE' | base64 -d | tar xzf - -C "\$D" 2>/dev/null || {
  mkdir -p "\$D"; printf %s '$BUNDLE' | base64 -d | tar xzf - -C "\$D";
}
cd "\$D"
sha256sum -c SHA256SUMS
bash -n disk-cache-maintenance.sh

install -d -m 0755 "\$BACKUP"
for f in "\$S" "\$U" "\$T"; do
  if [ -f "\$f" ]; then cp -a "\$f" "\$BACKUP/\$(basename "\$f").pre-deploy"; echo "BACKUP \$(basename "\$f")"; fi
done

install -m 0755 disk-cache-maintenance.sh "\$S"
install -m 0644 openscience-disk-cache-maintenance.service "\$U"
install -m 0644 openscience-disk-cache-maintenance.timer "\$T"

systemd-analyze verify "\$U" "\$T"
systemctl daemon-reload
systemctl enable --now openscience-disk-cache-maintenance.timer >/dev/null 2>&1 || systemctl enable --now openscience-disk-cache-maintenance.timer
systemctl start openscience-disk-cache-maintenance.service
sleep 2
echo "--- verification run ---"
journalctl -u openscience-disk-cache-maintenance.service -n 8 --no-pager | tail -8
echo "--- read-back ---"
for f in "\$S" "\$U" "\$T"; do printf 'INSTALLED %s %s %s\n' "\$(stat -c %a "\$f")" "\$(sha256sum "\$f" | cut -d' ' -f1)" "\$f"; done
printf 'TIMER_ENABLED %s\n' "\$(systemctl is-enabled openscience-disk-cache-maintenance.timer)"
printf 'TIMER_ACTIVE %s\n' "\$(systemctl is-active openscience-disk-cache-maintenance.timer)"
REMOTE
)

echo "=== deploying versioned artifacts ==="
remote "$REMOTE_INSTALL"

echo "=== drift check (local versioned vs installed) ==="
mapfile -t LOCAL < <(local_hashes)
mapfile -t REMOTE_HASHES < <(remote "$(read_remote)" | awk '/^PRESENT/{print $3}')
if [ "${#LOCAL[@]}" -eq 3 ] && [ "${#REMOTE_HASHES[@]}" -eq 3 ] \
  && [ "${LOCAL[0]}" = "${REMOTE_HASHES[0]}" ] \
  && [ "${LOCAL[1]}" = "${REMOTE_HASHES[1]}" ] \
  && [ "${LOCAL[2]}" = "${REMOTE_HASHES[2]}" ]; then
  echo "NO_DRIFT installed artifacts match the repository"
else
  echo "DRIFT_DETECTED installed artifacts differ from the repository" >&2
  echo "  local:  ${LOCAL[*]:-none}" >&2
  echo "  remote: ${REMOTE_HASHES[*]:-none}" >&2
  exit 70
fi
