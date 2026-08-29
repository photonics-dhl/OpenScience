import { describe, expect, it } from 'vitest';

interface FixtureSourceMap {
  artifactId: string;
  contentHash: string;
  pages: number[];
}

function parseFixtureSourceMap(value: unknown): FixtureSourceMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('source map invalid');
  const sourceMap = value as Record<string, unknown>;
  if (Object.keys(sourceMap).some((key) => !['artifactId', 'contentHash', 'pages'].includes(key))) {
    throw new Error('source map has unknown field');
  }
  if (typeof sourceMap.artifactId !== 'string' || typeof sourceMap.contentHash !== 'string'
    || !Array.isArray(sourceMap.pages) || sourceMap.pages.some((page) => !Number.isInteger(page))) {
    throw new Error('source map invalid');
  }
  return sourceMap as unknown as FixtureSourceMap;
}

async function extractionContract() {
  return await import('../../src') as unknown as {
    serializeExtractionResult<TSourceMap>(value: unknown, parseSourceMap: (value: unknown) => TSourceMap): string;
    parseExtractionResult<TSourceMap>(json: string, parseSourceMap: (value: unknown) => TSourceMap): unknown;
  };
}

describe('ExtractionResult boundary', () => {
  const sourceMap: FixtureSourceMap = {
    artifactId: 'artifact-1',
    contentHash: 'b'.repeat(64),
    pages: [1, 2],
  };

  it.each([
    { status: 'succeeded', sourceMap, warnings: [] },
    { status: 'needs_review', sourceMap, reasons: ['bbox_low_confidence'] },
    { status: 'blocked', code: 'rights_unknown', message: 'Full text rights were not established.' },
    { status: 'failed', retryable: true, provider: 'layout-parser', message: 'Parser timed out.' },
  ])('round-trips the %s discriminated-union branch', async (result) => {
    const { serializeExtractionResult, parseExtractionResult } = await extractionContract();

    expect(parseExtractionResult(
      serializeExtractionResult(result, parseFixtureSourceMap),
      parseFixtureSourceMap,
    )).toEqual(result);
  });

  it('rejects unknown statuses and provider-specific fields', async () => {
    const { serializeExtractionResult, parseExtractionResult } = await extractionContract();

    expect(() => parseExtractionResult(JSON.stringify({ status: 'queued' }), parseFixtureSourceMap)).toThrow(/status/);
    expect(() => parseExtractionResult(JSON.stringify({
      status: 'failed',
      retryable: true,
      provider: 'layout-parser',
      message: 'failed',
      rawProviderPayload: {},
    }), parseFixtureSourceMap)).toThrow(/unknown field/);
    expect(() => serializeExtractionResult({
      status: 'failed',
      retryable: true,
      provider: 'layout-parser',
      message: 'failed',
      rawProviderPayload: { requestId: 'private' },
    }, parseFixtureSourceMap)).toThrow(/unknown field/);
    expect(() => serializeExtractionResult({
      status: 'succeeded',
      sourceMap: { ...sourceMap, privateProviderBlock: true },
      warnings: [],
    }, parseFixtureSourceMap)).toThrow(/source map has unknown field/);
  });

  it('delegates succeeded source-map validation to the strict Task 3 decoder', async () => {
    const { parseExtractionResult } = await extractionContract();

    expect(() => parseExtractionResult(JSON.stringify({
      status: 'succeeded',
      sourceMap: { ...sourceMap, privateProviderBlock: true },
      warnings: [],
    }), parseFixtureSourceMap)).toThrow(/source map has unknown field/);
  });

  it('rejects unsupported block codes and malformed JSON', async () => {
    const { parseExtractionResult } = await extractionContract();

    expect(() => parseExtractionResult(JSON.stringify({
      status: 'blocked',
      code: 'provider_quota',
      message: 'quota',
    }), parseFixtureSourceMap)).toThrow(/blocked code/);
    expect(() => parseExtractionResult('{', parseFixtureSourceMap)).toThrow(/JSON/);
  });
});
