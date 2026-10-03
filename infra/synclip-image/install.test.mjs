import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = join(repo, 'tmp/hermes-cleanup-20261003');
const fixtureDirectories = [];
after(async () => {
  if (!fixtureDirectories.length) return;
  const expectedRoot = join(await realpath(repo), 'tmp/hermes-cleanup-20261003');
  assert.equal(await realpath(fixtureRoot), expectedRoot);
  for (const base of fixtureDirectories) {
    assert.equal((await lstat(base)).isSymbolicLink(), false);
    const target = await realpath(base);
    assert.equal(dirname(target), expectedRoot);
    assert.match(basename(target), /^independent-domain-synclip-install-[A-Za-z0-9]{6}$/u);
    await rm(target, { recursive: true, force: true });
  }
});
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const posix = path => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/u, (_, drive) => `/${drive.toLowerCase()}`);
const sha = 'a'.repeat(40); const renderer = `sha256:${'b'.repeat(64)}`;
async function fixture(existing = true) {
  await mkdir(fixtureRoot, { recursive: true });
  const base = await mkdtemp(join(fixtureRoot, 'independent-domain-synclip-install-'));
  fixtureDirectories.push(base);
  const root = join(base, 'synclip'); const release = join(base, 'sources', sha); const units = join(base, 'units');
  const bin = join(base, 'bin'); const calls = join(base, 'calls');
  for (const path of [root, units, bin, join(root, 'spool/results')]) await mkdir(path, { recursive: true });
  // Never uses an actual credential or host /opt, /etc, Docker, systemctl, or flock.
  await writeFile(join(root, 'api-key'), 'fixture-only-key');
  if (existing) {
    await writeFile(join(root, 'config.json'), 'previous-config');
    await writeFile(join(root, 'spool/results/.ready'), 'previous-ready');
    for (const suffix of ['service', 'timer']) await writeFile(join(units, `openscience-synclip-image.${suffix}`), `previous-${suffix}`);
  }
  const installer = (await readFile(join(repo, 'infra/synclip-image/install.sh'), 'utf8'))
    .replace('set -euo pipefail', 'set -euo pipefail\nexport PATH="$FAKE_BIN:$PATH"')
    .replaceAll('/opt/openscience-releases', posix(join(base, 'sources')))
    .replaceAll('/opt/openscience-synclip', posix(root))
    .replaceAll('/etc/systemd/system', posix(units));
  const script = join(base, 'install.sh'); await writeFile(script, installer);
  for (const file of ['infra/synclip-image/broker.mjs', 'infra/synclip-image/transport.mjs',
    'infra/chatgpt-browser/broker.mjs', 'infra/codex-image-runner/core.mjs']) {
    const target = join(release, file); await mkdir(dirname(target), { recursive: true }); await copyFile(join(repo, file), target);
  }
  const dist = join(release, 'packages/ai-gateway/dist'); await mkdir(dist, { recursive: true });
  for (const name of await readdir(join(repo, 'packages/ai-gateway/dist'))) {
    if (name.endsWith('.js')) await copyFile(join(repo, 'packages/ai-gateway/dist', name), join(dist, name));
  }
  const commands = {
    id: 'printf "0\\n"',
    stat: `case "$*" in
      *"%u %a"*) if [[ -d \${@: -1} ]]; then printf '0 700\\n'; elif [[ \${@: -1} == "$FIXTURE_ROOT/api-key" ]]; then printf '0 %s\\n' "\${KEY_MODE:-600}"; else printf '0 600\\n'; fi;;
      *) /usr/bin/stat "$@";;
    esac`,
    install: `args=(); directory=false; target=''; while (( $# )); do case "$1" in
      -o|-g|-m) shift 2;; -d) directory=true; shift;; -t) target=$2; shift 2;; *) args+=("$1"); shift;; esac; done
      if [[ $directory == true ]]; then mkdir -p -- "\${args[@]}";
      elif [[ -n $target ]]; then cp -- "\${args[@]}" "$target/"; else cp -- "\${args[@]}"; fi`,
    chmod: ':',
    flock: '[[ ${BUSY_LOCK:-0} == 0 ]]',
    docker: '[[ ${BAD_RENDERER:-0} == 0 || $1 != run ]]',
    timeout: 'shift; "$@"',
    node: `if [[ \${2:-} == verify ]]; then [[ \${BAD_MANIFEST:-0} == 0 ]]; else "$REAL_NODE" "$@"; fi`,
    systemctl: `case "$1" in
      is-active) printf '%s\\n' "\${TIMER_ACTIVE:-active}";;
      is-enabled) printf '%s\\n' "\${TIMER_ENABLED:-enabled}";;
      daemon-reload) if [[ \${FAIL_RELOAD:-0} == 1 && ! -e "$FIXTURE_BASE/reload-failed" ]]; then touch "$FIXTURE_BASE/reload-failed"; exit 1; fi;;
    esac`,
  };
  for (const [name, body] of Object.entries(commands)) {
    const path = join(bin, name);
    await writeFile(path, `#!/usr/bin/env bash\nprintf '%s' '${name}' >> "$CALLS"; printf ' <%s>' "$@" >> "$CALLS"; printf '\\n' >> "$CALLS"\n${body}\n`);
    await chmod(path, 0o755);
  }
  const env = { PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    ...(process.platform === 'win32' ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
    CALLS: posix(calls), FIXTURE_BASE: posix(base), FIXTURE_ROOT: posix(root), FAKE_BIN: posix(bin), REAL_NODE: posix(process.execPath),
    TIMER_ACTIVE: existing ? 'active' : 'inactive', TIMER_ENABLED: existing ? 'enabled' : 'not-found' };
  const run = (extra = {}, defer = true, args) => spawnSync(bash, [posix(script), ...(args ?? ['--confirm', '--source', posix(release),
    '--renderer-image', renderer, ...(defer ? ['--defer-timers'] : [])])], { cwd: repo, encoding: 'utf8', env: { ...env, ...extra }, timeout: 30000 });
  return { base, root, release, units, script, run, calls: async () => readFile(calls, 'utf8').catch(() => ''), bundle: join(root, 'releases', sha) };
}
async function unchanged(f) {
  assert.equal(await readFile(join(f.root, 'api-key'), 'utf8'), 'fixture-only-key');
  assert.equal(await readFile(join(f.root, 'config.json'), 'utf8'), 'previous-config');
  assert.equal(await readFile(join(f.units, 'openscience-synclip-image.service'), 'utf8'), 'previous-service');
  assert.equal(await readFile(join(f.units, 'openscience-synclip-image.timer'), 'utf8'), 'previous-timer');
}
function successful(result) { assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`); }

test('installer rejects missing confirmation, noncanonical source, and mutable renderer before host actions', async () => {
  const f = await fixture();
  assert.equal(f.run({}, true, []).status, 64);
  assert.equal(f.run({}, true, ['--confirm', '--source', posix(f.base), '--renderer-image', renderer]).status, 66);
  assert.equal(f.run({}, true, ['--confirm', '--source', posix(f.release), '--renderer-image', 'renderer:latest']).status, 66);
  assert.doesNotMatch(await f.calls(), /docker|systemctl|install </u); await unchanged(f);
});

test('deferred install stages a standalone runtime, private config and the correctly locked root:1000 oneshot', async () => {
  const f = await fixture(); successful(f.run()); const calls = await f.calls();
  assert.equal(await readFile(join(f.root, 'api-key'), 'utf8'), 'fixture-only-key');
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'config.json'), 'utf8')), {
    inbox: `${posix(f.root)}/spool/inbox`, results: `${posix(f.root)}/spool/results`, privateRoot: `${posix(f.root)}/private`, rendererImage: renderer,
  });
  assert.equal((await readFile(join(f.bundle, 'source-id'), 'utf8')).trim(), sha);
  const unit = await readFile(join(f.units, 'openscience-synclip-image.service'), 'utf8');
  assert.match(unit, /Type=oneshot\nUser=root\nGroup=1000/u);
  assert.ok(unit.includes(`ExecStart=/usr/bin/flock -n ${posix(f.root)}/runner.lock /usr/bin/node ${posix(f.bundle)}/infra/synclip-image/broker.mjs --config ${posix(f.root)}/config.json`));
  assert.match(unit, /ProtectSystem=strict/u); assert.match(unit, /UMask=0027/u);
  assert.match(calls, /install <-d> <-o> <root> <-g> <1000> <-m> <2750>/u);
  assert.match(calls, /install <-d> <-o> <1000> <-g> <1000> <-m> <0700>/u);
  assert.match(calls, /node .*<verify>.*<--sha>/u); assert.match(calls, /node <--input-type=module>/u);
  assert.match(calls, /systemctl <stop> <openscience-synclip-image.timer>/u);
  assert.doesNotMatch(calls, /systemctl <(?:enable|start)>|docker <(?:build|pull)>|chatgpt-web-image\.(?:timer|service)>/u);
  await assert.rejects(readFile(join(f.root, 'spool/results/.ready')), { code: 'ENOENT' });
  assert.equal(await readFile(join(f.bundle, 'previous/ready'), 'utf8'), 'previous-ready');
  assert.equal(await readFile(join(f.bundle, 'previous/config.json'), 'utf8'), 'previous-config');
  assert.ok(!calls.includes('fixture-only-key'));
});

test('source-manifest rejection prevents bundle creation and any provider or service action', async () => {
  const f = await fixture(); assert.notEqual(f.run({ BAD_MANIFEST: '1' }).status, 0); await unchanged(f);
  await assert.rejects(readdir(f.bundle), { code: 'ENOENT' }); assert.doesNotMatch(await f.calls(), /docker|systemctl/u);
});

test('a non-renderer image and an unsafe key mode stop before changing an existing installation', async () => {
  for (const failure of [{ BAD_RENDERER: '1' }, { KEY_MODE: '644' }]) {
    const f = await fixture(); assert.notEqual(f.run(failure).status, 0); await unchanged(f);
    await assert.rejects(readdir(f.bundle), { code: 'ENOENT' }); assert.doesNotMatch(await f.calls(), /systemctl/u);
  }
});

test('a busy runner lock preserves active work and timer state', async () => {
  const f = await fixture(); assert.equal(f.run({ BUSY_LOCK: '1' }).status, 71); await unchanged(f);
  assert.doesNotMatch(await f.calls(), /systemctl/u); await assert.rejects(readdir(f.bundle), { code: 'ENOENT' });
});

test('an existing immutable bundle is never overwritten or used to change the current service', async () => {
  const f = await fixture(); await mkdir(f.bundle, { recursive: true }); await writeFile(join(f.bundle, 'source-id'), 'retained');
  assert.equal(f.run().status, 69); await unchanged(f); assert.equal(await readFile(join(f.bundle, 'source-id'), 'utf8'), 'retained');
  assert.doesNotMatch(await f.calls(), /systemctl/u);
});

test('daemon reload failure restores only the original Synclip config, units, readiness and timer state', async () => {
  const f = await fixture(); assert.notEqual(f.run({ FAIL_RELOAD: '1' }).status, 0); await unchanged(f);
  assert.equal(await readFile(join(f.root, 'spool/results/.ready'), 'utf8'), 'previous-ready');
  const actions = (await f.calls()).split('\n').filter(line => line.startsWith('systemctl'));
  assert.ok(actions.some(line => line.includes('<start> <openscience-synclip-image.timer>')));
  assert.ok(actions.every(line => !/<(?:stop|disable|start|enable)>/u.test(line) || line.includes('<openscience-synclip-image.timer>')));
});

test('explicit nondeferred install enables only the Synclip timer', async () => {
  const f = await fixture(); successful(f.run({}, false));
  const actions = (await f.calls()).split('\n').filter(line => /systemctl <(?:start|enable)>/u.test(line));
  assert.deepEqual(actions, ['systemctl <enable> <--now> <openscience-synclip-image.timer>']);
});

test('a first-install failure preserves the separately provisioned key and does not leave new live units or config', async () => {
  const f = await fixture(false); assert.notEqual(f.run({ FAIL_RELOAD: '1' }).status, 0);
  assert.equal(await readFile(join(f.root, 'api-key'), 'utf8'), 'fixture-only-key');
  for (const path of [join(f.root, 'config.json'), join(f.units, 'openscience-synclip-image.service'), join(f.units, 'openscience-synclip-image.timer')]) {
    await assert.rejects(readFile(path), { code: 'ENOENT' });
  }
  assert.doesNotMatch(await f.calls(), /systemctl <(?:start|enable)>/u);
  assert.equal((await readFile(join(f.bundle, 'source-id'), 'utf8')).trim(), sha);
});

test('a missing compiled dependency fails the real bundle import before changing any live unit', async () => {
  const f = await fixture(); await unlink(join(f.release, 'packages/ai-gateway/dist/ocr.js'));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Cannot find module/u);
  await unchanged(f); assert.doesNotMatch(await f.calls(), /systemctl/u);
});
