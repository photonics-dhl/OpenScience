import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceScript = resolve(dirname(fileURLToPath(import.meta.url)), 'scansci-auth-tunnel.sh');
const sourceRfbProbe = resolve(dirname(fileURLToPath(import.meta.url)), 'probe-novnc-rfb.mjs');
const authEntrypoint = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/scansci-legal/auth-entrypoint.sh');
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'scansci-auth-tunnel-'));
  const scripts = join(root, 'infra', 'scripts');
  const bin = join(root, 'bin');
  const home = join(root, 'home');
  const state = join(root, 'state');
  await Promise.all([
    mkdir(scripts, { recursive: true }),
    mkdir(bin, { recursive: true }),
    mkdir(join(home, '.ssh'), { recursive: true }),
    mkdir(state, { recursive: true }),
  ]);
  const script = join(scripts, 'scansci-auth-tunnel.sh');
  const rfbProbe = join(scripts, 'probe-novnc-rfb.mjs');
  const ssh = join(bin, 'ssh');
  const log = join(root, 'ssh-argv.log');
  await copyFile(sourceScript, script);
  await copyFile(sourceRfbProbe, rfbProbe);
  await writeFile(join(root, '.env'), [
    'SERVER_HOST=198.51.100.24',
    'SERVER_USER=operator-fixture',
    'SERVER_PORT=2222',
    'UNRELATED_SECRET=must-never-be-printed',
    '',
  ].join('\n'));
  await writeFile(join(home, '.ssh', 'id_ed25519_xgs'), 'fixture-key-never-read\n');
  await writeFile(join(home, '.ssh', 'known_hosts'), 'fixture-host-key\n');
  await writeFile(ssh, `#!/usr/bin/env bash
printf '%s\\n' '---' "$@" >> "$FAKE_SSH_LOG"
case " $* " in
  *" cat /opt/openscience/.release-id "*)
    printf '%s\\n' "\${FAKE_RELEASE_SHA:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
    exit 0
    ;;
esac
case " $* " in
  *" --profile scansci-auth up --no-start --no-build --force-recreate scansci-auth"*)
    if [ -n "\${FAKE_HEALTH_READY_FILE:-}" ]; then : > "$FAKE_HEALTH_READY_FILE"; fi
    ;;
esac
case " $* " in
  *" --profile scansci-auth rm -f -s scansci-auth"*)
    if [ "\${FAKE_SSH_STOP_FAIL:-0}" = 1 ]; then exit 9; fi
    ;;
esac
case " $* " in
  *"verify-scansci-runtime.mjs"*)
    if [ "\${FAKE_AUTH_RETAG:-0}" = 1 ] && case " $* " in *" --allow-auth 0 "*) true;; *) false;; esac; then exit 8; fi
    if [ "\${FAKE_RUNTIME_VERIFY_FAIL:-0}" = 1 ] && case " $* " in *" --allow-auth 1 "*) true;; *) false;; esac; then exit 8; fi
    if [ -n "\${FAKE_RUNTIME_VERIFY_DELAY:-}" ] && case " $* " in *" --allow-auth 1 "*) true;; *) false;; esac; then sleep "$FAKE_RUNTIME_VERIFY_DELAY"; fi
    ;;
esac
case " $* " in
  *" -N "*)
    if [ "\${FAKE_SSH_TUNNEL_FAIL:-0}" = 1 ] && [ -z "\${FAKE_TUNNEL_PID_FILE:-}" ]; then exit 2; fi
    if [ -n "\${FAKE_TUNNEL_PID_FILE:-}" ]; then printf '%s\\n' "$$" > "$FAKE_TUNNEL_PID_FILE"; fi
    if [ "\${FAKE_SSH_TUNNEL_FAIL:-0}" = 1 ]; then sleep "\${FAKE_SSH_TUNNEL_FAIL_DELAY:-0}"; exit 2; fi
    trap 'exit 0' TERM INT
    while true; do sleep 1; done
    ;;
esac
`);
  await Promise.all([chmod(script, 0o755), chmod(ssh, 0o755)]);
  const bashBin = process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', bin], { encoding: 'utf8' }).stdout.trim()
    : bin;
  const bashKey = process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', join(home, '.ssh', 'id_ed25519_xgs')], { encoding: 'utf8' }).stdout.trim()
    : join(home, '.ssh', 'id_ed25519_xgs');
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_STATE_HOME: state,
    FAKE_SSH_LOG: log,
    FAKE_RELEASE_SHA: 'a'.repeat(40),
  };
  return { root, script, log, env, bashBin, bashKey };
}

function run(script, args, env, bashBin = '') {
  return spawnSync(
    bash,
    ['-c', 'PATH="$1:$PATH"; export PATH; shift; exec "$@"', 'run-script', bashBin, script, ...args],
    { encoding: 'utf8', env, timeout: 20_000 },
  );
}

function runAsync(script, args, env, bashBin = '') {
  return new Promise((resolveRun) => {
    const child = spawn(
      bash,
      ['-c', 'PATH="$1:$PATH"; export PATH; shift; exec "$@"', 'run-script', bashBin, script, ...args],
      { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status, signal) => resolveRun({ status, signal, stdout, stderr }));
  });
}

async function startHealthServer(t, port, { websocket = true, readyFile = '' } = {}) {
  const source = `const {createHash}=require('crypto');const {existsSync}=require('fs');const websocket=${JSON.stringify(websocket)};const readyFile=${JSON.stringify(readyFile)};const ready=()=>!readyFile||existsSync(readyFile);const server=require('http').createServer((request,response)=>{const ok=ready()&&request.url==='/vnc.html?autoconnect=true&resize=remote';response.writeHead(ok?200:404);response.end(ok?'ok':'not found')});server.on('upgrade',(request,socket)=>{if(!ready()||!websocket||request.url!=='/websockify'||!request.headers['sec-websocket-key']){socket.end('HTTP/1.1 404 Not Found\\r\\nConnection: close\\r\\n\\r\\n');return}const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade','Sec-WebSocket-Accept: '+accept,'Sec-WebSocket-Protocol: binary','',''].join('\\r\\n'));const payload=Buffer.from('RFB 003.008\\n','ascii');socket.end(Buffer.concat([Buffer.from([0x82,payload.length]),payload]))});server.listen(${port},'127.0.0.1')`;
  const server = spawn(process.execPath, ['-e', source], { stdio: 'ignore' });
  t.after(() => { if (server.exitCode === null) server.kill(); });
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  return server;
}

