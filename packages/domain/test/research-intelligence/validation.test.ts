import { describe, expect, it } from 'vitest';
import type { ResearchIdentityProfile, SourceLocator } from '../../src';

type Validators = {
  validateResearchIdentityProfile(value: unknown): ResearchIdentityProfile;
  validateSourceLocator(value: unknown): SourceLocator;
};

async function loadValidators(): Promise<Validators> {
  return await import('../../src') as unknown as Validators;
}

describe('validateResearchIdentityProfile', () => {
  it('rejects a primary identity that was not selected at registration', async () => {
    const { validateResearchIdentityProfile } = await loadValidators();

    expect(() => validateResearchIdentityProfile({
      identities: ['reader'],
      primaryIdentity: 'author',
      disciplines: ['physics'],
      methods: [],
      topics: ['ultrafast optics'],
      languages: ['zh'],
    })).toThrow(/primaryIdentity/);
  });

  it('accepts a multi-identity profile when its primary identity is selected', async () => {
    const { validateResearchIdentityProfile } = await loadValidators();
    const profile = {
      identities: ['reader', 'reviewer'],
      primaryIdentity: 'reviewer',
      disciplines: ['physics'],
      methods: ['pump-probe'],
      topics: ['ultrafast optics'],
      languages: ['zh', 'en'],
    } as const;

    expect(validateResearchIdentityProfile(profile)).toEqual(profile);
  });

  it('rejects duplicate identities and unknown profile fields', async () => {
    const { validateResearchIdentityProfile } = await loadValidators();

    expect(() => validateResearchIdentityProfile({
      identities: ['reader', 'reader'],
      primaryIdentity: 'reader',
      disciplines: [],
      methods: [],
      topics: [],
      languages: ['en'],
    })).toThrow(/identities/);
    expect(() => validateResearchIdentityProfile({
      identities: ['reader'],
      primaryIdentity: 'reader',
      disciplines: [],
      methods: [],
      topics: [],
      languages: ['en'],
      inferredSensitiveAttribute: 'none',
    })).toThrow(/unknown field/);
  });
});

describe('validateSourceLocator', () => {
  const base = { artifactId: 'artifact-1', contentHash: 'a'.repeat(64) };

  it.each([
    { ...base, page: 2, boundingBox: { x: 10, y: 20, width: 30, height: 40 } },
    { ...base, charRange: { start: 0, end: 18 } },
    { ...base, tableCell: { sheet: 'Results', row: 0, column: 3 } },
    { ...base, codeRange: { commit: 'abc1234', path: 'src/model.py', startLine: 4, endLine: 9 } },
  ])('accepts a deterministic locator variant %#', async (locator) => {
    const { validateSourceLocator } = await loadValidators();

    expect(validateSourceLocator(locator)).toEqual(locator);
  });

  it('requires at least one position and a valid content hash', async () => {
    const { validateSourceLocator } = await loadValidators();

    expect(() => validateSourceLocator(base)).toThrow(/position/);
    expect(() => validateSourceLocator({ ...base, contentHash: 'not-a-hash', page: 1 })).toThrow(/contentHash/);
  });

  it('rejects an invalid bounding box and a box without a page', async () => {
    const { validateSourceLocator } = await loadValidators();

    expect(() => validateSourceLocator({
      ...base,
      page: 2,
      boundingBox: { x: 10, y: 20, width: 0, height: 40 },
    })).toThrow(/boundingBox/);
    expect(() => validateSourceLocator({
      ...base,
      boundingBox: { x: 10, y: 20, width: 30, height: 40 },
    })).toThrow(/page/);
  });

  it('rejects reversed ranges and provider-specific fields', async () => {
    const { validateSourceLocator } = await loadValidators();

    expect(() => validateSourceLocator({ ...base, charRange: { start: 18, end: 18 } })).toThrow(/charRange/);
    expect(() => validateSourceLocator({
      ...base,
      page: 1,
      providerPayload: { pageIndex: 0 },
    })).toThrow(/unknown field/);
  });

  it('accepts an optional block ID but rejects invalid or unknown locator fields', async () => {
    const { validateSourceLocator } = await loadValidators();
    const locator = { ...base, blockId: 'paragraph-1', page: 1 };

    expect(validateSourceLocator(locator)).toEqual(locator);
    expect(() => validateSourceLocator({ ...locator, blockId: '' })).toThrow(/blockId/);
    expect(() => validateSourceLocator({ ...locator, blockId: 'paragraph-1', providerBlock: {} })).toThrow(/unknown field/);
  });

  it.each([
    { commit: ' abc1234', path: 'src/model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234\n', path: 'src/model.py', startLine: 1, endLine: 1 },
    { commit: 'abc123', path: 'src/model.py', startLine: 1, endLine: 1 },
    { commit: 'g'.repeat(65), path: 'src/model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234', path: '/src/model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234', path: 'C:/src/model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234', path: 'src\\model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234', path: 'src/../model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234', path: 'src//model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234', path: 'src/\u0000model.py', startLine: 1, endLine: 1 },
    { commit: 'abc1234', path: 'src/model.py', startLine: Number.MAX_SAFE_INTEGER + 1, endLine: Number.MAX_SAFE_INTEGER + 1 },
    { commit: 'abc1234', path: 'src/model.py', startLine: 10_000_001, endLine: 10_000_001 },
  ])('rejects unsafe code provenance %#', async (codeRange) => {
    const { validateSourceLocator } = await loadValidators();

    expect(() => validateSourceLocator({ ...base, codeRange })).toThrow(/codeRange/);
  });

  it('accepts the maximum safe practical code line', async () => {
    const { validateSourceLocator } = await loadValidators();
    const locator = { ...base, codeRange: { commit: 'abcdef0', path: 'src/model.py', startLine: 10_000_000, endLine: 10_000_000 } };

    expect(validateSourceLocator(locator)).toEqual(locator);
  });
});
