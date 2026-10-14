import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const release = 'a'.repeat(40);
const q = s => `'${s.replaceAll("'", "'\\''")}'`;
const slash = s => s.replaceAll('\\', '/');
const bashPath = s => process.platform === 'win32' ? slash(s).replace(/^([A-Za-z]):/u, (_, d) => '/' + d.toLowerCase()) : s;
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
for (const mode of ['success', 'object-verify-failure', 'state-verify-failure']) {
  test(`full orchestration ${mode} only publishes after all component verification`, async () => {
    const tmp = fileURLToPath(new URL('../../tmp/architecture-remediation/', import.meta.url));
    await mkdir(tmp, { recursive: true });
    const root = await mkdtemp(path.join(tmp, 'full-shell-'));
    const remote = path.join(root, 'remote'), source = path.join(root, 'release'), backup = path.join(root, 'backups'), bin = path.join(root, 'bin');
    for (const dir of [remote, source, backup, bin, path.join(source, 'infra/scripts')]) await mkdir(dir, { recursive: true });
    await writeFile(path.join(remote, '.release-id'), release); await writeFile(path.join(source, '.release-source'), release);
    let script = (await readFile(new URL('./backup.sh', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
    for (const [before, after] of [
      ['REMOTE_ROOT="/opt/openscience"', `REMOTE_ROOT=${q(slash(remote))}`],
      ['RELEASE_ROOT="/opt/openscience-releases/$RELEASE_SHA"', `RELEASE_ROOT=${q(slash(source))}`],
      ['DUMP_DIR="/var/backups/openscience"', `DUMP_DIR=${q(slash(backup))}`],
    ]) { assert.ok(script.includes(before)); script = script.replace(before, after); }
    script = script.replace('set -euo pipefail', `export PATH=${q(bashPath(bin))}:"$PATH"\nset -euo pipefail`);
    const scripts = {
      flock: '#!/usr/bin/env bash\nexit 0\n',
      sync: '#!/usr/bin/env bash\nexit 0\n',
      node: `#!/usr/bin/env bash\nexec ${q(slash(process.execPath))} "$@"\n`,
      docker: '#!/usr/bin/env bash\ncase "$*" in (*verify-database-isolation*) exit 0;; (*"new URL"*) printf "core_role\\ncore_db\\nsearch_role\\nsearch_db\\n";; (*pg_dump*) printf "fixture-sql\\n";; (*) exit 97;; esac\n',
    };
    if (process.platform === 'win32') scripts.install = '#!/usr/bin/env bash\nif [[ "$1" == -d ]]; then mkdir -p -- "$4"; elif [[ "$1" == -m && "$3" == /dev/null ]]; then touch -- "$4"; else exit 96; fi\n';
    for (const [name, content] of Object.entries(scripts)) await writeFile(path.join(bin, name), content, { mode: 0o700 });
    for (const kind of ['objects', 'recovery-state']) {
      await writeFile(path.join(source, 'infra/scripts', kind === 'objects' ? 'backup-objects.mjs' : 'backup-recovery-state.mjs'), `
        import { mkdirSync } from 'node:fs'; import path from 'node:path';
        const [op, root, id] = process.argv.slice(2);
        if(op === 'export') mkdirSync(path.join(root, ${JSON.stringify(kind === 'objects' ? 'objects-set-' : 'recovery-state-')} + id));
        if(op === 'verify' && ${JSON.stringify(mode)} === ${JSON.stringify(kind === 'objects' ? 'object-verify-failure' : 'state-verify-failure')}) process.exit(23);
      `);
    }
    const file = path.join(root, 'backup.sh'); await writeFile(file, script);
    const result = spawnSync(bash, [file, '--full'], { cwd: root, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, mode === 'success' ? 0 : 23, result.stderr);
    const names = await readdir(backup), complete = names.filter(n => n.startsWith('full-set-'));
    assert.equal(complete.length, mode === 'success' ? 1 : 0);
    if (mode === 'success') {
      const manifest = await readFile(path.join(backup, complete[0], 'manifest'), 'utf8');
      assert.match(manifest, /consistency=component-validated-not-point-in-time/);
      assert.match(result.stdout, /restore_consistency=pending offhost=pending/);
      for (const prefix of ['db-set-', 'objects-set-', 'recovery-state-']) assert.ok(names.includes(prefix + complete[0].slice('full-set-'.length)));
    }
    const refused = spawnSync(bash, [file, '--full', '--confirm'], { cwd: root, encoding: 'utf8', timeout: 15000 });
    assert.equal(refused.status, 64); assert.match(refused.stderr, /rotation held/);
  });
}