async function writeTunnelState(f, {
  token = 'c'.repeat(32), pid, port, release = 'a'.repeat(40), lifecycle = 'running', format = 'current',
}) {
  const stateRoot = join(f.env.XDG_STATE_HOME, 'openscience');
  await mkdir(stateRoot, { recursive: true });
  const releaseRoot = `/opt/openscience-releases/${release}`;
  const lines = [
    token,
    String(pid),
    String(port),
    release,
    releaseRoot,
    `${releaseRoot}/infra/compose/docker-compose.prod.yml`,
  ];
  if (format === 'current') lines.push(lifecycle);
  else if (format !== 'legacy') throw new Error(`unknown tunnel state format: ${format}`);
  await writeFile(
    join(stateRoot, 'scansci-auth-tunnel.state'),
    `${lines.join('\n')}\n`,
  );
}

async function installOneShotStateMoveFailure(f) {
  const fakeMv = join(f.root, 'bin', 'mv');
  await writeFile(fakeMv, [
    '#!/usr/bin/env bash',
    'marker="$XDG_STATE_HOME/openscience/.fake-state-mv-failed"',
    'destination="${!#}"',
    'case "$destination" in',
    '  */scansci-auth-tunnel.state)',
    '    if [ "${FAKE_STATE_MV_FAIL_ONCE:-0}" = 1 ] && [ ! -e "$marker" ]; then',
    '      : > "$marker"',
    '      exit 73',
    '    fi',
    '    ;;',
    'esac',
    'exec /usr/bin/mv "$@"',
    '',
  ].join('\n'));
  await chmod(fakeMv, 0o755);
}

async function installDelayedProcessTable(f, failures) {
  const fakePs = join(f.root, 'bin', 'ps');
  const countFile = join(f.root, 'ps-count');
  await writeFile(fakePs, [
    '#!/usr/bin/env bash',
    `count_file=${JSON.stringify(countFile)}`,
    'count="$(cat "$count_file" 2>/dev/null || printf 0)"',
    'count=$((count + 1))',
    'printf "%s\\n" "$count" > "$count_file"',
    `if [ "$count" -le ${failures} ]; then exit 1; fi`,
    'exec /usr/bin/ps "$@"',
    '',
  ].join('\n'));
  await chmod(fakePs, 0o755);
}

async function installKillAudit(f) {
  const bashEnv = join(f.root, 'disable-builtin-kill.sh');
  const killLog = join(f.root, 'kill-argv.log');
  const fakeKill = join(f.root, 'bin', 'kill');
  await writeFile(bashEnv, 'enable -n kill\n');
  await writeFile(fakeKill, [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$FAKE_KILL_LOG"',
    'exec /usr/bin/kill "$@"',
    '',
  ].join('\n'));
  await chmod(fakeKill, 0o755);
  const toBashPath = (path) => process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', path], { encoding: 'utf8' }).stdout.trim()
    : path;
  return {
    bashEnv: toBashPath(bashEnv),
    killLog,
    killLogForBash: toBashPath(killLog),
  };
}

