import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseStoryboardDocument, presentationStoryboardView } from '../../src/assets/storyboard';
const id = '10000000-0000-4000-8000-000000000001';
const doc = { schemaVersion: 1, title: 'Relation', scenes: [{ title: 'Scene', narration: 'One relation.', visualAction: 'Draw the supported relation.', sourceClaimIds: [id] }] };
const metadata = { selectedStyleId: 'article:watercolor', choices: [{ styleId: 'article:watercolor', name: 'Watercolor', reason: 'Keep the source labels legible.' }, { styleId: 'handdraw:#002', name: 'Ink', reason: 'Different linework.' }] };
it('round-trips optional metadata and preserves metadata-free historical documents', () => {
  expect(parseStoryboardDocument(doc, [id], 'image')).toEqual(doc);
  const withMetadata = { ...doc, scenes: [{ ...doc.scenes[0], styleRecommendations: metadata }] };
  expect(parseStoryboardDocument(withMetadata, [id], 'image')).toEqual(withMetadata);
});
it.each([null, [], {}, 'bad', { ...metadata, choices: Array(3).fill(metadata.choices[0]) }, { ...metadata, selectedStyleId: '../bad' }, { ...metadata, choices: [{ ...metadata.choices[0], reason: 'x'.repeat(401) }] }])('drops optional malformed metadata: %j', bad => {
  expect(parseStoryboardDocument({ ...doc, scenes: [{ ...doc.scenes[0], styleRecommendations: bad }] }, [id], 'image')).toEqual(doc);
});
it('retains strict scene keys and source scope regardless of metadata validity', () => {
  for (const extra of [{ sourceClaimIds: ['unknown'] }, { labels: ['invented'] }, { narration: '' }]) {
    expect(() => parseStoryboardDocument({ ...doc, scenes: [{ ...doc.scenes[0], ...extra, styleRecommendations: {} }] }, [id], 'image')).toThrow();
  }
});
it('projects only an existing bound final-brief review without exposing provenance', () => {
  const provenance = { subtype: 'sourced_storyboard', source: 'verified_claims', taskId: 'task', sourceEvidenceIdentity: 'evidence', storyboardSettings: { locale: 'en', style: 'auto', instruction: 'Explain', output: 'image' }, storyboardDocument: doc,
    illustrationReview: { stage: 'final-brief', decision: 'accepted', requestId: 'task', sourceEvidenceIdentity: 'evidence',
      candidateHash: createHash('sha256').update(JSON.stringify(doc)).digest('hex'), promptHash: 'a'.repeat(64), responseHash: 'b'.repeat(64),
      provider: 'chatgpt-web-science-review', summary: 'The sourced relation is preserved.', privateNotes: 'not public' } };
  const view = presentationStoryboardView({ kind: 'interactive_html', provenance }, [id]);
  expect(view?.scientificReview).toBe('accepted');
  expect(JSON.stringify(view)).not.toContain('privateNotes');
  for (const review of [undefined, { ...provenance.illustrationReview, stage: 'generated-image' }, { ...provenance.illustrationReview, requestId: 'other' }, { ...provenance.illustrationReview, sourceEvidenceIdentity: 'other' }]) {
    expect(presentationStoryboardView({ kind: 'interactive_html', provenance: { ...provenance, illustrationReview: review } }, [id])?.scientificReview).toBeUndefined();
  }
  for (const change of [{ candidateHash: undefined }, { candidateHash: 'c'.repeat(64) }, { promptHash: 'bad' }, { responseHash: undefined }, { provider: 'unknown' }, { summary: '' }]) {
    expect(presentationStoryboardView({ kind: 'interactive_html', provenance: { ...provenance,
      illustrationReview: { ...provenance.illustrationReview, ...change } } }, [id])?.scientificReview).toBeUndefined();
  }
  expect(presentationStoryboardView({ kind: 'interactive_html', provenance: { ...provenance,
    storyboardDocument: { ...doc, title: 'Changed after review' } } }, [id])?.scientificReview).toBeUndefined();
});
