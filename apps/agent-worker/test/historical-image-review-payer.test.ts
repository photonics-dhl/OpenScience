import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { ScienceReviewInput } from '@openscience/ai-gateway';
import { requireHistoricalImageReviewPayer } from '../src/index';

const input: ScienceReviewInput = {
  requestId: '01900000-0000-7000-8000-000000000001', prompt: 'Original image review',
  authorizationContext: { taskId: '01900000-0000-7000-8000-000000000001', actorId: 'actor', workspaceId: 'ws' },
  illustrationContext: { executionAttempt: 2, claimContent: 'Original claims', baseIdentity: 'parent' },
  source: { kind: 'illustration-image', researchObjectId: '01900000-0000-7000-8000-000000000002',
    versionId: '01900000-0000-7000-8000-000000000003', candidateHash: 'a'.repeat(64), sourceEvidenceIdentity: 'b'.repeat(64) },
};
const sol = { operation: 'scientific_review', provider: 'codex-sol-image-review', model: 'gpt-5.6-sol',
  promptHash: createHash('sha256').update(input.prompt).digest('hex'), inputContentHash: 'b'.repeat(64) };
function fixture(metadata: unknown[]) {
  const findMany = vi.fn(async () => metadata.map(value => ({ metadata: value })));
  return { prisma: { auditLog: { findMany } } as unknown as Prisma.TransactionClient, findMany };
}

it('leaves a missing audit to the own submitted receipt and does not turn absence into execution authority', async () => {
  const f = fixture([]);
  await expect(requireHistoricalImageReviewPayer(f.prisma, input)).resolves.toBeUndefined();
  expect(f.findMany).toHaveBeenCalledWith({ where: { action: 'ai.gateway.call', requestId: input.requestId }, select: { metadata: true } });
});

it('accepts matching Sol audit metadata and ignores another operation in the same task', async () => {
  const f = fixture([{ operation: 'image', provider: 'synclip' }, { operation: 'text_chat', provider: 'primary' }, sol]);
  await expect(requireHistoricalImageReviewPayer(f.prisma, input)).resolves.toBeUndefined();
});

it.each([
  { provider: 'chatgpt-web-science-review' }, { provider: 'unknown' }, { provider: null },
  { model: 'chatgpt-web/5.6-sol' }, { promptHash: 'e'.repeat(64) }, { inputContentHash: 'f'.repeat(64) },
])('rejects positive mismatching historical payer evidence: %j', async mismatch => {
  const f = fixture([sol, { ...sol, ...mismatch }]);
  await expect(requireHistoricalImageReviewPayer(f.prisma, input)).rejects.toThrow('conflicting historical image review payer');
});

it('does not apply historical spool audit checks to the explicit Native image-review role', async () => {
  const f = fixture([{ ...sol, provider: 'chatgpt-web-science-review' }]);
  await expect(requireHistoricalImageReviewPayer(f.prisma, { ...input,
    illustrationContext: { ...input.illustrationContext!, imageReviewMode: 'model-native' } })).resolves.toBeUndefined();
  expect(f.findMany).not.toHaveBeenCalled();
});
