import { expect, it } from 'vitest';
import { projectAgentTaskResult } from '../../src/agent/agent';

it('never projects private rejected scientific candidates into an API task result', () => {
  expect(projectAgentTaskResult({ assetId: 'asset', storyboardScienceDiagnostics: {
    candidates: [{ text: 'unreviewed private manuscript excerpt' }], sources: ['private source'],
  } }, 'presentation.generate')).toEqual({ assetId: 'asset' });
});

const privateCandidates = [{ text: 'PRIVATE_REJECTED_CANDIDATE', diagnostic: 'internal guard reason' }];
const privateOutputs = [{ text: 'PRIVATE_REJECTED_OUTPUT', attempt: 2, finishReason: 'length' }];
const validReview = {
  status: 'review_received', contractVersion: '5', kind: 'model_self_check',
  fieldReviews: { method: { status: 'supported', summary: 'Grounded method' } },
  needsMoreEvidence: [], responseHash: 'c'.repeat(64), usage: { inputTokens: 20, outputTokens: 10 },
};
const sourceMapRef = {
  schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'artifact-A', contentHash: 'a'.repeat(64),
  objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100,
};

for (const kind of ['sdf.extract', 'demo.echo']) {
  it.each([undefined, { invalid: true }, sourceMapRef])(`removes only private review diagnostics without mutating stored ${kind} results (sourceMapRef %j)`, reference => {
    const scientificReview = Object.freeze({ ...validReview, rejectedCandidates: privateCandidates, rejectedOutputs: privateOutputs });
    const raw = Object.freeze({ core: { method: 'Original method' }, evidence: { method: { quote: 'Original evidence' } },
      scientificReview, ...(reference === undefined ? {} : { sourceMapRef: reference }) });
    const before = structuredClone(raw);
    const projected = projectAgentTaskResult(raw, kind)!;
    expect(projected.scientificReview).toEqual(validReview);
    expect(projected.scientificReview).not.toBe(scientificReview);
    expect(projected.core).toEqual(raw.core);
    expect(projected.evidence).toEqual(raw.evidence);
    expect(projected).not.toHaveProperty('sourceMapRef');
    expect(projected).not.toHaveProperty('sourceMapIdentity');
    expect(projected.sourceMapAvailable).toBe(reference === sourceMapRef ? true : undefined);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_REJECTED|rejectedCandidates|rejectedOutputs/);
    expect(raw).toEqual(before);
    expect(raw.scientificReview.rejectedCandidates).toBe(privateCandidates);
    expect(raw.scientificReview.rejectedOutputs).toBe(privateOutputs);
  });

  it.each([null, 7, JSON.stringify({ rejectedOutputs: privateOutputs }), [{ rejectedCandidates: privateCandidates }]])(
    `omits malformed scientificReview rather than exposing embedded diagnostics for ${kind}: %j`, scientificReview => {
      const raw = { core: { method: 'Retained' }, scientificReview };
      expect(projectAgentTaskResult(raw, kind)).toEqual({ core: raw.core });
      expect(raw.scientificReview).toBe(scientificReview);
    },
  );
}
