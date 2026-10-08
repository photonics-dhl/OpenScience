import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The image installer's real-shell fixture, with only host commands and /opt,
// /etc paths relocated. Gateway modules and broker validation remain real.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = join(repo, 'tmp/synclip-video-install-tests');
const fixtureDirectories = [];
after(async () => {
  if (!fixtureDirectories.length) return;
  const expectedRoot = join(await realpath(repo), 'tmp/synclip-video-install-tests');
  assert.equal(await realpath(fixtureRoot), expectedRoot);
  for (const base of fixtureDirectories) {
    assert.equal((await lstat(base)).isSymbolicLink(), false);
    const target = await realpath(base);
    assert.equal(dirname(target), expectedRoot);
    assert.match(basename(target), /^isolated-video-install-[A-Za-z0-9]{6}$/u);
    await rm(target, { recursive: true, force: true });
  }
});
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const posix = path => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/u, (_, drive) => `/${drive.toLowerCase()}`);
const sha = 'a'.repeat(40), renderer = `sha256:${'b'.repeat(64)}`;
const oldSha = 'c'.repeat(40);
const timerName = 'openscience-synclip-video.timer', serviceName = 'openscience-synclip-video.service';
const keyMarker = 'not-a-provider-key-fixture-only';
const privateMarker = 'DO-NOT-DISCLOSE-PRIVATE-CONFIG', importMarker = 'PRIVATE-IMPORT-DIAGNOSTIC';
const runtimeModules = ['synclip-video-api', 'synclip-audio-api', 'synclip-image-api', 'codex-image-protocol', 'image', 'ocr', 'errors'];
// One invocation tests one source version even while the installer owner works.
const installerSource = await readFile(join(repo, 'infra/synclip-video/install.sh'), 'utf8');

