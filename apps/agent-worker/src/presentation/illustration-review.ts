import { createHash } from 'node:crypto';
import { SCIENCE_REVIEW_MAX_PROMPT_CHARS, type AiGateway, type ScienceReviewInput } from '@openscience/ai-gateway';
import { describeIllustrationBrief, parseIllustrationBrief, parseStoryboardDocument, requireIllustrationSourceSupport, type StoryboardDocument, type StoryboardRequest } from '@openscience/domain';
import type { PresentationClaim } from './chart-generator';
import { compileIllustrationImagePrompt } from './scene-image';
import { loadInstalledMediaSkills } from '../skills/installed-media-skills';

type ReviewContext = Pick<ScienceReviewInput, 'authorizationContext' | 'illustrationContext'> & {
  researchObjectId: string; versionId: string; sourceEvidenceIdentity: string;
  structuredIssues?: boolean;
};
export type IllustrationReviewIssue = {
  id: string; sceneIndex: number; labelIndex: number | null;
  kind: 'label_clarification' | 'requires_replan'; requiredMeaning: string;
  sources: { claimId: string; evidenceId: string }[];
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('[blocked] Invalid illustration review object');
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, expected: string[]) => {
  if (Object.keys(value).sort().join(',') !== expected.sort().join(',')) throw new Error('[blocked] Invalid illustration review fields');
};

function readIssues(value: unknown, candidate: StoryboardDocument,
  sources: readonly { claimId: string; evidenceId: string }[]): IllustrationReviewIssue[] {
  if (!Array.isArray(value) || !value.length || value.length > 36) throw new Error('[blocked] Invalid scientific review issues');
  const targets = new Set<string>();
  return value.map((raw, index) => {
    const issue = object(raw);
    keys(issue, ['sceneIndex', 'labelIndex', 'kind', 'requiredMeaning', 'sourceIds']);
    const { sceneIndex, labelIndex, kind, requiredMeaning, sourceIds } = issue;
    if (typeof sceneIndex !== 'number' || !Number.isInteger(sceneIndex) || !candidate.scenes[sceneIndex]
      || (kind !== 'label_clarification' && kind !== 'requires_replan')
      || typeof requiredMeaning !== 'string' || !requiredMeaning.trim() || requiredMeaning.length > 500
      || !Array.isArray(sourceIds) || sourceIds.length > 8 || new Set(sourceIds).size !== sourceIds.length) {
      throw new Error('[blocked] Invalid scientific review issue');
    }
    if (kind === 'label_clarification') {
      const target = `${sceneIndex}:${labelIndex}`;
      if (typeof labelIndex !== 'number' || !Number.isInteger(labelIndex)
        || typeof candidate.scenes[sceneIndex]!.illustration?.labels[labelIndex] !== 'string'
        || targets.has(target) || !sourceIds.length) throw new Error('[blocked] Invalid review label target');
      targets.add(target);
    } else if (labelIndex !== null) throw new Error('[blocked] Replanning issue must not claim a label repair');
    const basis = sourceIds.map(id => {
      if (typeof id !== 'string' || !/^s(?:0|[1-9]\d*)$/u.test(id)) throw new Error('[blocked] Invalid review issue source');
      const source = sources[Number(id.slice(1))];
      if (!source) throw new Error('[blocked] Review issue source unavailable');
      return { claimId: source.claimId, evidenceId: source.evidenceId };
    });
    return { id: `issue-${index + 1}`, sceneIndex, labelIndex: labelIndex as number | null, kind, requiredMeaning, sources: basis };
  });
}

