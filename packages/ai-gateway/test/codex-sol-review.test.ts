import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { CodexSolImageReviewProvider } from '../src/codex-sol-review';
import { sha256Text } from '../src/ocr';
import type { ScienceReviewInput } from '../src/science-review-protocol';

function png(): Buffer {
  const chunk = (type: string, bytes: Buffer) => { const value = Buffer.alloc(bytes.length + 12); value.writeUInt32BE(bytes.length); value.write(type, 4); bytes.copy(value, 8); return value; };
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(20))), chunk('IEND', Buffer.alloc(0))]);
}

it('publishes one model-pinned reservation and consumes only the matching saved response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sol-review-'));
  const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results'); const legacyInboxDir = join(root, 'legacy');
  await mkdir(inboxDir); await mkdir(resultsDir); await mkdir(legacyInboxDir); await writeFile(join(resultsDir, '.ready'), 'ready');
  const bytes = png(); const hash = createHash('sha256').update(bytes).digest('hex');
  const id = '01900000-0000-7000-8000-000000000001';
  const input: ScienceReviewInput = {
    requestId: id, authorizationContext: { taskId: id, actorId: 'actor', workspaceId: 'workspace' },
    illustrationContext: { executionAttempt: 1, claimContent: 'Claim', baseIdentity: null },
    source: { kind: 'illustration-image', researchObjectId: '01900000-0000-7000-8000-000000000002',
      versionId: '01900000-0000-7000-8000-000000000003', candidateHash: hash, sourceEvidenceIdentity: 'a'.repeat(64) },
    prompt: 'Inspect actual pixels', attachments: [{ fileName: 'page-1.png', mediaType: 'image/png',
      pageNumber: 1, width: 2, height: 2, sha256: hash, bytes }],
  };
  const response = '{"decision":"accepted","summary":"clear","repairInstruction":null}';
  let publishCount = 0;
  const provider = new CodexSolImageReviewProvider({ inboxDir, resultsDir, legacyInboxDir,
    withIllustrationSubmission: async (_, publish) => { publishCount++; return publish(); },
    sleep: async () => {
      const request = JSON.parse(await readFile(join(inboxDir, `${id}.submitted.json`), 'utf8'));
      await mkdir(join(resultsDir, id));
      await writeFile(join(resultsDir, id, 'response.txt'), response);
      await writeFile(join(resultsDir, id, 'result.json'), JSON.stringify({ schemaVersion: 1,
        provider: 'codex-sol-image-review', model: 'gpt-5.6-sol', id, promptHash: request.promptHash,
        status: 'succeeded', responseHash: sha256Text(response) }));
    }, pollIntervalMs: 1 });
  const result = await provider.review(input);
  expect(result.text).toBe(response);
  expect(result.model).toBe('gpt-5.6-sol');
  expect(await provider.hasImageReviewReservation(id)).toBe(true);
  expect(JSON.parse(await readFile(join(inboxDir, `${id}.submitted.json`), 'utf8')).reasoningEffort).toBe('high');
  expect(await provider.ownsLegacyImageReviewReservation(id)).toBe(true);
  expect(JSON.parse(await readFile(join(legacyInboxDir, `${id}.submitted.json`), 'utf8')).provider).toBe('codex-sol-image-review');
  expect((await provider.resumeFromCompletedResult(input)).responseHash).toBe(sha256Text(response));
  expect(publishCount).toBe(2);
  await expect(provider.review({ ...input, prompt: 'Changed science' })).rejects.toThrow('INVALID_OUTPUT');
});
