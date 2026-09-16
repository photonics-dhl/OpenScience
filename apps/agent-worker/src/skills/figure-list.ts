/**
 * Figure list extractor — pull a paper's "Fig. N" references out of its reviewed
 * passages, then optionally feed them through the figure auditor. This is the
 * "read the paper → what should the presentation reuse / re-render / abstract / skip"
 * path the user described.
 *
 * The extractor is intentionally cheap: it scans passage text for the standard
 * `Fig. N` / `Figure N(A)` / `图 N` patterns, groups hits by figure id, and picks
 * the first non-empty neighbouring sentence as a tentative caption. The figure
 * auditor (`auditFigures`) then adds a `decision` and an optional `styleId`.
 *
 * This is a first pass — it does not understand figure position, layout, or
 * image content. A real model pass per page (caption extraction, image
 * classification) would supersede it. For now it surfaces the references the
 * paper itself makes, which is the only thing the planner needs to anchor
 * a presentation on.
 */
import type { AiGateway } from '@openscience/ai-gateway';
import { auditFigures, type FigurePlan } from './figure-auditor';

/** Minimal shape the figure-list extractor needs; the extractor keeps the full
 * CanonicalPassage type private, so we declare the contract here. */
export interface ExtractedPassage {
  id: string;
  pageStart: number;
  text: string;
}

export interface ExtractedFigureReference {
  /** Stable id; uses the paper's own `Fig. N` label. */
  id: string;
  /** One-line tentative caption taken from the sentence that mentioned the figure. */
  caption?: string;
  /** First page on which the figure was referenced. */
  pageNumber?: number;
  /** Optional role guessed from verbs and nouns around the reference. */
  role?: 'device' | 'spectrum' | 'flowchart' | 'micrograph' | 'comparison' | 'other';
}

const FIGURE_RE = /\b(?:Fig(?:\.|ure)?\.?|图|圖)\s*([A-Z]?\d+[A-Z]?)(?:\s*\(([A-Z])\))?/gu;
const ROLE_HINTS: Record<string, ExtractedFigureReference['role']> = {
  schematic: 'device', setup: 'device', apparatus: 'device',
  spectrum: 'spectrum', spectra: 'spectrum', dispersion: 'spectrum', band: 'spectrum',
  flow: 'flowchart', algorithm: 'flowchart', pipeline: 'flowchart', tree: 'flowchart',
  micrograph: 'micrograph', image: 'micrograph', photograph: 'micrograph', sem: 'micrograph',
  comparison: 'comparison', versus: 'comparison', vs: 'comparison', tradeoff: 'comparison',
};
const SENTENCE_SPLIT = /(?<=[.!?。！？])\s+/u;

function firstSentence(text: string, startIndex: number): string {
  const end = text.indexOf('\n', startIndex);
  const line = (end === -1 ? text.slice(startIndex) : text.slice(startIndex, end)).trim();
  const split = line.split(SENTENCE_SPLIT);
  return (split[0] || line).replace(/\s+/g, ' ').slice(0, 280);
}

function guessRole(sentence: string): ExtractedFigureReference['role'] {
  const lower = sentence.toLowerCase();
  for (const [key, role] of Object.entries(ROLE_HINTS)) {
    if (lower.includes(key)) return role;
  }
  return 'other';
}

/**
 * Extract a deduplicated list of figure references from the reviewed passages.
 * Cap at 12 figures to keep the auditor's prompt bounded; papers with more
 * figures than that can re-run the auditor on a manually narrowed list.
 */
export function extractFigureReferences(passages: readonly ExtractedPassage[]): ExtractedFigureReference[] {
  const seen = new Map<string, ExtractedFigureReference>();
  for (const passage of passages) {
    for (const match of passage.text.matchAll(FIGURE_RE)) {
      const key = `Fig. ${match[1]!}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        id: key,
        caption: firstSentence(passage.text, match.index ?? 0),
        pageNumber: passage.pageStart,
        role: guessRole(passage.text.slice(Math.max(0, (match.index ?? 0) - 80), match.index ?? 0)),
      });
    }
  }
  return [...seen.values()].slice(0, 12);
}

export interface PaperFigureAuditInput {
  paperTitle: string;
  paperSummary?: string;
  passages: readonly ExtractedPassage[];
  presentationStyle?: string;
}

/**
 * End-to-end paper-level figure audit. Extracts `Fig. N` references from the reviewed
 * passages, then runs the figure auditor over them. The result is a FigurePlan
 * the caller can attach to a StoryboardRequest via `figurePlan`, or persist
 * separately for human review.
 */
export async function auditPaperFigures(gateway: Pick<AiGateway, 'completeStructured'>, input: PaperFigureAuditInput): Promise<FigurePlan> {
  const references = extractFigureReferences(input.passages);
  if (!references.length) return { figures: [] };
  return auditFigures(gateway, {
    paperTitle: input.paperTitle,
    ...(input.paperSummary ? { paperSummary: input.paperSummary } : {}),
    figures: references.map((reference) => ({
      id: reference.id,
      ...(reference.caption ? { caption: reference.caption } : {}),
      ...(reference.role ? { role: reference.role } : {}),
    })),
    ...(input.presentationStyle ? { presentationStyle: input.presentationStyle } : {}),
  });
}
