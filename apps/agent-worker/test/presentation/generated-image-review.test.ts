import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { generatedSceneImageRequiresPixelReview } from '@openscience/domain';
import { readStoredGeneratedImageReview, reviewGeneratedImage } from '../../src/presentation/generated-image-review';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function pixelInput() {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');
  return { bytes, contentType: 'image/png', claims: [] as unknown[],
    settings: { locale: 'en', style: 'aged-academia', instruction: 'Explain the relation.', output: 'image' },
    document: { schemaVersion: 1, title: 'Legacy scene', scenes: [{ title: 'Two regions', narration: 'A qualified relation.',
      visualAction: 'The only legacy description of the arrow.', sourceClaimIds: [] }] }, sceneIndex: 0,
    authorizationContext: { taskId: 'review' }, illustrationContext: {}, researchObjectId: 'ro', versionId: 'version',
    identity: { requestId: 'review', contentHash: hash(bytes), sourceEvidenceIdentity: 'source', parentIdentity: 'parent' },
  };
}

it('retains the only visual description when reviewing an unstructured legacy scene', async () => {
  const input = pixelInput();
  const reviewScientific = vi.fn(async (request: { prompt: string }) => {
    const projected = JSON.parse(request.prompt.slice(request.prompt.lastIndexOf('\n{"locale":') + 1));
    expect(projected.scene).toEqual(input.document.scenes[0]);
    const text = JSON.stringify({ decision: 'accepted', summary: 'The arrow is clear.', repairInstruction: null });
    return { text, promptHash: hash(request.prompt), responseHash: hash(text), provider: 'chatgpt-web-science-review', model: 'gpt-5.6-sol' };
  });
  await reviewGeneratedImage({ reviewScientific } as never, input as never);
  expect(reviewScientific).toHaveBeenCalledOnce();
});

it('still blocks oversized independent source text before submitting pixel review', async () => {
  const input = pixelInput();
  input.claims = [{ id: 'claim', kind: 'finding', statement: 'Bounded interpretation.', conditions: ['Under the stated conditions'],
    limitations: ['Only one model'], sourcePassages: Array.from({ length: 40 }, (_, index) => ({ evidenceId: `e${index}`,
      relation: 'supports', text: `Distinct passage ${index}: ` + 'x'.repeat(1800) })) }];
  const reviewScientific = vi.fn();
  await expect(reviewGeneratedImage({ reviewScientific } as never, input as never))
    .rejects.toThrow(/Generated image review exceeds the source input budget \(\d+ > 61440 characters\)/u);
  expect(reviewScientific).not.toHaveBeenCalled();
});

it('keeps science and art intact but excludes optional style choices from the pixel-review budget', async () => {
  const input = pixelInput();
  const scene = { ...input.document.scenes[0], illustration: { schemaVersion: 2, message: 'A qualified relation',
    subjects: [{ description: 'The first region', basis: { sourceId: 's0' } }], labels: ['A'],
    encoding: 'A identifies the first region', constraints: ['Conceptual'], composition: 'One focal region', treatment: 'Fine lines' },
    styleRecommendations: { selectedStyleId: 'article:sketch', choices: [{ styleId: 'article:sketch', name: 'Sketch', reason: 'Readable relationships' }] } };
  input.document.scenes = [scene];
  const reviewScientific = vi.fn(async (request: { prompt: string }) => {
    const projected = JSON.parse(request.prompt.slice(request.prompt.lastIndexOf('\n{"locale":') + 1));
    const { visualAction: _visual, styleRecommendations: _choices, ...expected } = scene;
    expect(projected.scene).toEqual(expected);
    expect(request.prompt).not.toContain('Readable relationships');
    const text = JSON.stringify({ decision: 'accepted', summary: 'The relation is clear.', repairInstruction: null });
    return { text, promptHash: hash(request.prompt), responseHash: hash(text), provider: 'chatgpt-web-science-review', model: 'gpt-5.6-sol' };
  });
  await reviewGeneratedImage({ reviewScientific } as never, input as never);
  expect(reviewScientific).toHaveBeenCalledOnce();
});

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

it('accepts an exact Sol pixel receipt and rejects a mislabeled model or changed image', () => {
  const identity = { requestId: 'task', contentHash: 'a'.repeat(64), sourceEvidenceIdentity: 'b'.repeat(64), parentIdentity: 'parent' };
  const receipt = { stage: 'generated-image', ...identity, decision: 'accepted', summary: 'Visible 20 nm gap is correctly bounded.',
    repairInstruction: null, promptHash: 'c'.repeat(64), responseHash: 'd'.repeat(64), provider: 'codex-sol-image-review', model: 'gpt-5.6-sol' };
  expect(readStoredGeneratedImageReview(receipt, identity)?.decision).toBe('accepted');
  expect(() => readStoredGeneratedImageReview({ ...receipt, model: 'chatgpt-web/6-pro' }, identity)).toThrow();
  expect(() => readStoredGeneratedImageReview(receipt, { ...identity, contentHash: 'e'.repeat(64) })).toThrow();
});