async function fixture({ existing = true, version = 'v1', audio, admin, installerPath,
  active = existing ? 'active' : 'inactive', enabled = existing ? 'enabled' : 'not-found' } = {}) {
  await mkdir(fixtureRoot, { recursive: true });
  const base = await mkdtemp(join(fixtureRoot, 'isolated-video-install-'));
  fixtureDirectories.push(base);
  const root = join(base, 'synclip-video'), shared = join(base, 'synclip-image');
  const release = join(base, 'sources', sha), units = join(base, 'units'), bin = join(base, 'bin');
  const calls = join(base, 'calls'), key = join(shared, 'api-key');
  for (const path of [root, shared, units, bin, join(root, 'private'), join(root, 'spool/inbox'), join(root, 'spool/results')]) {
    await mkdir(path, { recursive: true });
  }
  await writeFile(key, keyMarker);
  const defaultConfig = {
    inbox: `${posix(root)}/spool/inbox`, results: `${posix(root)}/spool/results`, privateRoot: `${posix(root)}/private`,
    keyPath: posix(key), rendererImage: renderer, model: 'ltx23', resolution: '720p',
    referenceMode: 'synclip-receipt', adminModelsEnabled: false, adapterRevision: 'synclip-video-v2',
  };
  const oldConfig = { ...defaultConfig, referenceMode: version === 'v1' ? 'inline' : 'synclip-receipt',
    adapterRevision: `synclip-video-${version}`, adminModelsEnabled: admin ?? false, ...(audio ? { audio } : {}) };
  if (version === 'v1' && admin === undefined) delete oldConfig.adminModelsEnabled;
  const config = join(root, 'config.json'), ready = join(root, 'spool/results/.ready');
  const service = join(units, serviceName), timer = join(units, timerName);
  const oldService = `[Unit]\nDescription=Previous fixture video broker\n[Service]\nType=oneshot\nUser=root\nGroup=1000\nExecStart=/usr/bin/flock -n ${posix(root)}/runner.lock /usr/bin/node ${posix(root)}/releases/${oldSha}/infra/synclip-video/broker.mjs --config ${posix(config)}\n`;
  const oldTimer = `[Timer]\nOnUnitActiveSec=15\nUnit=${serviceName}\n[Install]\nWantedBy=timers.target\n`;
  if (existing) {
    await writeFile(config, JSON.stringify(oldConfig) + '\n');
    await writeFile(ready, 'previous-ready');
    await writeFile(service, oldService);
    await writeFile(timer, oldTimer);
    await writeFile(join(root, 'runner.lock'), '');
  }
  // Completed output and unknown paid work must survive every installer path.
  const retained = {
    'spool/inbox/unknown-paid/request.json': '{"id":"unknown-paid","paid":true}',
    'private/unknown-paid/synclip-receipts.json': '{"taskId":"retained-paid-task"}',
    'private/completed-job/output.mp4': 'completed-video-fixture',
    'spool/results/completed-job/result.json': '{"status":"succeeded"}',
    'spool/results/completed-job/output.mp4': 'published-video-fixture',
  };
  for (const [name, value] of Object.entries(retained)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), value);
  }
  await writeFile(join(base, 'timer-active'), active);
  await writeFile(join(base, 'timer-enabled'), enabled);
  const relocate = value => value
    .replaceAll('/opt/openscience-releases', posix(join(base, 'sources')))
    .replaceAll('/opt/openscience-synclip-video', posix(root))
    .replaceAll('/opt/openscience-synclip', posix(shared))
    .replaceAll('/etc/systemd/system', posix(units));
  const installer = relocate(installerPath ? await readFile(installerPath, 'utf8') : installerSource);
  const strictShellHeader = /^set -(?:Eeuo|euo) pipefail\r?$/mu;
  assert.ok(strictShellHeader.test(installer), 'fixture must recognize the strict shell header before executing host commands');
  const script = join(base, 'install.sh');
  await writeFile(script, installer.replace(strictShellHeader,
    '$&\nunset MSYS2_ARG_CONV_EXCL MSYS2_ENV_CONV_EXCL\nexport PATH="$FAKE_BIN:$PATH"\n'
    + 'for fixture_command in id stat flock systemctl docker install chmod chown node getent groupadd timeout; do\n'
    + '  [[ $(command -v "$fixture_command") == "$FAKE_BIN/$fixture_command" ]] || { echo FIXTURE_HOST_COMMAND_ESCAPED >&2; exit 98; }\n'
    + 'done\n'
    // MSYS does not consistently carry FD9 through a script's /usr/bin/env
    // launcher. Execute the same flock fake in the installer's descriptor table.
    + (process.platform === 'win32' ? 'if [[ ${CHECK_FD9:-0} == 1 ]]; then flock() { source "$FAKE_BIN/flock" "$@"; }; fi\n' : '')
    + 'printf \'FIXTURE_ARG <%s>\\n\' "$@" >> "$CALLS"'));
  for (const file of ['infra/synclip-video/broker.mjs', 'infra/synclip-video/image-reference.mjs']) {
    const target = join(release, file); await mkdir(dirname(target), { recursive: true });
    // Relocate the broker's literal /opt prefix; do not replace its validator.
    await writeFile(target, relocate(await readFile(join(repo, file), 'utf8')).replaceAll("'/opt/'", `'${posix(base)}/'`));
  }
  const manifest = join(release, 'scripts/release-input-manifest.mjs');
  await mkdir(dirname(manifest), { recursive: true }); await copyFile(join(repo, 'scripts/release-input-manifest.mjs'), manifest);
  if (existing) {
    const oldBundle = join(root, 'releases', oldSha);
    await mkdir(join(oldBundle, 'infra/synclip-video'), { recursive: true });
    await writeFile(join(oldBundle, 'source-id'), oldSha + '\n');
    await copyFile(join(release, 'infra/synclip-video/broker.mjs'), join(oldBundle, 'infra/synclip-video/broker.mjs'));
  }
  const dist = join(release, 'packages/ai-gateway/dist'); await mkdir(dist, { recursive: true });
  for (const name of await readdir(join(repo, 'packages/ai-gateway/dist'))) {
    if (name.endsWith('.js')) await copyFile(join(repo, 'packages/ai-gateway/dist', name), join(dist, name));
  }
  // These guards run only in fixture child processes. They prohibit accidental
  // key reads and provider requests without replacing config/import validation.
  const guard = join(base, 'deny-provider-and-key.mjs');
  await writeFile(guard, `import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
function normalized(path) { return resolve(process.platform === 'win32' ? path.replace(/^\\/([a-z])\\//iu, (_, drive) => drive + ':/') : path); }
const keyPaths = new Set([process.env.FIXTURE_KEY, process.env.FIXTURE_KEY_NATIVE].map(normalized));
function denied(code) { fs.appendFileSync(process.env.CALLS_NATIVE, code + '\\n'); throw Error(code); }
function check(path) { if (typeof path === 'string' && keyPaths.has(normalized(path))) denied('FORBIDDEN_KEY_READ'); }
for (const name of ['readFile', 'readFileSync', 'open', 'openSync', 'createReadStream', 'copyFile', 'copyFileSync']) {
  const original = fs[name]; fs[name] = function (path, ...args) { check(path); return original.call(this, path, ...args); };
}
for (const name of ['readFile', 'open', 'copyFile']) {
  const original = fs.promises[name]; fs.promises[name] = function (path, ...args) { check(path); return original.call(this, path, ...args); };
}
const rename = fs.promises.rename;
fs.promises.rename = async function (source, destination) {
  await rename.call(this, source, destination);
  const labels = { [normalized(process.env.FIXTURE_ROOT + '/config.json')]: 'CONFIG',
    [normalized(process.env.FIXTURE_UNITS + '/${serviceName}')]: 'SERVICE',
    [normalized(process.env.FIXTURE_UNITS + '/${timerName}')]: 'TIMER' };
  const label = labels[normalized(destination)];
  if (label) fs.appendFileSync(process.env.CALLS_NATIVE, 'REPLACED_' + label + '\\n');
  if (!process.env.FAULT_AFTER || normalized(destination) !== normalized(process.env.FAULT_AFTER)) return;
  const marker = resolve(process.env.FIXTURE_BASE_NATIVE, 'replacement-failed');
  try { fs.writeFileSync(marker, '', { flag: 'wx' }); } catch (error) { if (error.code === 'EEXIST') return; throw error; }
  fs.appendFileSync(process.env.CALLS_NATIVE, 'INJECTED_AFTER_' + label + '\\n');
  if (process.env.FAULT_SIGNAL) {
    const sent = spawnSync(process.env.FIXTURE_BASH, ['-c', 'kill -s "$FAULT_SIGNAL" "$INSTALLER_PID"'], { env: process.env });
    if (sent.status !== 0) denied('FIXTURE_SIGNAL_INJECTION_FAILED');
    fs.appendFileSync(process.env.CALLS_NATIVE, 'SIGNAL_SENT_TO_INSTALLER_' + process.env.FAULT_SIGNAL + '\\n');
    process.exit(0);
  }
  throw Error('FIXTURE_AFTER_REPLACEMENT');
};
globalThis.fetch = () => denied('FORBIDDEN_PROVIDER_REQUEST');
for (const module of [http, https]) {
  for (const name of ['request', 'get']) module[name] = () => denied('FORBIDDEN_PROVIDER_REQUEST');
}
syncBuiltinESMExports();
`);
  const fault = join(base, 'after-replacement.sh');
  await writeFile(fault, `after_replacement() {
  case "$1" in
    "$FIXTURE_ROOT/config.json") printf 'REPLACED_CONFIG\\n' >> "$CALLS";;
    "$FIXTURE_UNITS/${serviceName}") printf 'REPLACED_SERVICE\\n' >> "$CALLS";;
    "$FIXTURE_UNITS/${timerName}") printf 'REPLACED_TIMER\\n' >> "$CALLS";;
  esac
  if [[ -n $FAULT_AFTER && $1 == "$FAULT_AFTER" && ! -e "$FIXTURE_BASE/replacement-failed" ]]; then
    touch "$FIXTURE_BASE/replacement-failed"
    printf 'INJECTED_AFTER_REPLACEMENT\\n' >> "$CALLS"
    case "$FAULT_SIGNAL" in
      INT|TERM) kill -s "$FAULT_SIGNAL" "$PPID"; printf 'SIGNAL_SENT_TO_INSTALLER_%s\\n' "$FAULT_SIGNAL" >> "$CALLS"; exit 0;; *) exit 1;;
    esac
  fi
}
`);
  const commands = {
    id: 'printf "%s\\n" "${INSTALL_UID:-0}"',
    stat: `path=\${@: -1}; uid=0; gid=0; mode=600
      if [[ -d $path ]]; then mode=700; fi
      if [[ $path == "$FIXTURE_UNITS/"* ]]; then mode=644; fi
      if [[ $path == */source-id || $path == "$FIXTURE_ROOT/releases/"*/service || $path == "$FIXTURE_ROOT/releases/"*/timer ]]; then mode=444; fi
      if [[ $path == */previous/service || $path == */previous/timer ]]; then mode=644; fi
      if [[ $path == "$FIXTURE_ROOT/spool/results/.ready" || $path == */previous/ready ]]; then gid=1000; mode=640; fi
      if [[ $path == "$FIXTURE_ROOT/spool/inbox" ]]; then uid=1000; gid=1000; mode=700; fi
      if [[ $path == "$FIXTURE_ROOT/spool/results" ]]; then gid=1000; mode=2750; fi
      if [[ $path == "$STAT_PATH" ]]; then uid=\${STAT_UID:-$uid}; gid=\${STAT_GID:-$gid}; mode=\${STAT_MODE:-$mode}; fi
      if [[ $1 == -c && $2 == *%[uga]* ]]; then
        format=$2; format=\${format//%u/$uid}; format=\${format//%g/$gid}; format=\${format//%a/$mode}; printf '%s\\n' "$format"
      else /usr/bin/stat "$@"; fi`,
    install: `source "$REPLACEMENT_FAULT"
      args=(); directory=false; target=''; while (( $# )); do case "$1" in
      -o|-g|-m) shift 2;; -d) directory=true; shift;; -t) target=$2; shift 2;; *) args+=("$1"); shift;; esac; done
      if [[ $directory == true ]]; then mkdir -p -- "\${args[@]}";
      elif [[ -n $target ]]; then cp -- "\${args[@]}" "$target/";
      else cp -- "\${args[@]}" || exit $?; after_replacement "\${args[-1]}"; fi`,
    mv: 'source "$REPLACEMENT_FAULT"; /usr/bin/mv "$@" || exit $?; after_replacement "${@: -1}"',
    ...Object.fromEntries(['cat', 'cp', 'dd'].map(name => [name, `for arg in "$@"; do
      [[ $arg != "$FIXTURE_KEY" && $arg != "if=$FIXTURE_KEY" ]] || { echo FORBIDDEN_KEY_READ >> "$CALLS"; exit 97; }
      done
      /usr/bin/${name} "$@"`])),
    chmod: ':', chown: ':',
    flock: 'if [[ ${CHECK_FD9:-0} == 1 ]]; then printf fd9-child-preserved >&9 || exit 98; fi; [[ ${BUSY_LOCK:-0} == 0 ]]',
    docker: '[[ ${BAD_RENDERER:-0} == 0 || $1 != run ]]',
    getent: '[[ ${GROUP_1000:-0} == 1 ]]', groupadd: ':',
    timeout: 'shift; "$@"',
    node: `if [[ \${2:-} == verify ]]; then [[ \${BAD_MANIFEST:-0} == 0 ]];
      elif [[ \${1:-} == */broker.mjs ]]; then echo FORBIDDEN_BROKER_EXECUTION >&2; exit 97;
      else export INSTALLER_PID=$PPID; exec "$REAL_NODE" --import "$NODE_GUARD" "$@"; fi`,
    curl: 'echo FORBIDDEN_PROVIDER_REQUEST >> "$CALLS"; exit 97',
    wget: 'echo FORBIDDEN_PROVIDER_REQUEST >> "$CALLS"; exit 97',
    systemctl: `action=$1; shift
      if [[ $action == daemon-reload || $action == disable ]]; then
        if [[ $FAIL_ACTION == "$action" && ! -e "$FIXTURE_BASE/action-failed" ]]; then
          touch "$FIXTURE_BASE/action-failed"
          case "$FAULT_SIGNAL" in
            INT|TERM) kill -s "$FAULT_SIGNAL" "$PPID"; printf 'SIGNAL_SENT_TO_INSTALLER_%s\\n' "$FAULT_SIGNAL" >> "$CALLS"; exit 0;; *) exit 1;;
          esac
        fi
      fi
      case "$action" in
        is-active) value=$(cat "$FIXTURE_BASE/timer-active"); printf '%s\\n' "$value"; [[ $value == active ]];;
        is-enabled) value=$(cat "$FIXTURE_BASE/timer-enabled"); printf '%s\\n' "$value"; [[ $value == enabled || $value == enabled-runtime ]];;
        stop) printf inactive > "$FIXTURE_BASE/timer-active";;
        disable) printf disabled > "$FIXTURE_BASE/timer-enabled";;
        enable) if [[ " $* " == *' --runtime '* ]]; then printf enabled-runtime > "$FIXTURE_BASE/timer-enabled";
          else printf enabled > "$FIXTURE_BASE/timer-enabled"; fi
          if [[ " $* " == *' --now '* ]]; then printf active > "$FIXTURE_BASE/timer-active"; fi;;
        start) printf active > "$FIXTURE_BASE/timer-active";;
      esac`,
  };
  for (const [name, body] of Object.entries(commands)) {
    const path = join(bin, name);
    await writeFile(path, `#!/usr/bin/env bash\nprintf '%s' '${name}' >> "$CALLS"; printf ' <%s>' "$@" >> "$CALLS"; printf '\\n' >> "$CALLS"\n${body}\n`);
    await chmod(path, 0o755);
  }
  const env = { PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    ...(process.platform === 'win32' ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
    CALLS: posix(calls), FIXTURE_BASE: posix(base), FIXTURE_ROOT: posix(root), FIXTURE_UNITS: posix(units),
    CALLS_NATIVE: calls, FIXTURE_KEY: posix(key), FIXTURE_KEY_NATIVE: key, NODE_GUARD: pathToFileURL(guard).href,
    FIXTURE_BASE_NATIVE: base, FIXTURE_BASH: bash,
    REPLACEMENT_FAULT: posix(fault), FAKE_BIN: posix(bin), REAL_NODE: posix(process.execPath),
    STAT_PATH: '', FAIL_ACTION: '', FAULT_AFTER: '', FAULT_SIGNAL: '' };
  const run = ({ extra = {}, defer = true, candidate, rollback = false, preserveFd9 = false, args } = {}) => {
    const commandArgs = args ?? (rollback ? ['--confirm', '--rollback', sha, ...(defer ? ['--defer-timer'] : [])] : [
      '--confirm', '--source', posix(release), '--renderer-image', renderer, ...(defer ? ['--defer-timer'] : []),
      ...(candidate ? ['--config', posix(candidate)] : []),
    ]);
    // MSYS drops nonstandard descriptors when exec starts a second Bash. Source
    // the unchanged script in the Bash that owns FD9, so the fake observes the
    // installer's real descriptor rather than inventing an inherited identity.
    const invocation = preserveFd9 ? ['-c', process.platform === 'win32'
      ? 'exec 9<>"$FIXTURE_BASE/production.lock"; source "$@"' : 'exec 9<>"$FIXTURE_BASE/production.lock"; exec "$@"',
      'fixture-parent', ...(process.platform === 'win32' ? [] : [bash]), posix(script), ...commandArgs] : [posix(script), ...commandArgs];
    return spawnSync(bash, invocation, { cwd: repo, encoding: 'utf8',
      env: { ...env, CHECK_FD9: preserveFd9 ? '1' : '0', ...extra }, timeout: 30000 });
  };
  return { base, root, release, units, key, config, ready, service, timer, script, run, retained, active, enabled,
    existing, defaultConfig, oldConfig, oldService, oldTimer, bundle: join(root, 'releases', sha),
    calls: async () => readFile(calls, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }) };
}
function diagnostic(result) {
  let value = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  for (const marker of [keyMarker, privateMarker, importMarker]) value = value.replaceAll(marker, '[redacted fixture value]');
  return `installer exit ${result.status}\n${value}`;
}
function successful(result) { assert.equal(result.status, 0, diagnostic(result)); }
async function absent(path) { await assert.rejects(lstat(path), { code: 'ENOENT' }); }
async function preservedWork(f) {
  assert.ok(await readFile(f.key, 'utf8') === keyMarker, 'shared fixture key must remain unchanged');
  for (const [name, value] of Object.entries(f.retained)) assert.equal(await readFile(join(f.root, name), 'utf8'), value, name);
  const calls = await f.calls();
  assert.doesNotMatch(calls, /systemctl <(?:stop|start|restart|try-restart|kill)>[^\n]*openscience-synclip-video\.service/u);
  assert.doesNotMatch(calls, /node <[^>]*\/broker\.mjs>|docker <(?:build|pull)>/u);
  assert.doesNotMatch(calls, /FORBIDDEN_KEY_READ|FORBIDDEN_PROVIDER_REQUEST/u);
  assert.ok(!calls.includes(keyMarker), 'host command log must not contain the fixture key');
}
async function unchanged(f) {
  if (f.existing) {
    assert.ok(await readFile(f.config, 'utf8') === JSON.stringify(f.oldConfig) + '\n', 'live config must remain unchanged');
    assert.equal(await readFile(f.service, 'utf8'), f.oldService);
    assert.equal(await readFile(f.timer, 'utf8'), f.oldTimer);
    assert.equal(await readFile(f.ready, 'utf8'), 'previous-ready');
  } else { for (const path of [f.config, f.service, f.timer, f.ready]) await absent(path); }
  assert.equal(await readFile(join(f.base, 'timer-active'), 'utf8'), f.active);
  assert.equal(await readFile(join(f.base, 'timer-enabled'), 'utf8'), f.enabled);
  await preservedWork(f);
}
async function candidateConfig(f, value = f.defaultConfig, name = 'operator-config.json') {
  const path = join(f.root, 'private', name);
  await writeFile(path, JSON.stringify(value) + '\n', { mode: 0o600 });
  return path;
}
async function liveState(f) {
  const result = {};
  for (const [name, path] of Object.entries({ config: f.config, service: f.service, timer: f.timer, ready: f.ready })) {
    result[name] = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  }
  for (const name of ['timer-active', 'timer-enabled']) result[name] = await readFile(join(f.base, name), 'utf8');
  return result;
}
async function previousState(f) {
  const result = {};
  for (const name of (await readdir(join(f.bundle, 'previous'))).sort()) {
    result[name] = await readFile(join(f.bundle, 'previous', name), 'utf8');
  }
  return result;
}
async function failClosed(f) {
  await absent(f.ready);
  assert.equal(await readFile(join(f.base, 'timer-active'), 'utf8'), 'inactive');
  assert.equal(await readFile(join(f.base, 'timer-enabled'), 'utf8'), 'disabled');
  await preservedWork(f);
}
function privateFailure(result, marker) {
  assert.notEqual(result.status, 0);
  assert.ok(!(result.stdout + result.stderr).includes(marker), 'rejection must not disclose private config or import diagnostics');
  assert.match(result.stderr, /SYNCLIP_VIDEO_RUNTIME_OR_CONFIG_INVALID/u);
}