test('status is read-only and only explicit start launches the helper and loopback tunnel', async (t) => {
  const f = await fixture();
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  await startHealthServer(t, 16080);

  const before = run(f.script, ['status'], f.env, f.bashBin);
  assert.equal(before.status, 3, before.stderr);
  assert.match(before.stdout, /^stopped\s*$/);
  assert.equal(existsSync(f.log), false);

  const started = run(f.script, ['start', '16080'], f.env, f.bashBin);
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.match(started.stdout, /^started on http:\/\/127\.0\.0\.1:16080\/vnc\.html\?autoconnect=true&resize=remote\s*$/);

  const status = run(f.script, ['status'], f.env, f.bashBin);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /^running on http:\/\/127\.0\.0\.1:16080\/vnc\.html\?autoconnect=true&resize=remote\s*$/);

  const log = await readFile(f.log, 'utf8');
  assert.match(log, /flock -n -E 73 \/run\/lock\/openscience-production-deploy\/lock/u);
  const helperStart = log.indexOf('--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth');
  assert.ok(helperStart >= 0, 'auth helper must start');
  assert.doesNotMatch(log, /scansci-secret-init/u, 'interactive auth must not refresh or mount unrelated Secret material');
  assert.equal(
    (log.match(/docker compose --project-directory "\/opt\/openscience-releases\/[0-9a-f]{40}"/g) ?? []).length,
    2,
    'auth startup must retain the immutable release project identity',
  );
  assert.match(log, /docker compose .*--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/u);
  assert.match(log, /prepare-scansci-auth-network\.sh/u);
  assert.match(log, /docker compose .*--profile scansci-auth start scansci-auth/u);
  assert.match(log, /read -r SCANSCI_BROWSER_REQUIREMENTS_SHA256 _ < <\(sha256sum "\/opt\/openscience-releases\/[0-9a-f]{40}\/apps\/scansci-legal\/browser-requirements\.lock"\)/u);
  assert.match(log, /SCANSCI_BROWSER_REQUIREMENTS_SHA256="\$SCANSCI_BROWSER_REQUIREMENTS_SHA256" docker compose/u);
  assert.match(log, /-L\n127\.0\.0\.1:16080:172\.25\.0\.2:6080/);
  assert.match(log, new RegExp(`-i\\n${f.bashKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(log, /operator-fixture@198\.51\.100\.24/);

  const combined = `${before.stdout}${before.stderr}${started.stdout}${started.stderr}${status.stdout}${status.stderr}`;
  for (const value of ['198.51.100.24', 'operator-fixture', '2222', 'must-never-be-printed']) {
    assert.doesNotMatch(combined, new RegExp(value));
  }
});

test('status does not report a recorded tunnel as running after its RFB backend disappears', async (t) => {
  const f = await fixture();
  const health = await startHealthServer(t, 16108);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16108'], f.env, f.bashBin).status, 0);
  health.kill();
  await new Promise((resolveWait) => health.once('close', resolveWait));
  const logBeforeStatus = await readFile(f.log, 'utf8');

  const status = run(f.script, ['status'], f.env, f.bashBin);

  assert.equal(status.status, 4, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, /^unreachable\s*$/);
  assert.equal(await readFile(f.log, 'utf8'), logBeforeStatus, 'status performed a remote mutation');
});

test('status reports an orphaned starting lifecycle as unreachable when its RFB backend disappeared', async (t) => {
  const f = await fixture();
  const health = await startHealthServer(t, 16110);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16110'], f.env, f.bashBin).status, 0);
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const state = (await readFile(statePath, 'utf8')).trimEnd().split('\n');
  state[6] = 'starting';
  await writeFile(statePath, `${state.join('\n')}\n`);
  health.kill();
  await new Promise((resolveWait) => health.once('close', resolveWait));
  const logBeforeStatus = await readFile(f.log, 'utf8');

  const status = run(f.script, ['status'], f.env, f.bashBin);

  assert.equal(status.status, 4, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, /^unreachable\s*$/);
  assert.equal(await readFile(f.log, 'utf8'), logBeforeStatus, 'status performed a remote mutation');
});

test('start replaces a healthy orphaned starting lifecycle instead of bypassing remote verification', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16113);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16113'], f.env, f.bashBin).status, 0);
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const state = (await readFile(statePath, 'utf8')).trimEnd().split('\n');
  state[6] = 'starting';
  await writeFile(statePath, `${state.join('\n')}\n`);

  const restarted = run(f.script, ['start', '16113'], f.env, f.bashBin);

  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  assert.match(restarted.stdout, /^started on http:\/\/127\.0\.0\.1:16113\/vnc\.html\?autoconnect=true&resize=remote\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/g) ?? []).length, 2);
  assert.equal((log.match(/--profile scansci-auth rm -f -s scansci-auth/g) ?? []).length, 1);
  assert.match(await readFile(statePath, 'utf8'), /\nrunning\s*$/);
});

test('duplicate start is idempotent and stop closes only the recorded tunnel', async (t) => {
  const f = await fixture();
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  await startHealthServer(t, 16081);

  assert.equal(run(f.script, ['start', '16081'], f.env, f.bashBin).status, 0);
  const duplicate = run(f.script, ['start', '16081'], f.env, f.bashBin);
  assert.equal(duplicate.status, 0, duplicate.stderr);
  assert.match(duplicate.stdout, /^already running on http:\/\/127\.0\.0\.1:16081\/vnc\.html\?autoconnect=true&resize=remote\s*$/);

  const beforeStop = await readFile(f.log, 'utf8');
  assert.equal((beforeStop.match(/--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/g) ?? []).length, 1);

  const stopped = run(f.script, ['stop'], f.env, f.bashBin);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(stopped.stdout, /^stopped\s*$/);
  assert.equal(run(f.script, ['status'], f.env, f.bashBin).status, 3);
  const afterStop = await readFile(f.log, 'utf8');
  assert.match(afterStop, /flock -n -E 73 \/run\/lock\/openscience-production-deploy\/lock/u);
  assert.match(
    afterStop,
    /docker compose --project-directory "\/opt\/openscience-releases\/[0-9a-f]{40}" .*--profile scansci-auth rm -f -s scansci-auth/u,
  );
  assert.match(afterStop, /docker compose .*--profile scansci-auth rm -f -s scansci-auth/);
  assert.doesNotMatch(afterStop, /rm -f -s (?:agent-worker|scansci-legal|api|web)/u);
});

test('duplicate start re-probes HTTP readiness and compensates when the listener disappeared', async (t) => {
  const f = await fixture();
  const health = await startHealthServer(t, 16088);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16088'], f.env, f.bashBin).status, 0);
  health.kill();
  await new Promise((resolveWait) => health.once('close', resolveWait));

  const duplicate = run(f.script, ['start', '16088'], f.env, f.bashBin);

  assert.equal(duplicate.status, 1, `${duplicate.stdout}\n${duplicate.stderr}`);
  assert.match(duplicate.stderr, /^loopback tunnel readiness failed\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /--profile scansci-auth rm -f -s scansci-auth/);
});

test('start replaces an identified tunnel whose RFB backend disappeared in one command', async (t) => {
  const f = await fixture();
  const readyFile = join(f.root, 'health-ready');
  await writeFile(readyFile, 'ready\n');
  await startHealthServer(t, 16109, { readyFile });
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16109'], f.env, f.bashBin).status, 0);
  await rm(readyFile);
  const readyFileForBash = process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', readyFile], { encoding: 'utf8' }).stdout.trim()
    : readyFile;

  const restarted = run(
    f.script,
    ['start', '16109'],
    { ...f.env, FAKE_HEALTH_READY_FILE: readyFileForBash },
    f.bashBin,
  );

  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  assert.match(restarted.stdout, /^started on http:\/\/127\.0\.0\.1:16109\/vnc\.html\?autoconnect=true&resize=remote\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/g) ?? []).length, 2);
  assert.equal((log.match(/--profile scansci-auth rm -f -s scansci-auth/g) ?? []).length, 1);
});

test('start can replace an unreachable recorded tunnel on a different requested port', async (t) => {
  const f = await fixture();
  const readyFile = join(f.root, 'switch-health-ready');
  await writeFile(readyFile, 'ready\n');
  await Promise.all([
    startHealthServer(t, 16111, { readyFile }),
    startHealthServer(t, 16112, { readyFile }),
  ]);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16111'], f.env, f.bashBin).status, 0);
  await rm(readyFile);
  const readyFileForBash = process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', readyFile], { encoding: 'utf8' }).stdout.trim()
    : readyFile;

  const restarted = run(
    f.script,
    ['start', '16112'],
    { ...f.env, FAKE_HEALTH_READY_FILE: readyFileForBash },
    f.bashBin,
  );

  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  assert.match(restarted.stdout, /^started on http:\/\/127\.0\.0\.1:16112\/vnc\.html\?autoconnect=true&resize=remote\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/g) ?? []).length, 2);
  assert.match(log, /-L\n127\.0\.0\.1:16112:172\.25\.0\.2:6080/);
});

test('stop uses the release identity stored at start after active release switches', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16089);
  t.after(async () => rm(f.root, { recursive: true, force: true }));
  const releaseA = 'a'.repeat(40);
  const releaseB = 'b'.repeat(40);
  assert.equal(run(f.script, ['start', '16089'], { ...f.env, FAKE_RELEASE_SHA: releaseA }, f.bashBin).status, 0);

  const stopped = run(f.script, ['stop'], { ...f.env, FAKE_RELEASE_SHA: releaseB }, f.bashBin);

  assert.equal(stopped.status, 0, stopped.stderr);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/cat \/opt\/openscience\/\.release-id/g) ?? []).length, 1);
  assert.match(log, new RegExp(`/opt/openscience-releases/${releaseA}.*--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth`));
  assert.match(log, new RegExp(`/opt/openscience-releases/${releaseA}.*--profile scansci-auth rm -f -s scansci-auth`));
  assert.doesNotMatch(log, new RegExp(`/opt/openscience-releases/${releaseB}`));
});

test('remote stop failure retains old release tombstone and retry commits only after success', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16090);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  const releaseA = 'a'.repeat(40);
  const releaseB = 'b'.repeat(40);
  assert.equal(run(f.script, ['start', '16090'], { ...f.env, FAKE_RELEASE_SHA: releaseA }, f.bashBin).status, 0);

  const failed = run(
    f.script,
    ['stop'],
    { ...f.env, FAKE_RELEASE_SHA: releaseB, FAKE_SSH_STOP_FAIL: '1' },
    f.bashBin,
  );
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');

  assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
  const failedLog = await readFile(f.log, 'utf8');
  assert.match(failedLog, /--profile scansci-auth rm -f -s scansci-auth/);
  assert.equal(existsSync(statePath), true, 'failed remote stop lost retry identity');
  const retained = await readFile(statePath, 'utf8');
  assert.match(retained, new RegExp(`${releaseA}\\n/opt/openscience-releases/${releaseA}`));
  assert.match(retained, /pending_stop\s*$/);
  const pending = run(f.script, ['status'], f.env, f.bashBin);
  assert.equal(pending.status, 4, pending.stderr);
  assert.match(pending.stdout, /^pending remote stop\s*$/);

  const retry = run(f.script, ['stop'], { ...f.env, FAKE_RELEASE_SHA: releaseB }, f.bashBin);

  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(existsSync(statePath), false);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/cat \/opt\/openscience\/\.release-id/g) ?? []).length, 1);
  const stopLines = log.split('\n').filter((line) => line.includes('--profile scansci-auth rm -f -s scansci-auth'));
  assert.equal(stopLines.length, 2);
  assert.ok(stopLines.every((line) => line.includes(`/opt/openscience-releases/${releaseA}`)));
  assert.doesNotMatch(log, new RegExp(`/opt/openscience-releases/${releaseB}`));
});

test('legacy stop upgrades six-field state and uses its stored release after active release switches', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16092);
  t.after(async () => rm(f.root, { recursive: true, force: true }));
  const releaseA = 'a'.repeat(40);
  const releaseB = 'b'.repeat(40);
  assert.equal(run(f.script, ['start', '16092'], { ...f.env, FAKE_RELEASE_SHA: releaseA }, f.bashBin).status, 0);
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const currentLines = (await readFile(statePath, 'utf8')).trimEnd().split('\n');
  await writeFile(statePath, `${currentLines.slice(0, 6).join('\n')}\n`);

  const stopped = run(f.script, ['stop'], { ...f.env, FAKE_RELEASE_SHA: releaseB }, f.bashBin);

  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  assert.equal(existsSync(statePath), false);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/cat \/opt\/openscience\/\.release-id/g) ?? []).length, 1);
  assert.match(log, new RegExp(`/opt/openscience-releases/${releaseA}.*--profile scansci-auth rm -f -s scansci-auth`));
  assert.doesNotMatch(log, new RegExp(`/opt/openscience-releases/${releaseB}`));
});

test('legacy duplicate start upgrades state without launching another helper or resolving a new release', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16093);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  const releaseA = 'a'.repeat(40);
  const releaseB = 'b'.repeat(40);
  assert.equal(run(f.script, ['start', '16093'], { ...f.env, FAKE_RELEASE_SHA: releaseA }, f.bashBin).status, 0);
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const legacyLines = (await readFile(statePath, 'utf8')).trimEnd().split('\n').slice(0, 6);
  await writeFile(statePath, `${legacyLines.join('\n')}\n`);

  const duplicate = run(f.script, ['start', '16093'], { ...f.env, FAKE_RELEASE_SHA: releaseB }, f.bashBin);

  assert.equal(duplicate.status, 0, `${duplicate.stdout}\n${duplicate.stderr}`);
  assert.match(duplicate.stdout, /^already running on http:\/\/127\.0\.0\.1:16093\/vnc\.html\?autoconnect=true&resize=remote\s*$/);
  assert.deepEqual((await readFile(statePath, 'utf8')).trimEnd().split('\n'), [...legacyLines, 'running']);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/cat \/opt\/openscience\/\.release-id/g) ?? []).length, 1);
  assert.equal((log.match(/--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/g) ?? []).length, 1);
  assert.doesNotMatch(log, new RegExp(`/opt/openscience-releases/${releaseB}`));
});

test('legacy remote stop failure retains the upgraded old-release tombstone for retry', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16094);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  const releaseA = 'a'.repeat(40);
  const releaseB = 'b'.repeat(40);
  assert.equal(run(f.script, ['start', '16094'], { ...f.env, FAKE_RELEASE_SHA: releaseA }, f.bashBin).status, 0);
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const legacyLines = (await readFile(statePath, 'utf8')).trimEnd().split('\n').slice(0, 6);
  await writeFile(statePath, `${legacyLines.join('\n')}\n`);

  const failed = run(
    f.script,
    ['stop'],
    { ...f.env, FAKE_RELEASE_SHA: releaseB, FAKE_SSH_STOP_FAIL: '1' },
    f.bashBin,
  );

  assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
  assert.deepEqual(
    (await readFile(statePath, 'utf8')).trimEnd().split('\n'),
    [legacyLines[0], '0', ...legacyLines.slice(2), 'pending_stop'],
  );
  const retry = run(f.script, ['stop'], { ...f.env, FAKE_RELEASE_SHA: releaseB }, f.bashBin);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(existsSync(statePath), false);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/cat \/opt\/openscience\/\.release-id/g) ?? []).length, 1);
  const stopLines = log.split('\n').filter((line) => line.includes('--profile scansci-auth rm -f -s scansci-auth'));
  assert.equal(stopLines.length, 2);
  assert.ok(stopLines.every((line) => line.includes(`/opt/openscience-releases/${releaseA}`)));
  assert.doesNotMatch(log, new RegExp(`/opt/openscience-releases/${releaseB}`));
});

test('legacy upgrade move failure makes start fail closed and preserves the six-field identity for retry', async (t) => {
  const f = await fixture();
  const health = await startHealthServer(t, 16096);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16096'], f.env, f.bashBin).status, 0);
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const legacyLines = (await readFile(statePath, 'utf8')).trimEnd().split('\n').slice(0, 6);
  const legacyState = `${legacyLines.join('\n')}\n`;
  await writeFile(statePath, legacyState);
  await installOneShotStateMoveFailure(f);
  health.kill();
  await new Promise((resolveWait) => health.once('close', resolveWait));

  const failed = run(
    f.script,
    ['start', '16096'],
    { ...f.env, FAKE_STATE_MV_FAIL_ONCE: '1' },
    f.bashBin,
  );

  assert.equal(failed.status, 65, `${failed.stdout}\n${failed.stderr}`);
  assert.match(failed.stderr, /^tunnel state upgrade failed\s*$/);
  assert.equal(await readFile(statePath, 'utf8'), legacyState);
  assert.equal(spawnSync(bash, ['-c', 'kill -0 "$1"', 'check', legacyLines[1]]).status, 0);
  assert.doesNotMatch(await readFile(f.log, 'utf8'), /--profile scansci-auth rm -f -s scansci-auth/);

  await startHealthServer(t, 16096);
  const retry = run(f.script, ['start', '16096'], f.env, f.bashBin);
  assert.equal(retry.status, 0, `${retry.stdout}\n${retry.stderr}`);
  assert.match(retry.stdout, /^already running on http:\/\/127\.0\.0\.1:16096\/vnc\.html\?autoconnect=true&resize=remote\s*$/);
  assert.deepEqual((await readFile(statePath, 'utf8')).trimEnd().split('\n'), [...legacyLines, 'running']);
});

test('legacy upgrade move failure makes stop fail closed without kill or remote stop', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16097);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  assert.equal(run(f.script, ['start', '16097'], f.env, f.bashBin).status, 0);
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const legacyLines = (await readFile(statePath, 'utf8')).trimEnd().split('\n').slice(0, 6);
  const legacyState = `${legacyLines.join('\n')}\n`;
  await writeFile(statePath, legacyState);
  await installOneShotStateMoveFailure(f);

  const failed = run(
    f.script,
    ['stop'],
    { ...f.env, FAKE_STATE_MV_FAIL_ONCE: '1' },
    f.bashBin,
  );

  assert.equal(failed.status, 65, `${failed.stdout}\n${failed.stderr}`);
  assert.match(failed.stderr, /^tunnel state upgrade failed\s*$/);
  assert.equal(await readFile(statePath, 'utf8'), legacyState);
  assert.equal(spawnSync(bash, ['-c', 'kill -0 "$1"', 'check', legacyLines[1]]).status, 0);
  assert.doesNotMatch(await readFile(f.log, 'utf8'), /--profile scansci-auth rm -f -s scansci-auth/);

  const retry = run(f.script, ['stop'], f.env, f.bashBin);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(existsSync(statePath), false);
  const stopLines = (await readFile(f.log, 'utf8'))
    .split('\n')
    .filter((line) => line.includes('--profile scansci-auth rm -f -s scansci-auth'));
  assert.equal(stopLines.length, 1);
  assert.ok(stopLines[0].includes(`/opt/openscience-releases/${legacyLines[3]}`));
});

test('invalid six-field state fails closed without kill, SSH, or overwrite', async (t) => {
  const [startFixture, stopFixture] = await Promise.all([fixture(), fixture()]);
  const unrelatedPidFile = join(startFixture.root, 'unrelated.pid');
  const unrelated = spawn(bash, ['-c', 'printf "%s\\n" "$$" > "$1"; sleep 30', 'unrelated', unrelatedPidFile], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 20 && !existsSync(unrelatedPidFile); attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  const unrelatedPid = Number((await readFile(unrelatedPidFile, 'utf8')).trim());
  t.after(async () => {
    spawnSync(bash, ['-c', 'kill "$1" 2>/dev/null || true', 'cleanup', String(unrelatedPid)]);
    if (unrelated.exitCode === null) unrelated.kill();
    await Promise.all([
      rm(startFixture.root, { recursive: true, force: true }),
      rm(stopFixture.root, { recursive: true, force: true }),
    ]);
  });
  const invalidToken = 'g'.repeat(32);
  await Promise.all([
    writeTunnelState(startFixture, { token: invalidToken, pid: unrelatedPid, port: 16095, format: 'legacy' }),
    writeTunnelState(stopFixture, { token: invalidToken, pid: unrelatedPid, port: 16095, format: 'legacy' }),
  ]);
  const startStatePath = join(startFixture.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const stopStatePath = join(stopFixture.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  const [startBefore, stopBefore] = await Promise.all([readFile(startStatePath, 'utf8'), readFile(stopStatePath, 'utf8')]);

  const started = run(startFixture.script, ['start', '16095'], startFixture.env, startFixture.bashBin);
  const stopped = run(stopFixture.script, ['stop'], stopFixture.env, stopFixture.bashBin);

  assert.equal(started.status, 65, `${started.stdout}\n${started.stderr}`);
  assert.equal(stopped.status, 65, `${stopped.stdout}\n${stopped.stderr}`);
  assert.equal(await readFile(startStatePath, 'utf8'), startBefore);
  assert.equal(await readFile(stopStatePath, 'utf8'), stopBefore);
  assert.equal(existsSync(startFixture.log), false);
  assert.equal(existsSync(stopFixture.log), false);
  assert.equal(spawnSync(bash, ['-c', 'kill -0 "$1"', 'check', String(unrelatedPid)]).status, 0);
});

test('invalid ports and unknown commands fail before any SSH process starts', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.root, { recursive: true, force: true }));

  for (const args of [['start', '0'], ['start', '70000'], ['start', 'not-a-port'], ['launch']]) {
    const result = run(f.script, args, f.env, f.bashBin);
    assert.equal(result.status, 64, `${args.join(' ')}: ${result.stderr}`);
  }
  assert.equal(existsSync(f.log), false);
});

test('option-shaped connection values are rejected before SSH without being echoed', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.root, { recursive: true, force: true }));
  const hostile = '-oProxyCommand=must-never-run';
  await writeFile(join(f.root, '.env'), `SERVER_HOST=${hostile}\nSERVER_USER=operator\nSERVER_PORT=22\n`);

  const result = run(f.script, ['start', '16084'], f.env, f.bashBin);

  assert.equal(result.status, 66, `${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(f.log), false);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /must-never-run/);
});

