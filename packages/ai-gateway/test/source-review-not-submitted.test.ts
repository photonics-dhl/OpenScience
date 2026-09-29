import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { ChatGptWebScienceReviewProvider } from '../src/science-review';
import type { ScienceReviewInput } from '../src/science-review-protocol';

const temporaryRoot = fileURLToPath(new URL('../../../tmp/', import.meta.url));
const owned: string[] = [];
afterEach(async () => {
  for (const root of owned.splice(0)) {
    if (!resolve(root).startsWith(resolve(temporaryRoot) + sep)) throw new Error('Temporary path escaped project');
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, 'source-review-proof-')); owned.push(root);
  const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
  const requestId = '01900000-0000-7000-8000-000000000001';
  const output = join(resultsDir, requestId);
  await mkdir(inboxDir); await mkdir(output, { recursive: true });
  const pdf = Buffer.from('%PDF-1.7\noriginal complete source\n%%EOF');
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  const source = { artifactId: '01900000-0000-7000-8000-000000000002', documentSha256: hash(pdf),
    candidateHash: 'a'.repeat(64), sourceMapHash: 'b'.repeat(64) };
  const prompt = 'Review the source and private candidate';
  const request = { schemaVersion: 1, provider: 'chatgpt-web-science-review', id: requestId,
    prompt, promptHash: hash(prompt), createdAt: 1_790_000_000_000, deadlineAt: 1_790_000_060_000,
    source, attachments: [{ fileName: 'source.pdf', mediaType: 'application/pdf', sha256: hash(pdf) }] };
  const result = { schemaVersion: 1, provider: request.provider, id: requestId, promptHash: request.promptHash,
    status: 'failed', errorCode: 'EXECUTION_FAILED' };
  const proof = { id: requestId, provider: request.provider, promptHash: request.promptHash, state: 'not_submitted' };
  const save = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
  await save(join(inboxDir, `${requestId}.submitted.json`), request);
  await writeFile(join(inboxDir, `${requestId}.source.pdf`), pdf);
  await save(join(output, 'result.json'), result); await save(join(output, 'not-submitted.json'), proof);
  return { root, inboxDir, resultsDir, output, request, result, proof, save, pdf,
    input: { requestId, promptHash: request.promptHash, ...source },
    provider: new ChatGptWebScienceReviewProvider({ inboxDir, resultsDir }) };
}

it('reads an exact positive proof after expiry without resetting, publishing or requiring browser readiness', async () => {
  const f = await fixture();
  const before = await readFile(join(f.inboxDir, `${f.input.requestId}.submitted.json`), 'utf8');
  expect(await f.provider.canRetrySourceReviewBeforeSubmission(f.input)).toBe(true);
  expect(await readFile(join(f.inboxDir, `${f.input.requestId}.submitted.json`), 'utf8')).toBe(before);
  expect((await readdir(f.inboxDir)).sort()).toEqual([`${f.input.requestId}.source.pdf`, `${f.input.requestId}.submitted.json`]);
});

it.each(['requestId', 'promptHash', 'artifactId', 'documentSha256', 'candidateHash', 'sourceMapHash'] as const)(
  'denies changed %s identity', async field => {
    const f = await fixture();
    expect(await f.provider.canRetrySourceReviewBeforeSubmission({ ...f.input,
      [field]: field.endsWith('Id') ? '01900000-0000-7000-8000-000000000003' : 'c'.repeat(64) })).toBe(false);
  });

async function successorFixture() {
  const f = await fixture();
  await writeFile(join(f.resultsDir, '.ready'), '{}');
  const input: ScienceReviewInput = {
    requestId: '01900000-0000-7000-8000-000000000003',
    authorizationContext: { taskId: 'task-successor', actorId: 'actor', workspaceId: 'workspace' },
    source: f.request.source, prompt: f.request.prompt,
    attachments: [{ fileName: 'source.pdf', mediaType: 'application/pdf', sha256: f.input.documentSha256, bytes: f.pdf }],
    sourceReviewRecovery: { ...f.input },
  };
  let submissions = 0;
  const provider = new ChatGptWebScienceReviewProvider({ inboxDir: f.inboxDir, resultsDir: f.resultsDir,
    withSubmission: async (_owner, publish) => {
      submissions++;
      if (changeProof) await rm(join(f.output, 'not-submitted.json'));
      return publish();
    },
    sleep: async () => {
      const output = join(f.resultsDir, input.requestId); await mkdir(output, { recursive: true });
      const text = 'review accepted';
      await writeFile(join(output, 'response.txt'), text);
      await f.save(join(output, 'result.json'), { ...f.result, id: input.requestId,
        status: 'succeeded', errorCode: undefined, responseHash: createHash('sha256').update(text).digest('hex') });
    },
  });
  let changeProof = false;
  return { ...f, input, provider, revokeBeforePublish: () => { changeProof = true; }, submissions: () => submissions };
}

