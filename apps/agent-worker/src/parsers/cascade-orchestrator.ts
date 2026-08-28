import type { AiGateway, OcrAuthorizationContext, OcrSelectionReason } from '@openscience/ai-gateway';
import {
  parseDocumentSourceMap,
  type DocumentBlock,
  type DocumentParserMetadata,
  type DocumentSourceMap,
  type DocumentTransformation,
  type ExtractionResult,
} from '@openscience/domain';
import { runDocumentParser } from './base-parser';
import { enrichWithGrobid, type GrobidEnrichmentResult } from './grobid-parser';
import type { ParserStageResult, StagePage } from './job-protocol';
import {
  PARSER_CASCADE_METADATA,
  runLlmOcrFallback,
  type LlmOcrCandidatePage,
} from './llm-ocr-fallback';
import { ocrSelectedPages, type LocalOcrAdapter } from './ocr-parser';
import { assessPageQuality } from './page-quality';
import type { DocumentParser, ParserInput } from './types';

export const CASCADE_ORCHESTRATOR_METADATA: DocumentParserMetadata = PARSER_CASCADE_METADATA;

export interface ParserCascadeFeatureFlags {
  detectLayout: boolean;
  grobid: boolean;
  localOcr: boolean;
  llmOcr: boolean;
}

export interface ParserCascadeAdapters {
  extractText: DocumentParser;
  detectLayout?: DocumentParser;
  grobid?: (input: ParserInput) => Promise<GrobidEnrichmentResult>;
  localOcr?: LocalOcrAdapter;
}

export interface CascadeContext {
  adapters: ParserCascadeAdapters;
  aiGateway?: Pick<AiGateway, 'ocr'>;
  trustedAuthorizationContext?: Readonly<OcrAuthorizationContext>;
  externalProcessingEligible: boolean;
  featureFlags: ParserCascadeFeatureFlags;
}

function metadataCopy(metadata: DocumentParserMetadata): DocumentParserMetadata {
  return {
    name: metadata.name,
    version: metadata.version,
    ...(metadata.modelHash === undefined ? {} : { modelHash: metadata.modelHash }),
  };
}

function emptySourceMap(input: ParserInput): DocumentSourceMap {
  return {
    artifactId: input.artifactId,
    contentHash: input.contentHash.toLowerCase(),
    parser: metadataCopy(CASCADE_ORCHESTRATOR_METADATA),
    pages: [],
  };
}

function normalizedText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  return normalized ? normalized : undefined;
}

function overlapRatio(left: DocumentBlock['boundingBox'], right: DocumentBlock['boundingBox']): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = width * height;
  if (intersection === 0) return 0;
  return intersection / Math.min(left.width * left.height, right.width * right.height);
}

function transformationKey(value: DocumentTransformation): string {
  return `${value.stage}\0${value.processor.name}\0${value.processor.version}\0${value.processor.modelHash ?? ''}`;
}