test('upgrades existing v1 with a complete previous snapshot and a deferred v2 runtime', async () => {
  const f = await fixture(); successful(f.run());
  assert.deepEqual(JSON.parse(await readFile(f.config, 'utf8')), f.defaultConfig);
  for (const [name, contents] of Object.entries({ service: f.oldService, timer: f.oldTimer,
    'config.json': JSON.stringify(f.oldConfig) + '\n', ready: 'previous-ready' })) {
    assert.equal(await readFile(join(f.bundle, 'previous', name), 'utf8'), contents);
  }
  const timerState = await readFile(join(f.bundle, 'previous/timer-state'), 'utf8');
  assert.match(timerState, /\bactive\b/u); assert.match(timerState, /\benabled\b/u);
  assert.equal((await readFile(join(f.bundle, 'source-id'), 'utf8')).trim(), sha);
  for (const module of runtimeModules) {
    assert.deepEqual(await readFile(join(f.bundle, 'packages/ai-gateway/dist', module + '.js')),
      await readFile(join(f.release, 'packages/ai-gateway/dist', module + '.js')));
  }
  await absent(f.ready);
  const calls = await f.calls();
  assert.match(calls, /flock <-n> <8>/u);
  assert.doesNotMatch(calls, /flock <-n> <9>/u);
  assert.match(calls, /node <--input-type=module>/u);
  assert.match(calls, /systemctl <stop> <openscience-synclip-video\.timer>/u);
  assert.match(calls, /systemctl <disable> <openscience-synclip-video\.timer>/u);
  assert.doesNotMatch(calls, /systemctl <(?:enable|start)>/u);
  assert.equal(await readFile(join(f.base, 'timer-active'), 'utf8'), 'inactive');
  assert.equal(await readFile(join(f.base, 'timer-enabled'), 'utf8'), 'disabled');
  await preservedWork(f);
});

