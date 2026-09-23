import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { ChatGptWebScienceReviewProvider } from '../src/science-review';
import { validateScienceReviewRequest, type ScienceReviewInput } from '../src/science-review-protocol';
import { sha256Text } from '../src/ocr';

function png(): Buffer {
  const chunk = (type: string, bytes: Buffer) => { const value = Buffer.alloc(bytes.length + 12); value.writeUInt32BE(bytes.length); value.write(type, 4); bytes.copy(value, 8); return value; };
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(20))), chunk('IEND', Buffer.alloc(0))]);
}

it('pins a new pixel review to web Sol while preserving the original Pro identity on an old saved result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'web-sol-review-'));
  const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
  await mkdir(inboxDir); await mkdir(resultsDir); await writeFile(join(resultsDir, '.ready'), 'ready');
  const bytes = png(); const hash = createHash('sha256').update(bytes).digest('hex');
  const input = (id: string): ScienceReviewInput => ({
    requestId: id, authorizationContext: { taskId: id, actorId: 'actor', workspaceId: 'workspace' },
    illustrationContext: { executionAttempt: 1, claimContent: 'Claim', baseIdentity: null },
    source: { kind: 'illustration-image', researchObjectId: '01900000-0000-7000-8000-000000000002',
      versionId: '01900000-0000-7000-8000-000000000003', candidateHash: hash, sourceEvidenceIdentity: 'a'.repeat(64) },
    prompt: 'Inspect actual pixels', attachments: [{ fileName: 'page-1.png', mediaType: 'image/png',
      pageNumber: 1, width: 2, height: 2, sha256: hash, bytes }],
  });
  const response = '{"decision":"accepted","summary":"clear","repairInstruction":null}';
  const saveResult = async (id: string, promptHash: string) => {
    await mkdir(join(resultsDir, id));
    await writeFile(join(resultsDir, id, 'response.txt'), response);
    await writeFile(join(resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1,
      provider: 'chatgpt-web-science-review', id, promptHash, status: 'succeeded', responseHash: sha256Text(response) }));
  };
  const freshId = '01900000-0000-7000-8000-000000000001';
  const provider = new ChatGptWebScienceReviewProvider({ inboxDir, resultsDir,
    withIllustrationSubmission: async (_, publish) => publish(),
    sleep: async () => {
      const saved = validateScienceReviewRequest(JSON.parse(await readFile(join(inboxDir, `${freshId}.submitted.json`), 'utf8')));
      await saveResult(freshId, saved.promptHash);
    } });
  const fresh = await provider.review(input(freshId));
  expect(fresh.model).toBe('chatgpt-web/5.6-sol');
  expect(validateScienceReviewRequest(JSON.parse(await readFile(join(inboxDir, `${freshId}.submitted.json`), 'utf8'))).model)
    .toBe('chatgpt-web/5.6-sol');
  expect(await provider.modelForImageReviewReservation(freshId)).toBe('chatgpt-web/5.6-sol');

  const oldId = '01900000-0000-7000-8000-000000000004';
  const now = Date.now();
  const old = validateScienceReviewRequest({ schemaVersion: 3, provider: 'chatgpt-web-science-review',
    id: oldId, prompt: input(oldId).prompt, promptHash: sha256Text(input(oldId).prompt), createdAt: now,
    deadlineAt: now + 600_000, source: input(oldId).source,
    attachments: [{ fileName: 'page-1.png', mediaType: 'image/png', pageNumber: 1, width: 2, height: 2, sha256: hash }] });
  await writeFile(join(inboxDir, `${oldId}.submitted.json`), JSON.stringify(old));
  expect(await provider.modelForImageReviewReservation(oldId)).toBe('chatgpt-web/6-pro');
  await saveResult(oldId, old.promptHash);
  const recovered = await provider.resumeFromCompletedResult(input(oldId));
  expect(recovered.model).toBe('chatgpt-web/6-pro');
});
