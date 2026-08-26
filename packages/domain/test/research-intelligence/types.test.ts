import { describe, expect, it } from 'vitest';

describe('Research Intelligence vocabulary', () => {
  it('exports the approved identity and claim values in their canonical order', async () => {
    const domain = await import('../../src') as Record<string, unknown>;

    expect(domain.RESEARCH_IDENTITIES).toEqual([
      'reader',
      'author',
      'reviewer',
      'editor',
      'data_steward',
      'developer',
      'student',
    ]);
    expect(domain.CLAIM_KINDS).toEqual(['core', 'supporting', 'method', 'boundary', 'counter']);
    expect(domain.CLAIM_ASSESSMENTS).toEqual(['supported', 'partial', 'disputed', 'missing']);
  });

  it('keeps generated presentation assets outside the Evidence vocabulary', async () => {
    const domain = await import('../../src') as Record<string, unknown>;

    expect(domain.EVIDENCE_KINDS).toEqual([
      'passage',
      'figure',
      'table',
      'dataset',
      'code',
      'notebook',
      'environment',
      'protocol',
      'supplement',
      'external_source',
    ]);
    expect(domain.PRESENTATION_ASSET_KINDS).toEqual([
      'svg',
      'chart',
      'interactive_html',
      'image',
      'video',
    ]);
    expect(domain.PRESENTATION_ASSET_LABEL).toBe('presentation_not_evidence');
  });

  it('exports the exact extraction and evidence relation states', async () => {
    const domain = await import('../../src') as Record<string, unknown>;

    expect(domain.CLAIM_RELATIONS).toEqual(['supports', 'contradicts', 'qualifies', 'context']);
    expect(domain.EXTRACTION_STATUSES).toEqual(['succeeded', 'needs_review', 'blocked', 'failed']);
  });
});