/** Reuse the existing review identities, never a new client-supplied issue list. */
export function readStoredIllustrationIssues(raw: unknown, candidate: StoryboardDocument,
  claims: readonly PresentationClaim[], requestId: string, sourceEvidenceIdentity: string): IllustrationReviewIssue[] | undefined {
  if (raw === undefined) return undefined; // Complete legacy feedback remains supported once.
  const saved = object(raw);
  keys(saved, ['stage', 'requestId', 'decision', 'summary', 'candidateHash', 'sourceEvidenceIdentity', 'promptHash', 'responseHash', 'provider', 'issues',
    ...(saved.model === undefined ? [] : ['model'])]);
  if (saved.stage !== 'final-brief' || saved.requestId !== requestId || saved.decision !== 'blocked'
    || (saved.provider !== 'chatgpt-web-science-review' && !(typeof saved.provider === 'string' && /^minimax-key-[1-9]\d*-model-[1-9]\d*$/u.test(saved.provider)))
    || (saved.model !== undefined && (typeof saved.model !== 'string' || !saved.model.trim() || saved.model.length > 200))
    || saved.sourceEvidenceIdentity !== sourceEvidenceIdentity
    || saved.candidateHash !== createHash('sha256').update(JSON.stringify(candidate)).digest('hex')
    || typeof saved.summary !== 'string' || !saved.summary.trim() || saved.summary.length > 6000
    || ![saved.promptHash, saved.responseHash].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash))
    || !Array.isArray(saved.issues)) throw new Error('[blocked] Saved scientific review does not match this plan');
  const sources = claims.flatMap(claim => (claim.sourcePassages ?? []).map(source => ({ claimId: claim.id, evidenceId: source.evidenceId })));
  const input = saved.issues.map((rawIssue, index) => {
    const issue = object(rawIssue);
    keys(issue, ['id', 'sceneIndex', 'labelIndex', 'kind', 'requiredMeaning', 'sources']);
    if (issue.id !== `issue-${index + 1}` || !Array.isArray(issue.sources)) throw new Error('[blocked] Invalid saved issue identity');
    const sourceIds = issue.sources.map(rawSource => {
      const source = object(rawSource); keys(source, ['claimId', 'evidenceId']);
      const i = sources.findIndex(item => item.claimId === source.claimId && item.evidenceId === source.evidenceId);
      if (i < 0) throw new Error('[blocked] Saved review source changed');
      return `s${i}`;
    });
    return { sceneIndex: issue.sceneIndex, labelIndex: issue.labelIndex, kind: issue.kind, requiredMeaning: issue.requiredMeaning, sourceIds };
  });
  return readIssues(input, candidate, sources);
}

