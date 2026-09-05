#!/usr/bin/env bash
# Deploy one reviewed D2NN science-video sample without changing the application release.

set -euo pipefail

DEMO_ROOT="/opt/openscience-demos/science-video/d2nn"
APP_RELEASE_MARKER="/opt/openscience/.release-id"
NGINX_MAIN_CONF="/etc/nginx/conf.d/openscience.conf"
NGINX_SNIPPET="/etc/nginx/snippets/science-video-demo.location.conf"
NGINX_INCLUDE="include /etc/nginx/snippets/science-video-demo*.location.conf;"
MANAGED_MARKER="# OpenScience managed science-video demo location"
DOCKER_BIN="docker"
NGINX_BIN="nginx"
SYSTEMCTL_BIN="systemctl"
TIMEOUT_BIN="timeout"
FLOCK_BIN="flock"
DEPLOY_LOCK_DIRECTORY="/run/lock/openscience-production-deploy"
DEPLOY_LOCK_PATH="$DEPLOY_LOCK_DIRECTORY/lock"
DEPLOY_LOCK_REQUIRED_UID=0
DEPLOY_LOCK_DIRECTORY_MODE=700
DEPLOY_LOCK_FILE_MODE=600

usage() {
  printf '%s\n' \
    "Usage: $0 --confirm --run-id <gitsha-YYYYMMDDTHHMMSSZ> --image openscience-media-demo:<full-git-sha>" >&2
  return 64
}

validate_run_id() {
  [[ "$1" =~ ^[a-f0-9]{7,40}-[0-9]{8}T[0-9]{6}Z$ ]]
}

validate_image() {
  [[ "$1" =~ ^openscience-media-demo:[a-f0-9]{40}$ ]]
}

acquire_production_deploy_lock() {
  command -v "$FLOCK_BIN" >/dev/null 2>&1 || return 69
  [ ! -L "$DEPLOY_LOCK_DIRECTORY" ] || return 71
  if [ ! -e "$DEPLOY_LOCK_DIRECTORY" ]; then
    mkdir -m 0700 -- "$DEPLOY_LOCK_DIRECTORY" || return 71
  fi
  [ -d "$DEPLOY_LOCK_DIRECTORY" ] && [ ! -L "$DEPLOY_LOCK_DIRECTORY" ] \
    && [ "$(readlink -f -- "$DEPLOY_LOCK_DIRECTORY")" = "$DEPLOY_LOCK_DIRECTORY" ] || return 71
  set -- $(stat -c '%u %a' -- "$DEPLOY_LOCK_DIRECTORY")
  [ "$1" = "$DEPLOY_LOCK_REQUIRED_UID" ] && [ "$2" = "$DEPLOY_LOCK_DIRECTORY_MODE" ] || return 71
  [ ! -L "$DEPLOY_LOCK_PATH" ] || return 71
  if [ ! -e "$DEPLOY_LOCK_PATH" ]; then
    (umask 077; set -C; : > "$DEPLOY_LOCK_PATH") || return 71
  fi
  [ -f "$DEPLOY_LOCK_PATH" ] && [ ! -L "$DEPLOY_LOCK_PATH" ] || return 71
  set -- $(stat -c '%u %a %h' -- "$DEPLOY_LOCK_PATH")
  [ "$1" = "$DEPLOY_LOCK_REQUIRED_UID" ] && [ "$2" = "$DEPLOY_LOCK_FILE_MODE" ] && [ "$3" = 1 ] || return 71
  exec 9<>"$DEPLOY_LOCK_PATH"
  "$FLOCK_BIN" -n -E 73 9
}

assert_production_deploy_lock() {
  local fd_identity path_identity probe_status
  fd_identity="$(stat -Lc '%d:%i' /proc/$$/fd/9)" || return 74
  path_identity="$(stat -Lc '%d:%i' "$DEPLOY_LOCK_PATH")" || return 74
  [ "$fd_identity" = "$path_identity" ] || return 74
  set +e
  "$FLOCK_BIN" -n -E 73 "$DEPLOY_LOCK_PATH" -c : >/dev/null 2>&1
  probe_status=$?
  set -e
  [ "$probe_status" -eq 73 ]
}

assert_regular_file() {
  local path="$1"
  local maximum_bytes="$2"
  [ -f "$path" ] && [ ! -L "$path" ] || {
    printf 'Blocked: required regular file is missing: %s\n' "$path" >&2
    return 66
  }
  local size
  size="$(stat -c '%s' "$path")"
  [ "$size" -ge 1 ] && [ "$size" -le "$maximum_bytes" ] || {
    printf 'Blocked: file size is outside the demo bounds: %s\n' "$path" >&2
    return 66
  }
}

