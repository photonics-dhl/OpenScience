import { describe, expect, it } from 'vitest';
import { researchObjectFromHermesPath } from '../lib/hermes/presentation-intent';

describe('Hermes research route scope', () => {
  it('finds RO context on every nested RO surface without treating new research as an object', () => {
    for (const suffix of ['edit', 'presentation', 'files', 'versions']) expect(researchObjectFromHermesPath('/research-objects/ro-1/' + suffix)).toBe('ro-1');
    expect(researchObjectFromHermesPath('/research-objects/new')).toBeUndefined();
    expect(researchObjectFromHermesPath('/dashboard')).toBeUndefined();
  });
});
