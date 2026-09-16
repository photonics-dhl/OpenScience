/**
 * Presentation figure-audit handler.
 *
 * New agent task kind `presentation.figure-audit`. The client submits the task
 * with payload `{ researchObjectId, versionId, presentationStyle?, paperSummary? }`
 * and the handler:
 *
 *  1. Reads the RO/version's reviewed evidence records (extractionStatus=succeeded),
 *     building a list of passages with id/pageStart/text.
 *  2. Extracts `Fig. N` references from the passages and feeds them to the
 *     figure auditor (the LLM is the auditor; it labels each figure with
 *     reuse / re-render / abstract / skip and an optional styleId).
 *  3. Stores the resulting FigurePlan into task.result so the API and the web
 *     client can display it without a follow-up round-trip.
 */
import type { Prisma } from '@prisma/client';
import type { AiGateway } from '@openscience/ai-gateway';
import type { TaskHandler } from '../index';
import { auditPaperFigures, type ExtractedFigureReference } from '../skills/figure-list';

const MAX_FIGURE_AUDIT_RESULT_CHARS = 8000;

interface FigureAuditPayload {
  researchObjectId: string;
  versionId: string;
  presentationStyle?: string;
  paperSummary?: string;
}

interface FigureAuditResult {
  figures: ExtractedFigureReference[];
  figurePlan: { figures: Array<{ id: string; decision: 'reuse' | 're-render' | 'abstract' | 'skip'; styleId?: string; caption?: string }> };
  style: string;
}

export function createPresentationFigureAuditHandler(gateway: Pick<AiGateway, 'completeStructured'>): TaskHandler {
  return async (deps, task) => {
    const payload = parseFigureAuditPayload(task.payload);
    const session = await deps.prisma.agentTask.findUnique({ where: { id: task.id }, include: { session: true } });
    if (!session || session.session.userId == null) throw new Error('[blocked] Figure audit task authority is invalid');
    if (session.session.researchObjectId !== payload.researchObjectId) {
      throw new Error('[blocked] Figure audit task scope does not match the session');
    }
    const passages = await readReviewedPassages(deps.prisma, payload);
    const paperTitle = (await deps.prisma.researchObject.findUnique({ where: { id: payload.researchObjectId }, select: { title: true } }))?.title ?? payload.researchObjectId;
    const style = payload.presentationStyle ?? 'scientific';
    const plan = passages.length === 0 ? { figures: [] } : await auditPaperFigures(gateway, {
      paperTitle,
      ...(payload.paperSummary ? { paperSummary: payload.paperSummary } : {}),
      passages,
      presentationStyle: style,
    });
    const extracted = extractFromPassages(passages);
    const result: FigureAuditResult = { figures: extracted, figurePlan: plan, style };
    const json = JSON.stringify(result);
    if (json.length > MAX_FIGURE_AUDIT_RESULT_CHARS) throw new Error('Figure audit result exceeds the response budget; narrow the paper scope');
    return { result };
  };
}

async function readReviewedPassages(prisma: Pick<Prisma.TransactionClient, 'evidenceRecord'>, scope: FigureAuditPayload): Promise<Array<{ id: string; pageStart: number; text: string }>> {
  // Read every reviewed evidence row in the version. We don't constrain to a
  // particular claim set because the figure audit is paper-wide.
  const rows = await prisma.evidenceRecord.findMany({ where: {
    researchObjectId: scope.researchObjectId, versionId: scope.versionId,
    extractionStatus: 'succeeded', exactQuote: { not: null },
  }, orderBy: [{ id: 'asc' }], take: 200 });
  const out: Array<{ id: string; pageStart: number; text: string }> = [];
  for (const row of rows) {
    const text = row.exactQuote?.trim();
    if (!text) continue;
    out.push({ id: row.id, pageStart: 1, text });
  }
  return out;
}

function parseFigureAuditPayload(payload: unknown): FigureAuditPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('[blocked] Figure audit payload must be an object');
  const p = payload as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof p.researchObjectId !== 'string' || !uuid.test(p.researchObjectId)) throw new Error('[blocked] researchObjectId is required');
  if (typeof p.versionId !== 'string' || !uuid.test(p.versionId)) throw new Error('[blocked] versionId is required');
  if (p.presentationStyle !== undefined && (typeof p.presentationStyle !== 'string' || p.presentationStyle.length > 100)) throw new Error('[blocked] presentationStyle must be a string up to 100 characters');
  if (p.paperSummary !== undefined && (typeof p.paperSummary !== 'string' || p.paperSummary.length > 2_000)) throw new Error('[blocked] paperSummary must be a string up to 2000 characters');
  return {
    researchObjectId: p.researchObjectId,
    versionId: p.versionId,
    ...(p.presentationStyle ? { presentationStyle: p.presentationStyle as string } : {}),
    ...(p.paperSummary ? { paperSummary: p.paperSummary as string } : {}),
  };
}

const FIGURE_RE = /\b(?:Fig(?:\.|ure)?\.?|图|圖)\s*([A-Z]?\d+[A-Z]?)(?:\s*\(([A-Z])\))?/gu;
function extractFromPassages(passages: Array<{ id: string; pageStart: number; text: string }>): ExtractedFigureReference[] {
  const seen = new Map<string, ExtractedFigureReference>();
  for (const passage of passages) {
    for (const m of passage.text.matchAll(FIGURE_RE)) {
      const key = `Fig. ${m[1]!}`;
      if (seen.has(key)) continue;
      const idx = m.index ?? 0;
      const lineEnd = passage.text.indexOf('\n', idx);
      const line = (lineEnd === -1 ? passage.text.slice(idx) : passage.text.slice(idx, lineEnd)).trim();
      seen.set(key, { id: key, caption: line.length > 0 ? line.slice(0, 280) : undefined, pageNumber: passage.pageStart });
    }
  }
  return [...seen.values()].slice(0, 12);
}
