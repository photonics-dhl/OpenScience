import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseProvisionCli, provisionScanSciSecrets, verifyRootOwnedSecretMetadata } from './provision-scansci-secrets.mjs';

const firstToken = 'first-token-value-never-print';
const secondToken = 'second-token-value-never-print';

test('provisioner atomically creates private fixed files and reports names/status only', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'scansci-secrets-'));
  const root = join(parent, 'private', 'scansci');
  t.after(async () => rm(parent, { recursive: true, force: true }));
  const requiredUid = process.getuid?.();

  const statuses = await provisionScanSciSecrets({
    root,
    input: `${JSON.stringify({ serviceToken: firstToken })}\n`,
    replaceExisting: false,
    requiredUid,
  });

  assert.deepEqual(statuses, [{ key: 'serviceToken', status: 'created' }]);
  assert.equal(await readFile(join(root, 'scansci_service_token'), 'utf8'), `${firstToken}\n`);
  const directory = await lstat(root);
  const secret = await lstat(join(root, 'scansci_service_token'));
  if (process.platform !== 'win32') {
    assert.equal(directory.mode & 0o777, 0o700);
    assert.equal(secret.mode & 0o777, 0o600);
  }
  assert.equal(secret.nlink, 1);
  assert.deepEqual((await readdir(root)).sort(), ['scansci_service_token']);
  const output = statuses.map(({ key, status }) => `${key}:${status}`).join('\n');
  assert.doesNotMatch(output, new RegExp(firstToken, 'u'));
  assert.doesNotMatch(output, /fixture-user/u);
  assert.doesNotMatch(output, /fixture-password/u);
});

test('provisioner preserves the service token until explicit replacement and rejects unsafe targets', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'scansci-secrets-'));
  const root = join(parent, 'scansci');
  t.after(async () => rm(parent, { recursive: true, force: true }));
  const requiredUid = process.getuid?.();
  await provisionScanSciSecrets({ root, input: JSON.stringify({ serviceToken: firstToken }), replaceExisting: false, requiredUid });

  const preserved = await provisionScanSciSecrets({ root, input: JSON.stringify({ serviceToken: secondToken }), replaceExisting: false, requiredUid });
  assert.deepEqual(preserved, [{ key: 'serviceToken', status: 'preserved' }]);
  assert.equal(await readFile(join(root, 'scansci_service_token'), 'utf8'), `${firstToken}\n`);

  const replaced = await provisionScanSciSecrets({ root, input: JSON.stringify({ serviceToken: secondToken }), replaceExisting: true, requiredUid });
  assert.deepEqual(replaced, [{ key: 'serviceToken', status: 'replaced' }]);
  assert.equal(await readFile(join(root, 'scansci_service_token'), 'utf8'), `${secondToken}\n`);

  const hostileRoot = join(parent, 'hostile');
  await symlink(root, hostileRoot, 'junction');
  await assert.rejects(provisionScanSciSecrets({
    root: hostileRoot,
    input: JSON.stringify({ serviceToken: 'never-write-token' }),
    replaceExisting: true,
    requiredUid,
  }), /unsafe ScanSci Secret/u);
});

test('provisioner CLI accepts no value arguments and requires an explicit replace switch', () => {
  assert.deepEqual(parseProvisionCli([]), { replaceExisting: false });
  assert.deepEqual(parseProvisionCli(['--replace-existing']), { replaceExisting: true });
  assert.throws(() => parseProvisionCli(['--service-token', firstToken]), /arguments are invalid/u);
});

test('provisioner CLI reads its JSON exclusively from stdin', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./provision-scansci-secrets.mjs', import.meta.url))], {
    encoding: 'utf8',
    input: '{}',
  });
  assert.equal(result.status, 65);
  assert.match(result.stderr, /ScanSci Secret input is invalid/u);
  assert.doesNotMatch(result.stderr, /path.*must be of type/iu);
});

test('provisioner rejects unsupported browser credentials and bootstrap material', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'scansci-secrets-'));
  t.after(async () => rm(parent, { recursive: true, force: true }));
  for (const input of [
    { username: 'fixture-user' },
    { username: 'fixture-user', password: 'fixture-password' },
    { sessionBootstrapKey: 'fixture-bootstrap' },
  ]) {
    await assert.rejects(provisionScanSciSecrets({
      root: join(parent, 'scansci'),
      input: JSON.stringify(input),
      requiredUid: process.getuid?.(),
    }), /input is invalid/u);
  }
});

test('provisioner rejects a root-owned Secret with a non-root group', () => {
  assert.throws(() => verifyRootOwnedSecretMetadata({ isFile: true, symbolic: false, nlink: 1, uid: 0, gid: 1, mode: 0o600 }), /unsafe/u);
});
