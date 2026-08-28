import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  SafeParserErrorCode,
  SafeParserWarningCode,
  deserializeParserJobResponseV2,
  parseParserJobRequestV2,
  parseParserStageResult,
  serializeParserJobRequestV2,
  serializeParserJobResponseV2,
  type ParserJobRequestV2,
  type ParserStageResult,
} from '../src/parsers/job-protocol';

const CONTENT_HASH = 'a'.repeat(64);
const metadata = { name: 'layout-parser', version: '2.1.0', modelHash: 'model-sha256' };

const parserDockerfile = readFileSync(join(process.cwd(), 'Dockerfile.parser'), 'utf8');
const protocolSource = readFileSync(join(process.cwd(), 'src', 'parsers', 'job-protocol.ts'), 'utf8');

function request(overrides: Partial<ParserJobRequestV2> = {}): ParserJobRequestV2 {
  return {
    schemaVersion: 2,
    operation: 'ocr_page',
    artifactId: 'artifact-1',
    contentHash: CONTENT_HASH,
    mediaType: 'application/pdf',
    options: { pageNumbers: [1, 3], renderDpi: 300, languageHints: ['eng', 'chi_sim'] },
    ...overrides,
  };
}

function stageResult(overrides: Partial<ParserStageResult> = {}): ParserStageResult {
  return {
    schemaVersion: 2,
    parser: metadata,
    pages: [{
      page: 1,
      width: 612,
      height: 792,
      blocks: [{
        kind: 'paragraph',
        text: 'Measured pulse width is 42 fs.',
        boundingBox: { x: 72, y: 600, width: 310, height: 19 },
        confidence: 0.975,
      }],
    }],
    warnings: [SafeParserWarningCode.OCR_APPLIED],
    ...overrides,
  };
}

