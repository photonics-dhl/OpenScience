import { describe, expect, it } from 'vitest';
import {
  PAGE_QUALITY_THRESHOLDS_V1,
  assessPageQuality,
  type PageQualityInput,
} from '../src/parsers/page-quality';
import type { StageBlock } from '../src/parsers/job-protocol';

function paragraph(text: string, confidence = 0.98): StageBlock {
  return {
    kind: 'paragraph',
    text,
    boundingBox: { x: 0, y: 0, width: 80, height: 20 },
    confidence,
  };
}

function page(blocks: StageBlock[], overrides: Partial<PageQualityInput> = {}): PageQualityInput {
  return {
    page: 1,
    width: 100,
    height: 100,
    blocks,
    ...overrides,
  };
}

describe('assessPageQuality', () => {
  it('routes an empty scan to local OCR and the low-confidence LLM candidate tier', () => {
    expect(assessPageQuality(page([]))).toEqual({
      confidence: 0,
      reasons: ['low_confidence'],
      localOcrRequired: true,
      llmCandidateReason: 'low_confidence',
    });
  });

  it('penalizes a high-confidence page whose Unicode text density is too low', () => {
    const result = assessPageQuality(page([paragraph('A', 0.99)], { width: 600, height: 800 }));

    expect(result.confidence).toBeLessThan(PAGE_QUALITY_THRESHOLDS_V1.llmCandidate);
    expect(result.localOcrRequired).toBe(true);
    expect(result.reasons).toEqual(['low_confidence']);
  });

  it('uses OCR confidence without reapplying the native-text density trigger', () => {
    const result = assessPageQuality(page([
      paragraph('PULSE', 0.95034515),
      paragraph('42', 0.70393005),
      paragraph('FS', 0.9483197),
    ], { width: 612, height: 792, signals: { localOcrApplied: true } }));

    expect(result.confidence).toBeGreaterThan(PAGE_QUALITY_THRESHOLDS_V1.llmCandidate);
    expect(result.localOcrRequired).toBe(true);
    expect(result.llmCandidateReason).toBeUndefined();
    expect(assessPageQuality(page([
      paragraph('PULSE 42 FS', 0.69),
    ], { width: 612, height: 792, signals: { localOcrApplied: true } })).llmCandidateReason)
      .toBe('low_confidence');
    expect(assessPageQuality(page([
      paragraph('A', 0.99),
    ], { width: 612, height: 792, signals: { localOcrApplied: true } })).llmCandidateReason)
      .toBe('low_confidence');
    expect(assessPageQuality(page([{
      kind: 'paragraph', text: 'PULSE 42 FS', boundingBox: { x: 0, y: 0, width: 200, height: 20 },
    }], { width: 612, height: 792, signals: { localOcrApplied: true } })).llmCandidateReason)
      .toBe('low_confidence');
  });

  it('accepts dense native Chinese and English text at or above the versioned threshold', () => {
    const result = assessPageQuality(page([
      paragraph('OpenScience 可定位证据 '.repeat(20), 0.98),
    ]));

    expect(result.confidence).toBe(0.98);
    expect(result.localOcrRequired).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.llmCandidateReason).toBeUndefined();
  });

  it('aggregates block confidence by Unicode letter and number count', () => {
    const result = assessPageQuality(page([
      paragraph('A'.repeat(90), 1),
      paragraph('数'.repeat(10), 0.5),
    ]));

    expect(result.confidence).toBe(0.95);
    expect(result.localOcrRequired).toBe(false);
  });

  it('surfaces formula, complex-table and layout-failure signals in deterministic priority order', () => {
    const result = assessPageQuality(page([
      paragraph('Dense native text '.repeat(20), 0.99),
      { ...paragraph('E = mc²', 0.99), kind: 'equation' },
    ], {
      signals: { complexTable: true, layoutFailure: true },
    }));

    expect(result.localOcrRequired).toBe(false);
    expect(result.reasons).toEqual(['layout_failure', 'complex_table', 'formula']);
    expect(result.llmCandidateReason).toBe('layout_failure');
  });

  it('does not send a native-quality page to the low-confidence LLM tier at the 0.70 boundary', () => {
    const result = assessPageQuality(page([paragraph('A'.repeat(100), 0.7)]));

    expect(result.localOcrRequired).toBe(true);
    expect(result.llmCandidateReason).toBeUndefined();
  });
});
