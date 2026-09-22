import { createHash } from 'node:crypto';
import { ILLUSTRATION_PLAN_REVIEW_MAX_PROMPT_CHARS, type AiGateway, type ScienceReviewInput } from '@openscience/ai-gateway';
import { ILLUSTRATION_BRIEF_MAX_CHARACTERS, describeIllustrationBrief, parseIllustrationBrief, parseStoryboardDocument, requireIllustrationSourceSupport, storyboardSceneStyles, type StoryboardDocument, type StoryboardRequest } from '@openscience/domain';
import type { PresentationClaim } from './chart-generator';
import { compileIllustrationImagePrompt } from './scene-image';
import { loadIllustrationStyleSkills } from './illustration-styles';
import { projectVisualNarrativeSource, type VisualNarrativeSource } from '../scientific-writing-source';

type ReviewContext = Pick<ScienceReviewInput, 'authorizationContext' | 'illustrationContext'> & {
  researchObjectId: string; versionId: string; sourceEvidenceIdentity: string;
  structuredIssues?: boolean;
  narrativeSource?: VisualNarrativeSource;
  acceptanceOnly?: boolean;
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
      if (candidate.scenes[sceneIndex]!.paperOriginal) throw new Error('[blocked] A verbatim original requires replanning, not generated-label correction');
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
  if (Boolean(settings.narrative) !== Boolean(candidate.narrative) || (candidate.narrative && !context.narrativeSource))
    throw new Error('[blocked] Whole-paper narrative review requires the current paper context and its main message');
  // Short-circuit: paper-original-only plans are mechanically deterministic —
  // every scene binds to a registered asset and there is no science to author,
  // no art direction to validate. Skip the chat-review LLM call entirely and
  // accept the plan as-is.
  if (!candidate.narrative && candidate.scenes.length > 0 && candidate.scenes.every(scene => scene.paperOriginal)) {
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
  const selectedClaims = candidate.narrative ? claims : claims.filter(claim => selectedClaimIds.has(claim.id));
  const sources = selectedClaims.flatMap(claim => (claim.sourcePassages ?? [])
    .map(passage => ({ ...passage, claimId: claim.id })));
  const sourceIds = new Map(sources.map((source, index) => [`${source.claimId}:${source.evidenceId}`, `s${index}`]));
  const candidateView = { title: candidate.title, ...(candidate.narrative ? { narrative: candidate.narrative } : {}), scenes: candidate.scenes.map(scene => {
    if (scene.illustration?.schemaVersion !== 2) throw new Error('[blocked] Illustration review requires separate science and layout');
    // Legacy mechanical reuse has no authored scientific explanation. New narrative
    // captions always require real passages; an uploaded image is not proof of its meaning.
    if (!scene.paperOriginal || candidate.narrative) {
      requireIllustrationSourceSupport(scene.illustration, claims);
      if (scene.illustration.subjects.some(subject => !sources.some(source => source.claimId === subject.basis.claimId
        && source.evidenceId === subject.basis.evidenceId && source.relation === 'supports'))) {
        throw new Error('[blocked] Illustration subject lacks supporting evidence');
      }
    }
    const { schemaVersion: _schemaVersion, ...brief } = scene.illustration;
    return { title: scene.title, narration: scene.narration, ...brief,
      ...(scene.paperOriginal ? { mediaSource: { kind: 'unchanged_paper_original', assetId: scene.paperOriginal.assetId } } : {}),
      // For paper-original scenes, basis.evidenceId is the registered asset id
      // (not a source passage), so sourceId is undefined — that's fine: the
      // LLM only sees the paper-original binding and skips review of support.
      subjects: brief.subjects.map(subject => ({
        description: subject.description,
        basis: {
          sourceId: scene.paperOriginal && !candidate.narrative
            ? `paper_original:${scene.paperOriginal.assetId}`
            : sourceIds.get(`${subject.basis.claimId}:${subject.basis.evidenceId}`),
        },
      })) };
  }) };
  const candidateHash = createHash('sha256').update(JSON.stringify(candidate)).digest('hex');
  const perSceneStyle = storyboardSceneStyles(settings, candidate.scenes);
  const generatedStyles = perSceneStyle.filter((_, index) => !candidate.scenes[index]!.paperOriginal);
  const reviewSkills = loadIllustrationStyleSkills(generatedStyles.length ? generatedStyles : [settings.style], settings.instruction, 'review');
  const verdictOnly = Boolean(settings.narrative || candidate.narrative || context.acceptanceOnly);
  const prompt = `Apply the shared scientific-critical-thinking skill below to the FINAL proposed research illustration. Use only the supplied analysis and original evidence; do not browse or operate tools. The image-specific task is to check what every axis, distance, color, region, arrow and curve communicates, including meaning introduced by composition and treatment. Decorative placement must not invent quantitative behavior or physical relationships.
${context.acceptanceOnly ? 'This candidate includes a proposed art correction. Assess the COMPLETE combined candidate afresh: composition/treatment must agree with the unchanged encoding, subjects, labels, conditions and captions. A different mathematical object, quantity, curve, parameter regime or label meaning is a scientific change, even when written in an art field. Return accepted only if the complete candidate is consistent; otherwise return blocked with all necessary upstream issues. Do not propose another correction or return revised.' : ''}
${candidate.narrative ? 'This is a whole-paper visual narrative. Return only accepted or blocked for the submitted candidate; never rewrite composition/treatment or return revised. In this same review, assess mainMessage, audience, titles, explanatory narrations and scene order against the supplied same-version SDF, completed scientific review and original sources. The main contribution must be distinguished from background, key steps must connect without unexplained jargon or unsupported leaps, and conditions and limits must remain visible to the intended reader. Do not redo full-paper analysis: consume the existing reviewed analysis; excerpt coverage is explicitly partial. One narrow correct scene does not establish a whole-paper explanation. Only labels appear as visible text in the final image; title, narration and message do not. Each generated scene needs at least one short, source-supported label explaining its main point or contribution to the target reader. A set of purely symbolic labels does not establish narrative intelligibility. If that visible main point is missing, return blocked with requires_replan; do not add text through an art correction. Keep detailed exposition in narration. Missing essential steps, a wrong main contribution, or an unsupported reader caption require blocked with requires_replan. A source image is unchanged reference material, never proof of its surrounding caption or a newly designed reader illustration. Review those captions even when every scene is an original. Do not modify source-image composition or treatment; request replanning when reuse cannot serve the narrative.' : ''}
Choose accepted only if the complete picture faithfully explains the supplied selected relationship. Science is carried in message/domain/subjects/encoding/labels/constraints plus title/narration; it is not yours to rewrite or replace. If any of those fields needs correction, or a different focus or source is necessary, return blocked and identify the exact scene, field, source and problem for upstream correction. Do not invent missing evidence or use a style reference as scientific authority.
${candidate.narrative ? 'Before accepting, compare title, narration, message, subjects, encoding, labels, constraints, composition and treatment for each scene. Treat ordered density/size sequences, proportional lengths/areas/distances, alignment, directional arrows or bridges, and fixed-versus-swept parameters as scientific claims: block contradictions between fields even when each field is separately plausible or supported under different conditions. In particular, equal-area or explicitly non-scaled encoding must not become proportional geometry in composition/treatment; correct numeric labels do not resolve that contradiction. Every depicted mapping must retain the operands, intermediate relations and conditions needed for the stated mechanism; a shortcut arrow or alignment must not assert a direct relation unsupported by the science. For generated scenes, enumerate all text boxes, callouts and annotations requested by composition/treatment and require their full visible text to be existing labels entries. Unchanged paper-original labels are exempt from that generated-text inventory. Report all conflicts together with their scene, conflicting fields and required scientific meaning; do not fix a scientific contradiction by silently changing the art.' : ''}
${verdictOnly ? 'Any remaining misleading meaning introduced by art must be reported as blocked; do not change this candidate or propose another revision.' : 'If only artistic placement or treatment introduced a misleading meaning, return revised with a minimal correction to composition or treatment. Preserve scene order/count, all scientific fields and unaffected artwork. Composition chooses placement, focal scale, reading path and spacing; treatment chooses material, palette, edges and typography. Neither may add a scientific mark, label, relationship or condition. Refer to existing subjects, encoding and labels; do not reselect the topic or rewrite the storyboard.'}
In this same review, also compare composition/treatment with userRequest and perSceneStyle. Each scene's selected style overrides the global fallback. A material mismatch with explicit art direction, background, layout, texture or typography warrants ${verdictOnly ? 'blocked with the unresolved issue' : 'revised using only the permitted art fields'}. Preserve every scientific field and only art aspects explicitly accepted by the user. Resolve objective instruction mismatches, not subjective taste. Conformance does not certify visual quality or user approval; do not change science for decoration.
Return ONLY JSON with EXACT keys {decision,summary,corrections}. decision is ${verdictOnly ? 'accepted|blocked' : 'accepted|revised|blocked'}; summary is a concise explanation in the requested locale. For accepted or blocked, corrections MUST be []. ${verdictOnly ? 'No further corrections are permitted.' : 'For revised, corrections is a nonempty list of {sceneIndex,composition?,treatment?}; each existing zero-based sceneIndex appears once, with at least one changed field and no other keys. composition and treatment must be nonempty single-line strings within the shared complete-brief budget.'} No HTML or code. Keep any corrections concise and in the requested locale. The complete scientific and artistic brief, including field headings and separators, must fit ${ILLUSTRATION_BRIEF_MAX_CHARACTERS} UTF-16 code units. Message, descriptions, encoding, constraints, composition and treatment share this total; they have no separate short allocations. Never mechanically truncate scientific meaning or remove necessary conditions to fit art. SourceIds and review notes are internal and are not drawn. Perform this focused audit yourself.
${reviewSkills.instructions}
${JSON.stringify({ locale: settings.locale, userRequest: settings.instruction, style: settings.style, perSceneStyle,
    ...(candidate.narrative ? { paper: projectVisualNarrativeSource(context.narrativeSource!) } : {}),
    upstream: selectedClaims.map(claim => ({ claimId: claim.id, parentClaimId: claim.parentClaimId ?? null, kind: claim.kind, assessment: claim.assessment, analysis: claim.statement,
      conditions: claim.conditions, limitations: claim.limitations,
      sourceIds: (claim.sourcePassages ?? []).map(passage => sourceIds.get(`${claim.id}:${passage.evidenceId}`)) })),
    sources: sources.map((source, index) => ({ sourceId: `s${index}`, text: source.text, relation: source.relation })), candidate: candidateView })}`;
  const requestPrompt = context.structuredIssues ? prompt
    .replace('EXACT keys {decision,summary,corrections}', 'EXACT keys {decision,summary,corrections,issues}')
    .replace('Perform this focused audit yourself.', `Perform this focused audit yourself. issues MUST be [] for ${verdictOnly ? 'accepted' : 'accepted/revised'}. For blocked, list ALL independent scientific issues together (1-36), each exactly {sceneIndex,labelIndex,kind,requiredMeaning,sourceIds}. sceneIndex refers to an existing zero-based scene. kind is label_clarification only when prepending/appending a short explanation to an existing label can fully resolve it without changing its existing symbols, equations, meaning or any other science/art field. Use that existing zero-based labelIndex and 1-8 exact supplied sourceIds. Combine all missing meanings for the same label into one issue; do not repeat label targets. If a definition repeated in multiple labels only needs one visible explanation, select one target. requiredMeaning is a precise complete description <=500 characters in the requested locale. For changes requiring any other field, new label/axis, different source or formula, use kind requires_replan and labelIndex:null; sourceIds may be [] only when the problem is missing evidence. Do not mistake successful JSON or mere presence of a symbol for completion of its required meaning.`) : prompt;
  if (requestPrompt.length > ILLUSTRATION_PLAN_REVIEW_MAX_PROMPT_CHARS) throw new Error(`[blocked] Illustration plan review input is ${requestPrompt.length} characters; text transport limit is ${ILLUSTRATION_PLAN_REVIEW_MAX_PROMPT_CHARS}. Saved plan retained.`);
  const validReview = (value: unknown): value is Record<string, unknown> => {
    try { parseIllustrationReview(value, candidate, claims, sources, context.structuredIssues, verdictOnly); return true; }
    catch { return false; }
  };
  const response = await gateway.reviewScientific({ requestId: context.authorizationContext.taskId,
    authorizationContext: context.authorizationContext, illustrationContext: context.illustrationContext,
    source: { kind: 'illustration-plan', researchObjectId: context.researchObjectId, versionId: context.versionId,
      sourceEvidenceIdentity: context.sourceEvidenceIdentity, candidateHash }, prompt: requestPrompt }, validReview);
  const { document, decision, summary, issues } = parseIllustrationReview(
    JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')), candidate, claims, sources, context.structuredIssues, verdictOnly);
  if (decision === 'blocked' && !context.structuredIssues) throw new Error('[blocked] Illustration needs upstream scientific revision: ' + summary.slice(0, 300));
  return { document, designSkills: reviewSkills.usage, provenance: { stage: 'final-brief', requestId: context.authorizationContext.taskId,
    decision, summary, candidateHash, sourceEvidenceIdentity: context.sourceEvidenceIdentity,
    promptHash: response.promptHash, responseHash: response.responseHash, provider: response.provider ?? 'chatgpt-web-science-review',
    ...(response.model ? { model: response.model } : {}), ...(issues ? { issues } : {}) } };
}

function parseIllustrationReview(value: unknown, candidate: StoryboardDocument, claims: readonly PresentationClaim[],
  sources: readonly { claimId: string; evidenceId: string }[], structuredIssues?: boolean, verdictOnly = Boolean(candidate.narrative)) {
  const review = object(value);
  keys(review, structuredIssues ? ['decision', 'summary', 'corrections', 'issues'] : ['decision', 'summary', 'corrections']);
  const decision = review.decision;
  if ((decision !== 'accepted' && decision !== 'revised' && decision !== 'blocked')
    || (verdictOnly && decision === 'revised')
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
      if (scene.paperOriginal) throw new Error('[blocked] Review cannot redesign a verbatim paper-original scene');
      const illustration = parseIllustrationBrief({ ...scene.illustration!,
        ...('composition' in correction ? { composition: correction.composition } : {}),
        ...('treatment' in correction ? { treatment: correction.treatment } : {}) }, scene.sourceClaimIds);
      if (illustration.composition === scene.illustration!.composition
        && illustration.treatment === scene.illustration!.treatment) throw new Error('[blocked] Invalid or unchanged art correction');
      scenes[index] = { ...scene, illustration, visualAction: describeIllustrationBrief(illustration) };
      patched.add(index);
    }
    document = parseStoryboardDocument({ ...candidate, scenes }, claims.map(claim => claim.id), 'image');
  }
  for (const scene of document.scenes) {
    if (!scene.paperOriginal || document.narrative) requireIllustrationSourceSupport(scene.illustration!, claims);
    compileIllustrationImagePrompt(scene.illustration!);
  }
  return { document, decision, summary: review.summary, issues };
}
