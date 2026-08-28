import type { OcrSelectionReason } from '@openscience/ai-gateway';
import type { StagePage } from './job-protocol';

export const PAGE_QUALITY_THRESHOLDS_V1 = Object.freeze({
  version: 'openscience-page-quality-v1',
  nativeAccept: 0.92,
  llmCandidate: 0.70,
  minimumUnicodeDensity: 0.0001,
});

export interface PageQualitySignals {
  complexTable?: boolean;
  layoutFailure?: boolean;
}

export type PageQualityInput = StagePage & { signals?: PageQualitySignals };

export interface PageQualityAssessment {
  confidence: number;
  reasons: OcrSelectionReason[];
  localOcrRequired: boolean;
  llmCandidateReason?: OcrSelectionReason;
}

const UNICODE_LETTER_OR_NUMBER = /[\p{L}\p{N}]/gu;
const STRUCTURAL_PRIORITY: readonly OcrSelectionReason[] = [
  'layout_failure',
  'complex_table',
  'formula',
];

function unicodeCharacterCount(text: string | undefined): number {
  return text?.match(UNICODE_LETTER_OR_NUMBER)?.length ?? 0;
}

function roundedConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000;
}

export function assessPageQuality(page: PageQualityInput): PageQualityAssessment {
  const weighted = page.blocks.reduce((total, block) => {
    const characters = unicodeCharacterCount(block.text);
    return {
      characters: total.characters + characters,
      confidence: total.confidence + characters * (block.confidence ?? 1),
    };
  }, { characters: 0, confidence: 0 });

  const pageArea = Number.isFinite(page.width) && Number.isFinite(page.height) && page.width > 0 && page.height > 0
    ? page.width * page.height
    : Number.POSITIVE_INFINITY;
  const density = weighted.characters / pageArea;
  const densityFactor = Math.min(1, density / PAGE_QUALITY_THRESHOLDS_V1.minimumUnicodeDensity);
  const aggregate = weighted.characters === 0 ? 0 : weighted.confidence / weighted.characters;
  const confidence = roundedConfidence(aggregate * densityFactor);
  const localOcrRequired = weighted.characters === 0 || confidence < PAGE_QUALITY_THRESHOLDS_V1.nativeAccept;

  const structural = new Set<OcrSelectionReason>();
  if (page.signals?.layoutFailure) structural.add('layout_failure');
  if (page.signals?.complexTable) structural.add('complex_table');
  if (page.blocks.some(({ kind }) => kind === 'equation')) structural.add('formula');
  const reasons = STRUCTURAL_PRIORITY.filter((reason) => structural.has(reason));
  if (localOcrRequired) reasons.push('low_confidence');

  const structuralCandidate = reasons.find((reason) => reason !== 'low_confidence');
  const llmCandidateReason = structuralCandidate
    ?? (confidence < PAGE_QUALITY_THRESHOLDS_V1.llmCandidate ? 'low_confidence' : undefined);

  return {
    confidence,
    reasons,
    localOcrRequired,
    ...(llmCandidateReason === undefined ? {} : { llmCandidateReason }),
  };
}
