import { afterAll, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { CodexSolImageReviewProvider } from '../src/codex-sol-review';
import { sha256Text } from '../src/ocr';
import type { ScienceReviewInput } from '../src/science-review-protocol';

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tmp/legacy-web-retirement');
const fixtureDirectories: string[] = [];
afterAll(async () => {
  const expectedRoot = await realpath(fixtureRoot);
  for (const root of fixtureDirectories) {
    expect((await lstat(root)).isSymbolicLink()).toBe(false);
    const target = await realpath(root);
    expect(dirname(target)).toBe(expectedRoot);
    expect(basename(target)).toMatch(/^sol-review-[A-Za-z0-9]{6}$/u);
    await rm(target, { recursive: true });
  }
});
function png(): Buffer {
  const chunk = (type: string, bytes: Buffer) => { const value = Buffer.alloc(bytes.length + 12); value.writeUInt32BE(bytes.length); value.write(type, 4); bytes.copy(value, 8); return value; };
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(20))), chunk('IEND', Buffer.alloc(0))]);
}

const id = '01900000-0000-7000-8000-000000000001';
const response = '{"decision":"accepted","summary":"clear","repairInstruction":null}';
async function fixture() {
  await mkdir(fixtureRoot, { recursive: true });
  const root = await mkdtemp(join(fixtureRoot, 'sol-review-')); fixtureDirectories.push(root);
  const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
  await mkdir(inboxDir); await mkdir(resultsDir);
  const bytes = png(); const hash = createHash('sha256').update(bytes).digest('hex');
  const input: ScienceReviewInput = {
    requestId: id, authorizationContext: { taskId: id, actorId: 'actor', workspaceId: 'workspace' },
    illustrationContext: { executionAttempt: 1, claimContent: 'Claim', baseIdentity: null },
    source: { kind: 'illustration-image', researchObjectId: '01900000-0000-7000-8000-000000000002',
      versionId: '01900000-0000-7000-8000-000000000003', candidateHash: hash, sourceEvidenceIdentity: 'a'.repeat(64) },
    prompt: 'Inspect actual pixels', attachments: [{ fileName: 'page-1.png', mediaType: 'image/png',
      pageNumber: 1, width: 2, height: 2, sha256: hash, bytes }],
  };
  const attachment = { ...input.attachments![0]! };
  Reflect.deleteProperty(attachment, 'bytes');
  const request = { schemaVersion: 1, provider: 'codex-sol-image-review', model: 'gpt-5.6-sol', reasoningEffort: 'high',
    id, prompt: input.prompt, promptHash: sha256Text(input.prompt), source: input.source,
    attachments: [attachment], createdAt: 100, deadlineAt: 1100 };
  let now = 1000; let authorizations = 0; let sleep: (ms: number) => Promise<void> = async ms => { now += ms; };
  const provider = new CodexSolImageReviewProvider({ inboxDir, resultsDir,
    withIllustrationSubmission: async (_, read) => { authorizations++; return read(); },
    now: () => now, sleep: ms => sleep(ms), pollIntervalMs: 5 });
  const reserve = (value: unknown = request) => writeFile(join(inboxDir, `${id}.submitted.json`), JSON.stringify(value));
  const output = async (status = 'succeeded', patch: Record<string, unknown> = {}) => {
    await mkdir(join(resultsDir, id), { recursive: true });
    await writeFile(join(resultsDir, id, 'response.txt'), response);
    await writeFile(join(resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1,
      provider: 'codex-sol-image-review', model: 'gpt-5.6-sol', id, promptHash: request.promptHash,
      status, ...(status === 'succeeded' ? { responseHash: sha256Text(response) } : { errorCode: 'UNCERTAIN' }), ...patch }));
  };
  return { root, inboxDir, resultsDir, input, request, provider, reserve, output,
    setNow: (value: number) => { now = value; }, setSleep: (callback: typeof sleep) => { sleep = callback; },
    now: () => now, authorizations: () => authorizations };
}
async function snapshot(root: string): Promise<Array<{ path: string; bytes: string | null }>> {
  const values: Array<{ path: string; bytes: string | null }> = [];
  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name); const stat = await lstat(path);
    values.push({ path, bytes: stat.isDirectory() ? null : (await readFile(path)).toString('hex') });
    if (stat.isDirectory()) values.push(...await snapshot(path));
  }
  return values;
}

