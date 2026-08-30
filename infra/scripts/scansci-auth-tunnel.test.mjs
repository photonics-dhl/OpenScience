import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceScript = resolve(dirname(fileURLToPath(import.meta.url)), 'scansci-auth-tunnel.sh');
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
  const ssh = join(bin, 'ssh');
  const log = join(root, 'ssh-argv.log');
  await copyFile(sourceScript, script);
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
  *" -N "*)
    if [ "\${FAKE_SSH_TUNNEL_FAIL:-0}" = 1 ]; then exit 2; fi
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
  };
  return { root, script, log, env, bashBin, bashKey };
}

function run(script, args, env, bashBin = '') {
  return spawnSync(
    bash,
    ['-c', 'PATH="$1:$PATH"; export PATH; shift; exec "$@"', 'run-script', bashBin, script, ...args],
    { encoding: 'utf8', env, timeout: 10_000 },
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

async function startHealthServer(t, port) {
  const source = `require('http').createServer((_request,response)=>{response.writeHead(200);response.end('ok')}).listen(${port},'127.0.0.1')`;
  const server = spawn(process.execPath, ['-e', source], { stdio: 'ignore' });
  t.after(() => { if (server.exitCode === null) server.kill(); });
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  return server;
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
  assert.match(started.stdout, /^started on http:\/\/127\.0\.0\.1:16080\s*$/);

  const status = run(f.script, ['status'], f.env, f.bashBin);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /^running on http:\/\/127\.0\.0\.1:16080\s*$/);

  const log = await readFile(f.log, 'utf8');
  assert.match(log, /docker compose .*--profile scansci-auth up -d scansci-auth/);
  assert.match(log, /-L\n127\.0\.0\.1:16080:127\.0\.0\.1:6080/);
  assert.match(log, new RegExp(`-i\\n${f.bashKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(log, /operator-fixture@198\.51\.100\.24/);

  const combined = `${before.stdout}${before.stderr}${started.stdout}${started.stderr}${status.stdout}${status.stderr}`;
  for (const value of ['198.51.100.24', 'operator-fixture', '2222', 'must-never-be-printed']) {
    assert.doesNotMatch(combined, new RegExp(value));
  }
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
  assert.match(duplicate.stdout, /^already running on http:\/\/127\.0\.0\.1:16081\s*$/);

  const beforeStop = await readFile(f.log, 'utf8');
  assert.equal((beforeStop.match(/--profile scansci-auth up -d scansci-auth/g) ?? []).length, 1);

  const stopped = run(f.script, ['stop'], f.env, f.bashBin);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(stopped.stdout, /^stopped\s*$/);
  assert.equal(run(f.script, ['status'], f.env, f.bashBin).status, 3);
  const afterStop = await readFile(f.log, 'utf8');
  assert.match(afterStop, /docker compose .*--profile scansci-auth stop scansci-auth/);
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
  assert.match(log, /--profile scansci-auth up -d scansci-auth/);
  assert.match(log, /--profile scansci-auth stop scansci-auth/);
});

test('a live tunnel without loopback HTTP readiness is stopped and compensated', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.root, { recursive: true, force: true }));

  const result = run(f.script, ['start', '16086'], f.env, f.bashBin);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^loopback tunnel readiness failed\s*$/);
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /--profile scansci-auth stop scansci-auth/);
  assert.equal(run(f.script, ['status'], f.env, f.bashBin).status, 3);
});

test('concurrent starts serialize to one identified tunnel and one remote helper start', async (t) => {
  const f = await fixture();
  await startHealthServer(t, 16085);
  t.after(async () => {
    run(f.script, ['stop'], f.env, f.bashBin);
    await rm(f.root, { recursive: true, force: true });
  });

  const results = await Promise.all([
    runAsync(f.script, ['start', '16085'], f.env, f.bashBin),
    runAsync(f.script, ['start', '16085'], f.env, f.bashBin),
  ]);

  assert.deepEqual(results.map((result) => result.status), [0, 0]);
  const log = await readFile(f.log, 'utf8');
  assert.equal((log.match(/--profile scansci-auth up -d scansci-auth/g) ?? []).length, 1);
  assert.equal((log.match(/127\.0\.0\.1:16085:127\.0\.0\.1:6080/g) ?? []).length, 1);
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
  const stateRoot = join(f.env.XDG_STATE_HOME, 'openscience');
  await mkdir(stateRoot, { recursive: true });
  await writeFile(join(stateRoot, 'scansci-auth-tunnel.pid'), `${unrelatedPid}\n`);
  await writeFile(join(stateRoot, 'scansci-auth-tunnel.port'), '16087\n');

  const result = run(f.script, ['stop'], f.env, f.bashBin);

  assert.equal(result.status, 0, result.stderr);
  const alive = spawnSync(bash, ['-c', 'kill -0 "$1"', 'check', String(unrelatedPid)]);
  assert.equal(alive.status, 0, 'unrelated Git Bash process was killed');
});

test('explicit stop closes the remote helper even when the recorded tunnel is stale', async (t) => {
  const f = await fixture();
  t.after(async () => rm(f.root, { recursive: true, force: true }));
  const stateRoot = join(f.env.XDG_STATE_HOME, 'openscience');
  await mkdir(stateRoot, { recursive: true });
  await writeFile(join(stateRoot, 'scansci-auth-tunnel.pid'), '999999\n');
  await writeFile(join(stateRoot, 'scansci-auth-tunnel.port'), '16083\n');

  const result = run(f.script, ['stop'], f.env, f.bashBin);

  assert.equal(result.status, 0, result.stderr);
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /--profile scansci-auth stop scansci-auth/);
});

test('auth entrypoint starts the loopback browser stack and stops it after operator login', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scansci-auth-entrypoint-'));
  const bin = join(root, 'bin');
  const log = join(root, 'process.log');
  await mkdir(bin, { recursive: true });
  const fake = `#!/usr/bin/env bash
name="$(basename "$0")"
printf '%s' "$name" >> "$AUTH_PROCESS_LOG"
printf ' %s' "$@" >> "$AUTH_PROCESS_LOG"
printf '\\n' >> "$AUTH_PROCESS_LOG"
if [ "$name" = python ]; then exit 0; fi
trap 'exit 0' TERM INT
while true; do sleep 1; done
`;
  for (const command of ['Xvfb', 'chromium', 'x11vnc', 'websockify', 'python']) {
    const target = join(bin, command);
    await writeFile(target, fake);
    await chmod(target, 0o755);
  }
  const bashBin = process.platform === 'win32'
    ? spawnSync(bash, ['-c', 'cygpath -u "$1"', 'convert-path', bin], { encoding: 'utf8' }).stdout.trim()
    : bin;
  t.after(async () => rm(root, { recursive: true, force: true }));

  const result = run(authEntrypoint, [], { ...process.env, AUTH_PROCESS_LOG: log }, bashBin);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const processes = await readFile(log, 'utf8');
  assert.match(processes, /^Xvfb :99 /m);
  assert.match(processes, /^chromium .*--user-data-dir=\/session\/chromium/m);
  assert.match(processes, /^x11vnc .* -listen 127\.0\.0\.1 /m);
  assert.match(processes, /^websockify .*127\.0\.0\.1:6080 127\.0\.0\.1:5900/m);
  assert.match(processes, /^python -m scansci_legal\.auth_login --operator-start$/m);
});
