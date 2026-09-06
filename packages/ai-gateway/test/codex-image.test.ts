import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rename, readFile, symlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { CodexSpoolImageProvider } from '../src/codex-image';
import { validateCodexImageRequest, validateCodexImageResult } from '../src/codex-image-protocol';
import { sha256Text } from '../src/ocr';
const id = '01900000-0000-7000-8000-000000000001';
const request = { schemaVersion: 1, id, prompt: 'scene', promptHash: sha256Text('scene'), createdAt: 100, deadlineAt: 1000 };
describe('Codex image spool', () => {
  it('validates identity, prompt digest, bounded deadline and safe result codes', () => {
    expect(validateCodexImageRequest(request, 101)).toEqual(request);
    for (const patch of [{ id: '../x' }, { promptHash: 'a'.repeat(64) }, { deadlineAt: 700000 }, { deadlineAt: 50 }]) expect(() => validateCodexImageRequest({ ...request, ...patch })).toThrow();
    expect(() => validateCodexImageResult({ schemaVersion: 1, id, promptHash: request.promptHash, status: 'failed', errorCode: 'secret details' })).toThrow();
  });
  it('requires readiness and never republishes a claimed request or accepts changed prompt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-image-'));
    const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
    await mkdir(inboxDir); await mkdir(resultsDir);
    let now = Date.now();
    const provider = new CodexSpoolImageProvider({ inboxDir, resultsDir, timeoutMs: 10, now: () => now, sleep: async () => { await rename(join(inboxDir, id + '.json'), join(root, 'claimed.json')).catch(() => {}); now += 10; } });
    await expect(provider.generate({ prompt: 'scene', requestId: id })).rejects.toThrow();
    await writeFile(join(resultsDir, '.ready'), 'ready');
    await expect(provider.generate({ prompt: 'scene', requestId: id })).rejects.toThrow();
    expect(JSON.parse(await readFile(join(root, 'claimed.json'), 'utf8')).id).toBe(id);
    await expect(provider.generate({ prompt: 'changed', requestId: id })).rejects.toThrow();
    await expect(readFile(join(inboxDir, id + '.json'))).rejects.toThrow();
  });
});

function png(): Buffer {
  const chunk = (type: string, bytes: Buffer) => { const value = Buffer.alloc(bytes.length + 12); value.writeUInt32BE(bytes.length); value.write(type, 4); bytes.copy(value, 8); return value; };
  const header = Buffer.alloc(13); header.writeUInt32BE(1280); header.writeUInt32BE(720, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(5121 * 720))), chunk('IEND', Buffer.alloc(0))]);
}
it.each(['succeeded', 'failed', 'uncertain', 'wrong-hash', 'oversized', 'bad-png'])('reads only bounded matching terminal result (%s)', async status => {
  const root = await mkdtemp(join(tmpdir(), 'codex-result-')); const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
  await mkdir(inboxDir); await mkdir(resultsDir); await mkdir(join(resultsDir, id)); await writeFile(join(resultsDir, '.ready'), 'ready');
  const result = { schemaVersion: 1, id, promptHash: status === 'wrong-hash' ? 'a'.repeat(64) : sha256Text('scene'), status: ['failed', 'uncertain'].includes(status) ? status : 'succeeded' };
  await writeFile(join(resultsDir, id, 'result.json'), status === 'oversized' ? ' '.repeat(16385) : JSON.stringify(result));
  await writeFile(join(resultsDir, id, 'result.png'), status === 'bad-png' ? Buffer.from('invalid') : png());
  const pending = new CodexSpoolImageProvider({ inboxDir, resultsDir }).generate({ prompt: 'scene', requestId: id });
  if (status === 'succeeded') expect((await pending).contentType).toBe('image/png'); else await expect(pending).rejects.toThrow();
});

it('rejects stale readiness and symlinked result directories before consuming output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-links-')); const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results'); const target = join(root, 'target');
  await mkdir(inboxDir); await mkdir(resultsDir); await mkdir(target); await writeFile(join(resultsDir, '.ready'), 'ready');
  await utimes(join(resultsDir, '.ready'), new Date(0), new Date(0));
  const provider = new CodexSpoolImageProvider({ inboxDir, resultsDir });
  await expect(provider.generate({ prompt: 'scene', requestId: id })).rejects.toThrow();
  await expect(readFile(join(inboxDir, id + '.json'))).rejects.toThrow();
  await utimes(join(resultsDir, '.ready'), new Date(), new Date());
  await symlink(target, join(resultsDir, id), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(provider.generate({ prompt: 'scene', requestId: id })).rejects.toThrow();
});

it('recovers an orphaned durable reservation without extending its deadline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-orphan-')); const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
  await mkdir(inboxDir); await mkdir(resultsDir); await writeFile(join(resultsDir, '.ready'), 'ready');
  let now = Date.now(); const saved = { ...request, createdAt: now - 10, deadlineAt: now + 100 };
  await writeFile(join(inboxDir, id + '.submitted.json'), JSON.stringify(saved));
  let consumed: unknown;
  const provider = new CodexSpoolImageProvider({ inboxDir, resultsDir, now: () => now, sleep: async () => {
    consumed = JSON.parse(await readFile(join(inboxDir, id + '.json'), 'utf8'));
    await rename(join(inboxDir, id + '.json'), join(root, 'claimed.json'));
    now += 100;
  } });
  await expect(provider.generate({ prompt: 'scene', requestId: id })).rejects.toThrow('EXPIRED');
  expect(consumed).toEqual(saved);
  expect(JSON.parse(await readFile(join(inboxDir, id + '.submitted.json'), 'utf8'))).toEqual(saved);
});