validate_input_tree() {
  local input_dir="$1"
  [ -d "$input_dir" ] && [ ! -L "$input_dir" ] || {
    printf 'Blocked: reviewed input directory is missing\n' >&2
    return 66
  }
  if [ -n "$(find "$input_dir" -type l -print -quit)" ]; then
    printf 'Blocked: reviewed input contains a symbolic link\n' >&2
    return 66
  fi
  local file_count total_bytes
  file_count="$(find "$input_dir" -type f -printf '.\n' | wc -l)"
  total_bytes="$(du -sb --apparent-size "$input_dir" | cut -f1)"
  [ "$file_count" -ge 1 ] && [ "$file_count" -le 128 ] \
    && [ "$total_bytes" -ge 1 ] && [ "$total_bytes" -le 134217728 ] || {
      printf 'Blocked: reviewed input exceeds the bounded file protocol\n' >&2
      return 66
    }
}

run_renderer() {
  local image="$1"
  local input_dir="$2"
  local output_dir="$3"
  local container_name="$4"
  if "$DOCKER_BIN" container inspect "$container_name" >/dev/null 2>&1; then
    printf 'Blocked: renderer container name already exists and will not be reused\n' >&2
    return 73
  fi
  set +e
  "$TIMEOUT_BIN" --signal=TERM --kill-after=30s 600s "$DOCKER_BIN" run \
    --pull=never \
    --name "$container_name" \
    --network none \
    --read-only \
    --user 10001:10001 \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --cpus 4 \
    --memory 4g \
    --memory-swap 4g \
    --pids-limit 256 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=512m,uid=10001,gid=10001,mode=0700 \
    --tmpfs /dev/shm:rw,nosuid,nodev,size=1024m,uid=10001,gid=10001,mode=0700 \
    --mount "type=bind,src=$input_dir,dst=/input,readonly" \
    --mount "type=bind,src=$output_dir,dst=/output" \
    "$image" --input /input --output /output
  local renderer_status=$?
  set -e
  if [ "$renderer_status" -ne 0 ]; then
    "$DOCKER_BIN" stop --time 30 "$container_name" >/dev/null 2>&1 || true
    return "$renderer_status"
  fi
}

validate_renderer_output() {
  local output_dir="$1"
  local video="$output_dir/d2nn-science-explainer-v2.mp4"
  local poster="$output_dir/poster-v2.png"
  local storyboard="$output_dir/storyboard.json"
  local metrics="$output_dir/metrics.json"
  assert_regular_file "$video" 67108864
  assert_regular_file "$poster" 16777216
  assert_regular_file "$storyboard" 1048576
  assert_regular_file "$metrics" 1048576
  [ "$(dd if="$video" bs=1 skip=4 count=4 status=none)" = "ftyp" ] || {
    printf 'Blocked: renderer output is not an MP4 container\n' >&2
    return 66
  }
  [ "$(od -An -tx1 -N8 "$poster" | tr -d ' \n')" = "89504e470d0a1a0a" ] || {
    printf 'Blocked: renderer poster is not a PNG\n' >&2
    return 66
  }
  /usr/bin/node - "$storyboard" "$metrics" <<'NODE'
const fs = require('node:fs');
const [storyboardPath, metricsPath] = process.argv.slice(2);
const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
if (!storyboard || typeof storyboard !== 'object' || Array.isArray(storyboard)) process.exit(65);
const valid = metrics && typeof metrics === 'object' && !Array.isArray(metrics)
  && metrics.schemaVersion === 1
  && metrics.width === 1280 && metrics.height === 720
  && typeof metrics.durationSeconds === 'number'
  && metrics.durationSeconds > 0 && metrics.durationSeconds <= 60
  && metrics.videoCodec === 'h264' && metrics.audioCodec === 'aac'
  && metrics.pixelFormat === 'yuv420p'
  && metrics.fastStart === true && metrics.completeDecode === true;
if (!valid) process.exit(65);
NODE
}