test('a failed local tunnel compensates by stopping the exact remote auth helper', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.root, { recursive: true, force: true }));

  const result = run(f.script, ['start', '16082'], { ...f.env, FAKE_SSH_TUNNEL_FAIL: '1' }, f.bashBin);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^loopback tunnel start failed\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/);
  assert.match(log, /--profile scansci-auth rm -f -s scansci-auth/);
});

test('start tolerates bounded Windows process-table visibility delay', async (t) => {
  const f = await fixture();
  await installDelayedProcessTable(f, 3);
  await startHealthServer(t, 16105);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });

  const result = run(f.script, ['start', '16105'], f.env, f.bashBin);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(run(f.script, ['status'], f.env, f.bashBin).status, 0);
});

test('failed process identity check reaps the tunnel process owned by this start', async (t) => {
  const f = await fixture();
  await installDelayedProcessTable(f, 100);
  const tunnelPidFile = join(f.root, 'tunnel-child.pid');
  t.after(async () => {
    if (existsSync(tunnelPidFile)) {
      const pid = (await readFile(tunnelPidFile, 'utf8')).trim();
      spawnSync(bash, ['-c', 'kill "$1" 2>/dev/null || true', 'cleanup', pid]);
    }
    await rm(f.root, { recursive: true, force: true });
  });

  const result = run(
    f.script,
    ['start', '16106'],
    { ...f.env, FAKE_TUNNEL_PID_FILE: tunnelPidFile },
    f.bashBin,
  );

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^loopback tunnel start failed\s*$/);
  const tunnelPid = (await readFile(tunnelPidFile, 'utf8')).trim();
  assert.notEqual(
    spawnSync(bash, ['-c', 'kill -0 "$1"', 'check', tunnelPid]).status,
    0,
    'owned SSH tunnel survived failed start cleanup',
  );
});

