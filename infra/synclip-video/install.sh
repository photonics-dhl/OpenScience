#!/usr/bin/env bash
# The caller owns the deployment lock, app pairing, admission stop and natural
# drain. The provider lock cannot exclude Worker writes to the inbox.
set -euo pipefail
set -E
umask 077
die() { echo "$2" >&2; exit "$1"; }
usage() {
  echo 'Usage: install.sh --confirm --source /opt/openscience-releases/<full-sha> --renderer-image <sha256:id> [--defer-timer] [--config <private/config.json>]' >&2
  echo '       install.sh --confirm --rollback <candidate-sha> --defer-timer' >&2
  exit 64
}
mode=install; defer=false; selected_config=''
[[ ${1:-} == --confirm ]] || usage
if [[ ${2:-} == --rollback ]]; then
  [[ $# == 4 && ${4:-} == --defer-timer && ${3:-} =~ ^[a-f0-9]{40}$ ]] || usage
  mode=rollback; sha=$3; defer=true
else
  [[ $# -ge 5 && ${2:-} == --source && ${4:-} == --renderer-image ]] || usage
  source_root=$3; renderer_image=$5; shift 5
  while (( $# )); do
    case "$1" in
      --defer-timer) [[ $defer == false ]] || usage; defer=true; shift;;
      --config) [[ $# -ge 2 && -z $selected_config ]] || usage; selected_config=$2; shift 2;;
      *) usage;;
    esac
  done
  sha=${source_root##*/}
  [[ $sha =~ ^[a-f0-9]{40}$ && $source_root == "/opt/openscience-releases/$sha"
    && $renderer_image =~ ^sha256:[a-f0-9]{64}$ ]] || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
fi
[[ $(id -u) == 0 ]] || exit 65
root=/opt/openscience-synclip-video; bundle="$root/releases/$sha"; key=/opt/openscience-synclip/api-key
service=/etc/systemd/system/openscience-synclip-video.service; timer=/etc/systemd/system/openscience-synclip-video.timer
config="$root/config.json"; ready="$root/spool/results/.ready"; lock="$root/runner.lock"
timer_name=openscience-synclip-video.timer
canonical() { [[ ! -L $1 && $(readlink -m -- "$1") == "$1" ]]; }
safe_file() {
  canonical "$1" && [[ -f $1 && $(stat -c '%u %g %a' "$1") == "$2" ]]
}
safe_dir() { canonical "$1" && [[ -d $1 && $(stat -c '%u %g %a' "$1") == "$2" ]]; }
source_path() {
  local permissions
  canonical "$1" && [[ -e $1 && $(stat -c '%u' "$1") == 0 ]] || return 1
  permissions=$(stat -c '%a' "$1")
  [[ $permissions =~ ^[0-7]{3,4}$ ]] && (( (8#$permissions & 0022) == 0 ))
}
release_source_path() {
  local permissions
  # Archive modes are bound by the existing release manifest. This exception
  # applies only to that source, never generated dist or installed/backup files.
  [[ $1 == "$source_root" || $1 == "$source_root/"* ]] && canonical "$1" \
    && [[ -f $1 || -d $1 ]] && [[ $(stat -c '%u %g' "$1") == '0 0' ]] || return 1
  permissions=$(stat -c '%a' "$1")
  [[ $permissions =~ ^[0-7]{3,4}$ ]] && (( (8#$permissions & 0002) == 0 ))
}
for path in "$root" "$root/releases" "$root/spool" "$root/private"; do
  canonical "$path" && [[ ! -e $path || -d $path ]] || die 68 SYNCLIP_VIDEO_PATH_UNSAFE
  if [[ -e $path ]]; then safe_dir "$path" '0 0 700' || die 68 SYNCLIP_VIDEO_PATH_UNSAFE; fi
done
for entry in 'spool/inbox:1000 1000 700' 'spool/results:0 1000 2750'; do
  path="$root/${entry%%:*}"
  canonical "$path" && [[ ! -e $path || -d $path ]] || die 68 SYNCLIP_VIDEO_PATH_UNSAFE
  if [[ -e $path ]]; then safe_dir "$path" "${entry#*:}" || die 68 SYNCLIP_VIDEO_PATH_UNSAFE; fi
done
for entry in "$service:0 0 644" "$timer:0 0 644" "$config:0 0 600" "$ready:0 1000 640" "$lock:0 0 600"; do
  path=${entry%%:*}
  canonical "$path" && [[ ! -e $path || -f $path ]] || die 68 SYNCLIP_VIDEO_PATH_UNSAFE
  if [[ -e $path ]]; then safe_file "$path" "${entry#*:}" || die 68 SYNCLIP_VIDEO_PATH_UNSAFE; fi
done
# Metadata only: never read, copy, print, rewrite or put the key in config/env.
canonical "${key%/*}" && safe_dir "${key%/*}" '0 0 700' && safe_file "$key" '0 0 600' && [[ -s $key ]] \
  || die 67 SYNCLIP_SHARED_KEY_UNAVAILABLE
installed=false
if [[ -f $service && -f $timer && -f $config ]]; then
  [[ -f $lock ]] || die 68 SYNCLIP_VIDEO_PARTIAL_INSTALL
  for path in "$root/releases" "$root/spool" "$root/spool/inbox" "$root/spool/results" "$root/private"; do
    [[ -d $path ]] || die 68 SYNCLIP_VIDEO_PARTIAL_INSTALL
  done
  installed=true
elif [[ $mode == install && ( -e $service || -e $timer || -e $config || -e $ready ) ]]; then
  die 68 SYNCLIP_VIDEO_PARTIAL_INSTALL
fi
if [[ $mode == install ]]; then
  [[ $installed == false || $defer == true ]] || die 69 SYNCLIP_VIDEO_EXISTING_INSTALL_REQUIRES_DEFER
  [[ ! -e $bundle && ! -L $bundle ]] || die 69 SYNCLIP_VIDEO_BUNDLE_EXISTS
  for path in "$source_root" "$source_root/scripts" "$source_root/scripts/release-input-manifest.mjs" \
    "$source_root/infra/synclip-video"; do
    release_source_path "$path" || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
  done
  for path in "$source_root/.release-source" "$source_root/.release-inputs.sha256"; do
    safe_file "$path" '0 0 444' && [[ $(stat -c '%h' "$path") == 1 ]] \
      || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
  done
  [[ $(stat -c '%s' "$source_root/.release-source") == 41 && $(<"$source_root/.release-source") == "$sha" ]] \
    || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
  source_path "$source_root/packages/ai-gateway/dist" || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
  for module in broker.mjs image-reference.mjs; do
    path="$source_root/infra/synclip-video/$module"
    [[ -f $path ]] && release_source_path "$path" || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
  done
  node "$source_root/scripts/release-input-manifest.mjs" verify --root "$source_root" --sha "$sha" >/dev/null 2>&1 \
    || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
  for module in synclip-video-api synclip-audio-api synclip-image-api codex-image-protocol image ocr errors; do
    path="$source_root/packages/ai-gateway/dist/$module.js"
    [[ -f $path ]] && source_path "$path" || die 66 SYNCLIP_VIDEO_SOURCE_INVALID
  done
  if [[ -n $selected_config ]]; then
    [[ $selected_config == "$root/private/"* ]] && safe_file "$selected_config" '0 0 600' \
      || die 67 SYNCLIP_VIDEO_CONFIG_PATH_UNSAFE
  fi
else
  safe_dir "$root" '0 0 700' && safe_file "$lock" '0 0 600' || die 68 SYNCLIP_VIDEO_PATH_UNSAFE
fi
if [[ ! -e $root ]]; then install -d -o root -g root -m 0700 "$root"; fi
if [[ ! -e $lock ]]; then (set -o noclobber; : > "$lock"); chown root:root "$lock"; chmod 0600 "$lock"; fi
safe_file "$lock" '0 0 600' || die 68 SYNCLIP_VIDEO_PATH_UNSAFE
exec 8<>"$lock"
# FD9 belongs to the outer deployment. Never reopen or flock it here.
flock -n 8 || die 71 SYNCLIP_VIDEO_RUNNER_ACTIVE

# Import only the real runtime. No broker execution, key read or provider call.
# All parsing/import errors are fixed diagnostics, never JSON or secret values.
check_config() {
  node --input-type=module - "$bundle/infra/synclip-video/broker.mjs" "$1" "${2:-}" "${3:-}" "${4:-}" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
try {
  const [module, input, output, renderer, kind] = process.argv.slice(2);
  const broker = await import(pathToFileURL(module).href);
  if (typeof broker.runSynclipVideoBrokerOnce !== 'function' || typeof broker.validateSynclipVideoBrokerConfig !== 'function') throw Error();
  const root = '/opt/openscience-synclip-video', key = '/opt/openscience-synclip/api-key';
  const defaults = { inbox: root + '/spool/inbox', results: root + '/spool/results', privateRoot: root + '/private', keyPath: key,
    rendererImage: renderer, model: 'ltx23', resolution: '720p', referenceMode: 'synclip-receipt', adminModelsEnabled: false, adapterRevision: 'synclip-video-v2' };
  let value = defaults, previousV1 = false;
  if (input) {
    const bytes = await readFile(input);
    if (!bytes.length || bytes.length > 16384) throw Error();
    value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(name => !Object.hasOwn(defaults, name) && name !== 'audio')
      || ['inbox', 'results', 'privateRoot', 'keyPath', 'model', 'resolution'].some(name => value[name] !== defaults[name])
      || typeof value.rendererImage !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value.rendererImage)) throw Error();
    previousV1 = value.adapterRevision === 'synclip-video-v1';
    if (previousV1 && !['explicit', 'candidate'].includes(kind)) {
      if (value.referenceMode !== 'inline' || Object.hasOwn(value, 'audio') || Object.hasOwn(value, 'adminModelsEnabled')) throw Error();
      value = { ...value, referenceMode: 'synclip-receipt', adminModelsEnabled: false, adapterRevision: 'synclip-video-v2' };
    }
    broker.validateSynclipVideoBrokerConfig(value);
    if (kind === 'explicit' && value.rendererImage !== renderer) throw Error();
    if (output && kind !== 'explicit') value = { ...value, rendererImage: renderer };
  }
  broker.validateSynclipVideoBrokerConfig(value);
  if (output) await writeFile(output, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' });
  if (kind === 'previous') process.stdout.write(String(previousV1));
} catch { process.stderr.write('SYNCLIP_VIDEO_RUNTIME_OR_CONFIG_INVALID\n'); process.exitCode = 66; }
NODE
}
atomic_temporary=''
atomic_copy() {
  atomic_temporary=$(mktemp "$2.XXXXXX") || return 74
  if install -o root -g root -m "$3" "$1" "$atomic_temporary" && mv -T -- "$atomic_temporary" "$2"; then
    atomic_temporary=''; return 0
  fi
  rm -f -- "$atomic_temporary"; atomic_temporary=''
  echo SYNCLIP_VIDEO_ATOMIC_WRITE_FAILED >&2
  return 74
}
unit_source() {
  local line result='' count=0
  while IFS= read -r line || [[ -n $line ]]; do
    if [[ $line == ExecStart=* ]]; then
      [[ $line == "ExecStart=/usr/bin/flock -n $lock /usr/bin/node $root/releases/"*"/infra/synclip-video/broker.mjs --config $config" ]] || return 1
      result=${line#"ExecStart=/usr/bin/flock -n $lock /usr/bin/node $root/releases/"}
      result=${result%%/*}; (( count += 1 ))
      [[ $line == "ExecStart=/usr/bin/flock -n $lock /usr/bin/node $root/releases/$result/infra/synclip-video/broker.mjs --config $config" ]] || return 1
    fi
  done < "$1"
  [[ $count == 1 && $result =~ ^[a-f0-9]{40}$ ]] || return 1
  local old="$root/releases/$result"
  canonical "$old" && source_path "$old" && [[ -d $old ]] && safe_file "$old/source-id" '0 0 444' \
    && [[ $(stat -c '%s' "$old/source-id") == 41 && $(<"$old/source-id") == "$result" ]] \
    && source_path "$old/infra/synclip-video/broker.mjs" && [[ -f $old/infra/synclip-video/broker.mjs ]] || return 1
}
load_snapshot() {
  prior_v1=false
  safe_dir "$bundle/previous" '0 0 700' && safe_file "$bundle/previous/timer-state" '0 0 600' || return 1
  local state
  state=$(node --input-type=module - "$bundle/previous/timer-state" <<'NODE'
import { readFile } from 'node:fs/promises';
try {
  const bytes = await readFile(process.argv[2]); if (!bytes.length || bytes.length > 1024) throw Error();
  const state = JSON.parse(bytes.toString('utf8'));
  if (Object.keys(state).sort().join(',') !== 'active,enabled,installed,ready'
    || typeof state.installed !== 'boolean' || typeof state.ready !== 'boolean'
    || !['active', 'inactive', 'failed', 'unknown', ''].includes(state.active)
    || !['enabled', 'enabled-runtime', 'disabled', 'not-found', ''].includes(state.enabled)
    || (!state.installed && (state.ready || state.active === 'active' || ['enabled', 'enabled-runtime'].includes(state.enabled)))) throw Error();
  process.stdout.write([String(state.installed), state.enabled || 'not-found', state.active || 'unknown', String(state.ready)].join(' '));
} catch { process.stderr.write('SYNCLIP_VIDEO_PREVIOUS_INVALID\n'); process.exitCode = 68; }
NODE
  ) || return 1
  read -r prior_installed prior_enabled prior_active prior_ready <<< "$state"
  if [[ $prior_installed == true ]]; then
    safe_file "$bundle/previous/service" '0 0 644' && safe_file "$bundle/previous/timer" '0 0 644' \
      && safe_file "$bundle/previous/config.json" '0 0 600' && unit_source "$bundle/previous/service" \
      && grep -Fxq "Unit=openscience-synclip-video.service" "$bundle/previous/timer" || return 1
    prior_v1=$(check_config "$bundle/previous/config.json" '' '' previous) || return 1
    case "$prior_v1" in true|false) ;; *) return 1;; esac
  else
    for path in service timer config.json; do
      [[ ! -e $bundle/previous/$path && ! -L $bundle/previous/$path ]] || return 1
    done
  fi
  if [[ $prior_ready == true ]]; then safe_file "$bundle/previous/ready" '0 1000 640' || return 1
  else [[ ! -e $bundle/previous/ready && ! -L $bundle/previous/ready ]] || return 1; fi
}
v1_work_absent() {
  local job name
  for job in "$root/spool/inbox/"* "$root/private/"*; do
    name=${job##*/}
    if [[ $name =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ \
      && ( -d $job || -L $job ) ]]; then return 1; fi
  done
}
hold_timer() {
  local ok=0
  # An initial install may fail before a timer unit exists at all.
  if [[ -f $timer ]]; then
    systemctl stop "$timer_name" || ok=1
    systemctl disable "$timer_name" || ok=1
  fi
  rm -f -- "$ready" || ok=1
  return "$ok"
}
restore_snapshot() {
  local ok=0 advertise=$1
  hold_timer || ok=1
  if [[ $prior_installed == true ]]; then
    atomic_copy "$bundle/previous/config.json" "$config" 0600 || ok=1
    atomic_copy "$bundle/previous/service" "$service" 0644 || ok=1
    atomic_copy "$bundle/previous/timer" "$timer" 0644 || ok=1
    cmp -s -- "$bundle/previous/config.json" "$config" && cmp -s -- "$bundle/previous/service" "$service" \
      && cmp -s -- "$bundle/previous/timer" "$timer" && unit_source "$service" || ok=1
  else
    rm -f -- "$config" "$service" "$timer" || ok=1
  fi
  systemctl daemon-reload || ok=1
  if [[ $ok == 0 && $advertise == true && $prior_installed == true ]]; then
    # App pairing is protected by the caller's deployment window. Even an old
    # terminal/expired UUID directory makes v1 reactivation unsafe for v2 work.
    if [[ $prior_v1 == true ]] && ! v1_work_absent; then
      echo SYNCLIP_VIDEO_V1_REACTIVATION_HELD >&2
    else
      if [[ $prior_ready == true ]]; then
        install -o root -g 1000 -m 0640 "$bundle/previous/ready" "$ready" || ok=1
      fi
      if [[ $ok == 0 ]]; then
        case "$prior_enabled" in
          enabled) systemctl enable "$timer_name" || ok=1;;
          enabled-runtime) systemctl enable --runtime "$timer_name" || ok=1;;
        esac
        if [[ $ok == 0 && $prior_active == active ]]; then systemctl start "$timer_name" || ok=1; fi
      fi
    fi
  fi
  if [[ $ok != 0 ]]; then hold_timer || true; return 1; fi
}
switch_started=false
recover() {
  local code=$1
  trap - ERR INT TERM
  set +e
  if [[ -n $atomic_temporary ]]; then rm -f -- "$atomic_temporary"; atomic_temporary=''; fi
  if [[ $switch_started == true ]]; then
    if [[ $mode == install ]]; then
      if ! restore_snapshot true; then echo SYNCLIP_VIDEO_RESTORE_FAILED_TIMER_HELD >&2; fi
    elif ! hold_timer; then
      echo SYNCLIP_VIDEO_RESTORE_FAILED_TIMER_HELD >&2
    fi
  fi
  echo SYNCLIP_VIDEO_INSTALL_FAILED >&2
  exit "$code"
}

if [[ $mode == rollback ]]; then
  source_path "$bundle" && [[ -d $bundle ]] && safe_file "$bundle/source-id" '0 0 444' \
    && [[ $(stat -c '%s' "$bundle/source-id") == 41 && $(<"$bundle/source-id") == "$sha" ]] \
    && safe_file "$bundle/service" '0 0 444' && safe_file "$bundle/timer" '0 0 444' \
    && safe_file "$bundle/config.json" '0 0 600' || die 68 SYNCLIP_VIDEO_ROLLBACK_INVALID
  for module in broker.mjs image-reference.mjs; do source_path "$bundle/infra/synclip-video/$module" || die 68 SYNCLIP_VIDEO_ROLLBACK_INVALID; done
  for module in synclip-video-api synclip-audio-api synclip-image-api codex-image-protocol image ocr errors; do
    source_path "$bundle/packages/ai-gateway/dist/$module.js" || die 68 SYNCLIP_VIDEO_ROLLBACK_INVALID
  done
  check_config "$bundle/config.json" '' '' candidate
  load_snapshot || die 68 SYNCLIP_VIDEO_PREVIOUS_INVALID
  # Allow a completed or interrupted rollback; never replace a newer provider.
  for entry in service timer config; do
    path=${!entry}; saved=$entry; [[ $entry != config ]] || saved=config.json
    if [[ -e $path ]]; then
      cmp -s -- "$path" "$bundle/$saved" || { [[ $prior_installed == true ]] && cmp -s -- "$path" "$bundle/previous/$saved"; } \
        || die 69 SYNCLIP_VIDEO_ROLLBACK_LIVE_MISMATCH
    else [[ $prior_installed == false ]] || die 69 SYNCLIP_VIDEO_ROLLBACK_LIVE_MISMATCH; fi
  done
  trap 'recover $?' ERR; trap 'recover 130' INT; trap 'recover 143' TERM
  switch_started=true
  restore_snapshot false
  trap - ERR INT TERM
  echo "SYNCLIP_VIDEO_PROVIDER_ROLLED_BACK source=$sha timer=disabled"
  exit 0
fi

docker image inspect "$renderer_image" >/dev/null 2>&1 || die 66 SYNCLIP_VIDEO_RENDERER_UNAVAILABLE
for tool in ffmpeg ffprobe; do
  timeout 25 docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --entrypoint "/usr/bin/$tool" "$renderer_image" -version >/dev/null 2>&1 || die 66 SYNCLIP_VIDEO_RENDERER_UNAVAILABLE
done
[[ ! -e $bundle && ! -L $bundle ]] || die 69 SYNCLIP_VIDEO_BUNDLE_EXISTS
if ! getent group 1000 >/dev/null 2>&1; then groupadd --system --gid 1000 openscience-synclip; fi
install -d -o root -g root -m 0700 "$root/releases" "$root/spool" "$root/private"
install -d -o 1000 -g 1000 -m 0700 "$root/spool/inbox"
install -d -o root -g 1000 -m 2750 "$root/spool/results"
install -d -m 0755 "$bundle/infra/synclip-video" "$bundle/packages/ai-gateway/dist"
for module in broker.mjs image-reference.mjs; do install -m 0444 "$source_root/infra/synclip-video/$module" "$bundle/infra/synclip-video/$module"; done
for module in synclip-video-api synclip-audio-api synclip-image-api codex-image-protocol image ocr errors; do
  install -m 0444 "$source_root/packages/ai-gateway/dist/$module.js" "$bundle/packages/ai-gateway/dist/$module.js"
done
input_config=$config; [[ $installed == true ]] || input_config=''
config_kind=default
if [[ -n $selected_config ]]; then input_config=$selected_config; config_kind=explicit; fi
check_config "$input_config" "$bundle/config.json" "$renderer_image" "$config_kind"
printf '%s\n' "$sha" > "$bundle/source-id"; chmod 0444 "$bundle/source-id"
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
prior_active=$(systemctl is-active "$timer_name" 2>/dev/null || true)
prior_enabled=$(systemctl is-enabled "$timer_name" 2>/dev/null || true)
case "$prior_active" in active|inactive|failed|unknown|'') ;; *) die 72 SYNCLIP_VIDEO_TIMER_STATE_UNKNOWN;; esac
case "$prior_enabled" in enabled|enabled-runtime|disabled|not-found|'') ;; *) die 72 SYNCLIP_VIDEO_TIMER_STATE_UNKNOWN;; esac
install -d -m 0700 "$bundle/previous"
for entry in service timer config; do
  path=${!entry}; saved=$entry; [[ $entry != config ]] || saved=config.json
  if [[ -f $path ]]; then cp -p -- "$path" "$bundle/previous/$saved"; fi
done
prior_ready=false
if [[ -f $ready ]]; then cp -p -- "$ready" "$bundle/previous/ready"; prior_ready=true; fi
printf '{"installed":%s,"enabled":"%s","active":"%s","ready":%s}\n' "$installed" "$prior_enabled" "$prior_active" "$prior_ready" > "$bundle/previous/timer-state"
chmod 0600 "$bundle/previous/timer-state"
load_snapshot || die 68 SYNCLIP_VIDEO_PREVIOUS_INVALID
trap 'recover $?' ERR; trap 'recover 130' INT; trap 'recover 143' TERM
switch_started=true
hold_timer
atomic_copy "$bundle/config.json" "$config" 0600
atomic_copy "$bundle/service" "$service" 0644
atomic_copy "$bundle/timer" "$timer" 0644
systemctl daemon-reload
if [[ $defer == true ]]; then systemctl stop "$timer_name"; systemctl disable "$timer_name"
else systemctl enable --now "$timer_name"; fi
trap - ERR INT TERM
echo "SYNCLIP_VIDEO_PROVIDER_INSTALLED source=$sha timer=$([[ $defer == true ]] && echo disabled || echo enabled)"
