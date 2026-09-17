import { PresentationAssetError } from './errors';

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
    return { description: line(raw.description, 140, `${field}_description`), basis: { claimId: b.claimId, evidenceId: b.evidenceId, quote: b.quote } };
  });
  const fields: IllustrationBriefFields = { message: line(v.message, 120, 'message'), domain: v.domain as IllustrationBrief['domain'],
    subjects, composition: line(v.composition, v.schemaVersion === 2 ? 200 : 400, 'composition'), treatment: line(v.treatment, 240, 'treatment'),
    labels: list(v.labels, 0, 8, 80, 'labels'), constraints: list(v.constraints, 1, 5, 120, 'constraints') };
  return v.schemaVersion === 2
    ? { schemaVersion: 2, ...fields, encoding: line(v.encoding, 200, 'encoding') }
    : { schemaVersion: 1, ...fields };
}

/** One representation shared by plan review and image compilation. */
export function describeIllustrationBrief(brief: IllustrationBrief): string {
  return `核心关系：${brief.message}。科学域：${brief.domain}。对象：${brief.subjects.map(subject => subject.description).join('；')}。${brief.schemaVersion === 2 ? `科学编码：${brief.encoding}。` : ''}构图：${brief.composition}。视觉处理：${brief.treatment}。可见标签：${brief.labels.length ? brief.labels.join('；') : '无'}。科学限定：${brief.constraints.join('；')}。`;
}

export function requireIllustrationSourceSupport(brief: IllustrationBrief, claims: readonly {
  id: string; sourcePassages?: readonly { evidenceId: string; text: string }[];
}[]): void {
  for (const subject of brief.subjects) {
    const b = subject.basis;
    if (!claims.find(claim => claim.id === b.claimId)?.sourcePassages?.some(passage => passage.evidenceId === b.evidenceId && passage.text.includes(b.quote))) {
      throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'illustration_brief:original_passage_changed');
    }
  }
}
