import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { SynclipSpoolImageProvider } from '../src/codex-image';
import { imagePromptHash, validateCodexImageRequest, validateCodexImageResult } from '../src/codex-image-protocol';

const id = '01900000-0000-7000-8000-000000000001';
const prompt = 'Preserve the reviewed science and the selected illustration style.';
const request = { schemaVersion: 1, provider: 'synclip', id, prompt, promptHash: imagePromptHash(prompt), createdAt: 100, deadlineAt: 1000 };
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function spool() {
  const parent = resolve(__dirname, '../../../tmp/synclip-image-spool');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'case-')); roots.push(root);
  const inboxDir = join(root, 'inbox'), resultsDir = join(root, 'results');
  await mkdir(inboxDir); await mkdir(resultsDir); await writeFile(join(resultsDir, '.ready'), 'ready');
  return { root, inboxDir, resultsDir };
}
function png() {
  const chunk = (type: string, bytes: Buffer) => { const value = Buffer.alloc(bytes.length + 12); value.writeUInt32BE(bytes.length); value.write(type, 4); bytes.copy(value, 8); return value; };
  const header = Buffer.alloc(13); header.writeUInt32BE(1280); header.writeUInt32BE(720, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(5121 * 720))), chunk('IEND', Buffer.alloc(0))]);
}

describe('Synclip uses the existing image spool', () => {
  it('requires its own explicit provider identity and excludes references', () => {
    expect(validateCodexImageRequest(request, 101)).toEqual(request);
    expect(() => validateCodexImageRequest({ ...request, reference: { contentHash: 'a'.repeat(64), role: 'style' } })).toThrow();
    for (const provider of ['codex', 'chatgpt-web'] as const) {
      expect(() => validateCodexImageRequest(request, 101, provider)).toThrow();
      expect(() => validateCodexImageResult({ schemaVersion: 1, provider: 'synclip', id, promptHash: request.promptHash, status: 'succeeded' }, provider)).toThrow();
    }
  });
  it('keeps the existing submission authority before publishing any paid intent', async () => {
    const dirs = await spool();
    const provider = new SynclipSpoolImageProvider({ ...dirs, withSubmission: async () => { throw Error('authority revoked'); } });
    await expect(provider.generate({ requestId: id, prompt })).rejects.toThrow('authority revoked');
    await expect(readFile(join(dirs.inboxDir, id + '.submitted.json'))).rejects.toThrow();
    expect(provider.name).toBe('synclip'); expect(provider.model).toBe('gpt-image-2');
    expect(provider.supportsReferenceImage).toBe(false);
  });
  it('returns only a complete matching local result; pending and foreign receipts never become completed', async () => {
    const dirs = await spool(); const provider = new SynclipSpoolImageProvider(dirs);
    await writeFile(join(dirs.inboxDir, id + '.submitted.json'), JSON.stringify(request));
    expect(await provider.inspectRecoveryState(id)).toBe('submitted_without_result');
    await mkdir(join(dirs.resultsDir, id));
    const result = { schemaVersion: 1, provider: 'synclip', id, promptHash: request.promptHash, status: 'succeeded' };
    await writeFile(join(dirs.resultsDir, id, 'result.png'), png());
    await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify(result));
    expect(await provider.canResumeFromCompletedResult(id)).toBe(true);
    expect((await provider.resumeFromCompletedResult(id)).promptHash).toBe(request.promptHash);
    for (const patch of [{ provider: 'chatgpt-web' }, { provider: undefined }, { promptHash: 'b'.repeat(64) }]) {
      await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify({ ...result, ...patch }));
      expect(await provider.inspectRecoveryState(id)).toBe('unsafe');
      expect(await provider.canResumeFromCompletedResult(id)).toBe(false);
    }
  });
});
