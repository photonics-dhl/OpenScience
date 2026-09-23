import { expect, it } from 'vitest';
import { sha256Text } from '../src/ocr';
import { validateCodexSolReviewRequest, validateCodexSolReviewResult } from '../src/codex-sol-review-protocol';

const id = '01900000-0000-7000-8000-000000000001';
const prompt = 'Inspect exact pixels';
const request = { schemaVersion: 1, provider: 'codex-sol-image-review', model: 'gpt-5.6-sol', reasoningEffort: 'high',
  id, prompt, promptHash: sha256Text(prompt), createdAt: 100, deadlineAt: 1000,
  source: { kind: 'illustration-image', researchObjectId: '01900000-0000-7000-8000-000000000002',
    versionId: '01900000-0000-7000-8000-000000000003', sourceEvidenceIdentity: 'a'.repeat(64), candidateHash: 'b'.repeat(64) },
  attachments: [{ fileName: 'page-1.png', mediaType: 'image/png', pageNumber: 1, width: 1280, height: 720, sha256: 'b'.repeat(64) }] };

it('pins image review to exact model, source, pixel digest and deadline', () => {
  expect(validateCodexSolReviewRequest(request, 101)).toEqual(request);
  for (const mutation of [
    { model: 'gpt-6-astra' }, { reasoningEffort: 'low' }, { promptHash: 'c'.repeat(64) },
    { source: { ...request.source, candidateHash: 'c'.repeat(64) } }, { deadlineAt: 1_800_101 },
  ]) expect(() => validateCodexSolReviewRequest({ ...request, ...mutation })).toThrow();
});

it('requires a bounded exact-model result and response digest on success', () => {
  const result = { schemaVersion: 1, provider: 'codex-sol-image-review', model: 'gpt-5.6-sol', id,
    promptHash: request.promptHash, status: 'succeeded', responseHash: 'c'.repeat(64) };
  expect(validateCodexSolReviewResult(result)).toEqual(result);
  expect(() => validateCodexSolReviewResult({ ...result, model: 'gpt-6-astra' })).toThrow();
  expect(() => validateCodexSolReviewResult({ ...result, responseHash: undefined })).toThrow();
});