test('existing installation requires explicit defer before changing live state', async () => {
  const f = await fixture(); const result = f.run({ defer: false });
  assert.equal(result.status, 69); assert.match(result.stderr, /SYNCLIP_VIDEO_EXISTING_INSTALL_REQUIRES_DEFER/u);
  await unchanged(f); await absent(f.bundle);
  assert.doesNotMatch(await f.calls(), /systemctl <(?:stop|disable|enable|start|daemon-reload)>/u);
});

test('known v2 upgrade preserves explicitly selected audio and administrator mode', async () => {
  const audio = { provider: 'synclip', voice: 'operator-selected-voice', speed: 1.05 };
  const f = await fixture({ version: 'v2', audio, admin: true }); successful(f.run());
  assert.deepEqual(JSON.parse(await readFile(f.config, 'utf8')), f.oldConfig);
  assert.deepEqual(JSON.parse(await readFile(join(f.bundle, 'previous/config.json'), 'utf8')), f.oldConfig);
  await failClosed(f);
});

test('explicit protected complete config supplies audio and admin without a credential', async () => {
  const f = await fixture();
  const selected = { ...f.defaultConfig, adminModelsEnabled: true, audio: { provider: 'synclip', voice: 'selected-voice', speed: 0.95 } };
  const candidate = await candidateConfig(f, selected); const original = await readFile(candidate, 'utf8');
  successful(f.run({ candidate }));
  assert.deepEqual(JSON.parse(await readFile(f.config, 'utf8')), selected);
  assert.equal(await readFile(candidate, 'utf8'), original); await failClosed(f);
});

