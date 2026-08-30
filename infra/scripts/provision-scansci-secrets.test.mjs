import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseProvisionCli, provisionScanSciSecrets } from './provision-scansci-secrets.mjs';

const firstToken = 'first-token-value-never-print';
const secondToken = 'second-token-value-never-print';

test('provisioner atomically creates private fixed files and reports names/status only', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'scansci-secrets-'));
  const root = join(parent, 'private', 'scansci');
  t.after(async () => rm(parent, { recursive: true, force: true }));
  const requiredUid = process.getuid?.();

  const statuses = await provisionScanSciSecrets({
    root,
    input: `${JSON.stringify({ serviceToken: firstToken, username: 'fixture-user', password: 'fixture-password' })}\n`,
    replaceExisting: false,
    requiredUid,
  });

  assert.deepEqual(statuses, [
    { key: 'serviceToken', status: 'created' },
    { key: 'username', status: 'created' },
    { key: 'password', status: 'created' },
  ]);
  assert.equal(await readFile(join(root, 'scansci_service_token'), 'utf8'), `${firstToken}\n`);
  const directory = await lstat(root);
  const secret = await lstat(join(root, 'scansci_service_token'));
  if (process.platform !== 'win32') {
    assert.equal(directory.mode & 0o777, 0o700);
    assert.equal(secret.mode & 0o777, 0o600);
  }
  assert.equal(secret.nlink, 1);
  assert.deepEqual((await readdir(root)).sort(), ['scansci_password', 'scansci_service_token', 'scansci_username']);
  const output = statuses.map(({ key, status }) => `${key}:${status}`).join('\n');
  assert.doesNotMatch(output, new RegExp(firstToken, 'u'));
  assert.doesNotMatch(output, /fixture-user/u);
  assert.doesNotMatch(output, /fixture-password/u);
});

test('provisioner preserves existing credentials until explicit replacement and rejects unsafe targets', async (t) => {
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
    input: JSON.stringify({ username: 'never-write-user', password: 'never-write-password' }),
    replaceExisting: true,
    requiredUid,
  }), /unsafe ScanSci Secret/u);
});

test('provisioner CLI accepts no value arguments and requires an explicit replace switch', () => {
  assert.deepEqual(parseProvisionCli([]), { replaceExisting: false });
  assert.deepEqual(parseProvisionCli(['--replace-existing']), { replaceExisting: true });
  assert.throws(() => parseProvisionCli(['--service-token', firstToken]), /arguments are invalid/u);
});

test('provisioner rejects a partial optional credential pair', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'scansci-secrets-'));
  t.after(async () => rm(parent, { recursive: true, force: true }));
  await assert.rejects(provisionScanSciSecrets({
    root: join(parent, 'scansci'),
    input: JSON.stringify({ username: 'fixture-user' }),
    requiredUid: process.getuid?.(),
  }), /input is invalid/u);
});
