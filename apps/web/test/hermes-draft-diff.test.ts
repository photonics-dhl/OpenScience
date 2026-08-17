import { describe, expect, it } from 'vitest';

import { parseHermesDraftAction } from '@/components/hermes/HermesDraftDiff';

describe('Hermes draft diff event boundary', () => {
  it('accepts draft/check only for known SDF targets', () => {
    expect(parseHermesDraftAction({ action: 'draft', target: 'sdf-problem' })).toEqual({ action: 'draft', target: 'sdf-problem' });
    expect(parseHermesDraftAction({ action: 'check', target: 'sdf-results' })).toEqual({ action: 'check', target: 'sdf-results' });
  });

  it('rejects arbitrary DOM targets and field contents', () => {
    expect(parseHermesDraftAction({ action: 'draft', target: 'textarea-7' })).toBeNull();
    expect(parseHermesDraftAction({ action: 'apply', target: 'sdf-problem' })).toBeNull();
    expect(parseHermesDraftAction({ action: 'draft', target: 'sdf-problem', value: 'private draft' })).toBeNull();
  });
});