it('publishes one exact technical successor and preserves the failed original reservation', async () => {
  const f = await successorFixture();
  const old = await readFile(join(f.inboxDir, `${f.request.id}.submitted.json`), 'utf8');
  expect((await f.provider.review(f.input)).text).toBe('review accepted');
  expect(f.submissions()).toBe(1);
  expect(await readFile(join(f.inboxDir, `${f.request.id}.submitted.json`), 'utf8')).toBe(old);
  const next = JSON.parse(await readFile(join(f.inboxDir, `${f.input.requestId}.json`), 'utf8'));
  expect(next.promptHash).toBe(f.request.promptHash);
  expect(next).not.toHaveProperty('sourceReviewRecovery');
});

it('rereads positive evidence inside the submission callback before writing any successor file', async () => {
  const f = await successorFixture();
  expect(await f.provider.canRetrySourceReviewBeforeSubmission(f.input.sourceReviewRecovery!)).toBe(true);
  f.revokeBeforePublish();
  await expect(f.provider.review(f.input)).rejects.toThrow();
  expect(f.submissions()).toBe(1);
  expect((await readdir(f.inboxDir)).filter(name => name.startsWith(f.input.requestId))).toEqual([]);
});

it.each(['requestId', 'prompt', 'artifactId', 'documentSha256', 'candidateHash', 'sourceMapHash', 'missing-pdf'])(
  'rejects a changed successor %s before publishing', async change => {
    const f = await successorFixture();
    if (change === 'requestId') f.input.requestId = f.request.id;
    else if (change === 'prompt') f.input.prompt += ' changed';
    else if (change === 'missing-pdf') f.input.attachments = [];
    else f.input.source = { ...f.request.source, [change]: change === 'artifactId' ? 'other-artifact' : 'c'.repeat(64) };
    const before = (await readdir(f.inboxDir)).sort();
    await expect(f.provider.review(f.input)).rejects.toThrow();
    expect((await readdir(f.inboxDir)).sort()).toEqual(before);
  });

it.each(['missing-proof', 'wrong-proof', 'extra-proof-field', 'uncertain', 'wrong-error', 'corrupt-pdf',
  'missing-pdf', 'wrong-pdf-hash', 'no-pdf', 'response.txt', 'recovered-result.json', 'recovered-response.txt'])(
  'refuses absent or contradictory evidence: %s', async change => {
    const f = await fixture();
    if (change === 'missing-proof') await rm(join(f.output, 'not-submitted.json'));
    else if (change === 'wrong-proof') await f.save(join(f.output, 'not-submitted.json'), { ...f.proof, promptHash: 'c'.repeat(64) });
    else if (change === 'extra-proof-field') await f.save(join(f.output, 'not-submitted.json'), { ...f.proof, uncertain: true });
    else if (change === 'uncertain') await f.save(join(f.output, 'result.json'), { ...f.result, status: 'uncertain', errorCode: 'UNCERTAIN' });
    else if (change === 'wrong-error') await f.save(join(f.output, 'result.json'), { ...f.result, errorCode: 'EXPIRED' });
    else if (change === 'corrupt-pdf') await writeFile(join(f.inboxDir, `${f.input.requestId}.source.pdf`), 'changed');
    else if (change === 'missing-pdf') await rm(join(f.inboxDir, `${f.input.requestId}.source.pdf`));
    else if (change === 'wrong-pdf-hash') {
      f.request.attachments[0]!.sha256 = 'c'.repeat(64);
      await f.save(join(f.inboxDir, `${f.input.requestId}.submitted.json`), f.request);
    } else if (change === 'no-pdf') {
      f.request.attachments = []; await f.save(join(f.inboxDir, `${f.input.requestId}.submitted.json`), f.request);
    } else await writeFile(join(f.output, change), '{}');
    expect(await f.provider.canRetrySourceReviewBeforeSubmission(f.input)).toBe(false);
  });