function mergedTransformations(
  left: readonly DocumentTransformation[],
  right: readonly DocumentTransformation[],
): DocumentTransformation[] {
  const transformations = [...left, ...right, {
    stage: 'merge' as const,
    processor: metadataCopy(CASCADE_ORCHESTRATOR_METADATA),
  }];
  const seen = new Set<string>();
  return transformations.filter((entry) => {
    const key = transformationKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((entry) => ({ stage: entry.stage, processor: metadataCopy(entry.processor) }));
}

function matchingBlock(page: DocumentBlock[], incoming: DocumentBlock): DocumentBlock | undefined {
  const text = normalizedText(incoming.text);
  if (!text) return undefined;
  return page.find((existing) => normalizedText(existing.text) === text
    && overlapRatio(existing.boundingBox, incoming.boundingBox) >= 0.5);
}

function distinctBlockId(existingIds: Set<string>, requested: string): string {
  if (!existingIds.has(requested)) return requested;
  let suffix = 1;
  while (existingIds.has(`${requested}:conflict:${suffix}`)) suffix += 1;
  return `${requested}:conflict:${suffix}`;
}

function mergeDeterministicMaps(
  base: DocumentSourceMap,
  incoming: DocumentSourceMap,
): DocumentSourceMap | undefined {
  if (base.artifactId !== incoming.artifactId || base.contentHash !== incoming.contentHash) return undefined;
  const pages = base.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({
      ...block,
      boundingBox: { ...block.boundingBox },
      parser: metadataCopy(block.parser),
      transformations: block.transformations.map((entry) => ({
        stage: entry.stage,
        processor: metadataCopy(entry.processor),
      })),
    })),
  }));
  const ids = new Set(pages.flatMap((page) => page.blocks.map(({ id }) => id)));
  for (const incomingPage of incoming.pages) {
    let page = pages.find(({ page: pageNumber }) => pageNumber === incomingPage.page);
    if (!page) {
      page = { page: incomingPage.page, width: incomingPage.width, height: incomingPage.height, blocks: [] };
      pages.push(page);
    } else if (page.width !== incomingPage.width || page.height !== incomingPage.height) {
      return undefined;
    }
    for (const incomingBlock of incomingPage.blocks) {
      const matching = matchingBlock(page.blocks, incomingBlock);
      if (matching) {
        const index = page.blocks.indexOf(matching);
        const incomingWins = (incomingBlock.confidence ?? 0) > (matching.confidence ?? 0);
        const winner = incomingWins ? incomingBlock : matching;
        page.blocks[index] = {
          ...winner,
          id: matching.id,
          boundingBox: { ...winner.boundingBox },
          parser: metadataCopy(winner.parser),
          transformations: mergedTransformations(matching.transformations, incomingBlock.transformations),
        };
        continue;
      }
      const id = distinctBlockId(ids, incomingBlock.id);
      ids.add(id);
      page.blocks.push({
        ...incomingBlock,
        id,
        boundingBox: { ...incomingBlock.boundingBox },
        parser: metadataCopy(incomingBlock.parser),
        transformations: mergedTransformations([], incomingBlock.transformations),
      });
    }
  }
  try {
    return parseDocumentSourceMap({
      ...base,
      parser: metadataCopy(CASCADE_ORCHESTRATOR_METADATA),
      pages: pages.sort((left, right) => left.page - right.page),
    });
  } catch {
    return undefined;
  }
}

function withOrchestratorMetadata(sourceMap: DocumentSourceMap): DocumentSourceMap | undefined {
  try {
    return parseDocumentSourceMap({
      ...sourceMap,
      parser: metadataCopy(CASCADE_ORCHESTRATOR_METADATA),
    });
  } catch {
    return undefined;
  }
}

function stagePages(sourceMap: DocumentSourceMap): StagePage[] {
  return sourceMap.pages.map((page) => ({
    page: page.page,
    width: page.width,
    height: page.height,
    blocks: page.blocks.map((block) => ({
      kind: block.kind,
      ...(block.text === undefined ? {} : { text: block.text }),
      boundingBox: { ...block.boundingBox },
      ...(block.confidence === undefined ? {} : { confidence: block.confidence }),
    })),
  }));
}

function localOcrSourceMap(input: ParserInput, result: ParserStageResult): DocumentSourceMap | undefined {
  try {
    return parseDocumentSourceMap({
      artifactId: input.artifactId,
      contentHash: input.contentHash,
      parser: metadataCopy(result.parser),
      pages: result.pages.map((page) => ({
        page: page.page,
        width: page.width,
        height: page.height,
        blocks: page.blocks.map((block, index): DocumentBlock => ({
          id: `block:local-ocr:${input.contentHash}:${page.page}:${index + 1}`,
          kind: block.kind,
          ...(block.text === undefined ? {} : { text: block.text }),
          boundingBox: { ...block.boundingBox },
          ...(block.confidence === undefined ? {} : { confidence: block.confidence }),
          parser: metadataCopy(result.parser),
          transformations: [{ stage: 'ocr', processor: metadataCopy(result.parser) }],
        })),
      })),
    });
  } catch {
    return undefined;
  }
}

