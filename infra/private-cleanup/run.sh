#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/opt/openscience-private-cleanup
[[ $(id -u) == 0 && -d $root && ! -L $root && $(readlink -f -- "$root") == "$root" ]] || exit 65
[[ -f $root/runner.lock && ! -L $root/runner.lock && -f $root/paused.units && ! -L $root/paused.units ]] || exit 65
[[ $(stat -c '%u:%a' "$root/paused.units") == '0:600' ]] || exit 65
exec 6<"$root/runner.lock"
flock -n 6 || exit 0
node=/usr/bin/node
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $bundle =~ ^/opt/openscience-private-cleanup/releases/[a-f0-9]{40}$ ]] || exit 65
runner="$bundle/runner.mjs"
services=(openscience-chatgpt-web-image.service openscience-chatgpt-web-science-review.service openscience-codex-image.service openscience-video-runner.service)
timers=(openscience-chatgpt-web-image.timer openscience-chatgpt-web-science-review.timer)
prior=()
locks=()
state() { /usr/bin/systemctl show --property=ActiveState --value "$1"; }
installed() { [[ $(/usr/bin/systemctl show --property=LoadState --value "$1") != not-found ]]; }
known() { local candidate=$1 unit; for unit in "${services[@]}" "${timers[@]}"; do [[ $candidate != "$unit" ]] || return 0; done; return 1; }
save_prior() {
  local temporary
  temporary=$(mktemp "$root/paused.XXXXXXXX")
  chmod 0600 "$temporary"
  if ((${#prior[@]})); then printf '%s\n' "${prior[@]}" > "$temporary"; fi
  mv -T -- "$temporary" "$root/paused.units"
}
remember() {
  local unit=$1 existing
  for existing in "${prior[@]}"; do [[ $existing != "$unit" ]] || return 0; done
  prior+=("$unit"); save_prior
}
while IFS= read -r unit; do [[ -z $unit ]] && continue; known "$unit" || exit 65; prior+=("$unit"); done < "$root/paused.units"
resume() {
  local code=$? unit current
  trap - EXIT INT TERM
  for current in "${locks[@]}"; do flock -u "$current" || true; done
  local retained=()
  for unit in "${prior[@]}"; do
    current=$(state "$unit") || { retained+=("$unit"); continue; }
    if [[ $unit == *.service && $current != inactive && $current != failed ]]; then
      # A draining runner may outlive this bounded pass. Retain the restart obligation.
      retained+=("$unit")
    elif ! /usr/bin/systemctl start --no-block "$unit"; then retained+=("$unit"); fi
  done
  prior=("${retained[@]}"); save_prior
  exit "$code"
}
trap resume EXIT
trap 'exit 1' INT TERM

if "$node" "$runner" --has-work; then work=true; else result=$?; [[ $result == 3 ]] || exit "$result"; work=false; fi
if [[ $work == false ]]; then exit 0; fi
defer() { "$node" "$runner" --pending || true; exit 0; }

# Stop only timers that were actually running. Browser oneshots finish naturally:
# they do not have a SIGTERM drain handler, and their child operators may be active.
for unit in "${timers[@]}"; do
  installed "$unit" || continue
  current=$(state "$unit") || defer
  case "$current" in active|activating|reloading) remember "$unit"; /usr/bin/systemctl stop "$unit" || defer ;; inactive|failed) ;; *) defer ;; esac
done
for unit in "${services[@]}"; do
  installed "$unit" || continue
  current=$(state "$unit") || defer
  case "$current" in active|activating|reloading) remember "$unit" ;; inactive|failed) ;; *) defer ;; esac
done
drain_deadline=$((SECONDS + 60))
wait_idle() {
  local current
  while :; do
    current=$(state "$1") || return 1
    [[ $current == inactive || $current == failed ]] && return 0
    ((SECONDS < drain_deadline)) || return 1
    sleep 2
  done
}
for unit in openscience-chatgpt-web-image.service openscience-chatgpt-web-science-review.service; do installed "$unit" || continue; wait_idle "$unit" || defer; done
for unit in openscience-codex-image.service openscience-video-runner.service; do
  installed "$unit" || continue
  current=$(state "$unit") || defer
  if [[ $current == active || $current == activating || $current == reloading ]]; then
    # Signal only the identified Node process, never flock, its Docker children or a cgroup.
    "$node" "$runner" --signal "$unit" || { wait_idle "$unit" || defer; }
    wait_idle "$unit" || defer
  fi
done
# Recheck the drained services before locking. Never call stop on a service:
# an operator could restart it between this observation and the stop command.
# Any concurrent restart must acquire the same provider lock before doing work.
for unit in "${services[@]}"; do
  installed "$unit" || continue
  current=$(state "$unit") || defer
  [[ $current == inactive || $current == failed ]] || defer
done

lock_file() {
  local file=$1 fd=$2
  [[ -f $file && ! -L $file && $(readlink -f -- "$file") == "$file" ]] || return 1
  case "$fd" in 7) exec 7<"$file" ;; 8) exec 8<"$file" ;; 9) exec 9<"$file" ;; 10) exec 10<"$file" ;; 11) exec 11<"$file" ;; *) return 1 ;; esac
  [[ $(readlink -- "/proc/$$/fd/$fd") == "$file" ]] || return 1
  flock -n "$fd" || return 1
  locks+=("$fd")
}
# Existing provider lock order: image → science → shared, then independent Codex/video.
if [[ -e /opt/openscience-chatgpt-browser ]]; then
  lock_file /opt/openscience-chatgpt-browser/jobs/image-runner.lock 7 || defer
  lock_file /opt/openscience-chatgpt-browser/jobs/science-review-runner.lock 8 || defer
  lock_file /opt/openscience-chatgpt-browser/jobs/runner.lock 9 || defer
fi
if [[ -e /opt/openscience-codex ]]; then lock_file /opt/openscience-codex/runner.lock 10 || defer; fi
if [[ -e /opt/openscience-video ]]; then lock_file /opt/openscience-video/runner.lock 11 || defer; fi
PRIVATE_CLEANUP_LOCKS_HELD=1 "$node" "$runner" --sweep