it('consumes the exact paid Sol response after the deadline, without a legacy host, readiness or filesystem write', async () => {
  const f = await fixture(); await f.reserve(); await f.output(); f.setNow(2000);
  const before = await snapshot(f.root);
  expect(await f.provider.hasImageReviewReservation(id)).toBe(true);
  expect(await f.provider.canResumeFromCompletedResult(id)).toBe(true);
  expect((await f.provider.review(f.input)).model).toBe('gpt-5.6-sol');
  expect((await f.provider.resumeFromCompletedResult(f.input)).responseHash).toBe(sha256Text(response));
  const reader = new CodexSolImageReviewProvider({ inboxDir: f.inboxDir, resultsDir: f.resultsDir });
  expect(await reader.canResumeFromCompletedResult(id)).toBe(true);
  await expect(reader.review(f.input)).rejects.toThrow('INVALID_OUTPUT');
  expect(await snapshot(f.root)).toEqual(before);
  expect(f.authorizations()).toBe(2);
});

it.each(['missing', 'queue-only', 'results-only', 'malformed', 'Chat', 'wrong-id', 'changed-prompt', 'changed-source', 'changed-attachment'])(
  'rejects %s evidence instead of creating a sidecar, reservation or queue entry', async kind => {
    const f = await fixture();
    if (kind === 'queue-only') await writeFile(join(f.inboxDir, `${id}.json`), JSON.stringify(f.request));
    if (kind === 'results-only') await f.output();
    if (kind === 'malformed') await f.reserve({ id });
    if (kind === 'Chat') await f.reserve({ ...f.request, provider: 'chatgpt-web-science-review' });
    if (kind === 'wrong-id') await f.reserve({ ...f.request, id: '01900000-0000-7000-8000-000000000009' });
    if (kind === 'changed-prompt') await f.reserve({ ...f.request, prompt: 'Different science', promptHash: sha256Text('Different science') });
    if (kind === 'changed-source') await f.reserve({ ...f.request, source: { ...f.request.source, sourceEvidenceIdentity: 'b'.repeat(64) } });
    if (kind === 'changed-attachment') await f.reserve({ ...f.request, attachments: [{ ...f.request.attachments[0], fileName: 'page-2.png' }] });
    const before = await snapshot(f.root);
    await expect(f.provider.review(f.input)).rejects.toThrow('RETIRED_IMAGE_REVIEW');
    await expect(f.provider.resumeFromCompletedResult(f.input)).rejects.toThrow('RETIRED_IMAGE_REVIEW');
    expect(await f.provider.canResumeFromCompletedResult(id)).toBe(false);
    expect(await snapshot(f.root)).toEqual(before);
  });

it('polls only the original submitted result within its original deadline and never recreates a consumed queue', async () => {
  const f = await fixture(); await f.reserve(); const before = await readFile(join(f.inboxDir, `${id}.submitted.json`));
  const inboxBefore = await readdir(f.inboxDir); let polls = 0;
  f.setSleep(async ms => { polls++; f.setNow(f.now() + ms); await f.output(); });
  expect((await f.provider.review(f.input)).text).toBe(response);
  expect(polls).toBe(1); expect(f.now()).toBe(1005);
  expect(await readFile(join(f.inboxDir, `${id}.submitted.json`))).toEqual(before);
  expect(await readdir(f.inboxDir)).toEqual(inboxBefore);
});

it('preserves an uncertain paid response and later consumes its matching completed result without another attempt', async () => {
  const f = await fixture(); await f.reserve(); await f.output('uncertain');
  const before = await snapshot(f.root);
  await expect(f.provider.review(f.input)).rejects.toThrow('UNCERTAIN');
  expect(await f.provider.canResumeFromCompletedResult(id)).toBe(false);
  expect(await snapshot(f.root)).toEqual(before);
  await f.output(); f.setNow(2000);
  expect((await f.provider.resumeFromCompletedResult(f.input)).text).toBe(response);
});

it('does not renew an expired pending deadline or accept an output with mismatched response bytes', async () => {
  const f = await fixture(); await f.reserve(); f.setNow(2000);
  const before = await snapshot(f.root);
  await expect(f.provider.review(f.input)).rejects.toThrow();
  expect(await snapshot(f.root)).toEqual(before);
  await f.output('succeeded', { responseHash: 'f'.repeat(64) });
  const damaged = await snapshot(f.root);
  expect(await f.provider.canResumeFromCompletedResult(id)).toBe(false);
  await expect(f.provider.resumeFromCompletedResult(f.input)).rejects.toThrow('INVALID_OUTPUT');
  expect(await snapshot(f.root)).toEqual(damaged);
});