function unresolvedPages(sourceMap: DocumentSourceMap): Array<StagePage & { reason: OcrSelectionReason }> {
  return stagePages(sourceMap).flatMap((page) => {
    const assessment = assessPageQuality(page);
    if (!assessment.localOcrRequired && !assessment.llmCandidateReason) return [];
    return [{ ...page, reason: assessment.llmCandidateReason ?? 'low_confidence' }];
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export async function runParserCascade(
  input: ParserInput,
  context: CascadeContext,
): Promise<ExtractionResult<DocumentSourceMap>> {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let current = emptySourceMap(input);
  let localStageSucceeded = false;

  try {
    const extracted = await runDocumentParser(input, context.adapters.extractText);
    if (extracted.status === 'blocked') return extracted;
    if (extracted.status === 'failed') {
      reasons.push('extract_text failed');
    } else {
      const stamped = withOrchestratorMetadata(extracted.sourceMap);
      if (!stamped) reasons.push('critical locator could not round-trip');
      else {
        current = stamped;
        localStageSucceeded = current.pages.some((page) => page.blocks.length > 0);
      }
      if (extracted.status === 'needs_review') reasons.push(...extracted.reasons);
      else warnings.push(...extracted.warnings);
    }
  } catch {
    reasons.push('extract_text failed');
  }

  if (context.featureFlags.detectLayout && context.adapters.detectLayout) {
    try {
      const layout = await runDocumentParser(input, context.adapters.detectLayout);
      if (layout.status === 'blocked') return layout;
      if (layout.status === 'failed') reasons.push('detect_layout failed');
      else {
        const merged = mergeDeterministicMaps(current, layout.sourceMap);
        if (!merged) reasons.push('critical locator could not round-trip');
        else {
          current = merged;
          localStageSucceeded ||= layout.sourceMap.pages.some((page) => page.blocks.length > 0);
        }
        if (layout.status === 'needs_review') reasons.push(...layout.reasons);
        else warnings.push(...layout.warnings);
      }
    } catch {
      reasons.push('detect_layout failed');
    }
  }

  if (context.featureFlags.grobid && context.adapters.grobid) {
    try {
      const result = await context.adapters.grobid(input);
      const enriched = enrichWithGrobid(current, result);
      if (result.status === 'failed') warnings.push(`grobid ${result.errorCode}`);
      else {
        current = withOrchestratorMetadata(enriched) ?? current;
        localStageSucceeded ||= current.pages.some((page) => page.blocks.length > 0);
      }
    } catch {
      warnings.push('grobid unavailable');
    }
  }

  const initialUnresolved = unresolvedPages(current);
  const locallyResolved = new Set<number>();
  if (context.featureFlags.localOcr && context.adapters.localOcr && initialUnresolved.length > 0) {
    const selected = initialUnresolved.slice(0, 4);
    try {
      const result = await ocrSelectedPages(input, selected, context.adapters.localOcr);
      for (const page of result.pages) if (page.blocks.length > 0) locallyResolved.add(page.page);
      const localMap = localOcrSourceMap(input, result);
      const merged = localMap ? mergeDeterministicMaps(current, localMap) : undefined;
      if (!merged) reasons.push('critical locator could not round-trip');
      else current = merged;
      localStageSucceeded ||= locallyResolved.size > 0;
      warnings.push(...result.warnings);
    } catch {
      reasons.push('local_ocr failed');
    }
  }

  let remaining = initialUnresolved.filter(({ page }) => !locallyResolved.has(page));
  if (context.featureFlags.llmOcr && remaining.length > 0 && context.adapters.localOcr) {
    const selected = remaining.slice(0, 4);
    try {
      const rasters = await context.adapters.localOcr.renderPdfPages(input, selected.map(({ page }) => page));
      const reasonsByPage = new Map(selected.map((page) => [page.page, page.reason]));
      const candidates: LlmOcrCandidatePage[] = rasters.map((raster) => ({
        ...raster,
        selectionReason: reasonsByPage.get(raster.pageNumber) ?? 'low_confidence',
      }));
      const fallback = await runLlmOcrFallback(input, current, candidates, {
        aiGateway: context.aiGateway,
        enabled: context.featureFlags.llmOcr,
        externalProcessingEligible: context.externalProcessingEligible,
        trustedAuthorizationContext: context.trustedAuthorizationContext,
      });
      current = fallback.sourceMap;
      warnings.push(...fallback.warnings);
      const unresolvedSet = new Set(fallback.unresolvedPageNumbers);
      const rastered = new Set(candidates.map(({ pageNumber }) => pageNumber));
      remaining = [
        ...selected.filter(({ page }) => !rastered.has(page) || unresolvedSet.has(page)),
        ...remaining.slice(4),
      ];
    } catch {
      warnings.push('llm OCR unavailable');
    }
  }

  if (!localStageSucceeded) reasons.push('all local parser stages failed');
  if (remaining.length > 0) reasons.push('unresolved pages remain');
  const sourceMap = withOrchestratorMetadata(current) ?? emptySourceMap(input);
  const finalReasons = uniqueStrings(reasons);
  return finalReasons.length > 0
    ? { status: 'needs_review', sourceMap, reasons: finalReasons }
    : { status: 'succeeded', sourceMap, warnings: uniqueStrings(warnings) };
}
