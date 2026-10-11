import { describe, expect, it } from 'vitest';
import { scientificComparisonBinding, scientificExpressionReferences, scientificEqualityRelations, normalizeScientificSourceNotation } from '../../src/presentation/scientific-comparison';
import { materializeIllustrationScience } from '../../src/presentation/illustration-planner';
import type { PresentationClaim } from '../../src/presentation/chart-generator';

const binding = (text: string) => scientificComparisonBinding(text, text.lastIndexOf('27'));

const materializeQuantity = (source: string, mark: string, sourceId = 's0', fresh = true) => {
  const claims: PresentationClaim[] = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding',
    statement: 'A quantity reported by the source.', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded',
    sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001', relation: 'supports', text: source }] }];
  const candidate = { title: 'Sourced quantity', narrative: { mainMessage: mark, audience: 'A research reader' },
    scenes: [{ title: 'Quantity', narration: mark, domain: 'conceptual', message: mark,
      subjects: [{ description: mark, basis: { sourceId } }], encoding: mark, labels: [mark],
      constraints: ['Preserve the source quantity definition.'], paperOriginalAssetId: null }] };
  return materializeIllustrationScience(candidate, claims,
    { locale: 'en', style: 'auto', instruction: 'Explain the sourced quantity.', output: 'image', narrative: true, narrativeSceneLimit: 1 },
    new Map(), fresh, fresh, fresh, fresh, fresh);
};

describe('fresh source quantity annotations followed by prose and mathematics', () => {
  const original = 'As FWHM_T (19 as) is much shorter than *T*c₁/2 (i.e., 0.26 fs), such a pulse is a deep-sub-cycle pulse.';

  it.each(['FWHM_T (19 as)', 'FWHM_T = 19 as'])(
    'accepts the original quantity independently of later prose mathematics: %s', mark => {
      expect(materializeQuantity(original, mark).scenes).toHaveLength(1);
    });

  it.each([
    ['The response time', '37 ps'], ['The beam width', '7 nm'],
    ['The bunch charge', '2 pC'], ['The energy spread', '12 keV'],
    ['The channel voltage', '-2.5 mV'], ['The resonant frequency', '1.2e3 Hz'],
  ])('preserves a general SI annotation for %s', (name, quantity) => {
    const source = `${name} (${quantity}) is compared with q/3 in the source.`;
    const start = source.indexOf(quantity);
    expect(scientificExpressionReferences(source, true)
      .some(reference => reference.start <= start && reference.end > start)).toBe(false);
    expect(materializeQuantity(source, `${name} is ${quantity}`).scenes).toHaveLength(1);
  });

  it.each(['FWHM_T = 20 as', 'FWHM_S = 19 as', 'FWHM_T = 19 fs'])(
    'still rejects an altered value, quantity or unit: %s', mark => {
      expect(() => materializeQuantity(original, mark)).toThrow(/unbound_numeric/u);
    });
  it.each(['s1', 'S0', 'foreign'])('still rejects a missing or foreign source %s', sourceId => {
    expect(() => materializeQuantity(original, 'FWHM_T = 19 as', sourceId)).toThrow(/unknown_original_source/u);
  });
  it('does not change the historical parser contract', () => {
    expect(materializeQuantity(original, 'FWHM_T = 19 as', 's0', false).scenes).toHaveLength(1);
  });
  it('preserves an explicit mathematical symbol named is', () => {
    expect(scientificExpressionReferences('q=is-2.5', true))
      .toEqual([{ key: '(is-2.5)', start: 2, end: 8 }]);
  });
  it.each(['(a/b)*(1-f(θ))', '(a/b)(1-β f(θ))', '(1-β cosθ)*f(φ)', '(37 ps)*f(θ)'])(
    'continues to reject a compound expression with an unknown or extra factor: %s', input => {
      expect(scientificExpressionReferences(input, true).some(reference => reference.unsupported)).toBe(true);
    });
});