test('an exited tunnel runner is reaped without signaling its stale numeric pid', async (t) => {
  const f = await fixture();
  await installDelayedProcessTable(f, 100);
  const killAudit = await installKillAudit(f);
  const tunnelPidFile = join(f.root, 'tunnel-child.pid');
  const stateFile = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');
  t.after(async () => rm(f.root, { recursive: true, force: true }));

  const started = runAsync(
    f.script,
    ['start', '16107'],
    {
      ...f.env,
      BASH_ENV: killAudit.bashEnv,
      FAKE_KILL_LOG: killAudit.killLogForBash,
      FAKE_SSH_TUNNEL_FAIL: '1',
      FAKE_SSH_TUNNEL_FAIL_DELAY: '0.2',
      FAKE_TUNNEL_PID_FILE: tunnelPidFile,
    },
    f.bashBin,
  );
  let runnerPid = '';
  for (let attempt = 0; attempt < 100 && !runnerPid; attempt += 1) {
    if (existsSync(stateFile)) {
      const state = await readFile(stateFile, 'utf8');
      const observedPid = state.split(/\r?\n/)[1] ?? '';
      if (/^[1-9][0-9]*$/.test(observedPid)) runnerPid = observedPid;
    }
    if (!runnerPid) await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  const result = await started;

  assert.match(runnerPid, /^[1-9][0-9]*$/);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^loopback tunnel start failed\s*$/);
  const killCalls = (await readFile(killAudit.killLog, 'utf8')).trim().split(/\r?\n/);
  assert.equal(
    killCalls.includes(runnerPid),
    false,
    `stale runner pid was signaled: ${killCalls.join(', ')}`,
  );
});

