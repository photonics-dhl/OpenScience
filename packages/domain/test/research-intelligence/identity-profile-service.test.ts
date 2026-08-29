import { describe, expect, it } from 'vitest';
import {
  applyResearchIdentityProfilePatch,
  correctResearchInterestSignal,
  ResearchIdentityProfileError,
} from '../../src';

const current = {
  identities: ['reader', 'reviewer'] as const,
  primaryIdentity: 'reviewer' as const,
  disciplines: ['physics'],
  methods: ['spectroscopy'],
  topics: ['ultrafast optics'],
  languages: ['zh'],
  profileVersion: 3,
  acceptedSignals: ['open data'],
  rejectedSignals: ['clinical medicine'],
};

describe('research identity profile service', () => {
  it('applies a partial settings patch without losing untouched fields', () => {
    expect(applyResearchIdentityProfilePatch(current, {
      expectedProfileVersion: 3,
      topics: ['attosecond science'],
      languages: ['zh', 'en'],
    })).toEqual({
      ...current,
      topics: ['attosecond science'],
      languages: ['zh', 'en'],
      profileVersion: 4,
    });
  });

  it('fails a stale optimistic update and rejects sensitive fields', () => {
    expect(() => applyResearchIdentityProfilePatch(current, {
      expectedProfileVersion: 2,
      topics: ['stale'],
    })).toThrowError(ResearchIdentityProfileError);
    expect(() => applyResearchIdentityProfilePatch(current, {
      expectedProfileVersion: 3,
      inferredSensitiveAttribute: 'none',
    } as never)).toThrow(/unknown field/i);
  });

  it('moves a corrected signal between accepted and rejected sets', () => {
    const rejected = correctResearchInterestSignal(current, {
      expectedProfileVersion: 3,
      signal: 'open data',
      decision: 'reject',
    });
    expect(rejected.acceptedSignals).toEqual([]);
    expect(rejected.rejectedSignals).toEqual(['clinical medicine', 'open data']);
    expect(rejected.profileVersion).toBe(4);

    const accepted = correctResearchInterestSignal(rejected, {
      expectedProfileVersion: 4,
      signal: 'clinical medicine',
      decision: 'accept',
    });
    expect(accepted.acceptedSignals).toEqual(['clinical medicine']);
    expect(accepted.rejectedSignals).toEqual(['open data']);
    expect(accepted.profileVersion).toBe(5);
  });

  it('enforces bounded unique signal lists', () => {
    expect(() => correctResearchInterestSignal({
      ...current,
      acceptedSignals: Array.from({ length: 100 }, (_, index) => `signal-${index}`),
    }, {
      expectedProfileVersion: 3,
      signal: 'one-too-many',
      decision: 'accept',
    })).toThrow(/at most 100/i);
  });
});