describe('equivalent Unicode comparison signs in fresh source copies', () => {
  it.each([['⩾', '≥'], ['⩽', '≤']])('normalizes %s without changing its direction', (sourceSign, canonicalSign) => {
    const source = `(FWHMs${sourceSign}λ0/2)`;
    const canonical = `(FWHMs${canonicalSign}λ0/2)`;
    expect(normalizeScientificSourceNotation(source)).toEqual({ text: canonical, unsupported: [] });
    expect(scientificExpressionReferences(source, true)).toEqual(scientificExpressionReferences(canonical, true));
    expect(normalizeScientificSourceNotation(source).text).not.toBe(
      `(FWHMs${canonicalSign === '≥' ? '≤' : '≥'}λ0/2)`);
  });
  it('accepts a complete original marked-up half-wavelength reference', () => {
    const source = 'A Gaussian-profile intensity distribution (FWHMs⩾*λ*₀/2), which sets the spatial scale.';
    expect(materializeQuantity(source, 'FWHMs⩾λ₀/2').scenes).toHaveLength(1);
    expect(materializeQuantity(source, 'FWHMs 不小于 λ₀/2').scenes).toHaveLength(1);
    expect(materializeQuantity(source, 'FWHMs⩾λ₀/2').scenes[0]!.illustration.subjects[0]!.basis.quote).toBe(source);
  });
  it.each(['FWHMs⩾λ₁/2', 'FWHMs⩾λ₀/3'])(
    'still rejects an altered variable or denominator: %s', mark => {
      const source = 'A Gaussian-profile intensity distribution (FWHMs⩾*λ*₀/2), which sets the spatial scale.';
      expect(() => materializeQuantity(source, mark)).toThrow(/unbound_expression/u);
    });
  it('preserves an unsupported historical comparison rather than reopening it', () => {
    expect(scientificExpressionReferences('(FWHMs⩾λ0/2)', false))
      .not.toEqual(scientificExpressionReferences('(FWHMs≥λ0/2)', false));
  });
  it.each(['(FWHMs⩾f(θ)/2)', '(FWHMs⩾λ0/2)*β', '(FWHMs⩾λ0/2)/β', '(FWHMs⩾λ0/2⩾λ1/3)'])(
    'does not truncate unsupported mathematics around a Unicode sign: %s', input => {
      expect(scientificExpressionReferences(input, true).some(reference => reference.unsupported)).toBe(true);
    });
});

describe('scientific comparison binding', () => {
  it('does not bypass a cropped expression through a prose-parenthesis suffix', () => {
    const result = binding(`a+${' '.repeat(161)}b (~27 nm)`)!;
    expect(result.binding).toEqual({ kind: 'unsupported-expression' });
    expect(result.start).toBe(result.end);
  });
  it('recognizes a locally complete prose quantity in a long source', () => {
    const text = `${'context '.repeat(30)}the z-direction (~77 nm)`;
    expect(scientificComparisonBinding(text, text.lastIndexOf('77'))).toBeUndefined();
  });
  it.each(['a>b≈27', 'a≤b≈27', `a + ${' '.repeat(161)}b≈27`, 'a/(b≈27)', 'sin (a+b)≈27', 'sin(a+b)≈27', 'a^b≈27', 'a%b≈27', 'a÷b≈27'])(
    'does not relabel an unsupported expression as its last operand: %s', text => {
      expect(binding(text)?.binding).toEqual({ kind: 'unsupported-expression' });
    });
  it('keeps a precise unsupported LHS range', () => {
    const text = 'The energy is 1 MeV; f^2(x)≈27';
    const result = binding(text)!;
    expect(result.binding).toEqual({ kind: 'unsupported-expression' });
    expect(text.slice(result.start, result.end)).toBe('f^2(x)');
  });
  it.each([
    ['1 MeV. f^2(x)≈27', 'f^2(x)'],
    ['1 MeV\nf^2(x)≈27', 'f^2(x)'],
    ['1 MeV and f^2(x)≈27', 'f^2(x)'],
    ['1 MeV — f^2(x)≈27', 'f^2(x)'],
    ['1 MeV and 2*f^x≈27', '2*f^x'],
  ])('never swallows an independent result before unsupported math: %s', (text, expected) => {
    const result = binding(text)!;
    expect(text.slice(result.start, result.end)).toBe(expected);
  });
  it.each([
    ['0.26 fs(ζ≈27)', { kind: 'symbol', key: 'ζ' }],
    ['单电子 (ζ≈27)', { kind: 'symbol', key: 'ζ' }],
    ['ζ=Tc1/τ1≈27', { kind: 'symbol', key: 'ζ' }],
    ['q=(a+b)/c≈27', { kind: 'symbol', key: 'q' }],
    ['(a+b)/c≈27', { kind: 'expression', key: '((a+b)/c)' }],
  ])('preserves complete bindings: %s', (text, expected) => expect(binding(text as string)?.binding).toMatchObject(expected));
  it.each([
    ['Tc1/2(i.e.,0.26fs)', '0.26', { kind: 'expression', key: '(tc1/2)' }],
    ['FWHM_T(19as)', '19', { kind: 'symbol', key: 'fwhmt' }],
    ['τ1≈19as ≪ Tc1/2≈0.26fs', '0.26', { kind: 'expression', key: '(tc1/2)' }],
  ])('preserves source annotations and adjacent quantities: %s', (text, number, expected) => {
    expect(scientificComparisonBinding(text as string, (text as string).lastIndexOf(number as string))?.binding).toEqual(expected);
  });
});

