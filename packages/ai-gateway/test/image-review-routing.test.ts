import { expect, it, vi } from 'vitest';
import { AiGateway } from '../src/gateway';
import { sha256Text } from '../src/ocr';
import type { ScienceReviewInput, ScienceReviewProvider } from '../src/science-review-protocol';

const review: ScienceReviewInput = {
  requestId: '01900000-0000-7000-8000-000000000001',
  authorizationContext: { taskId: '01900000-0000-7000-8000-000000000001', workspaceId: 'workspace', actorId: 'actor' },
  illustrationContext: { executionAttempt: 1, claimContent: 'Claim', baseIdentity: null },
  source: { kind: 'illustration-image', researchObjectId: '01900000-0000-7000-8000-000000000002',
    versionId: '01900000-0000-7000-8000-000000000003', sourceEvidenceIdentity: 'a'.repeat(64), candidateHash: 'b'.repeat(64) },
  prompt: 'Inspect the image',
  attachments: [{ fileName: 'page-1.png', mediaType: 'image/png', pageNumber: 1, width: 1, height: 1,
    sha256: 'b'.repeat(64), bytes: new Uint8Array([1]) }],
};

it('routes only actual image review to the explicitly configured Sol provider without falling back', async () => {
  const chat = vi.fn(async () => ({ text: '{"decision":"accepted"}', promptHash: sha256Text(review.prompt), responseHash: 'c'.repeat(64) }));
  const sol = vi.fn(async () => ({ text: '{"decision":"accepted"}', promptHash: sha256Text(review.prompt), responseHash: 'c'.repeat(64) }));
  let chatReserved = false;
  let solReserved = false;
  let solLegacySelected = false;
  const chatProvider: ScienceReviewProvider = { name: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro', review: chat,
    hasImageReviewReservation: async () => chatReserved };
  const solProvider: ScienceReviewProvider = { name: 'codex-sol-image-review', model: 'gpt-5.6-sol', review: sol,
    hasImageReviewReservation: async () => solReserved,
    ownsLegacyImageReviewReservation: async () => solLegacySelected };
  const gateway = new AiGateway({ providers: [{ name: 'text', model: 'text', complete: async () => { throw Error('unexpected'); } }],
    scientificReviewProvider: chatProvider, illustrationImageReviewProvider: solProvider,
    illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => {} });
  const guard = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
  const result = await gateway.reviewScientific(review, guard);
  expect(result.provider).toBe('codex-sol-image-review');
  expect(result.model).toBe('gpt-5.6-sol');
  expect(sol).toHaveBeenCalledTimes(1);
  expect(chat).not.toHaveBeenCalled();
  sol.mockRejectedValueOnce(new Error('UNCERTAIN'));
  await expect(gateway.reviewScientific(review, guard)).rejects.toThrow();
  expect(chat).not.toHaveBeenCalled();
  chatReserved = true;
  expect((await gateway.reviewScientific(review, guard)).provider).toBe('chatgpt-web-science-review');
  expect(chat).toHaveBeenCalledTimes(1);
  solReserved = true;
  await expect(gateway.reviewScientific(review, guard)).rejects.toThrow('conflicting provider reservations');
  solLegacySelected = true;
  expect((await gateway.reviewScientific(review, guard)).provider).toBe('codex-sol-image-review');
  expect(sol).toHaveBeenCalledTimes(3);
});