/** Review the final scientific meaning, including meanings introduced by artistic layout. */
export async function reviewIllustrationStoryboard(
  gateway: Pick<AiGateway, 'reviewScientific'>,
  claims: readonly PresentationClaim[], settings: StoryboardRequest, candidate: StoryboardDocument, context: ReviewContext,
) {
  // Short-circuit: paper-original-only plans are mechanically deterministic —
  // every scene binds to a registered asset and there is no science to author,
  // no art direction to validate. Skip the chat-review LLM call entirely and
  // accept the plan as-is.
  if (candidate.scenes.length > 0 && candidate.scenes.every(scene => scene.paperOriginal)) {
    return {
      document: candidate,
      decision: 'accepted' as const,
      summary: 'All scenes are bound to registered paper-original figures; no scientific review needed.',
      issues: [],
      designSkills: [],
      provenance: {
        stage: 'final-brief',
        requestId: context.authorizationContext.taskId,
        decision: 'accepted' as const,
        summary: 'All scenes are bound to registered paper-original figures; no scientific review needed.',
        candidateHash: candidate.title,
        sourceEvidenceIdentity: context.sourceEvidenceIdentity,
        promptHash: createHash('sha256').update('paper-original-only').digest('hex'),
        responseHash: createHash('sha256').update('paper-original-only').digest('hex'),
        provider: 'paper-original-skip' as const,
        model: 'paper-original-skip' as const,
      },
    };
  }
  // Imported evidence is field-scoped and often all marked supports. Keep the
  // selected Claims' whole source context: unused passages can carry qualifiers.
  const selectedClaimIds = new Set(candidate.scenes.flatMap(scene => scene.sourceClaimIds));
  const selectedClaims = claims.filter(claim => selectedClaimIds.has(claim.id));
  const sources = selectedClaims.flatMap(claim => (claim.sourcePassages ?? [])
    .map(passage => ({ ...passage, claimId: claim.id })));
  const sourceIds = new Map(sources.map((source, index) => [`${source.claimId}:${source.evidenceId}`, `s${index}`]));
  const candidateView = { title: candidate.title, scenes: candidate.scenes.map(scene => {
    if (scene.illustration?.schemaVersion !== 2) throw new Error('[blocked] Illustration review requires separate science and layout');
    // Paper-original scenes anchor their source to a registered asset, not a
    // reviewed passage; the chat-review's source-support and supports-evidence
    // checks do not apply (the asset registration itself is the evidence).
    if (!scene.paperOriginal) {
      requireIllustrationSourceSupport(scene.illustration, claims);
      if (scene.illustration.subjects.some(subject => !sources.some(source => source.claimId === subject.basis.claimId
        && source.evidenceId === subject.basis.evidenceId && source.relation === 'supports'))) {
        throw new Error('[blocked] Illustration subject lacks supporting evidence');
      }
    }
    const { schemaVersion: _schemaVersion, ...brief } = scene.illustration;
    return { title: scene.title, narration: scene.narration, ...brief,
      // For paper-original scenes, basis.evidenceId is the registered asset id
      // (not a source passage), so sourceId is undefined — that's fine: the
      // LLM only sees the paper-original binding and skips review of support.
      subjects: brief.subjects.map(subject => ({
        description: subject.description,
        basis: {
          sourceId: scene.paperOriginal
            ? `paper_original:${scene.paperOriginal.assetId}`
            : sourceIds.get(`${subject.basis.claimId}:${subject.basis.evidenceId}`),
        },
      })) };
  }) };
  const candidateHash = createHash('sha256').update(JSON.stringify(candidate)).digest('hex');
  const reviewSkills = loadInstalledMediaSkills(settings.style, settings.instruction, 'review');
  const prompt = `Apply the shared scientific-critical-thinking skill below to the FINAL proposed research illustration. Use only the supplied analysis and original evidence; do not browse or operate tools. The image-specific task is to check what every axis, distance, color, region, arrow and curve communicates, including meaning introduced by composition and treatment. Decorative placement must not invent quantitative behavior or physical relationships.
Choose accepted only if the complete picture faithfully explains the supplied selected relationship. Science is carried in message/domain/subjects/encoding/labels/constraints plus title/narration; it is not yours to rewrite or replace. If any of those fields needs correction, or a different focus or source is necessary, return blocked and identify the exact scene, field, source and problem for upstream correction. Do not invent missing evidence or use a style reference as scientific authority.
If only artistic placement or treatment introduced a misleading meaning, return revised with a minimal correction to that scene's composition or treatment. Preserve scene order/count, all scientific fields and unaffected artwork. Composition chooses placement, focal scale, reading path and spacing; treatment chooses material, palette, edges and typography. Neither may add a new scientific mark, label, relationship or condition. Refer to existing subjects, encoding and labels. Do not reselect a topic, rewrite a complete storyboard or add another review stage.
In this same review, also compare the candidate composition/treatment with userRequest. A material mismatch with an explicit art direction, background, layout, texture or typography request warrants revised using those same correction fields. Preserve every scientific field and only art aspects explicitly accepted by the user; scientific approval is not aesthetic acceptance. Resolve objective instruction mismatches, not subjective taste. Conformance does not certify visual quality or user approval; never add another review stage or change science for decoration.
Return ONLY JSON with EXACT keys {decision,summary,corrections}. decision is accepted|revised|blocked; summary is a concise explanation in the requested locale. For accepted or blocked, corrections MUST be []. For revised, corrections is a nonempty list of {sceneIndex,composition?,treatment?}; each existing zero-based sceneIndex appears once, with at least one changed field and no other keys. composition:nonempty single-line string<=200; treatment:nonempty single-line string<=220. No HTML or code. Keep corrections concise and in the requested locale. The final drawing instructions including unchanged scientific fields must fit 1500 characters; never shorten science to fit art. SourceIds and review notes are internal and are not drawn. Perform this focused audit yourself.
${reviewSkills.instructions}
${JSON.stringify({ locale: settings.locale, userRequest: settings.instruction, style: settings.style,
    upstream: selectedClaims.map(claim => ({ claimId: claim.id, parentClaimId: claim.parentClaimId ?? null, kind: claim.kind, assessment: claim.assessment, analysis: claim.statement,
      conditions: claim.conditions, limitations: claim.limitations,
      sourceIds: (claim.sourcePassages ?? []).map(passage => sourceIds.get(`${claim.id}:${passage.evidenceId}`)) })),
    sources: sources.map((source, index) => ({ sourceId: `s${index}`, text: source.text, relation: source.relation })), candidate: candidateView })}`;
  const requestPrompt = context.structuredIssues ? prompt
    .replace('EXACT keys {decision,summary,corrections}', 'EXACT keys {decision,summary,corrections,issues}')
    .replace('Perform this focused audit yourself.', `Perform this focused audit yourself. issues MUST be [] for accepted/revised. For blocked, list ALL independent scientific issues together (1-36), each exactly {sceneIndex,labelIndex,kind,requiredMeaning,sourceIds}. sceneIndex refers to an existing zero-based scene. kind is label_clarification only when prepending/appending a short explanation to an existing label can fully resolve it without changing its existing symbols, equations, meaning or any other science/art field. Use that existing zero-based labelIndex and 1-8 exact supplied sourceIds. Combine all missing meanings for the same label into one issue; do not repeat label targets. If a definition repeated in multiple labels only needs one visible explanation, select one target. requiredMeaning is a precise complete description <=500 characters in the requested locale. For changes requiring any other field, new label/axis, different source or formula, use kind requires_replan and labelIndex:null; sourceIds may be [] only when the problem is missing evidence. Do not mistake successful JSON or mere presence of a symbol for completion of its required meaning.`) : prompt;
  if (requestPrompt.length > SCIENCE_REVIEW_MAX_PROMPT_CHARS) throw new Error('[blocked] Illustration review sources exceed the input budget; select fewer Claims');
  const validReview = (value: unknown): value is Record<string, unknown> => {
    try { parseIllustrationReview(value, candidate, claims, sources, context.structuredIssues); return true; }
    catch { return false; }
  };
  const response = await gateway.reviewScientific({ requestId: context.authorizationContext.taskId,
    authorizationContext: context.authorizationContext, illustrationContext: context.illustrationContext,
    source: { kind: 'illustration-plan', researchObjectId: context.researchObjectId, versionId: context.versionId,
      sourceEvidenceIdentity: context.sourceEvidenceIdentity, candidateHash }, prompt: requestPrompt }, validReview);
  const { document, decision, summary, issues } = parseIllustrationReview(
    JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')), candidate, claims, sources, context.structuredIssues);
  if (decision === 'blocked' && !context.structuredIssues) throw new Error('[blocked] Illustration needs upstream scientific revision: ' + summary.slice(0, 300));
  return { document, designSkills: reviewSkills.usage, provenance: { stage: 'final-brief', requestId: context.authorizationContext.taskId,
    decision, summary, candidateHash, sourceEvidenceIdentity: context.sourceEvidenceIdentity,
    promptHash: response.promptHash, responseHash: response.responseHash, provider: response.provider ?? 'chatgpt-web-science-review',
    ...(response.model ? { model: response.model } : {}), ...(issues ? { issues } : {}) } };
}

function parseIllustrationReview(value: unknown, candidate: StoryboardDocument, claims: readonly PresentationClaim[],
  sources: readonly { claimId: string; evidenceId: string }[], structuredIssues?: boolean) {
  const review = object(value);
  keys(review, structuredIssues ? ['decision', 'summary', 'corrections', 'issues'] : ['decision', 'summary', 'corrections']);
  const decision = review.decision;
  if ((decision !== 'accepted' && decision !== 'revised' && decision !== 'blocked')
    || typeof review.summary !== 'string' || !review.summary.trim() || review.summary.length > 6000) {
    throw new Error('[blocked] Invalid scientific review decision');
  }
  if (!Array.isArray(review.corrections) || review.corrections.length > candidate.scenes.length
    || (decision !== 'revised' && review.corrections.length !== 0)) throw new Error('[blocked] Invalid scientific review corrections');
  let issues: IllustrationReviewIssue[] | undefined;
  if (structuredIssues) {
    if (decision === 'blocked') issues = readIssues(review.issues, candidate, sources);
    else if (!Array.isArray(review.issues) || review.issues.length) throw new Error('[blocked] Unresolved scientific review issues');
    else issues = [];
  }
  let document = candidate;
  if (decision === 'revised') {
    if (!review.corrections.length) throw new Error('[blocked] Revised review requires an actual correction');
    const scenes = [...candidate.scenes];
    const patched = new Set<number>();
    for (const raw of review.corrections) {
      const correction = object(raw);
      const index = correction.sceneIndex;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= scenes.length || patched.has(index)
        || Object.keys(correction).some(key => !['sceneIndex', 'composition', 'treatment'].includes(key))
        || (!('composition' in correction) && !('treatment' in correction))) throw new Error('[blocked] Invalid scene correction');
      const scene = scenes[index]!;
      const illustration = parseIllustrationBrief({ ...scene.illustration!,
        ...('composition' in correction ? { composition: correction.composition } : {}),
        ...('treatment' in correction ? { treatment: correction.treatment } : {}) }, scene.sourceClaimIds);
      if (illustration.treatment.length > 220 || (illustration.composition === scene.illustration!.composition
        && illustration.treatment === scene.illustration!.treatment)) throw new Error('[blocked] Invalid or unchanged art correction');
      scenes[index] = { ...scene, illustration, visualAction: describeIllustrationBrief(illustration) };
      patched.add(index);
    }
    document = parseStoryboardDocument({ ...candidate, scenes }, claims.map(claim => claim.id), 'image');
  }
  for (const scene of document.scenes) {
    if (!scene.paperOriginal) requireIllustrationSourceSupport(scene.illustration!, claims);
    compileIllustrationImagePrompt(scene.illustration!);
  }
  return { document, decision, summary: review.summary, issues };
}