test('a live tunnel without loopback HTTP readiness is stopped and compensated', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.root, { recursive: true, force: true }));

  const result = run(f.script, ['start', '16086'], f.env, f.bashBin);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^loopback tunnel readiness failed\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /--profile scansci-auth rm -f -s scansci-auth/);
  assert.equal(run(f.script, ['status'], f.env, f.bashBin).status, 3);
});

test('a static noVNC page without a WebSocket RFB backend is stopped and compensated', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16089, { websocket: false });
  t.after(async () => rm(f.root, { recursive: true, force: true }));

  const result = run(f.script, ['start', '16089'], f.env, f.bashBin);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^loopback tunnel readiness failed\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /--profile scansci-auth rm -f -s scansci-auth/);
  assert.equal(run(f.script, ['status'], f.env, f.bashBin).status, 3);
});

test('retagged auth image or post-readiness verifier failure is rejected and exactly compensated', async (t) => {
  for (const [flag, port] of [['FAKE_AUTH_RETAG', 16101], ['FAKE_RUNTIME_VERIFY_FAIL', 16102]]) {
    const f = await fixture();
    await startHealthServer(t, port);
    t.after(async () => rm(f.root, { recursive: true, force: true }));
    const result = run(f.script, ['start', String(port)], { ...f.env, [flag]: '1' }, f.bashBin);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    const log = await readFile(f.log, 'utf8');
    assert.match(log, /verify-scansci-runtime\.mjs/);
    if (flag === 'FAKE_RUNTIME_VERIFY_FAIL') assert.match(log, /--profile scansci-auth rm -f -s scansci-auth/);
    assert.equal(existsSync(join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state')), false);
  }
});

test('failed-start compensation retains old release tombstone when remote stop fails', async (t) => {
  const f = await fixture();
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });
  const releaseA = 'd'.repeat(40);
  const failed = run(
    f.script,
    ['start', '16091'],
    { ...f.env, FAKE_RELEASE_SHA: releaseA, FAKE_SSH_STOP_FAIL: '1' },
    f.bashBin,
  );
  const statePath = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.state');

  assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
  assert.equal(existsSync(statePath), true);
  const retained = await readFile(statePath, 'utf8');
  assert.match(retained, new RegExp(`${releaseA}\\n/opt/openscience-releases/${releaseA}`));
  assert.match(retained, /pending_stop\s*$/);

  await startHealthServer(t, 16091);
  const releaseB = 'e'.repeat(40);
  const restarted = run(f.script, ['start', '16091'], { ...f.env, FAKE_RELEASE_SHA: releaseB }, f.bashBin);

  assert.equal(restarted.status, 0, restarted.stderr);
  const running = await readFile(statePath, 'utf8');
  assert.match(running, new RegExp(`${releaseB}\\n/opt/openscience-releases/${releaseB}`));
  assert.match(running, /running\s*$/);
});

