import { PresentationAssetError } from './errors';

/** Science and art share the existing image visual-action budget, including headings and separators. */
export const ILLUSTRATION_BRIEF_MAX_CHARACTERS = 4000;

interface IllustrationBriefFields {
  message: string;
  domain: 'real-space' | 'wavevector-space' | 'time' | 'frequency' | 'parameter-space' | 'conceptual';
  subjects: Array<{ description: string; basis: { claimId: string; evidenceId: string; quote: string } }>;
  composition: string;
  treatment: string;
  labels: string[];
  constraints: string[];
}
// Legacy briefs remain readable without rewriting stored assets or their hashes.
export type IllustrationBrief = IllustrationBriefFields & (
  { schemaVersion: 1 } | { schemaVersion: 2; encoding: string }
);
export function parseIllustrationBrief(value: unknown, claimIds?: readonly string[]): IllustrationBrief {
  const fail = (field: string, reason: string): never => {
    // Callers supply only fixed schema paths and numeric bounds, never document text.
    throw new PresentationAssetError('VALIDATION_ERROR', `illustration_brief:${field}:${reason}`);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('root', 'object_required');
  const v = value as Record<string, unknown>;
  const expectedKeys = v.schemaVersion === 2
    ? 'composition,constraints,domain,encoding,labels,message,schemaVersion,subjects,treatment'
    : 'composition,constraints,domain,labels,message,schemaVersion,subjects,treatment';
  if (Object.keys(v).sort().join(',') !== expectedKeys || (v.schemaVersion !== 1 && v.schemaVersion !== 2)) return fail('root', 'keys_or_schema_version');
  if (!['real-space', 'wavevector-space', 'time', 'frequency', 'parameter-space', 'conceptual'].includes(String(v.domain))) {
    return fail('domain', 'expected_real-space,wavevector-space,time,frequency,parameter-space,conceptual');
  }
  const line = (input: unknown, max: number, field: string): string => {
    if (typeof input !== 'string') return fail(field, 'string_required');
    if (!input.trim()) return fail(field, 'nonempty_required');
    if (input.length > max) return fail(field, `length_${input.length}_max_${max}`);
    if (/[\u0000-\u001f]/.test(input)) return fail(field, 'single_line_no_control_characters');
    return input.trim();
  };
  const list = (input: unknown, min: number, max: number, length: number, field: string): string[] => {
    if (!Array.isArray(input)) return fail(field, 'array_required');
    if (input.length < min || input.length > max) return fail(field, `count_${input.length}_min_${min}_max_${max}`);
    return input.map((item, index) => line(item, length, `${field}_${index}`));
  };
  if (!Array.isArray(v.subjects) || v.subjects.length < 1 || v.subjects.length > 4) return fail('subjects', 'array_count_1_to_4');
  const subjects = v.subjects.map((raw, index) => {
    const field = `subjects_${index}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== 'basis,description') return fail(field, 'expected_basis,description');
    const b = raw.basis;
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).sort().join(',') !== 'claimId,evidenceId,quote') return fail(`${field}_basis`, 'expected_claimId,evidenceId,quote');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof b.claimId !== 'string' || !uuid.test(b.claimId) || (claimIds && !claimIds.includes(b.claimId))
      || typeof b.evidenceId !== 'string' || !uuid.test(b.evidenceId)
      || typeof b.quote !== 'string' || b.quote.trim().length < 12 || b.quote.length > 12000) return fail(`${field}_basis`, 'invalid_bound_source');
    return { description: line(raw.description, ILLUSTRATION_BRIEF_MAX_CHARACTERS, `${field}_description`), basis: { claimId: b.claimId, evidenceId: b.evidenceId, quote: b.quote } };
  });
  if (!Array.isArray(v.labels)) return fail('labels', 'array_required');
  const fields: IllustrationBriefFields = { message: line(v.message, ILLUSTRATION_BRIEF_MAX_CHARACTERS, 'message'), domain: v.domain as IllustrationBrief['domain'],
    subjects, composition: line(v.composition, ILLUSTRATION_BRIEF_MAX_CHARACTERS, 'composition'), treatment: line(v.treatment, ILLUSTRATION_BRIEF_MAX_CHARACTERS, 'treatment'),
    labels: v.labels.map((label, index) => line(label, 80, `labels_${index}`)), constraints: list(v.constraints, 1, 5, ILLUSTRATION_BRIEF_MAX_CHARACTERS, 'constraints') };
  const brief: IllustrationBrief = v.schemaVersion === 2
    ? { schemaVersion: 2, ...fields, encoding: line(v.encoding, ILLUSTRATION_BRIEF_MAX_CHARACTERS, 'encoding') }
    : { schemaVersion: 1, ...fields };
  describeIllustrationBrief(brief);
  return brief;
}

/** One representation shared by plan review and image compilation. */
export function describeIllustrationBrief(brief: IllustrationBrief): string {
  const description = `核心关系：${brief.message}。科学域：${brief.domain}。对象：${brief.subjects.map(subject => subject.description).join('；')}。${brief.schemaVersion === 2 ? `科学编码：${brief.encoding}。` : ''}构图：${brief.composition}。视觉处理：${brief.treatment}。可见标签：${brief.labels.length ? brief.labels.join('；') : '无'}。科学限定：${brief.constraints.join('；')}。`;
  if (description.length > ILLUSTRATION_BRIEF_MAX_CHARACTERS) throw new PresentationAssetError('VALIDATION_ERROR',
    `illustration_brief:description:length_${description.length}_max_${ILLUSTRATION_BRIEF_MAX_CHARACTERS}`);
  return description;
}

export function requireIllustrationSourceSupport(brief: IllustrationBrief, claims: readonly {
  id: string; sourcePassages?: readonly { evidenceId: string; text: string }[];
}[], paperOriginals?: ReadonlyMap<string, { assetId: string; objectKey: string; contentHash: string }>): void {
  for (const subject of brief.subjects) {
    const b = subject.basis;
    // Paper-original bound sources anchor to a registered paper_original_figure
    // asset, not a reviewed passage. The asset was registered as user evidence
    // and the figurePlan's caption identifies it; downstream source support
    // for paper-original scenes is the asset's provenance itself.
    if (paperOriginals && Array.from(paperOriginals.values()).some((ref) => ref.assetId === b.evidenceId)) continue;
    if (!claims.find(claim => claim.id === b.claimId)?.sourcePassages?.some(passage => passage.evidenceId === b.evidenceId && passage.text.includes(b.quote))) {
      throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'illustration_brief:original_passage_changed');
    }
  }
}
