import { describe, expect, it } from 'vitest';

import { agentSessionBodySchema, agentTaskBodySchema } from '../src/routes/agent';

const validGuide = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  kind: 'workspace.guide',
  payload: {
    goal: 'Help me organise this workspace',
    locale: 'en',
    route: 'dashboard',
    target: null,
    context: { tasks: [], researchObjects: [] },
  },
};

describe('agent task payload boundary', () => {
  it('preserves explicit first-image intent only on an exact saved research scope', () => {
    const request = { ...validGuide, payload: { ...validGuide.payload, goal: 'Generate one image explaining this paper.',
      route: 'research-object-edit', executionIntent: 'first-image', context: { tasks: [], researchObjects: [],
        presentation: { researchObjectId: validGuide.sessionId, versionId: '00000000-0000-4000-8000-000000000002' } } } };
    expect(agentTaskBodySchema.parse(request)).toEqual(request);
    for (const goal of ['Do not generate an image', 'How can I generate an image?', 'Only plan an image'])
      expect(() => agentTaskBodySchema.parse({ ...request, payload: { ...request.payload, goal } })).toThrow();
    expect(() => agentTaskBodySchema.parse({ ...request, payload: { ...request.payload, firstImageRun: { runId: 'forged' } } })).toThrow();
  });
  it('reserves internal task names from public session creation', () => {
    expect(() => agentSessionBodySchema.parse({ kind: 'search.index' })).toThrow();
    expect(agentSessionBodySchema.parse({ kind: 'extract' })).toEqual({ kind: 'extract' });
  });

  it('accepts the bounded workspace.guide contract', () => {
    expect(agentTaskBodySchema.parse(validGuide)).toEqual(validGuide);
    expect(agentTaskBodySchema.parse({
      ...validGuide,
      payload: {
        ...validGuide.payload,
        route: 'research-object-edit',
        context: { tasks: [], researchObjects: [], presentation: { researchObjectId: validGuide.sessionId } },
      },
    })).toMatchObject({ payload: { context: { presentation: { researchObjectId: validGuide.sessionId } } } });
    expect(agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: { versionId: validGuide.sessionId, coreText: 'Review this research object.' },
      currentGoal: 'Check the central claim',
      activeClaimId: '00000000-0000-4000-8000-000000000002',
    })).toMatchObject({ currentGoal: 'Check the central claim' });
  });

  it('requires the bounded review target contract at the public boundary', () => {
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: {},
    })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: { versionId: validGuide.sessionId, coreText: 'x'.repeat(8_001) },
    })).toThrow();
  });

  it('rejects client-supplied InterestContext and inferred traits', () => {
    expect(() => agentTaskBodySchema.parse({ ...validGuide, interestContext: { primaryIdentity: 'reviewer' } })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'review.analyze',
      payload: {},
      offsiteHistory: ['example.org'],
    })).toThrow();
  });

  it('rejects oversized guide goals and context before persistence or dispatch', () => {
    expect(() => agentTaskBodySchema.parse({
      ...validGuide,
      payload: { ...validGuide.payload, goal: 'x'.repeat(2001) },
    })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      ...validGuide,
      payload: {
        ...validGuide.payload,
        context: { tasks: Array.from({ length: 21 }, (_, index) => ({ id: `t-${index}`, researchObjectId: 'ro', state: 'queued' })), researchObjects: [] },
      },
    })).toThrow();
  });

  it('reserves search.index for trusted server-side producers', () => {
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'search.index',
      payload: {},
    })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'not.registered',
      payload: {},
    })).toThrow();
  });

  it('reserves source retrieval for the unified literature acquisition endpoint', () => {
    expect(() => agentSessionBodySchema.parse({ kind: 'retrieval' })).toThrow();
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'source.retrieve',
      payload: { query: 'ultrafast science', providers: ['semantic_scholar', 'tavily'], limit: 5 },
    })).toThrow();
  });

  it('reserves the durable retrieval marker from every public generic task payload', () => {
    expect(() => agentTaskBodySchema.parse({
      sessionId: validGuide.sessionId,
      kind: 'demo.echo',
      payload: { message: 'ordinary task', retryContractVersion: 1 },
    })).toThrow();
  });
});