describe('standalone parenthesized comparisons in fresh source notation', () => {
  it.each(['FWHM_S ≪ λ0/2', 'FWHM_S < λ0/2', 'FWHM_S ≥ λ0/2'])(
    'retains the same complete expression with or without prose parentheses: %s', comparison => {
      const bare = scientificExpressionReferences(comparison, true);
      const wrapped = scientificExpressionReferences(`(${comparison})`, true);
      expect(bare.some(reference => reference.unsupported)).toBe(false);
      expect(wrapped.some(reference => reference.unsupported)).toBe(false);
      expect(wrapped.map(reference => reference.key)).toEqual(bare.map(reference => reference.key));
    });

  it.each(['(FWHM_S ≪ λ0/2', '(FWHM_S < f(θ)/2)', '(FWHM_S < λ0/2)*β',
    '(FWHM_S < λ0/2) f(θ)', 'f(FWHM_S < λ0/2)',
    '(FWHM_S < λ0/2)/β', '(FWHM_S < λ0/2 < λ1/3)'])(
    'does not crop unsupported mathematics into a standalone comparison: %s', value => {
      const references = scientificExpressionReferences(value, true);
      expect(references.some(reference => reference.unsupported)).toBe(true);
      expect(references.filter(reference => !reference.unsupported)).toEqual([]);
    });

  it('preserves the historical reference and range without fresh notation', () => {
    expect(scientificExpressionReferences('(FWHM_S ≪ λ0/2)', false))
      .toEqual([{ key: '(λ0/2)', start: 10, end: 14 }]);
  });
});

describe('complete expression references with spaced trigonometric terms', () => {
  const references = (text: string) => scientificExpressionReferences(text.replaceAll('−', '-'));
  it.each(['(1−β cosθ)', '(1 − β cos θ)', '(1-βcos θ)', '(1-β\tcosθ)'])(
    'compares the whole %s with compact notation', text => {
      const compact = references('(1-βcosθ)');
      const spaced = references(text);
      expect(spaced).toHaveLength(1);
      expect(spaced[0]).toEqual({ key: compact[0]!.key, start: 0, end: text.length });
      expect(binding(`${text.replaceAll('−', '-')}≈27`)?.binding).toEqual(binding('(1-βcosθ)≈27')?.binding);
    });

  it.each(['(1-β f(θ))', '(1-β cos(θ+φ))', '(1-β cosθ extra)', '(1-β cos)', '(1-β cosθ', '(1-β cosθ +)', '(1-β\ncosθ)',
    '1-β f(θ)', '1-β cosθ1', `(1-${' '.repeat(161)}βcosθ)`])(
    'does not turn incomplete or unsupported %s into a shorter reference', text => {
      const parsed = references(text);
      expect(parsed.some(item => item.unsupported)).toBe(true);
      expect(parsed.filter(item => !item.unsupported)).not.toContainEqual(expect.objectContaining({ key: references('(1-β)')[0]!.key }));
    });

  it('keeps the unsupported group range local to its own brackets', () => {
    const input = '1 MeV; (1-β cos(θ+φ)); 500 nm';
    const parsed = references(input).filter(item => item.unsupported);
    expect(parsed).toHaveLength(1);
    expect(input.slice(parsed[0]!.start, parsed[0]!.end)).toBe('(1-β cos(θ+φ))');
  });

  it.each(['(1-β cosθ) sinφ', '(1-β cosθ)foo', '(1-β cosθ) sin φ', '(1-β cosθ) β', '(1-β cosθ) f(φ)'])(
    'does not discard a factor following a complete group: %s', text => {
      const parsed = references(text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({ start: 0, end: text.length, unsupported: true });
    });

  it.each(['1/β cosθ', '1/βcosθ', '1/-β cosθ', '(1/β cosθ)'])(
    'refuses an ambiguous implicit denominator in references, comparisons and equalities: %s', text => {
      const parsed = references(text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({ start: 0, end: text.length, unsupported: true });
      expect(binding(`${text}≈27`)?.binding).toEqual({ kind: 'unsupported-expression' });
      expect(scientificEqualityRelations(`q=${text}`)).toEqual([]);
    });

  it('distinguishes a grouped denominator from explicit left-associative multiplication', () => {
    const denominator = references('1/(β cosθ)');
    const product = references('1/β*cosθ');
    expect(denominator).toHaveLength(1);
    expect(product).toHaveLength(1);
    expect(denominator[0]!.unsupported).toBeUndefined();
    expect(product[0]!.unsupported).toBeUndefined();
    expect(denominator[0]!.key).toBe(references('1/(β*cosθ)')[0]!.key);
    expect(product[0]!.key).not.toBe(denominator[0]!.key);
  });

  it.each(['(1-β cosφ)', '(1+β cosθ)', '(1-β/cosθ)', '(1-β sinθ)', '(1-β cosθ1)', '(1-β cosθ+φ)'])(
    'does not equate an altered angle, operator or argument: %s', text => {
      const compactKey = references('(1-βcosθ)')[0]!.key;
      expect(references(text).filter(item => !item.unsupported).map(item => item.key)).not.toContain(compactKey);
    });
});
