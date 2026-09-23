import { expect, it } from 'vitest';
import { generatedSceneImageRequiresPixelReview } from '@openscience/domain';
import { readStoredGeneratedImageReview } from '../../src/presentation/generated-image-review';

it('routes manual and narrative scene images to pixel review while preserving explicit legacy profiles', () => {
  expect(generatedSceneImageRequiresPixelReview({ sceneImage: { sceneIndex: 0 } })).toBe(true);
  expect(generatedSceneImageRequiresPixelReview({ hermesRunAuthority: { profile: 'visual-narrative-v1' } })).toBe(true);
  expect(generatedSceneImageRequiresPixelReview({ hermesRunAuthority: { profile: 'content-driven-image-v1' } })).toBe(false);
});

it('keeps a corrupted stored image review terminal at the worker boundary', () => {
  expect(() => readStoredGeneratedImageReview({ decision: 'accepted' }, {
    requestId: 'task', contentHash: 'a'.repeat(64), sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'parent',
  })).toThrow('[blocked] Saved image review does not match the persisted image');
});
