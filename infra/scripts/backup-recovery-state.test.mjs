import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile, symlink, stat, link } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportRecoveryState, verifyRecoveryState } from './backup-recovery-state.mjs';

const release = 'a'.repeat(40), id = '20261014T120000Z-123';
async function fixture() {
  const tmp = fileURLToPath(new URL('../../tmp/architecture-remediation/', import.meta.url));
  await mkdir(tmp, { recursive: true });
  const root = await mkdtemp(path.join(tmp, 'host-backup-'));
  const backupRoot = path.join(root, 'backups'), source = path.join(root, 'source');
  await mkdir(backupRoot, { mode: 0o700 }); await mkdir(source);
  return { root, source, backupRoot, options: { backupRoot, id, release, reserve: 0, sources: [{ name: 'image-private', root: source }] } };
}
test('private host set preserves paid receipt bytes and ownership metadata, with numbered blobs', async () => {
  const f = await fixture();
  await writeFile(path.join(f.source, 'synclip-receipt.json'), '{"taskId":"fixture-paid"}');
  await writeFile(path.join(f.source, 'api-key'), 'must-not-backup');
  await writeFile(path.join(f.source, 'runtime.env'), 'must-not-backup');
  await writeFile(path.join(f.source, 'caller.credential'), 'must-not-backup');
  const result = await exportRecoveryState(f.options);
  const set = path.join(f.backupRoot, `recovery-state-${id}`);
  assert.equal(result.files, 1); assert.deepEqual(await verifyRecoveryState(set), result);
  const map = JSON.parse((await readFile(path.join(set, 'files.ndjson'), 'utf8')).trim());
  assert.equal(map.relative, 'synclip-receipt.json');
  assert.equal(await readFile(path.join(set, map.blob), 'utf8'), '{"taskId":"fixture-paid"}');
  assert.equal(map.uid, (await stat(path.join(f.source, 'synclip-receipt.json'))).uid);
  if (process.platform !== 'win32') {
    assert.equal((await stat(set)).mode & 0o777, 0o700);
    assert.equal((await stat(path.join(set, map.blob))).mode & 0o777, 0o600);
  }
  await writeFile(path.join(set, map.blob), 'damaged');
  await assert.rejects(verifyRecoveryState(set), /^Error: RECOVERY_STATE_FAIL$/);
});
test('Native state exports request identity and ended only; runtime credentials never copied', async () => {
  const f = await fixture();
  const attempt = '12345678-1234-1234-1234-123456789012-1';
  await mkdir(path.join(f.source, attempt));
  for (const name of ['request.json', 'ended', 'caller.credential', 'config.yaml']) await writeFile(path.join(f.source, attempt, name), name);
  f.options.sources[0].native = true;
  assert.equal((await exportRecoveryState(f.options)).files, 2);
});
test('changed source rejects publication, retains preexisting sets and sanitizes errors', async () => {
  const f = await fixture(); const file = path.join(f.source, 'receipt.json');
  await writeFile(file, 'old'); await mkdir(path.join(f.backupRoot, 'older-set'));
  f.options.afterCopy = () => writeFile(file, 'changed');
  await assert.rejects(exportRecoveryState(f.options), /^Error: RECOVERY_STATE_FAIL$/);
  assert.deepEqual(await readdir(f.backupRoot), ['older-set']);
});
test('missing optional legacy source is explicit in the manifest', async () => {
  const f = await fixture(); f.options.sources.push({ name: 'legacy-missing', root: path.join(f.root, 'missing') });
  await exportRecoveryState(f.options);
  const m = JSON.parse(await readFile(path.join(f.backupRoot, `recovery-state-${id}`, 'manifest.json')));
  assert.deepEqual(m.roots, [{ name: 'image-private', present: true }, { name: 'legacy-missing', present: false }]);
});
test('symlink source entry cannot copy a credential outside its allowlisted root', { skip: process.platform === 'win32' ? 'Windows symlink privilege unavailable; Linux nofollow validation pending' : false }, async () => {
  const f = await fixture(); const secret = path.join(f.root, 'secret'); await writeFile(secret, 'secret');
  await symlink(secret, path.join(f.source, 'receipt.json'));
  await assert.rejects(exportRecoveryState(f.options), /^Error: RECOVERY_STATE_FAIL$/);
});
test('a linked source root cannot redirect backup to a credential tree', async () => {
  const f = await fixture(); const target = path.join(f.root, 'credential-tree');
  await mkdir(target); await writeFile(path.join(target, 'receipt.json'), 'do-not-copy');
  const alias = path.join(f.root, 'alias'); await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  f.options.sources[0].root = alias;
  await assert.rejects(exportRecoveryState(f.options), /^Error: RECOVERY_STATE_FAIL$/);
  assert.deepEqual(await readdir(f.backupRoot), []);
});
test('hardlinked receipt cannot copy a file from outside the allowlisted source', async () => {
  const f = await fixture(); const target = path.join(f.root, 'credential');
  await writeFile(target, 'do-not-copy'); await link(target, path.join(f.source, 'receipt.json'));
  await assert.rejects(exportRecoveryState(f.options), /^Error: RECOVERY_STATE_FAIL$/);
  assert.deepEqual(await readdir(f.backupRoot), []);
});