prepare_nginx_main_candidate() {
  local source="$1"
  local candidate="$2"
  [ -f "$source" ] && [ ! -L "$source" ] || {
    printf 'Blocked: active nginx main config is unavailable or is a symlink\n' >&2
    return 66
  }
  local any_include_count exact_include_count release_location_count
  any_include_count="$(grep -Fc "$NGINX_INCLUDE" "$source" || true)"
  exact_include_count="$(grep -Fxc "    $NGINX_INCLUDE" "$source" || true)"
  [ "$any_include_count" -eq "$exact_include_count" ] || {
    printf 'Blocked: nginx demo include exists in an unexpected form\n' >&2
    return 66
  }
  if [ "$exact_include_count" -eq 1 ]; then
    cp -p -- "$source" "$candidate"
    return 0
  fi
  [ "$exact_include_count" -eq 0 ] || {
    printf 'Blocked: nginx demo include is duplicated\n' >&2
    return 66
  }
  release_location_count="$(grep -Fxc '    location = /__release {' "$source" || true)"
  [ "$release_location_count" -eq 1 ] || {
    printf 'Blocked: unique nginx release location anchor is unavailable\n' >&2
    return 66
  }
  awk -v include_line="    $NGINX_INCLUDE" '
    $0 == "    location = /__release {" { print include_line }
    { print }
  ' "$source" > "$candidate"
}

restore_nginx_transaction() {
  local snippet_backup="$1"
  local snippet_target="$2"
  local main_backup="$3"
  local main_target="$4"
  cp -p -- "$snippet_backup" "$snippet_target"
  cp -p -- "$main_backup" "$main_target"
}

install_nginx_transaction() {
  local snippet_candidate="$1"
  local snippet_target="$2"
  local snippet_backup="$3"
  local main_candidate="$4"
  local main_target="$5"
  local main_backup="$6"
  [ -f "$snippet_target" ] && [ ! -L "$snippet_target" ] \
    && [ -f "$main_target" ] && [ ! -L "$main_target" ] \
    && grep -Fxq "$MANAGED_MARKER" "$snippet_target" \
    && grep -Fxq "$MANAGED_MARKER" "$snippet_candidate" || {
      printf 'Blocked: nginx demo transaction targets are not owned regular files\n' >&2
      return 66
    }
  [ ! -e "$snippet_backup" ] && [ ! -L "$snippet_backup" ] \
    && [ ! -e "$main_backup" ] && [ ! -L "$main_backup" ] || {
      printf 'Blocked: nginx transaction backup already exists\n' >&2
      return 73
    }
  cp -p -- "$snippet_target" "$snippet_backup"
  cp -p -- "$main_target" "$main_backup"
  install -m 0644 "$snippet_candidate" "$snippet_target"
  install -m 0644 "$main_candidate" "$main_target"
  if ! "$NGINX_BIN" -t; then
    restore_nginx_transaction "$snippet_backup" "$snippet_target" "$main_backup" "$main_target"
    "$NGINX_BIN" -t
    return 1
  fi
  if ! "$SYSTEMCTL_BIN" reload nginx; then
    restore_nginx_transaction "$snippet_backup" "$snippet_target" "$main_backup" "$main_target"
    "$NGINX_BIN" -t
    "$SYSTEMCTL_BIN" reload nginx
    return 1
  fi
}