test('explicit config outside private, with unsafe ownership or mode, or through a symlink is refused', async () => {
  for (const variant of ['outside', 'mode', 'owner', 'symlink']) {
    const f = await fixture(); let candidate = await candidateConfig(f); let extra = {};
    if (variant === 'outside') { const outside = join(f.base, 'outside-config.json'); await copyFile(candidate, outside); candidate = outside; }
    if (variant === 'mode') extra = { STAT_PATH: posix(candidate), STAT_MODE: '644' };
    if (variant === 'owner') extra = { STAT_PATH: posix(candidate), STAT_UID: '1000' };
    if (variant === 'symlink') {
      const target = join(f.base, 'selected-config'); await mkdir(target); await copyFile(candidate, join(target, basename(candidate)));
      const alias = join(f.root, 'private/config-alias'); await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
      candidate = join(alias, basename(candidate));
    }
    const result = f.run({ candidate, extra }); assert.equal(result.status, 67, variant);
    await unchanged(f); assert.doesNotMatch(await f.calls(), /systemctl <(?:stop|disable|daemon-reload)>/u);
  }
});

test('invalid complete config fields and malformed JSON fail without exposing private values', async () => {
  const marker = privateMarker;
  for (const variant of ['secret', 'audio-secret', 'key-path', 'spool-path', 'admin-type', 'voice', 'speed', 'incomplete', 'json']) {
    const f = await fixture(); const value = { ...f.defaultConfig };
    if (variant === 'secret') value.apiKey = marker;
    if (variant === 'audio-secret') value.audio = { provider: 'synclip', voice: 'selected-voice', speed: 1, token: marker };
    if (variant === 'key-path') value.keyPath = `${posix(f.root)}/private/${marker}`;
    if (variant === 'spool-path') value.inbox = `${posix(f.root)}/private/${marker}`;
    if (variant === 'admin-type') value.adminModelsEnabled = marker;
    if (variant === 'voice') value.audio = { provider: 'synclip', voice: marker + ' invalid voice', speed: 1 };
    if (variant === 'speed') value.audio = { provider: 'synclip', voice: 'selected-voice', speed: 0 };
    if (variant === 'incomplete') delete value.results;
    const candidate = await candidateConfig(f, value);
    if (variant === 'json') await writeFile(candidate, '{"private":"' + marker + '",invalid}');
    privateFailure(f.run({ candidate }), marker); await unchanged(f);
  }
});

