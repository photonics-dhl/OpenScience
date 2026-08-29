import { describe, expect, it } from 'vitest';
import { canonicalParserMediaType } from '../src/parser-media-type';

describe('canonicalParserMediaType', () => {
  it('canonicalizes compatible stored MIME types from the lower-cased basename extension', () => {
    expect(canonicalParserMediaType('analysis.py', 'text/plain')).toBe('text/x-python');
    expect(canonicalParserMediaType('analysis.ipynb', 'application/json'))
      .toBe('application/x-ipynb+json');
    expect(canonicalParserMediaType('nested/ANALYSIS.PY', 'text/x-python; charset=utf-8'))
      .toBe('text/x-python');
  });

  it('fails closed when the stored MIME type conflicts with the extension', () => {
    expect(canonicalParserMediaType('analysis.py', 'image/png')).toBe('application/octet-stream');
  });
});
