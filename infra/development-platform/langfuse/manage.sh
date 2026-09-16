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
case "${1:-}" in
  status)
    [[ $# == 1 ]] || exit 64
    "${compose[@]}" ps
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
    # No down -v, prune, rm, or operations on a different Compose project.
    "${compose[@]}" stop
    ;;
  backup)
    [[ $# == 2 && $2 == --confirm ]] || exit 64
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