test('unknown or non-default v1 configuration is rejected instead of silently granting migration', async () => {
  for (const settings of [{ version: 'v3' }, { admin: true }, { audio: { provider: 'synclip', voice: 'selected-voice', speed: 1 } }]) {
    const f = await fixture(settings); privateFailure(f.run(), keyMarker); await unchanged(f);
  }
});

test('busy provider FD8 preserves the inherited production FD9 and every live component', async () => {
  const f = await fixture(); const result = f.run({ extra: { BUSY_LOCK: '1' }, preserveFd9: true });
  assert.equal(result.status, 71, diagnostic(result) + '\n' + await f.calls());
  assert.equal(await readFile(join(f.base, 'production.lock'), 'utf8'), 'fd9-child-preserved', diagnostic(result));
  assert.match(await f.calls(), /flock <-n> <8>/u); assert.doesNotMatch(await f.calls(), /flock <-n> <9>|systemctl/u);
  await unchanged(f); await absent(f.bundle);
});

test('bad source manifest, mutable renderer, and failed renderer inspection leave the existing install unchanged', async () => {
  for (const failure of ['manifest', 'mutable-renderer', 'renderer']) {
    const f = await fixture(); const result = failure === 'mutable-renderer'
      ? f.run({ args: ['--confirm', '--source', posix(f.release), '--renderer-image', 'renderer:latest', '--defer-timer'] })
      : f.run({ extra: failure === 'manifest' ? { BAD_MANIFEST: '1' } : { BAD_RENDERER: '1' } });
    assert.notEqual(result.status, 0); if (failure !== 'manifest') assert.equal(result.status, 66);
    await unchanged(f); await absent(f.bundle);
    assert.doesNotMatch(await f.calls(), /systemctl <(?:stop|disable|daemon-reload)>/u);
  }
});

test('non-root, unsafe root, unsafe units, unsafe config, and shared key modes never enter the live switch', async () => {
  for (const variant of ['non-root', 'root', 'service', 'config', 'key']) {
    const f = await fixture();
    const extra = variant === 'non-root' ? { INSTALL_UID: '1000' }
      : { STAT_PATH: posix({ root: f.root, service: f.service, config: f.config, key: f.key }[variant]), STAT_MODE: variant === 'root' ? '777' : '666' };
    assert.notEqual(f.run({ extra }).status, 0, variant); await unchanged(f);
    assert.doesNotMatch(await f.calls(), /systemctl <(?:stop|disable|daemon-reload)>/u);
  }
});

test('partial installation and a symlinked unit directory are refused without filling in or replacing components', async () => {
  for (const variant of ['partial', 'symlink']) {
    const f = await fixture();
    if (variant === 'partial') await unlink(f.service);
    else {
      const target = join(f.base, 'original-units');
      assert.equal(dirname(await realpath(f.units)), await realpath(f.base));
      await rename(f.units, target); await symlink(target, f.units, process.platform === 'win32' ? 'junction' : 'dir');
    }
    const before = await liveState(f); assert.equal(f.run().status, 68, variant);
    assert.deepEqual(await liveState(f), before); await preservedWork(f);
  }
});

test('existing immutable candidate bundle is never overwritten', async () => {
  const f = await fixture(); await mkdir(f.bundle, { recursive: true });
  await writeFile(join(f.bundle, 'source-id'), 'retained-candidate');
  assert.equal(f.run().status, 69); assert.equal(await readFile(join(f.bundle, 'source-id'), 'utf8'), 'retained-candidate');
  await unchanged(f); assert.doesNotMatch(await f.calls(), /systemctl <(?:stop|disable|daemon-reload)>/u);
});

test('missing source dependency and invalid staged broker syntax are rejected before live changes', async () => {
  for (const variant of ['dependency', 'syntax']) {
    const f = await fixture(); const marker = importMarker;
    if (variant === 'dependency') await unlink(join(f.release, 'packages/ai-gateway/dist/ocr.js'));
    else await writeFile(join(f.release, 'infra/synclip-video/broker.mjs'), 'throw Error("' + marker + '"); invalid syntax {');
    const result = f.run();
    if (variant === 'syntax') privateFailure(result, marker);
    else { assert.notEqual(result.status, 0); assert.ok(!(result.stdout + result.stderr).includes(keyMarker)); }
    await unchanged(f);
    assert.doesNotMatch(await f.calls(), /systemctl <(?:stop|disable|daemon-reload)>/u);
  }
});

