import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { CodexSpoolImageProvider, SynclipSpoolImageProvider } from '../src/codex-image';
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
  it('does not change historical Codex unknown behavior', async () => {
    const dirs = await spool(); let now = Date.now(); let sleeps = 0;
    const config = { ...dirs, timeoutMs: 5000, now: () => now, sleep: async (ms: number) => {
      now += ms; sleeps++;
      const reserved = JSON.parse(await readFile(join(dirs.inboxDir, id + '.submitted.json'), 'utf8'));
      await mkdir(join(dirs.resultsDir, id));
      await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1,
        id, promptHash: reserved.promptHash, status: 'uncertain', errorCode: 'UNCERTAIN' }));
    } };
    const provider = new CodexSpoolImageProvider(config);
    await expect(provider.generate({ requestId: id, prompt })).rejects.toThrow('UNCERTAIN'); expect(sleeps).toBe(1);
  });
  it.each(['uncertain', 'succeeded'] as const)('preserves retired Web %s receipts without adopting or resubmitting them', async status => {
    const dirs = await spool();
    const reservationPath = join(dirs.inboxDir, id + '.submitted.json');
    const resultDir = join(dirs.resultsDir, id);
    const reservation = JSON.stringify({ ...request, provider: 'chatgpt-web' });
    const receipt = JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web', id,
      promptHash: request.promptHash, status, ...(status === 'uncertain' ? { errorCode: 'UNCERTAIN' } : {}) });
    const bytes = png();
    await writeFile(reservationPath, reservation); await mkdir(resultDir);
    await writeFile(join(resultDir, 'result.json'), receipt); await writeFile(join(resultDir, 'result.png'), bytes);
    let submissions = 0;
    const config = { ...dirs, withSubmission: async <T>(_owner: unknown, publish: () => Promise<T>) => { submissions++; return publish(); } };
    for (const provider of [new CodexSpoolImageProvider(config), new SynclipSpoolImageProvider(config)]) {
      expect(await provider.canResumeBeforeSubmission(id)).toBe(false);
      expect(await provider.inspectRecoveryState(id)).toBe('unsafe');
      expect(await provider.canResumeFromCompletedResult(id)).toBe(false);
      await expect(provider.resumeFromCompletedResult(id)).rejects.toThrow('INVALID_OUTPUT');
      await expect(provider.generate({ requestId: id, prompt })).rejects.toThrow('INVALID_OUTPUT');
    }
    expect(submissions).toBe(0);
    await expect(readFile(join(dirs.inboxDir, id + '.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(reservationPath, 'utf8')).toBe(reservation);
    expect(await readFile(join(resultDir, 'result.json'), 'utf8')).toBe(receipt);
    expect(await readFile(join(resultDir, 'result.png'))).toEqual(bytes);
  });
  it.each([{ id: '01900000-0000-7000-8000-000000000002' }, { promptHash: 'a'.repeat(64) }, { model: undefined }])(
    'rejects changed recovered identity after uncertainty: %j', async patch => {
      const dirs = await spool(); let now = Date.now(); let sleeps = 0;
      const provider = new SynclipSpoolImageProvider({ ...dirs, timeoutMs: 5000, now: () => now,
        sleep: async ms => {
          now += ms; sleeps++;
          const reserved = JSON.parse(await readFile(join(dirs.inboxDir, id + '.submitted.json'), 'utf8'));
          await mkdir(join(dirs.resultsDir, id), { recursive: true });
          await writeFile(join(dirs.resultsDir, id, 'result.png'), png());
          await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify(sleeps === 1
            ? { schemaVersion: 1, provider: 'synclip', id, promptHash: reserved.promptHash, status: 'uncertain', errorCode: 'UNCERTAIN' }
            : { schemaVersion: 1, provider: 'synclip', id, promptHash: reserved.promptHash, status: 'succeeded', model: 'gpt-image-2.5', ...patch }));
        } });
      await expect(provider.generate({ requestId: id, prompt })).rejects.toThrow('INVALID_OUTPUT'); expect(sleeps).toBe(2);
    });
  it.each(['gpt-image-2.5', 'gpt-image-2'])('automatically returns the same paid %s PNG after uncertainty within its original deadline', async model => {
    const dirs = await spool(); let now = Date.now(); let sleeps = 0; let submissions = 0;
    const provider = new SynclipSpoolImageProvider({ ...dirs, timeoutMs: 5000, pollIntervalMs: 1000, now: () => now,
      withSubmission: async (_owner, publish) => { submissions++; return publish(); },
      sleep: async ms => {
        now += ms; sleeps++;
        const reserved = JSON.parse(await readFile(join(dirs.inboxDir, id + '.submitted.json'), 'utf8'));
        await mkdir(join(dirs.resultsDir, id), { recursive: true });
        if (sleeps === 1) await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1,
          provider: 'synclip', id, promptHash: reserved.promptHash, status: 'uncertain', errorCode: 'UNCERTAIN' }));
        else {
          await writeFile(join(dirs.resultsDir, id, 'result.png'), png());
          await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1,
            provider: 'synclip', id, promptHash: reserved.promptHash, status: 'succeeded', model }));
        }
      } });
    const result = await provider.generate({ requestId: id, prompt });
    expect(result.model).toBe(model); expect(result.bytes).toEqual(png()); expect(submissions).toBe(1); expect(sleeps).toBe(2);
    const reserved = JSON.parse(await readFile(join(dirs.inboxDir, id + '.submitted.json'), 'utf8'));
    expect(reserved.deadlineAt - reserved.createdAt).toBe(5000);
    expect(await provider.generate({ requestId: id, prompt })).toMatchObject({ model });
    expect(submissions).toBe(1);
  });
  it('waits permanently unknown Synclip output only to its original deadline without resetting the reservation', async () => {
    const dirs = await spool(); let now = Date.now(); let sleeps = 0;
    const provider = new SynclipSpoolImageProvider({ ...dirs, timeoutMs: 3000, pollIntervalMs: 1000, now: () => now,
      sleep: async ms => {
        now += ms; sleeps++;
        const reserved = JSON.parse(await readFile(join(dirs.inboxDir, id + '.submitted.json'), 'utf8'));
        await mkdir(join(dirs.resultsDir, id), { recursive: true });
        await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1,
          provider: 'synclip', id, promptHash: reserved.promptHash, status: 'uncertain', errorCode: 'UNCERTAIN' }));
      } });
    await expect(provider.generate({ requestId: id, prompt })).rejects.toThrow('UNCERTAIN');
    expect(sleeps).toBe(3);
    const original = await readFile(join(dirs.inboxDir, id + '.submitted.json'), 'utf8');
    await expect(provider.generate({ requestId: id, prompt })).rejects.toThrow();
    expect(await readFile(join(dirs.inboxDir, id + '.submitted.json'), 'utf8')).toBe(original); expect(sleeps).toBe(3);
  });
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
    expect(provider.name).toBe('synclip'); expect(provider.model).toBe('gpt-image-2.5');
    expect(provider.supportsReferenceImage).toBe(false);
  });
  it('returns only a complete matching local result; pending and foreign receipts never become completed', async () => {
    const dirs = await spool(); const provider = new SynclipSpoolImageProvider(dirs);
    await writeFile(join(dirs.inboxDir, id + '.submitted.json'), JSON.stringify(request));
    expect(await provider.inspectRecoveryState(id)).toBe('submitted_without_result');
    await mkdir(join(dirs.resultsDir, id));
    const result = { schemaVersion: 1, provider: 'synclip', id, promptHash: request.promptHash, status: 'succeeded', model: 'gpt-image-2' };
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
  it.each([undefined, 'wrong-model'])('refuses completed Synclip output with unproven model %s without changing or resubmitting it', async model => {
    const dirs = await spool(); let submissions = 0;
    const provider = new SynclipSpoolImageProvider({ ...dirs, withSubmission: async (_owner, publish) => { submissions++; return publish(); } });
    const result = JSON.stringify({ schemaVersion: 1, provider: 'synclip', id, promptHash: request.promptHash, status: 'succeeded', model });
    const image = png();
    await writeFile(join(dirs.inboxDir, id + '.submitted.json'), JSON.stringify(request));
    await mkdir(join(dirs.resultsDir, id));
    await writeFile(join(dirs.resultsDir, id, 'result.json'), result);
    await writeFile(join(dirs.resultsDir, id, 'result.png'), image);
    expect(await provider.inspectRecoveryState(id)).toBe('unsafe');
    expect(await provider.canResumeFromCompletedResult(id)).toBe(false);
    await expect(provider.resumeFromCompletedResult(id)).rejects.toThrow('INVALID_OUTPUT');
    await expect(provider.generate({ requestId: id, prompt })).rejects.toThrow('INVALID_OUTPUT');
    expect(submissions).toBe(0);
    expect(await readdir(dirs.inboxDir)).toEqual([id + '.submitted.json']);
    expect(await readFile(join(dirs.resultsDir, id, 'result.json'), 'utf8')).toBe(result);
    expect(await readFile(join(dirs.resultsDir, id, 'result.png'))).toEqual(image);
  });
  it.each(['gpt-image-2.5', 'gpt-image-2'])('preserves actual completed %s across replay and recovery', async model => {
    const dirs = await spool(); let submissions = 0;
    const provider = new SynclipSpoolImageProvider({ ...dirs, withSubmission: async (_owner, publish) => { submissions++; return publish(); } });
    await writeFile(join(dirs.inboxDir, id + '.submitted.json'), JSON.stringify(request));
    await mkdir(join(dirs.resultsDir, id));
    await writeFile(join(dirs.resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1, provider: 'synclip', id, promptHash: request.promptHash, status: 'succeeded', model }));
    await writeFile(join(dirs.resultsDir, id, 'result.png'), png());
    expect(await provider.inspectRecoveryState(id)).toBe('completed');
    expect(await provider.canResumeFromCompletedResult(id)).toBe(true);
    expect((await provider.resumeFromCompletedResult(id)).model).toBe(model);
    expect((await provider.generate({ requestId: id, prompt })).model).toBe(model);
    expect(submissions).toBe(0);
  });
});
