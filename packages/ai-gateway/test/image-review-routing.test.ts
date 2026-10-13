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

function setup(reserved: boolean) {
  const result = { text: '{"decision":"accepted"}', promptHash: sha256Text(review.prompt), responseHash: 'c'.repeat(64) };
  const chat = vi.fn(async () => result);
  const sol = vi.fn(async () => result);
  const resume = vi.fn(async () => result);
  const logs: Array<{ metadata?: { provider?: string; model?: string } }> = [];
  const gateway = new AiGateway({ providers: [{ name: 'text', model: 'text', complete: async () => { throw Error('unexpected text call'); } }],
    scientificReviewProvider: { name: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro', review: chat },
    illustrationImageReviewProvider: { name: 'codex-sol-image-review', model: 'gpt-5.6-sol', review: sol,
      hasImageReviewReservation: async () => reserved, resumeFromCompletedResult: resume },
    illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => {},
    audit: { record: async (event) => { logs.push(event as never); } } });
  return { gateway, chat, sol, resume, logs };
}
const guard = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

it('does not move an unmarked historical image review to a fresh Sol submission when its old spool is absent', async () => {
  const f = setup(false);
  await expect(f.gateway.reviewScientific(review, guard)).rejects.toThrow('retired');
  expect(f.sol).not.toHaveBeenCalled();
  expect(f.chat).not.toHaveBeenCalled();
  expect(f.logs).toHaveLength(0);
});

it('resumes only the active Sol provider reservation and never falls back after an unknown paid outcome', async () => {
  const f = setup(true);
  expect(await f.gateway.reviewScientific(review, guard)).toMatchObject({ provider: 'codex-sol-image-review', model: 'gpt-5.6-sol' });
  f.sol.mockRejectedValueOnce(new Error('UNCERTAIN'));
  await expect(f.gateway.reviewScientific(review, guard)).rejects.toThrow('scientific review provider failed');
  expect(f.sol).toHaveBeenCalledTimes(2);
  expect(f.chat).not.toHaveBeenCalled();
  expect(f.logs.map(event => event.metadata?.provider)).toEqual(['codex-sol-image-review', 'codex-sol-image-review']);
  expect(f.logs.map(event => event.metadata?.model)).toEqual(['gpt-5.6-sol', 'gpt-5.6-sol']);
});

it('keeps the existing Sol completed-result reader without invoking a fresh review', async () => {
  const f = setup(true);
  expect(await f.gateway.resumeScientificReviewFromCompletedResult(review, guard)).toMatchObject({ provider: 'codex-sol-image-review', model: 'gpt-5.6-sol' });
  expect(f.resume).toHaveBeenCalledTimes(1);
  expect(f.sol).not.toHaveBeenCalled();
  expect(f.chat).not.toHaveBeenCalled();
});

it('refuses retired source review execution and does not expose a non-submission retry witness', async () => {
  const chat = vi.fn(); const verifier = vi.fn(async () => true);
  const gateway = new AiGateway({ providers: [{ name: 'text', model: 'text', complete: vi.fn() }],
    scientificReviewProvider: { name: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro', review: chat,
      canRetrySourceReviewBeforeSubmission: verifier } });
  const source = { artifactId: review.requestId, documentSha256: 'd'.repeat(64), candidateHash: 'e'.repeat(64), sourceMapHash: 'f'.repeat(64) };
  await expect(gateway.reviewScientific({ ...review, illustrationContext: undefined, source })).rejects.toThrow('retired');
  expect(await gateway.canRetrySourceReviewBeforeSubmission({ requestId: review.requestId,
    promptHash: sha256Text(review.prompt), ...source })).toBe(false);
  expect(chat).not.toHaveBeenCalled(); expect(verifier).not.toHaveBeenCalled();
});
