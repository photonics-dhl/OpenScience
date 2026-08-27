import { describe, expect, it } from 'vitest';

import { buildCandidateEvaluationReport, serializeCandidateEvaluationReport } from '../src/parser-evaluation';

const sha = (digit: string) => digit.repeat(64);

describe('buildCandidateEvaluationReport', () => {
  it('keeps failures in latency metrics and emits only bounded evidence fields', () => {
    const report = buildCandidateEvaluationReport({
      candidate: {
        name: 'liteparse',
        version: '2.14.0',
        imageDigest: `sha256:${sha('a')}`,
        license: 'Apache-2.0',
      },
      cases: [
        { id: 'one', contentHash: sha('1'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 10, peakRssBytes: 100 },
        { id: 'two', contentHash: sha('2'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 20, peakRssBytes: 200 },
        { id: 'three', contentHash: sha('3'), status: 'needs_review', locatorMatches: 0, locatorTotal: 1, elapsedMs: 30, peakRssBytes: 300, errorCode: 'locator_miss' },
        { id: 'four', contentHash: sha('4'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 40, peakRssBytes: 400 },
        { id: 'five', contentHash: sha('5'), status: 'failed', locatorMatches: 0, locatorTotal: 1, elapsedMs: 50, peakRssBytes: 500, errorCode: 'parser_exit' },
      ],
    });

    expect(report).toEqual({
      schemaVersion: 1,
      candidate: {
        name: 'liteparse',
        version: '2.14.0',
        imageDigest: `sha256:${sha('a')}`,
        license: 'Apache-2.0',
      },
      summary: {
        cases: 5,
        succeeded: 3,
        needsReview: 1,
        failed: 1,
        locatorMatches: 3,
        locatorTotal: 5,
        p50ElapsedMs: 30,
        p95ElapsedMs: 50,
        peakRssBytes: 500,
      },
      cases: [
        { id: 'one', contentHash: sha('1'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 10, peakRssBytes: 100 },
        { id: 'two', contentHash: sha('2'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 20, peakRssBytes: 200 },
        { id: 'three', contentHash: sha('3'), status: 'needs_review', locatorMatches: 0, locatorTotal: 1, elapsedMs: 30, peakRssBytes: 300, errorCode: 'locator_miss' },
        { id: 'four', contentHash: sha('4'), status: 'succeeded', locatorMatches: 1, locatorTotal: 1, elapsedMs: 40, peakRssBytes: 400 },
        { id: 'five', contentHash: sha('5'), status: 'failed', locatorMatches: 0, locatorTotal: 1, elapsedMs: 50, peakRssBytes: 500, errorCode: 'parser_exit' },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('sourceText');
    expect(JSON.stringify(report)).not.toContain('/opt/openscience');
  });

  it('rejects duplicate cases and unknown fields instead of spreading sensitive input', () => {
    const candidate = {
      name: 'current-parser', version: '1.0.0', imageDigest: `sha256:${sha('b')}`, license: 'project',
    };
    const item = {
      id: 'duplicate', contentHash: sha('6'), status: 'succeeded' as const,
      locatorMatches: 1, locatorTotal: 1, elapsedMs: 1, peakRssBytes: 1,
    };

    expect(() => buildCandidateEvaluationReport({ candidate, cases: [item, item] })).toThrow(/duplicate/i);
    expect(() => buildCandidateEvaluationReport({
      candidate,
      cases: [{ ...item, sourceText: 'private evidence', absolutePath: '/opt/openscience/private.pdf' }],
    } as never)).toThrow(/unknown field/i);
  });

  it('serializes a validated report with one trailing newline', () => {
    const input = {
      candidate: {
        name: 'current-parser', version: '1.0.0', imageDigest: `sha256:${sha('c')}`, license: 'project',
      },
      cases: [{
        id: 'native-pdf', contentHash: sha('7'), status: 'succeeded' as const,
        locatorMatches: 1, locatorTotal: 1, elapsedMs: 12, peakRssBytes: 256,
      }],
    };

    const serialized = serializeCandidateEvaluationReport(input);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized.endsWith('\n\n')).toBe(false);
    expect(JSON.parse(serialized)).toEqual(buildCandidateEvaluationReport(input));
  });
});