test('concurrent starts serialize to one identified tunnel and one remote helper start', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16085);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });

  const delayedEnv = { ...f.env, FAKE_RUNTIME_VERIFY_DELAY: '12' };
  const first = runAsync(f.script, ['start', '16085'], delayedEnv, f.bashBin);
  const lockDir = join(f.env.XDG_STATE_HOME, 'openscience', 'scansci-auth-tunnel.lock');
  for (let attempt = 0; attempt < 80 && !existsSync(lockDir); attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  assert.equal(existsSync(lockDir), true, 'first start never acquired the local lifecycle lock');
  const results = await Promise.all([
    first,
    runAsync(f.script, ['start', '16085'], delayedEnv, f.bashBin),
  ]);

  assert.deepEqual(results.map((result) => result.status), [0, 0]);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/--profile scansci-auth up --no-start --no-build --force-recreate scansci-auth/g) ?? []).length, 1);
  assert.equal((log.match(/127\.0\.0\.1:16085:172\.25\.0\.2:6080/g) ?? []).length, 1);
});

test('stop recognizes and kills the immediately previous loopback-target runner identity', async (t) => {
  for (const [format, port] of [['current', 16103], ['legacy', 16104]]) {
    const f = await fixture();
    const stateRoot = join(f.env.XDG_STATE_HOME, 'openscience');
    const runner = join(stateRoot, 'scansci-auth-tunnel-runner.sh');
    const pidFile = join(f.root, `old-runner-${format}.pid`);
    const token = format === 'current' ? 'd'.repeat(32) : 'e'.repeat(32);
    await mkdir(stateRoot, { recursive: true });
    await writeFile(runner, [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$$" > "$OLD_RUNNER_PID_FILE"',
      'trap "exit 0" TERM INT',
      'while true; do sleep 1; done',
      '',
    ].join('\n'));
    await chmod(runner, 0o700);
    const oldRunner = spawn(bash, [
      runner, token, String(port), 'ssh', '-N', '-L', `127.0.0.1:${port}:127.0.0.1:6080`,
    ], { env: { ...f.env, OLD_RUNNER_PID_FILE: pidFile }, stdio: 'ignore' });
    for (let attempt = 0; attempt < 40 && !existsSync(pidFile); attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    await writeTunnelState(f, { token, pid, port, format });
    t.after(async () => {
      spawnSync(bash, ['-c', 'kill "$1" 2>/dev/null || true', 'cleanup', String(pid)]);
      if (oldRunner.exitCode === null) oldRunner.kill();
      await rm(f.root, { recursive: true, force: true });
    });

    const stopped = run(f.script, ['stop'], f.env, f.bashBin);

    assert.equal(stopped.status, 0, `${format}: ${stopped.stdout}\n${stopped.stderr}`);
    assert.notEqual(
      spawnSync(bash, ['-c', 'kill -0 "$1"', 'check', String(pid)]).status,
      0,
      `${format}: old topology runner survived stop`,
    );
  }
});

test('stop never kills an unrelated live PID from stale state', async (t) => {
  const f = await fixture();
  const unrelatedPidFile = join(f.root, 'unrelated.pid');
  const unrelated = spawn(bash, ['-c', 'printf "%s\\n" "$$" > "$1"; sleep 30', 'unrelated', unrelatedPidFile], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 20 && !existsSync(unrelatedPidFile); attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  const unrelatedPid = Number((await readFile(unrelatedPidFile, 'utf8')).trim());
  t.after(async () => {
    spawnSync(bash, ['-c', 'kill "$1" 2>/dev/null || true', 'cleanup', String(unrelatedPid)]);
    if (unrelated.exitCode === null) unrelated.kill();
    await rm(f.root, { recursive: true, force: true });
  });
  await writeTunnelState(f, { pid: unrelatedPid, port: 16087 });

  const result = run(f.script, ['stop'], f.env, f.bashBin);

  assert.equal(result.status, 0, result.stderr);
  const alive = spawnSync(bash, ['-c', 'kill -0 "$1"', 'check', String(unrelatedPid)]);
  assert.equal(alive.status, 0, 'unrelated Git Bash process was killed');
});

test('explicit stop closes the remote helper even when the recorded tunnel is stale', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.root, { recursive: true, force: true }));
  await writeTunnelState(f, { pid: 999999, port: 16083 });

  const result = run(f.script, ['stop'], f.env, f.bashBin);

  assert.equal(result.status, 0, result.stderr);
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /--profile scansci-auth rm -f -s scansci-auth/);
});