test('first installation defers without starting a broker and retains the root:1000 locked oneshot contract', async () => {
  const f = await fixture({ existing: false }); successful(f.run());
  assert.deepEqual(JSON.parse(await readFile(f.config, 'utf8')), f.defaultConfig);
  const unit = await readFile(f.service, 'utf8');
  assert.match(unit, /Type=oneshot\nUser=root\nGroup=1000/u);
  assert.ok(unit.includes(`ExecStart=/usr/bin/flock -n ${posix(f.root)}/runner.lock /usr/bin/node ${posix(f.bundle)}/infra/synclip-video/broker.mjs --config ${posix(f.config)}`));
  assert.match(unit, /ProtectSystem=strict/u); assert.match(unit, /UMask=0027/u);
  assert.doesNotMatch(await f.calls(), /systemctl <(?:enable|start)>/u); await failClosed(f);
});

test('first installation without defer explicitly enables only the timer', async () => {
  const f = await fixture({ existing: false }); successful(f.run({ defer: false }));
  assert.match(await f.calls(), /systemctl <enable> <--now> <openscience-synclip-video\.timer>/u);
  await absent(f.ready); await preservedWork(f);
});

test('daemon-reload and disable failures restore the original compatible config, units, ready, and timer state', async () => {
  for (const [action, active, enabled] of [['daemon-reload', 'active', 'enabled'], ['disable', 'active', 'enabled'],
    ['daemon-reload', 'inactive', 'disabled'], ['disable', 'active', 'enabled-runtime']]) {
    const f = await fixture({ version: 'v2', active, enabled }); assert.notEqual(f.run({ extra: { FAIL_ACTION: action } }).status, 0);
    await unchanged(f);
    if (active === 'active') assert.match(await f.calls(), /systemctl <start> <openscience-synclip-video\.timer>/u);
    else assert.doesNotMatch(await f.calls(), /systemctl <start>/u);
    assert.equal(await readFile(join(f.bundle, 'previous/config.json'), 'utf8'), JSON.stringify(f.oldConfig) + '\n');
  }
});

test('failed first installation removes only new live config and units and never advertises ready or starts a timer', async () => {
  const f = await fixture({ existing: false, enabled: 'disabled' });
  assert.notEqual(f.run({ extra: { FAIL_ACTION: 'daemon-reload' } }).status, 0);
  await unchanged(f); assert.doesNotMatch(await f.calls(), /systemctl <(?:enable|start)>/u);
});

test('INT and TERM during upgrade restore a compatible installation once with their signal exit codes', async () => {
  for (const [signal, code] of [['INT', 130], ['TERM', 143]]) {
    const f = await fixture({ version: 'v2' });
    assert.equal(f.run({ extra: { FAIL_ACTION: 'daemon-reload', FAULT_SIGNAL: signal } }).status, code);
    await unchanged(f);
    assert.match(await f.calls(), new RegExp('^SIGNAL_SENT_TO_INSTALLER_' + signal + '$', 'mu'));
    assert.equal((await f.calls()).match(/systemctl <start> <openscience-synclip-video\.timer>/gu)?.length, 1);
  }
});

test('v1 automatic failure restoration keeps disabled and no ready when inbox or private contains any UUID job, including terminal work', async () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  for (const directory of ['spool/inbox', 'private']) {
    const f = await fixture(); const relative = `${directory}/${uuid}/result.json`;
    await mkdir(dirname(join(f.root, relative)), { recursive: true });
    f.retained[relative] = '{"status":"succeeded","paid":true}'; await writeFile(join(f.root, relative), f.retained[relative]);
    assert.notEqual(f.run({ extra: { FAIL_ACTION: 'daemon-reload' } }).status, 0);
    assert.equal(await readFile(f.config, 'utf8'), JSON.stringify(f.oldConfig) + '\n');
    assert.equal(await readFile(f.service, 'utf8'), f.oldService);
    assert.equal(await readFile(f.timer, 'utf8'), f.oldTimer);
    await failClosed(f); assert.doesNotMatch(await f.calls(), /systemctl <(?:enable|start)>/u);
  }
});

test('escaped v1 revision in valid JSON still holds UUID work disabled without ready on upgrade failure', async () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  for (const escape of ['value', 'property']) {
    for (const directory of ['spool/inbox', 'private']) {
      // A caller may select an explicit, recorded pre-fix copy for RED evidence.
      // Normal regression runs always exercise the current installer.
      const f = await fixture({ installerPath: process.env.SYNCLIP_VIDEO_INSTALL_TEST_SOURCE });
      const oldBytes = (JSON.stringify(f.oldConfig) + '\n').replace(
        escape === 'value' ? '"synclip-video-v1"' : '"adapterRevision"',
        escape === 'value' ? '"synclip-video-v\\u0031"' : '"adapterRevisio\\u006e"');
      assert.equal(JSON.parse(oldBytes).adapterRevision, 'synclip-video-v1');
      await writeFile(f.config, oldBytes);
      const relative = `${directory}/${uuid}/result.json`; await mkdir(dirname(join(f.root, relative)), { recursive: true });
      f.retained[relative] = '{"status":"succeeded","paid":true}'; await writeFile(join(f.root, relative), f.retained[relative]);
      assert.notEqual(f.run({ extra: { FAIL_ACTION: 'daemon-reload' } }).status, 0);
      assert.ok((await lstat(join(f.base, 'action-failed'))).isFile(), 'must reach the injected daemon-reload failure');
      assert.match(await f.calls(), /systemctl <daemon-reload>/u);
      assert.ok(await readFile(f.config, 'utf8') === oldBytes, 'restoration must preserve original escaped JSON bytes');
      await failClosed(f); assert.doesNotMatch(await f.calls(), /systemctl <(?:enable|start)>/u);
    }
  }
});