describe('parser job protocol v2', () => {
  it('packages every compiled V2 runtime module without adding the Domain runtime', () => {
    expect(parserDockerfile).toMatch(/dist\/parsers\/job-protocol\.js/);
    expect(parserDockerfile).not.toMatch(/@openscience\/domain/);
    expect(protocolSource).not.toMatch(/@openscience\/domain/);
  });
  it('serializes an exact canonical request snapshot', () => {
    const input = request();
    const serialized = serializeParserJobRequestV2(input);
    const canonical = parseParserJobRequestV2(JSON.parse(serialized));

    expect(JSON.parse(serialized)).toEqual(input);
    expect(canonical).toEqual(input);
    expect(JSON.parse(serializeParserJobRequestV2(canonical))).toEqual(input);
  });

  it.each([
    ['wrong schema version', { ...request(), schemaVersion: 1 }],
    ['unknown request field', { ...request(), provider: 'private' }],
    ['unknown option field', { ...request(), options: { vendorMode: 'private' } }],
    ['invalid operation', { ...request(), operation: 'provider_private_parse' }],
    ['invalid content hash', { ...request(), contentHash: 'not-a-hash' }],
    ['out-of-range render DPI', { ...request(), options: { renderDpi: 601 } }],
    ['duplicate page numbers', { ...request(), options: { pageNumbers: [2, 2] } }],
    ['too many language hints', { ...request(), options: { languageHints: Array.from({ length: 17 }, (_, index) => `l${index}`) } }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseParserJobRequestV2(value)).toThrow();
  });

  it('rejects request accessors without invoking them', () => {
    let getterCalls = 0;
    const input = request() as unknown as Record<string, unknown>;
    Object.defineProperty(input, 'artifactId', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('getter leaked');
      },
    });

    expect(() => parseParserJobRequestV2(input)).toThrow(/data propert/i);
    expect(getterCalls).toBe(0);
  });

  it('rejects request proxies without invoking traps', () => {
    let trapCalls = 0;
    const input = new Proxy(request(), {
      ownKeys: () => {
        trapCalls += 1;
        throw new Error('proxy leaked');
      },
    });

    expect(() => parseParserJobRequestV2(input)).toThrow(/proxy/i);
    expect(trapCalls).toBe(0);
  });

  it('rejects sparse option arrays and nested accessors', () => {
    const sparse = new Array(2) as number[];
    sparse[1] = 2;
    expect(() => parseParserJobRequestV2(request({ options: { pageNumbers: sparse } }))).toThrow(/sparse|data propert/i);

    let getterCalls = 0;
    const options = { pageNumbers: [1] } as Record<string, unknown>;
    Object.defineProperty(options, 'renderDpi', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('nested getter leaked');
      },
    });
    expect(() => parseParserJobRequestV2(request({ options: options as ParserJobRequestV2['options'] }))).toThrow(/data propert/i);
    expect(getterCalls).toBe(0);
  });

  it('accepts only bounded provider-neutral stage fields', () => {
    const canonical = parseParserStageResult(stageResult());
    expect(canonical).toEqual(stageResult());
    expect(parseParserStageResult(canonical)).toEqual(stageResult());
    expect(() => serializeParserJobResponseV2({
      schemaVersion: 2,
      ok: true,
      artifactId: 'artifact-1',
      contentHash: CONTENT_HASH,
      result: canonical,
    })).not.toThrow();
    expect(() => parseParserStageResult({ ...stageResult(), parser: { ...metadata, providerDocument: 'private' } })).toThrow(/unknown field/i);
    expect(() => parseParserStageResult({
      ...stageResult(),
      pages: [{ ...stageResult().pages[0]!, blocks: [{ ...stageResult().pages[0]!.blocks[0]!, providerBlockType: 'private' }] }],
    })).toThrow(/unknown field/i);
    expect(() => parseParserStageResult({ ...stageResult(), schemaVersion: 1 })).toThrow(/schema/i);
    expect(() => parseParserStageResult({ ...stageResult(), warnings: ['/secret/path: manuscript fragment'] })).toThrow(/warning/i);
  });

  it('rejects page, block and string budget overflow before accepting a stage', () => {
    const page = stageResult().pages[0]!;
    expect(() => parseParserStageResult({ ...stageResult(), pages: Array.from({ length: 10_001 }, (_, index) => ({ ...page, page: index + 1 })) })).toThrow(/page|limit|maximum/i);
    expect(() => parseParserStageResult({ ...stageResult(), pages: [{ ...page, blocks: Array.from({ length: 10_001 }, () => page.blocks[0]!) }] })).toThrow(/block|limit|maximum/i);
    expect(() => parseParserStageResult({
      ...stageResult(),
      pages: [{ ...page, blocks: [{ ...page.blocks[0]!, text: 'x'.repeat(50_001) }] }],
    })).toThrow(/text|string|limit/i);
    expect(() => parseParserStageResult({
      ...stageResult(),
      warnings: Array.from({ length: 101 }, () => SafeParserWarningCode.LOW_CONFIDENCE),
    })).toThrow(/warning|maximum/i);
    expect(() => parseParserStageResult({
      ...stageResult(),
      pages: [{
        ...page,
        blocks: Array.from({ length: 101 }, () => ({ ...page.blocks[0]!, text: 'x'.repeat(50_000) })),
      }],
    })).toThrow(/text character budget/i);
  });

  it.each([
    ['negative x', { x: -1, y: 0, width: 1, height: 1 }],
    ['zero width', { x: 0, y: 0, width: 0, height: 1 }],
    ['right overflow', { x: 611, y: 0, width: 2, height: 1 }],
    ['bottom overflow', { x: 0, y: 791, width: 1, height: 2 }],
    ['non-finite coordinate', { x: Number.NaN, y: 0, width: 1, height: 1 }],
  ])('rejects a block bbox with %s', (_label, boundingBox) => {
    const page = stageResult().pages[0]!;
    expect(() => parseParserStageResult({
      ...stageResult(),
      pages: [{ ...page, blocks: [{ ...page.blocks[0]!, boundingBox }] }],
    })).toThrow(/bounding|bbox|page/i);
  });

  it.each([-0.001, 1.001, Number.NaN, Number.POSITIVE_INFINITY])('rejects confidence %s outside [0,1]', (confidence) => {
    const page = stageResult().pages[0]!;
    expect(() => parseParserStageResult({
      ...stageResult(),
      pages: [{ ...page, blocks: [{ ...page.blocks[0]!, confidence }] }],
    })).toThrow(/confidence/i);
  });

  it('rejects stage proxies, accessors and sparse arrays without invoking user code', () => {
    let trapCalls = 0;
    const proxied = new Proxy(stageResult(), {
      getPrototypeOf: () => {
        trapCalls += 1;
        throw new Error('proxy leaked');
      },
    });
    expect(() => parseParserStageResult(proxied)).toThrow(/proxy/i);
    expect(trapCalls).toBe(0);

    const sparsePages = new Array(1) as ParserStageResult['pages'];
    expect(() => parseParserStageResult({ ...stageResult(), pages: sparsePages })).toThrow(/sparse|data propert/i);
  });

  it('enforces the 24 MiB serialized response ceiling before JSON parsing', () => {
    const oversized = Buffer.alloc(PARSER_JOB_RESPONSE_MAX_BYTES + 1, 0x20);
    expect(() => deserializeParserJobResponseV2(oversized, request(), metadata)).toThrow(/response_too_large/i);

    const page = stageResult().pages[0]!;
    const oversizedStage = stageResult({
      pages: [{
        ...page,
        blocks: Array.from({ length: 85 }, () => ({ ...page.blocks[0]!, text: '\0'.repeat(50_000) })),
      }],
    });
    expect(() => serializeParserJobResponseV2({
      schemaVersion: 2,
      ok: true,
      artifactId: 'artifact-1',
      contentHash: CONTENT_HASH,
      result: oversizedStage,
    })).toThrow(/response_too_large/i);
  });

  it('accepts success only when response identity and parser metadata match the request', () => {
    const response = {
      schemaVersion: 2 as const,
      ok: true as const,
      artifactId: 'artifact-1',
      contentHash: CONTENT_HASH,
      result: stageResult(),
    };
    const serialized = serializeParserJobResponseV2(response);

    expect(deserializeParserJobResponseV2(Buffer.from(serialized), request(), metadata)).toEqual(response);
    expect(() => deserializeParserJobResponseV2(Buffer.from(serializeParserJobResponseV2({ ...response, artifactId: 'other' })), request(), metadata)).toThrow(/identity_mismatch/i);
    expect(() => deserializeParserJobResponseV2(Buffer.from(serializeParserJobResponseV2({ ...response, result: stageResult({ parser: { ...metadata, version: 'other' } }) })), request(), metadata)).toThrow(/metadata_mismatch/i);
  });

  it('uses a closed safe error code response with no provider detail field', () => {
    const response = {
      schemaVersion: 2 as const,
      ok: false as const,
      artifactId: 'artifact-1',
      contentHash: CONTENT_HASH,
      errorCode: SafeParserErrorCode.PARSER_FAILED,
    };
    expect(deserializeParserJobResponseV2(Buffer.from(serializeParserJobResponseV2(response)), request())).toEqual(response);
    expect(() => serializeParserJobResponseV2({ ...response, providerStderr: '/secret/path: manuscript fragment' } as never)).toThrow(/unknown field/i);
    expect(() => deserializeParserJobResponseV2(Buffer.from(JSON.stringify({ ...response, errorCode: 'vendor_crash' })), request())).toThrow(/invalid_response/i);
  });

  it('serializes canonical snapshots without inherited toJSON hooks', () => {
    const objectHook = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
    const arrayHook = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
    Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, value: () => { throw new Error('object hook reached'); } });
    Object.defineProperty(Array.prototype, 'toJSON', { configurable: true, value: () => { throw new Error('array hook reached'); } });
    try {
      expect(() => serializeParserJobRequestV2(request())).not.toThrow();
      expect(() => serializeParserJobResponseV2({
        schemaVersion: 2,
        ok: true,
        artifactId: 'artifact-1',
        contentHash: CONTENT_HASH,
        result: stageResult(),
      })).not.toThrow();
    } finally {
      if (objectHook) Object.defineProperty(Object.prototype, 'toJSON', objectHook);
      else delete (Object.prototype as { toJSON?: unknown }).toJSON;
      if (arrayHook) Object.defineProperty(Array.prototype, 'toJSON', arrayHook);
      else delete (Array.prototype as { toJSON?: unknown }).toJSON;
    }
  });
});