test('auth entrypoint starts only the loopback display stack and leaves the browser lifecycle to ScanSci', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scansci-auth-entrypoint-'));
  const bin = join(root, 'bin');
  const log = join(root, 'process.log');
  await mkdir(bin, { recursive: true });
  const fake = `#!/usr/bin/env bash
name="$(basename "$0")"
line="$name"
for argument in "$@"; do line="$line $argument"; done
printf '%s\\n' "$line" >> "$AUTH_PROCESS_LOG"
if [ "$name" = python ]; then exit 0; fi
trap 'exit 0' TERM INT
while true; do sleep 1; done
`;
  for (const command of ['Xvfb', 'x11vnc', 'websockify', 'python']) {
    const target = join(bin, command);
    await writeFile(target, fake);
    await chmod(target, 0o755);
  }
  const bashBin = process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', bin], { encoding: 'utf8' }).stdout.trim()
    : bin;
  t.after(async () => rm(root, { recursive: true, force: true }));

  const result = run(authEntrypoint, [], { ...process.env, DISPLAY: '', AUTH_PROCESS_LOG: log }, bashBin);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const processes = await readFile(log, 'utf8');
  assert.match(processes, /^Xvfb :99 /m);
  assert.doesNotMatch(processes, /^chromium /m);
  assert.match(processes, /^x11vnc .* -listen 127\.0\.0\.1 .* -no6(?: |$)/m);
  assert.match(processes, /^websockify .*0\.0\.0\.0:6080 127\.0\.0\.1:5900/m);
  assert.match(processes, /^python -m scansci_legal\.auth_login --operator-start$/m);
});

test('auth entrypoint TERM promptly stops its owned long-running login child', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scansci-auth-entrypoint-term-'));
  const bin = join(root, 'bin');
  const pidFile = join(root, 'auth-login.pid');
  await mkdir(bin, { recursive: true });
  const fake = `#!/usr/bin/env bash
name="$(basename "$0")"
if [ "$name" = python ]; then
  printf '%s\\n' "$$" > "$AUTH_LOGIN_PID_FILE"
fi
trap 'exit 0' TERM INT
while true; do sleep 1; done
`;
  for (const command of ['Xvfb', 'x11vnc', 'websockify', 'python']) {
    const target = join(bin, command);
    await writeFile(target, fake);
    await chmod(target, 0o755);
  }
  const toBashPath = (path) => process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', path], { encoding: 'utf8' }).stdout.trim()
    : path;
  t.after(async () => rm(root, { recursive: true, force: true }));
  const harness = [
    'PATH="$1:$PATH"; export PATH',
    'entrypoint="$2"; pid_file="$3"',
    'AUTH_LOGIN_PID_FILE="$pid_file" bash "$entrypoint" >/dev/null 2>&1 & entrypoint_pid=$!',
    'cleanup(){ kill -TERM "$entrypoint_pid" 2>/dev/null || true; if [ -f "$pid_file" ]; then auth_pid="$(cat "$pid_file")"; kill -TERM "$auth_pid" 2>/dev/null || true; fi; wait "$entrypoint_pid" 2>/dev/null || true; }',
    'trap cleanup EXIT',
    'for attempt in $(seq 1 100); do [ -s "$pid_file" ] && break; sleep 0.02; done',
    '[ -s "$pid_file" ] || { echo "auth child did not start" >&2; exit 1; }',
    'auth_pid="$(cat "$pid_file")"',
    'kill -TERM "$entrypoint_pid"',
    'for attempt in $(seq 1 20); do if ! kill -0 "$auth_pid" 2>/dev/null; then wait "$entrypoint_pid" 2>/dev/null || true; trap - EXIT; exit 0; fi; sleep 0.1; done',
    'echo "auth child survived entrypoint TERM" >&2',
    'exit 1',
  ].join('; ');

  const result = spawnSync(
    bash,
    ['-c', harness, 'entrypoint-term', toBashPath(bin), toBashPath(authEntrypoint), toBashPath(pidFile)],
    { encoding: 'utf8', timeout: 10_000 },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
