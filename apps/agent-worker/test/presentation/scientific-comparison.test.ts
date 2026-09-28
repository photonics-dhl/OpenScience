import { describe, expect, it } from 'vitest';
import { scientificComparisonBinding, scientificExpressionReferences } from '../../src/presentation/scientific-comparison';

const binding = (text: string) => scientificComparisonBinding(text, text.lastIndexOf('27'));
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
  it.each(['a>b≈27', 'a≤b≈27', `a + ${' '.repeat(161)}b≈27`, 'a/(b≈27)', 'sin (a+b)≈27', 'sin(a+b)≈27', 'a^b≈27', 'a%b≈27', 'a÷b≈27'])
    ('does not relabel an unsupported expression as its last operand: %s', text => {
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

describe('complete expression references with spaced trigonometric terms', () => {
  const references = (text: string) => scientificExpressionReferences(text.replaceAll('−', '-'));
  it.each(['(1−β cosθ)', '(1 − β cos θ)', '(1-βcos θ)', '(1-β\tcosθ)'])
    ('compares the whole %s with compact notation', text => {
      const compact = references('(1-βcosθ)');
      const spaced = references(text);
      expect(spaced).toHaveLength(1);
      expect(spaced[0]).toEqual({ key: compact[0]!.key, start: 0, end: text.length });
      expect(binding(`${text.replaceAll('−', '-')}≈27`)?.binding).toEqual(binding('(1-βcosθ)≈27')?.binding);
    });

  it.each(['(1-β f(θ))', '(1-β cos(θ+φ))', '(1-β cosθ extra)', '(1-β cos)', '(1-β cosθ', '(1-β cosθ +)', '(1-β\ncosθ)',
    '1-β f(θ)', '1-β cosθ1', `(1-${' '.repeat(161)}βcosθ)`])
    ('does not turn incomplete or unsupported %s into a shorter reference', text => {
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

  it.each(['(1-β cosφ)', '(1+β cosθ)', '(1-β/cosθ)', '(1-β sinθ)', '(1-β cosθ1)', '(1-β cosθ+φ)'])
    ('does not equate an altered angle, operator or argument: %s', text => {
      const compactKey = references('(1-βcosθ)')[0]!.key;
      expect(references(text).filter(item => !item.unsupported).map(item => item.key)).not.toContain(compactKey);
    });
});
