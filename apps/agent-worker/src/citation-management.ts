import {
  createBlockSourceLocator,
  type DocumentSourceMap,
  type SourceLocator,
  type WorkspaceWritingCitation,
} from '@openscience/domain';

export interface WritingSourceExcerpt {
  id: string;
  text: string;
  sourceLocator: SourceLocator;
  range: { start: number; end: number; total: number };
}

export interface WritingSourcePacket {
  excerpts: WritingSourceExcerpt[];
  coverage: {
    complete: boolean;
    selectedCharacters: number;
    totalCharacters: number;
    omittedSegments: number;
  };
}

const MAX_SOURCE_PACKET_CHARACTERS = 48_000;
const MAX_EXCERPT_CHARACTERS = 1_600;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function preferredBlockIds(extractionResult: unknown): Set<string> {
  const ids = new Set<string>();
  const segments = record(extractionResult).evidenceSegments;
  if (!segments || typeof segments !== 'object' || Array.isArray(segments)) return ids;
  for (const values of Object.values(segments as Record<string, unknown>)) {
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const locator = record(record(value).sourceLocator);
      if (typeof locator.blockId === 'string') ids.add(locator.blockId);
    }
  }
  return ids;
}

/** Build a bounded model packet from server-owned parser output. IDs and locators never come from the model. */
export function createWritingSourcePacket(
  sourceMap: DocumentSourceMap,
  extractionResult: unknown,
): WritingSourcePacket {
  const preferred = preferredBlockIds(extractionResult);
  const blocks = sourceMap.pages.flatMap((page) => page.blocks.map((block) => ({ page: page.page, block })))
    .filter(({ block }) => typeof block.text === 'string' && block.text.trim().length > 0);
  const ordered = [...blocks].sort((left, right) => {
    const leftPriority = preferred.has(left.block.id) ? 0 : left.block.kind === 'heading' ? 1 : left.block.kind === 'reference' ? 3 : 2;
    const rightPriority = preferred.has(right.block.id) ? 0 : right.block.kind === 'heading' ? 1 : right.block.kind === 'reference' ? 3 : 2;
    return leftPriority - rightPriority || left.page - right.page;
  });
  const segments = ordered.flatMap(({ block }) => splitBlockAtBoundaries(block.text!).map((range) => ({ block, ...range })));
  const selected: WritingSourceExcerpt[] = [];
  let characters = 0;
  let omittedSegments = 0;
  for (const { block, text, start, end } of segments) {
    if (characters + text.length > MAX_SOURCE_PACKET_CHARACTERS) {
      omittedSegments += 1;
      continue;
    }
    const id = 'S' + (selected.length + 1);
    selected.push({
      id,
      text,
      sourceLocator: createBlockSourceLocator(sourceMap, block.id, { charRange: { start, end } }),
      range: { start, end, total: block.text!.length },
    });
    characters += text.length;
  }
  return {
    excerpts: selected,
    coverage: {
      complete: omittedSegments === 0,
      selectedCharacters: characters,
      totalCharacters: segments.reduce((sum, segment) => sum + segment.text.length, 0),
      omittedSegments,
    },
  };
}

function splitBlockAtBoundaries(text: string): Array<{ text: string; start: number; end: number }> {
  const segments: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + MAX_EXCERPT_CHARACTERS);
    if (end < text.length) {
      const window = text.slice(start, end);
      const minimum = Math.floor(window.length * 0.55);
      const paragraphMatches = [...window.matchAll(/\n\s*\n/gu)].filter((match) => (match.index ?? 0) >= minimum);
      const sentenceMatches = [...window.matchAll(/[。！？.!?](?:\s|$)/gu)].filter((match) => (match.index ?? 0) >= minimum);
      const boundary = paragraphMatches.at(-1) ?? sentenceMatches.at(-1);
      if (boundary?.index !== undefined) end = start + boundary.index + boundary[0].length;
    }
    const chunk = text.slice(start, end);
    if (chunk.trim()) segments.push({ text: chunk, start, end });
    start = end;
  }
  return segments;
}

/** Convert model-selected server IDs into exact quotes and SourceLocators. */
export function materializeWritingCitations(
  body: string,
  usedSourceIds: readonly string[],
  sources: readonly WritingSourceExcerpt[],
): WorkspaceWritingCitation[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const citations: WorkspaceWritingCitation[] = [];
  for (const id of [...new Set(usedSourceIds)]) {
    const source = byId.get(id);
    if (!source || !body.includes(`[${id}]`)) throw new Error('Scientific writing citation does not resolve to the supplied SourceMap');
    citations.push({ id, marker: `[${id}]`, quote: source.text, sourceLocator: source.sourceLocator });
  }
  if (!citations.length) throw new Error('Scientific writing draft requires at least one real SourceMap citation');
  const markers = [...body.matchAll(/\[(S\d+)\]/gu)].map((match) => match[1]!);
  if (markers.some((id) => !byId.has(id) || !usedSourceIds.includes(id))) {
    throw new Error('Scientific writing draft contains an invented citation marker');
  }
  return citations;
}
