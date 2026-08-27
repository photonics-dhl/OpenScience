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
  it('reserves internal task names from public session creation', () => {
    expect(() => agentSessionBodySchema.parse({ kind: 'search.index' })).toThrow();
    expect(agentSessionBodySchema.parse({ kind: 'extract' })).toEqual({ kind: 'extract' });
  });

  it('accepts the bounded workspace.guide contract', () => {
    expect(agentTaskBodySchema.parse(validGuide)).toEqual(validGuide);
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
});