test('manual previous rollback restores old config and units while retaining previous and keeping disabled without ready', async () => {
  const f = await fixture(); successful(f.run()); const previous = await previousState(f);
  // A ready from a briefly activated new bundle must never survive rollback.
  await writeFile(f.ready, 'new-bundle-ready');
  successful(f.run({ rollback: true, preserveFd9: true }));
  assert.equal(await readFile(f.config, 'utf8'), JSON.stringify(f.oldConfig) + '\n');
  assert.equal(await readFile(f.service, 'utf8'), f.oldService);
  assert.equal(await readFile(f.timer, 'utf8'), f.oldTimer);
  assert.deepEqual(await previousState(f), previous); await failClosed(f);
  assert.equal(await readFile(join(f.base, 'production.lock'), 'utf8'), 'fd9-child-preserved');
  assert.doesNotMatch(await f.calls(), /systemctl <(?:enable|start)>|flock <-n> <9>/u);
});

test('rollback requires defer and rejects busy FD8, missing previous components, and unsafe previous without any live change', async () => {
  for (const variant of ['no-defer', 'busy', 'missing-previous', 'missing-config', 'missing-service', 'missing-timer',
    'missing-timer-state', 'unsafe-config', 'unsafe-directory', 'symlink-directory']) {
    const f = await fixture(); successful(f.run()); let extra = {};
    const previous = join(f.bundle, 'previous');
    if (variant === 'missing-previous' || variant === 'symlink-directory') {
      const retained = join(f.bundle, 'retained-previous');
      assert.equal(dirname(await realpath(previous)), await realpath(f.bundle)); await rename(previous, retained);
      if (variant === 'symlink-directory') await symlink(retained, previous, process.platform === 'win32' ? 'junction' : 'dir');
    } else if (variant.startsWith('missing-')) await unlink(join(previous, variant === 'missing-config' ? 'config.json' : variant.slice('missing-'.length)));
    if (variant === 'busy') extra = { BUSY_LOCK: '1' };
    if (variant === 'unsafe-config') extra = { STAT_PATH: posix(join(f.bundle, 'previous/config.json')), STAT_MODE: '666' };
    if (variant === 'unsafe-directory') extra = { STAT_PATH: posix(previous), STAT_MODE: '777' };
    const before = await liveState(f);
    const result = f.run({ rollback: true, defer: variant !== 'no-defer', extra, preserveFd9: variant === 'busy' });
    assert.notEqual(result.status, 0, variant); if (variant === 'busy') assert.equal(result.status, 71);
    assert.deepEqual(await liveState(f), before); await preservedWork(f);
    if (variant === 'busy') assert.equal(await readFile(join(f.base, 'production.lock'), 'utf8'), 'fd9-child-preserved');
  }
});

test('rollback errors and INT or TERM after config, service, or reload fail closed once and a repeated rollback completes', async t => {
  for (const boundary of ['config', 'service', 'daemon-reload']) {
    for (const [signal, code] of [['', 1], ['INT', 130], ['TERM', 143]]) {
      await t.test(`rollback boundary ${boundary}/${signal || 'ERR'}`, async () => {
        const f = await fixture({ installerPath: process.env.SYNCLIP_VIDEO_INSTALL_TEST_SOURCE });
        successful(f.run()); const previous = await previousState(f);
        await writeFile(f.ready, 'new-bundle-ready');
        await writeFile(join(f.base, 'timer-active'), 'active'); await writeFile(join(f.base, 'timer-enabled'), 'enabled');
        const extra = { FAULT_SIGNAL: signal, ...(boundary === 'daemon-reload' ? { FAIL_ACTION: boundary }
          : { FAULT_AFTER: posix(boundary === 'config' ? f.config : f.service) }) };
        const beforeCalls = await f.calls();
        const result = f.run({ rollback: true, extra });
        assert.ok(!result.error, 'fixture subprocess must finish without a spawn error or timeout');
        assert.equal(result.signal, null, 'installer must exit normally after handling the injected failure or signal');
        if (signal) assert.equal(result.status, code, `${boundary}/${signal}: ${diagnostic(result)}`);
        else assert.ok(Number.isInteger(result.status) && result.status > 0,
          `${boundary}/ERR must exit with a numeric nonzero status: ${diagnostic(result)}`);
        await failClosed(f); assert.deepEqual(await previousState(f), previous);
        const failureCalls = (await f.calls()).slice(beforeCalls.length);
        if (signal) assert.match(failureCalls, new RegExp('^SIGNAL_SENT_TO_INSTALLER_' + signal + '$', 'mu'));
        if (boundary !== 'daemon-reload') assert.match(failureCalls, /INJECTED_AFTER_/u);
        assert.match(failureCalls, /^REPLACED_CONFIG$/mu);
        for (const component of ['CONFIG', 'SERVICE', 'TIMER']) {
          assert.ok((failureCalls.match(new RegExp('^REPLACED_' + component + '$', 'gmu')) ?? []).length <= 1,
            'failed rollback must not re-enter component restoration');
        }
        // The failed operation is one-shot; reusing the same invocation proves
        // recovery works from a genuinely half-restored installation.
        successful(f.run({ rollback: true, extra }));
        assert.equal(await readFile(f.config, 'utf8'), JSON.stringify(f.oldConfig) + '\n');
        assert.equal(await readFile(f.service, 'utf8'), f.oldService); assert.equal(await readFile(f.timer, 'utf8'), f.oldTimer);
        await failClosed(f); assert.deepEqual(await previousState(f), previous);
        assert.doesNotMatch(await f.calls(), /systemctl <(?:enable|start)>/u);
      });
    }
  }
});