main() {
  [ "$(id -u)" -eq 0 ] || {
    printf 'Blocked: run this bounded deployment as root on the ECS\n' >&2
    return 77
  }
  local confirmed=0 run_id='' image=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --confirm) confirmed=1; shift ;;
      --run-id) [ "$#" -ge 2 ] || { usage; return; }; run_id="$2"; shift 2 ;;
      --image) [ "$#" -ge 2 ] || { usage; return; }; image="$2"; shift 2 ;;
      *) usage; return ;;
    esac
  done
  [ "$confirmed" -eq 1 ] || { printf 'Blocked: --confirm is required\n' >&2; return 65; }
  validate_run_id "$run_id" || { printf 'Blocked: run ID format is invalid\n' >&2; return 64; }
  validate_image "$image" || { printf 'Blocked: renderer image must use the exact release tag convention\n' >&2; return 64; }

  local script_dir template bundle_dir expected_bundle release_dir input_dir output_dir web_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  template="$script_dir/../nginx/science-video-demo.location.conf"
  bundle_dir="$DEMO_ROOT/staging/$run_id"
  expected_bundle="$bundle_dir"
  release_dir="$DEMO_ROOT/releases/$run_id"
  input_dir="$bundle_dir/input"
  output_dir="$release_dir/output"
  web_dir="$bundle_dir/web"

  [ -f "$APP_RELEASE_MARKER" ] || { printf 'Blocked: application release marker is unavailable\n' >&2; return 66; }
  [ -f "$NGINX_MAIN_CONF" ] && [ ! -L "$NGINX_MAIN_CONF" ] || {
    printf 'Blocked: active nginx main config is unavailable or is a symlink\n' >&2
    return 66
  }
  [ -f "$template" ] && [ ! -L "$template" ] || { printf 'Blocked: nginx template is unavailable\n' >&2; return 66; }
  [ -d "$bundle_dir" ] && [ ! -L "$bundle_dir" ] || { printf 'Blocked: staging bundle is unavailable\n' >&2; return 66; }
  [ "$(realpath -e "$bundle_dir")" = "$expected_bundle" ] || { printf 'Blocked: staging bundle path escaped the demo root\n' >&2; return 66; }
  [ ! -e "$release_dir" ] && [ ! -L "$release_dir" ] || { printf 'Blocked: run ID already exists and will not be overwritten\n' >&2; return 73; }
  validate_input_tree "$input_dir"
  assert_regular_file "$web_dir/index.html" 1048576
  assert_regular_file "$web_dir/styles.css" 1048576
  assert_regular_file "$web_dir/player.js" 1048576
  grep -Fq 'data-science-video-demo="d2nn-reviewed-sample"' "$web_dir/index.html" || {
    printf 'Blocked: demo page is missing the reviewed-sample marker\n' >&2
    return 66
  }
  "$DOCKER_BIN" image inspect "$image" >/dev/null

  install -d -o 10001 -g 10001 -m 0755 "$output_dir"
  install -d -o root -g root -m 0755 "$release_dir/web"
  run_renderer "$image" "$input_dir" "$output_dir" "science-video-demo-$run_id"
  validate_renderer_output "$output_dir"
  install -m 0644 "$web_dir/index.html" "$release_dir/web/index.html"
  install -m 0644 "$web_dir/styles.css" "$release_dir/web/styles.css"
  install -m 0644 "$web_dir/player.js" "$release_dir/web/player.js"

  acquire_production_deploy_lock
  assert_production_deploy_lock
  local app_release_before
  app_release_before="$(tr -d '\r\n' < "$APP_RELEASE_MARKER")"
  [[ "$app_release_before" =~ ^[a-f0-9]{40}$ ]] || { printf 'Blocked: application release marker is invalid\n' >&2; return 66; }

  install -d -o root -g root -m 0755 "$(dirname "$NGINX_SNIPPET")"
  if [ ! -e "$NGINX_SNIPPET" ] && [ ! -L "$NGINX_SNIPPET" ]; then
    printf '%s\n%s\n' "$MANAGED_MARKER" '# inactive until the first reviewed demo deployment' > "$NGINX_SNIPPET"
    chmod 0644 "$NGINX_SNIPPET"
  fi

  local candidate backup main_candidate main_backup backup_dir
  candidate="$release_dir/nginx-science-video-demo.location.conf"
  backup_dir="$release_dir/nginx-backups"
  install -d -o root -g root -m 0750 "$backup_dir"
  backup="$backup_dir/science-video-demo.location.conf.before"
  main_candidate="$release_dir/nginx-openscience.candidate.conf"
  main_backup="$backup_dir/openscience.conf.before"
  sed "s/__RUN_ID__/$run_id/g" "$template" > "$candidate"
  grep -Fq '__RUN_ID__' "$candidate" && { printf 'Blocked: nginx template token was not resolved\n' >&2; return 66; }
  prepare_nginx_main_candidate "$NGINX_MAIN_CONF" "$main_candidate"
  install_nginx_transaction "$candidate" "$NGINX_SNIPPET" "$backup" \
    "$main_candidate" "$NGINX_MAIN_CONF" "$main_backup"

  local app_release_after
  app_release_after="$(tr -d '\r\n' < "$APP_RELEASE_MARKER")"
  [ "$app_release_after" = "$app_release_before" ] || {
    printf 'Blocked: application release changed concurrently; verify both deployments\n' >&2
    return 75
  }
  exec 9>&-
  printf 'SCIENCE_VIDEO_DEMO_RUN=%s\n' "$run_id"
  printf 'SCIENCE_VIDEO_DEMO_URL=https://openscience.428312321.xyz/demos/science-video/d2nn/\n'
  printf 'APPLICATION_RELEASE_UNCHANGED=%s\n' "$app_release_after"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
