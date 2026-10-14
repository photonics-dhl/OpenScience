#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
[[ $(uname -s) == Linux && $EUID == 0 ]] || { printf 'Run on the server as root.\n' >&2; exit 64; }
release_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $release_dir =~ ^/opt/openscience-development/langfuse/releases/[a-f0-9]{7,40}$ ]] || { printf 'Use an installed Langfuse release.\n' >&2; exit 64; }
config=/etc/openscience-development/langfuse
docker_cmd=(env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin COMPOSE_PARALLEL_LIMIT=2 docker --host unix:///var/run/docker.sock)
compose=("${docker_cmd[@]}" compose --project-name openscience-development-langfuse --project-directory "$release_dir" --env-file "$config/runtime.env" -f "$release_dir/compose.yaml")
# The existing audit connector has an independent restart policy. Stopping the
# backend while it is running creates an uncertain/pending ingestion boundary.
require_telemetry_stopped() {
  local consumers description
  # A successful exact-name inventory establishes absence. Inspect failure must
  # not masquerade as absence; restart/paused/transitional states are active.
  if ! consumers=$("${docker_cmd[@]}" ps --all --filter 'name=^/openscience-development-gateway-audit$' --format '{{.ID}}'); then
    printf 'Telemetry is not confirmed stopped: inventory failed. No backend services changed.\n' >&2; exit 75
  fi
  [[ -n $consumers ]] || return 0
  if [[ ! $consumers =~ ^[a-f0-9]{12,64}$ ]] || ! description=$("${docker_cmd[@]}" inspect --type container "$consumers" \
    --format '{{.Name}}|{{.State.Status}}|{{.State.Running}}|{{.State.Paused}}|{{.State.Restarting}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}'); then
    printf 'Telemetry is not confirmed stopped: identity/inspection failed. No backend services changed.\n' >&2; exit 75
  fi
  [[ $description == '/openscience-development-gateway-audit|exited|false|false|false|openscience-development-telemetry|gateway-audit' ]] \
    || { printf 'Telemetry is not confirmed stopped. Stop the audit connector first; preserve its checkpoint and pending receipt. No backend services changed.\n' >&2; exit 75; }
}
case "${1:-}" in
  status)
    [[ $# == 1 ]] || exit 64
    "${compose[@]}" ps
    "${docker_cmd[@]}" ps --all --filter 'name=^/openscience-development-gateway-audit$' --format 'telemetry={{.Status}}'
    ;;
  start)
    [[ $# == 2 && $2 == --confirm ]] || exit 64
    root=/opt/openscience-development/langfuse
    [[ ! -e $root/current || -L $root/current ]] || { printf 'Unexpected current path; no services changed.\n' >&2; exit 1; }
    if [[ -L $root/current && $(readlink -f "$root/current") != "$release_dir" ]]; then
      printf 'Refusing an older release against current data volumes. Restore matching data separately.\n' >&2
      exit 1
    fi
    "${compose[@]}" up -d --pull never --wait --wait-timeout 300
    [[ ! -e $root/current || -L $root/current ]] || exit 1
    if [[ -L $root/current && $(readlink "$root/current") != "$release_dir" ]]; then readlink "$root/current" > "$release_dir/previous-release"; fi
    ln -s -- "$release_dir" "$root/.current-$$"
    mv -Tf -- "$root/.current-$$" "$root/current"
    "${compose[@]}" images --format json > "$release_dir/images.json"
    ;;
  stop)
    [[ $# == 2 && $2 == --confirm ]] || exit 64
    require_telemetry_stopped
    # No down -v, prune, rm, or operations on a different Compose project.
    "${compose[@]}" stop
    ;;
  backup)
    [[ $# == 2 && $2 == --confirm ]] || exit 64
    require_telemetry_stopped
    backup_root=/opt/openscience-development/langfuse/backups
    install -d -m 0700 "$backup_root"
    backup=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ).XXXXXXXX")
    running_list=$("${compose[@]}" ps --status running --services)
    running=()
    if [[ -n $running_list ]]; then mapfile -t running <<< "$running_list"; fi
    trap 'if ((${#running[@]})); then "${compose[@]}" start "${running[@]}" >/dev/null; fi' EXIT
    "${compose[@]}" stop
    for volume in postgres redis clickhouse clickhouse-logs minio; do
      "${docker_cmd[@]}" run --rm --pull never --network none --read-only --user 0 --memory 128m --cpus 0.25 --security-opt no-new-privileges \
        --mount "type=volume,src=openscience-development-langfuse-$volume,dst=/snapshot,readonly" \
        --mount "type=bind,src=$backup,dst=/backup" --entrypoint tar postgres:16-alpine \
        -C /snapshot -czf "/backup/$volume.tgz" .
    done
    cp -a -- "$config" "$backup/credentials"
    cp -a -- "$release_dir" "$backup/release"
    printf 'Stopped-stack backup saved in %s (private). Langfuse services resume now.\n' "$backup"
    ;;
  *) printf 'Usage: manage.sh status | start --confirm | stop --confirm | backup --confirm\n' >&2; exit 64 ;;
esac
