import { describe, expect, it } from 'vitest';
import { buildInterestContext, validateInterestContext } from '../../src';

const profile = {
  identities: ['author', 'reviewer'] as const,
  primaryIdentity: 'author' as const,
  disciplines: ['optics'],
  methods: ['pump-probe'],
  topics: ['ultrafast science'],
  languages: ['zh', 'en'],
  profileVersion: 4,
  acceptedSignals: ['open data'],
  rejectedSignals: ['clinical medicine'],
};

describe('buildInterestContext', () => {
  it('orders explainable routing from explicit goal through correctable history', () => {
    const context = buildInterestContext({
      profile,
      currentGoal: ' Compare the evidence for the main claim ',
      activeResearchObjectId: '11111111-1111-4111-8111-111111111111',
      activeClaimId: '22222222-2222-4222-8222-222222222222',
    });

    expect(context).toMatchObject({
      schemaVersion: 1,
      profileVersion: 4,
      primaryIdentity: 'author',
      currentGoal: 'Compare the evidence for the main claim',
      acceptedSignals: ['open data'],
      rejectedSignals: ['clinical medicine'],
    });
    expect(context.routingReasons.map((reason) => reason.code)).toEqual([
      'explicit_goal',
      'active_claim',
      'active_research_object',
      'primary_identity',
      'persistent_disciplines',
      'persistent_methods',
      'persistent_topics',
      'persistent_languages',
      'accepted_history',
      'rejected_history',
    ]);
  });

  it('degrades a missing profile to a neutral reader context', () => {
    expect(buildInterestContext({})).toEqual({
      schemaVersion: 1,
      profileVersion: 0,
      primaryIdentity: 'reader',
      identities: ['reader'],
      disciplines: [],
      methods: [],
      topics: [],
      languages: [],
      acceptedSignals: [],
      rejectedSignals: [],
      routingReasons: [{ code: 'primary_identity', values: ['reader'] }],
      profileMissing: true,
    });
  });

  it('rejects sensitive, off-site and malformed page context instead of inferring it', () => {
    expect(() => buildInterestContext({
      profile,
      sensitiveTraits: ['health'],
    } as never)).toThrow(/unknown field/i);
    expect(() => buildInterestContext({
      profile,
      offsiteHistory: ['example.org'],
    } as never)).toThrow(/unknown field/i);
    expect(() => buildInterestContext({ profile, activeClaimId: '../claim' })).toThrow(/activeClaimId/);
  });

  it('rejects a persisted context whose explainability reasons were tampered', () => {
    const context = buildInterestContext({ profile, currentGoal: 'Review evidence' });
    expect(validateInterestContext(context)).toEqual(context);
    expect(() => validateInterestContext({
      ...context,
      routingReasons: [{ code: 'accepted_history', values: ['sensitive inference'] }],
    })).toThrow(/does not match deterministic routing/i);
  });
});
