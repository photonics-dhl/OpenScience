/**
 * Figure auditor — paper-figure lifecycle decisioning.
 *
 * A "figure" in this context is one of the author's own illustrations in the
 * source paper (device schematic, spectrum, flowchart, photograph, etc.) that
 * the user is considering for the OpenScience presentation. The auditor's job
 * is to label each figure with a single decision:
 *
 *   - `reuse`     — the source figure is publication-grade, keep it as-is.
 *   - `re-render` — the source figure is right in intent but should be redrawn
 *                   in the user's current style (e.g. technical / ink-notes).
 *   - `abstract`  — the source figure is too narrow or uses a style we should
 *                   not copy; recast it into a different style.
 *   - `skip`      — the figure does not belong in this presentation.
 *
 * The output is a `FigurePlan` object compatible with `StoryboardRequest['figurePlan']`,
 * so callers can either consume the raw object or attach it to a storyboard
 * request directly. The auditor is a building block — paper-analysis, the Hermes
 * guide, and the workspace guide can all call it to populate `figurePlan`.
 */
import type { AiGateway } from '@openscience/ai-gateway';
import { loadInstalledMediaSkills } from './installed-media-skills';

export type FigureDecision = 'reuse' | 're-render' | 'abstract' | 'skip';
export interface FigurePlanEntry {
  id: string;
  decision: FigureDecision;
  /** When decision is 'abstract' this is the target style id. */
  styleId?: string;
  /** One-line rationale the auditor captured. Surface in the human-facing review. */
  rationale?: string;
}
export interface FigurePlan {
  figures: FigurePlanEntry[];
}
export interface FigureAuditInput {
  /** Title or short identifier of the paper being audited. */
  paperTitle: string;
  /** Optional summary the user provided (abstract, key claims, scope). */
  paperSummary?: string;
  /** Source figure descriptions. Each entry should include the figure number or id. */
  figures: Array<{ id: string; caption?: string; role?: string }>;
  /** The style the current presentation is in (default 'scientific'). */
  presentationStyle?: string;
}

const DECISIONS = new Set<FigureDecision>(['reuse', 're-render', 'abstract', 'skip']);

function isEntry(value: unknown): value is FigurePlanEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id.trim() || e.id.length > 200) return false;
  if (typeof e.decision !== 'string' || !DECISIONS.has(e.decision as FigureDecision)) return false;
  if (e.styleId !== undefined && (typeof e.styleId !== 'string' || !e.styleId.trim() || e.styleId.length > 100)) return false;
  if (e.rationale !== undefined && (typeof e.rationale !== 'string' || e.rationale.length > 280)) return false;
  return true;
}

export function parseFigurePlan(value: unknown): FigurePlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const root = value as { figures?: unknown };
  if (!Array.isArray(root.figures) || root.figures.length < 1 || root.figures.length > 12) return undefined;
  if (!root.figures.every(isEntry)) return undefined;
  return { figures: root.figures as FigurePlanEntry[] };
}

/**
 * Run the figure auditor against a list of source-paper figures. The caller passes
 * the figures (id + caption + optional role) and the auditor labels each one with a
 * single decision. Returns a parsed `FigurePlan`; throws if the model output cannot
 * be coerced into a valid plan after the bounded retry budget.
 */
export async function auditFigures(gateway: Pick<AiGateway, 'completeStructured'>, input: FigureAuditInput): Promise<FigurePlan> {
  const style = input.presentationStyle ?? 'scientific';
  const skills = loadInstalledMediaSkills(style, `audit figures for ${input.paperTitle}`, 'science');
  const system = `You are Hermes auditing the source paper's figures for the OpenScience presentation. Each entry represents one of the author's own illustrations in the paper (device schematic, spectrum, flowchart, photo, etc.). For each, choose a single decision from the four defined below. A figure's id, caption, and (optional) role are sourced verbatim from the user; do not invent identifiers or claims. Reasoning must be brief (one short clause) and the rationale must reference the visible scientific content, not the style choice alone.

Decision semantics:
- reuse: the source figure is publication-grade; keep it as-is, link or import.
- re-render: the source figure is the right concept but should be redrawn in the current style (${style}).
- abstract: the source figure is too narrow or uses a style we should not copy; recast it in a different style and set styleId to that id.
- skip: the figure does not belong in this presentation (off-topic, redundant, or replaceable by text).

Style ids you may use for "abstract" come from the installed catalogue surfaced below. Do not invent style ids.

${skills.instructions}

Return exactly {figures: [{id, decision, optional styleId, optional rationale}]} in the same order as the input, with one entry per supplied figure. id copies the input id verbatim (string, no edits). decision is one of reuse | re-render | abstract | skip. styleId is only present when decision=abstract and must be a real catalogue id from the loaded references. rationale is one short sentence (<=240 chars) justifying the choice; cite the scientific role of the figure, not the style. No other fields. No Markdown or commentary outside the JSON.`;
  const user = JSON.stringify({
    paper: { title: input.paperTitle, ...(input.paperSummary ? { summary: input.paperSummary } : {}) },
    presentationStyle: style,
    figures: input.figures.map((figure) => ({ id: figure.id, ...(figure.caption ? { caption: figure.caption } : {}), ...(figure.role ? { role: figure.role } : {}) })),
  });
  const messages = [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }];
  let diagnostic = 'invalid_figure_plan';
  const plan = await gateway.completeStructured((value): value is { figures: unknown[] } => {
    const parsed = value && typeof value === 'object' ? (value as { figures?: unknown }).figures : undefined;
    if (parseFigurePlan({ figures: parsed }) === undefined) return false;
    return true;
  }, messages, { temperature: 0.2, maxRetries: 2, maxTokens: 4096,
    validationDiagnostic: () => diagnostic.toLowerCase().replace(/[^a-z0-9_,-]+/gu, '_').slice(0, 400),
    validationFeedback: () => `Repair the rejected object: ${diagnostic}. Return exactly {figures:[{id,decision,optional styleId,optional rationale}]}. id copies the input id verbatim, decision is reuse|re-render|abstract|skip, styleId is only present when decision=abstract and must be a catalogue id. No extra fields, no Markdown.` });
  const parsed = parseFigurePlan(plan);
  if (!parsed) throw new Error('Figure auditor returned an unparsable plan');
  return parsed;
}

