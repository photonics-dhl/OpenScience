import { describe, expect, it } from 'vitest';
import { getEditorialMediaStatus } from '../lib/editorial-media-draft';

const empty = { type: 'image' as const, url: '', alt: '', credit: '', licenseId: 'CC-BY-4.0', sourceUrl: '' };
const complete = { ...empty, url: 'https://example.org/figure.png', alt: 'Optical setup', credit: 'Research team', sourceUrl: 'https://example.org/paper' };

describe('optional editorial media draft', () => {
  it('allows only the untouched default media area to be omitted', () => {
    expect(getEditorialMediaStatus(empty)).toBe('empty');
    expect(getEditorialMediaStatus({ ...empty, alt: 'Caption in progress' })).toBe('incomplete');
    expect(getEditorialMediaStatus({ ...empty, licenseId: 'CC-BY-SA-4.0' })).toBe('incomplete');
    expect(getEditorialMediaStatus({ ...empty, type: 'video' })).toBe('incomplete');
  });

  it.each(['url', 'alt', 'credit', 'licenseId', 'sourceUrl'] as const)('preserves a draft with missing %s instead of submitting without media', field => {
    expect(getEditorialMediaStatus({ ...complete, [field]: '   ' })).toBe('incomplete');
  });

  it('accepts complete media and keeps the HTTPS field requirement', () => {
    expect(getEditorialMediaStatus(complete)).toBe('ready');
    expect(getEditorialMediaStatus({ ...complete, url: 'http://example.org/figure.png' })).toBe('incomplete');
    expect(getEditorialMediaStatus({ ...complete, sourceUrl: 'not a URL' })).toBe('incomplete');
  });
});
