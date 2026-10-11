import { expect, it } from 'vitest';
import { projectAgentTaskResult } from '../../src/agent/agent';

it('projects only the minimal private audition playback DTO and keeps its grant, path, quote and provider identity server-side', () => {
  const stored = { purpose: 'audio-audition', inputHash: 'a'.repeat(64), audioAuditionGrant: { workerMaxEstimatedCoins: 200 },
    audioAudition: { taskId: 'task', sceneIndex: 1, contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'requires_revision',
      objectKey: 'presentation/private/audio.mp3', filePath: '/private/audition.mp3', audioTaskId: 'paid-provider-id',
      contentHash: 'b'.repeat(64), quote: { estimatedCoins: 22 }, coinsUsed: 22 } };
  const before = structuredClone(stored);
  expect(projectAgentTaskResult(stored, 'presentation.generate')).toEqual({ purpose: 'audio-audition', audioAudition: {
    taskId: 'task', sceneIndex: 1, contentType: 'audio/mpeg', durationSeconds: 2.5, timingStatus: 'requires_revision',
  } });
  expect(stored).toEqual(before);
});

it('hides an authorized but not yet completed audition grant without manufacturing a playable result', () => {
  expect(projectAgentTaskResult({ audioAuditionGrant: { inputHash: 'secret-internal-binding' }, progressNote: 'Preparing narration' },
    'presentation.generate')).toEqual({ progressNote: 'Preparing narration' });
});

it.each([undefined, 'video', 'unknown'])('strips raw private audio metadata when the audition purpose is missing or wrong: %s', purpose => {
  const stored = { ...(purpose ? { purpose } : {}), progressNote: 'Preparing media',
    audioAudition: { objectKey: 'PRIVATE_OBJECT_KEY', filePath: 'PRIVATE_PATH', quote: { estimatedCoins: 22 } },
    audioAuditionGrant: { inputHash: 'PRIVATE_GRANT' } };
  expect(projectAgentTaskResult(stored, 'presentation.generate')).toEqual({ ...(purpose ? { purpose } : {}), progressNote: 'Preparing media' });
});

it('never projects private rejected scientific candidates into an API task result', () => {
  expect(projectAgentTaskResult({ assetId: 'asset', storyboardScienceDiagnostics: {
    candidates: [{ text: 'unreviewed private manuscript excerpt' }], sources: ['private source'],
  } }, 'presentation.generate')).toEqual({ assetId: 'asset' });
});

const privateCandidates = [{ text: 'PRIVATE_REJECTED_CANDIDATE', diagnostic: 'internal guard reason' }];
const privateOutputs = [{ text: 'PRIVATE_REJECTED_OUTPUT', attempt: 2, finishReason: 'length' }];
const privateDraftClaims = [{ statement: 'PRIVATE_UNREVIEWED_CLAIM' }];
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
    const scientificReview = Object.freeze({ ...validReview, rejectedCandidates: privateCandidates,
      rejectedOutputs: privateOutputs, draftClaims: privateDraftClaims });
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
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_REJECTED|PRIVATE_UNREVIEWED|rejectedCandidates|rejectedOutputs|draftClaims/);
    expect(raw).toEqual(before);
    expect(raw.scientificReview.rejectedCandidates).toBe(privateCandidates);
    expect(raw.scientificReview.rejectedOutputs).toBe(privateOutputs);
    expect(raw.scientificReview.draftClaims).toBe(privateDraftClaims);
  });

  it.each([null, 7, JSON.stringify({ rejectedOutputs: privateOutputs }), [{ rejectedCandidates: privateCandidates }]])(
    `omits malformed scientificReview rather than exposing embedded diagnostics for ${kind}: %j`, scientificReview => {
      const raw = { core: { method: 'Retained' }, scientificReview };
      expect(projectAgentTaskResult(raw, kind)).toEqual({ core: raw.core });
      expect(raw.scientificReview).toBe(scientificReview);
    },
  );
}
