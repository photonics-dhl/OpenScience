import { PresentationAssetError } from './errors';
import { createHash } from 'node:crypto';
import { getBlobStorageKey } from '@openscience/storage';
import { parseSceneAnimation, type SceneAnimation } from './animation';
import { ILLUSTRATION_BRIEF_MAX_CHARACTERS, parseIllustrationBrief, describeIllustrationBrief, type IllustrationBrief } from './illustration-brief';
export const STORYBOARD_IMAGE_VISUAL_ACTION_MAX = ILLUSTRATION_BRIEF_MAX_CHARACTERS;
export const STORYBOARD_VIDEO_VISUAL_ACTION_GENERATION_MAX = 100;
export const STORYBOARD_VIDEO_VISUAL_ACTION_STORED_MAX = 1000;

/**
 * Legacy style id aliases. Both the agent-worker loader and the domain-side
 * revision comparison must reduce these to a single canonical form before
 * comparing; otherwise d3a0da3f-era tasks stored with `style: 'technical'`
 * cannot be retried with the same conceptual style under a newer alias.
 */
export const STORYBOARD_STYLE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    'v6': 'scientific',
    'technical': 'scientific',
    'ink': 'ink-notes',
    'watercolor': 'watercolor',
});
/** Reduce a free-form style id through the alias table; stable across legacy and new ids. */
export function canonicalStoryboardStyle(raw: string): string {
    return STORYBOARD_STYLE_ALIASES[raw] ?? raw;
}
export interface StoryboardRequest {
    locale: 'zh' | 'en';
    /**
     * Free-form style id. Resolved against the installed catalogue in
     * apps/agent-worker/src/skills/installed-media-skills.ts; unknown ids fall back to
     * `scientific` and log a warning. Legacy values `watercolor` / `ink` are aliased.
     */
    style: string;
    instruction: string;
    /** Omitted legacy requests are animation storyboards. */
    output: 'image' | 'video';
    /** Explain the whole paper using its existing reviewed analysis and an ordered visual narrative. */
    narrative?: true;
    /** Remaining scene allowance supplied by the run orchestrator; never expands its generation grant. */
    narrativeSceneLimit?: number;
    baseAssetId?: string;
    /** Revise only this scene of a base-bound narrative video plan. */
    revisionSceneIndex?: number;
    /** Restyle a sourced image plan without regenerating its scientific fields. */
    revisionMode?: 'art';
    /** Bounded narrative restyling preserves every other scene byte-for-byte. */
    artSceneIndex?: number;
    /** Reuse an owned scientifically blocked image plan for a bounded revision. */
    revisionTaskId?: string;
    /** Replan after a bound narrative image requires scientific changes, never a render-only correction. */
    revisionImageAssetId?: string;
    /**
     * Optional figure-level audit from the upstream figure auditor. Each entry steers
     * one paper figure to a single decision: reuse the source figure, re-render in the
     * current style, abstract to a different style, or skip it. The planner uses this
     * to decide whether to author a brand-new scene or to anchor a revised brief on an
     * existing illustration.
     */
    figurePlan?: {
        figures: Array<{
            id: string;
            decision: 'reuse' | 're-render' | 'abstract' | 'skip';
            /** When abstracting, the target style id; otherwise inferred from request.style. */
            styleId?: string;
            /** Optional human-readable caption the planner may surface in narration. */
            caption?: string;
        }>;
    };
}
export interface IllustrationStyleRecommendations {
    selectedStyleId: string;
    choices: Array<{ styleId: string; name: string; reason: string }>;
}
export type VideoNarrativeArc = 'question-mechanism-takeaway' | 'question-evidence-limitations' | 'observation-mechanism-limitations';
export type VideoAudioPolicy = 'native-first' | 'external-narration' | 'compare-before-publish';
export type VideoModelPolicy = 'commercial-primary' | 'local-preview';
export type VideoShotType = 'hook' | 'mechanism' | 'evidence' | 'transition' | 'takeaway' | 'hero';
export type VideoReference = 'scene-artwork' | 'paper-original' | 'none';
export type VideoFrameStrategy = 'start-reference' | 'start-end-reference' | 'text-only';
export type VideoAudioMode = 'native' | 'external-narration' | 'silent' | 'hybrid';
export type VideoSubtitleMode = 'burn-in' | 'sidecar' | 'none';
export interface VideoProductionDirection {
    schemaVersion: 1;
    narrativeArc: VideoNarrativeArc;
    visualContinuity: string;
    audioPolicy: VideoAudioPolicy;
    modelPolicy: VideoModelPolicy;
}
export interface VideoSceneDirection {
    shotType: VideoShotType;
    purpose: string;
    subjectLock: string;
    generatedElements: string;
    motion: string;
    camera: string;
    reference: VideoReference;
    frameStrategy: VideoFrameStrategy;
    audioMode: VideoAudioMode;
    subtitleMode: VideoSubtitleMode;
    negativeConstraints: string[];
    modelPolicy: VideoModelPolicy;
}
/** Optional display metadata must never invalidate an otherwise valid scientific plan. */
export function parseIllustrationStyleRecommendations(value: unknown): IllustrationStyleRecommendations | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const v = value as Record<string, unknown>;
    const id = (s: unknown): s is string => typeof s === 'string' && s.length <= 100
        && /^(?:(?:article|infographic):[a-z0-9-]+|handdraw:#[0-9]{3})$/u.test(s);
    const prose = (s: unknown, max: number): s is string => typeof s === 'string' && Boolean(s.trim())
        && s.length <= max && !Array.from(s).some(character => character.charCodeAt(0) < 32);
    if (!id(v.selectedStyleId) || !Array.isArray(v.choices) || !v.choices.length || v.choices.length > 2) return undefined;
    const choices: IllustrationStyleRecommendations['choices'] = [];
    for (const raw of v.choices) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const c = raw as Record<string, unknown>;
        if (!id(c.styleId) || !prose(c.name, 120) || !prose(c.reason, 400) || choices.some(item => item.styleId === c.styleId)) continue;
        choices.push({ styleId: c.styleId, name: c.name.trim(), reason: c.reason.trim() });
    }
    return choices.some(c => c.styleId === v.selectedStyleId) ? { selectedStyleId: v.selectedStyleId, choices } : undefined;
}
export interface StoryboardDocument {
    schemaVersion: 1;
    title: string;
    narrative?: { mainMessage: string; audience: string };
    videoProduction?: VideoProductionDirection;
    scenes: Array<{
        title: string;
        narration: string;
        visualAction: string;
        illustration?: IllustrationBrief;
        styleRecommendations?: IllustrationStyleRecommendations;
        durationSeconds?: number;
        sourceClaimIds: string[];
        animation?: SceneAnimation;
        videoDirection?: VideoSceneDirection;
        /**
         * Paper-original binding for figurePlan.reuse decisions: when the planner
         * finds a registered paper_original_figure asset for this scene's figureId,
         * it stamps the bound asset here. The image renderer copies these bytes
         * verbatim instead of calling the image provider.
         */
        paperOriginal?: { assetId: string; objectKey: string; contentHash: string };
    }>;
}
export interface StoryboardView {
    document: StoryboardDocument;
    locale: StoryboardRequest['locale'];
    style: StoryboardRequest['style'];
    /** Older API fixtures omit this; persisted plans are normalized to video. */
    output?: StoryboardRequest['output'];
    narrative?: true;
    baseAssetId?: string;
    artSceneIndex?: number;
    figurePlan?: StoryboardRequest['figurePlan'];
    /** Existing final-brief review decision; absent for legacy/unbound reviews. */
    scientificReview?: 'accepted' | 'revised' | 'blocked';
}
/** The planner emits reuse scenes first, then generated figures, preserving each group's order. */
export function storyboardSceneStyles(settings: Pick<StoryboardRequest, 'style' | 'figurePlan'> & { output?: StoryboardRequest['output'] },
    scenes: ReadonlyArray<Pick<StoryboardDocument['scenes'][number], 'title' | 'paperOriginal'>>): string[] {
    if (settings.output === 'video' || !settings.figurePlan) return scenes.map(() => settings.style);
    const figures = [
        ...settings.figurePlan.figures.filter(figure => figure.decision === 'reuse'),
        ...settings.figurePlan.figures.filter(figure => figure.decision === 're-render' || figure.decision === 'abstract'),
    ];
    if (figures.length !== scenes.length) return invalid('figure_plan_scene_mapping');
    return scenes.map((scene, index) => {
        const figure = figures[index]!;
        const suffix = scene.title.slice(figure.id.length);
        if (Boolean(scene.paperOriginal) !== (figure.decision === 'reuse')
            || !scene.title.startsWith(figure.id) || (suffix && !/^[\s:：–—-]/u.test(suffix)))
            return invalid(`figure_plan_scene_${index}_mapping`);
        return figure.styleId ?? settings.style;
    });
}
function invalid(reason: string): never { throw new PresentationAssetError('VALIDATION_ERROR', `storyboard:${reason}`); }
function object(value: unknown, reason: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid(reason); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, required: string[], optional: string[], reason: string) { if (required.some(k => !(k in value)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k)))
    invalid(reason); }
function text(value: unknown, max: number, reason: string): string {
    if (typeof value !== 'string') return invalid(`${reason}:type_${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`);
    if (!value.trim()) return invalid(`${reason}:empty`);
    if (value.length > max) return invalid(`${reason}:length_${value.length}:max_${max}`);
    const control = value.match(/[\u0000-\u001f]/);
    if (control) return invalid(`${reason}:control_u${control[0].charCodeAt(0).toString(16).padStart(4, '0')}`);
    return value;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], reason: string): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) return invalid(reason);
    return value as T;
}
function parseVideoProductionDirection(value: unknown): VideoProductionDirection {
    const v = object(value, 'video_production_shape');
    keys(v, ['schemaVersion', 'narrativeArc', 'visualContinuity', 'audioPolicy', 'modelPolicy'], [], 'video_production_keys');
    if (v.schemaVersion !== 1) return invalid('video_production_schema_version');
    return {
        schemaVersion: 1,
        narrativeArc: enumValue(v.narrativeArc, ['question-mechanism-takeaway', 'question-evidence-limitations', 'observation-mechanism-limitations'], 'video_production_narrative_arc') as VideoNarrativeArc,
        visualContinuity: text(v.visualContinuity, 600, 'video_production_visual_continuity'),
        audioPolicy: enumValue(v.audioPolicy, ['native-first', 'external-narration', 'compare-before-publish'], 'video_production_audio_policy') as VideoAudioPolicy,
        modelPolicy: enumValue(v.modelPolicy, ['commercial-primary', 'local-preview'], 'video_production_model_policy') as VideoModelPolicy,
    };
}
function parseVideoSceneDirection(value: unknown, prefix: string): VideoSceneDirection {
    const v = object(value, `${prefix}:video_direction_shape`);
    keys(v, ['shotType', 'purpose', 'subjectLock', 'generatedElements', 'motion', 'camera', 'reference', 'frameStrategy', 'audioMode', 'subtitleMode', 'negativeConstraints', 'modelPolicy'], [], `${prefix}:video_direction_keys`);
    if (!Array.isArray(v.negativeConstraints) || v.negativeConstraints.length > 0 && v.negativeConstraints.length > 8)
        return invalid(`${prefix}:video_direction_negative_constraints`);
    const negativeConstraints = v.negativeConstraints.map((item, index) => text(item, 160, `${prefix}:video_direction_negative_${index}`));
    return {
        shotType: enumValue(v.shotType, ['hook', 'mechanism', 'evidence', 'transition', 'takeaway', 'hero'], `${prefix}:video_direction_shot_type`) as VideoShotType,
        purpose: text(v.purpose, 240, `${prefix}:video_direction_purpose`),
        subjectLock: text(v.subjectLock, 360, `${prefix}:video_direction_subject_lock`),
        generatedElements: text(v.generatedElements, 600, `${prefix}:video_direction_generated_elements`),
        motion: text(v.motion, 600, `${prefix}:video_direction_motion`),
        camera: text(v.camera, 300, `${prefix}:video_direction_camera`),
        reference: enumValue(v.reference, ['scene-artwork', 'paper-original', 'none'], `${prefix}:video_direction_reference`) as VideoReference,
        frameStrategy: enumValue(v.frameStrategy, ['start-reference', 'start-end-reference', 'text-only'], `${prefix}:video_direction_frame_strategy`) as VideoFrameStrategy,
        audioMode: enumValue(v.audioMode, ['native', 'external-narration', 'silent', 'hybrid'], `${prefix}:video_direction_audio_mode`) as VideoAudioMode,
        subtitleMode: enumValue(v.subtitleMode, ['burn-in', 'sidecar', 'none'], `${prefix}:video_direction_subtitle_mode`) as VideoSubtitleMode,
        negativeConstraints,
        modelPolicy: enumValue(v.modelPolicy, ['commercial-primary', 'local-preview'], `${prefix}:video_direction_model_policy`) as VideoModelPolicy,
    };
}
export function parseStoryboardRequest(value: unknown): StoryboardRequest {
    const v = object(value, 'request_shape');
    keys(v, ['locale', 'style', 'instruction'], ['baseAssetId', 'revisionSceneIndex', 'revisionTaskId', 'revisionImageAssetId', 'revisionMode', 'artSceneIndex', 'output', 'figurePlan', 'narrative', 'narrativeSceneLimit'], 'request_keys');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof v.locale !== 'string' || !['zh', 'en'].includes(v.locale)
        || typeof v.style !== 'string' || !v.style.trim() || v.style.length > 100
        || typeof v.instruction !== 'string' || !v.instruction.trim() || v.instruction.length > 1000
        || ('baseAssetId' in v && (typeof v.baseAssetId !== 'string' || !uuid.test(v.baseAssetId)))
        || ('revisionTaskId' in v && (typeof v.revisionTaskId !== 'string' || !uuid.test(v.revisionTaskId) || v.output !== 'image' || 'baseAssetId' in v))
        || ('revisionImageAssetId' in v && (typeof v.revisionImageAssetId !== 'string' || !uuid.test(v.revisionImageAssetId)
            || v.output !== 'image' || v.narrative !== true || !('narrativeSceneLimit' in v)
            || ['baseAssetId', 'revisionTaskId', 'revisionMode', 'figurePlan'].some(key => key in v)))
        || ('revisionMode' in v && (v.revisionMode !== 'art' || v.output !== 'image' || !v.baseAssetId || 'revisionTaskId' in v))
        || ('artSceneIndex' in v && (v.revisionMode !== 'art' || v.output !== 'image' || !v.baseAssetId || v.narrative !== true
            || !Number.isInteger(v.artSceneIndex) || Number(v.artSceneIndex) < 0 || Number(v.artSceneIndex) > 5))
        || ('revisionSceneIndex' in v && (v.output !== 'video' || v.narrative !== true || !v.baseAssetId
            || !Number.isInteger(v.revisionSceneIndex) || Number(v.revisionSceneIndex) < 0 || Number(v.revisionSceneIndex) > 5))
        || ('output' in v && v.output !== 'image' && v.output !== 'video')
        || ('narrative' in v && (v.narrative !== true || (v.output !== 'image' && v.output !== 'video') || v.figurePlan != null))
        || ('narrativeSceneLimit' in v && (v.narrative !== true || !Number.isInteger(v.narrativeSceneLimit)
            || Number(v.narrativeSceneLimit) < 1 || Number(v.narrativeSceneLimit) > 6))) return invalid('request_values');
    let figurePlan: StoryboardRequest['figurePlan'] | undefined;
    if ('figurePlan' in v && v.figurePlan !== undefined && v.figurePlan !== null) {
        const fp = object(v.figurePlan, 'figure_plan_shape');
        keys(fp, ['figures'], [], 'figure_plan_keys');
        if (!Array.isArray(fp.figures) || fp.figures.length > 12) return invalid('figure_plan_count');
        const decisions = new Set(['reuse', 're-render', 'abstract', 'skip']);
        figurePlan = {
            figures: fp.figures.map((raw, index) => {
                const f = object(raw, `figure_${index}:shape`);
                keys(f, ['id', 'decision'], ['styleId', 'caption'], `figure_${index}:keys`);
                if (typeof f.id !== 'string' || !f.id.trim() || f.id.length > 200) return invalid(`figure_${index}:id`);
                if (typeof f.decision !== 'string' || !decisions.has(f.decision)) return invalid(`figure_${index}:decision`);
                if ('styleId' in f && (typeof f.styleId !== 'string' || !f.styleId.trim() || f.styleId.length > 100)) return invalid(`figure_${index}:style_id`);
                if ('caption' in f && (typeof f.caption !== 'string' || f.caption.length > 200)) return invalid(`figure_${index}:caption`);
                return { id: f.id, decision: f.decision as 'reuse' | 're-render' | 'abstract' | 'skip', ...(f.styleId ? { styleId: f.styleId as string } : {}), ...(f.caption ? { caption: f.caption as string } : {}) };
            }),
        };
        const sceneCount = figurePlan.figures.filter(figure => figure.decision !== 'skip').length;
        if (v.output === 'image' && (sceneCount < 1 || sceneCount > 6)) return invalid('figure_plan_scene_count_1_to_6');
    }
    return {
        locale: v.locale as StoryboardRequest['locale'],
        style: v.style,
        instruction: v.instruction.trim(),
        output: (v.output ?? 'video') as StoryboardRequest['output'],
        ...(v.narrative === true ? { narrative: true as const } : {}),
        ...(v.narrativeSceneLimit !== undefined ? { narrativeSceneLimit: v.narrativeSceneLimit as number } : {}),
        ...(v.baseAssetId ? { baseAssetId: v.baseAssetId as string } : {}),
        ...(v.revisionSceneIndex !== undefined ? { revisionSceneIndex: v.revisionSceneIndex as number } : {}),
        ...(v.revisionTaskId ? { revisionTaskId: v.revisionTaskId as string } : {}),
        ...(v.revisionImageAssetId ? { revisionImageAssetId: v.revisionImageAssetId as string } : {}),
        ...(v.revisionMode ? { revisionMode: v.revisionMode as 'art' } : {}),
        ...(v.artSceneIndex !== undefined ? { artSceneIndex: v.artSceneIndex as number } : {}),
        ...(figurePlan ? { figurePlan } : {}),
    };
}
export function parseStoryboardDocument(value: unknown, selected: readonly string[], output: StoryboardRequest['output'] = 'video', options: { nativeNarrativeVideo?: boolean } = {}): StoryboardDocument {
    const v = object(value, 'document_shape');
    const nativeNarrativeVideo = output === 'video' && options.nativeNarrativeVideo === true;
    const illustrationOutput = output === 'image' || nativeNarrativeVideo;
    keys(v, nativeNarrativeVideo ? ['schemaVersion', 'title', 'scenes', 'narrative', 'videoProduction'] : ['schemaVersion', 'title', 'scenes'],
        nativeNarrativeVideo ? [] : output === 'image' ? ['narrative'] : ['videoProduction'], 'document_keys');
    if (v.schemaVersion !== 1) return invalid('schema_version');
    if (!Array.isArray(v.scenes) || v.scenes.length < (output === 'image' ? 1 : 3) || v.scenes.length > 6)
        return invalid('scene_count');
    const covered = new Set<string>();
    const scenes = v.scenes.map((raw, index) => {
        const prefix = `scene_${index}`;
        const s = object(raw, `${prefix}:shape`);
        keys(s, nativeNarrativeVideo ? ['title', 'narration', 'visualAction', 'durationSeconds', 'sourceClaimIds', 'illustration', 'videoDirection']
            : output === 'video' ? ['title', 'narration', 'visualAction', 'durationSeconds', 'sourceClaimIds'] : ['title', 'narration', 'visualAction', 'sourceClaimIds'],
            nativeNarrativeVideo ? ['animation', 'styleRecommendations'] : output === 'video' ? ['animation', 'videoDirection'] : ['illustration', 'paperOriginal', 'styleRecommendations'], `${prefix}:keys`);
        if (output === 'video' && (nativeNarrativeVideo ? ![5, 10, 15].includes(s.durationSeconds as number)
            : !Number.isInteger(s.durationSeconds) || Number(s.durationSeconds) < 4 || Number(s.durationSeconds) > 20))
            return invalid(`${prefix}:duration`);
        if (!Array.isArray(s.sourceClaimIds) || s.sourceClaimIds.length < 1 || s.sourceClaimIds.length > 12 || new Set(s.sourceClaimIds).size !== s.sourceClaimIds.length || s.sourceClaimIds.some(id => typeof id !== 'string' || !selected.includes(id)))
            return invalid(`${prefix}:source_claims`);
        const ids = s.sourceClaimIds as string[];
        ids.forEach(id => covered.add(id));
        let animation: SceneAnimation | undefined;
        if (output === 'video' && 'animation' in s) {
            try { animation = parseSceneAnimation(s.animation, ids); }
            catch (error) {
                if (error instanceof PresentationAssetError && error.message.startsWith('animation:')) invalid(`${prefix}:${error.message}`);
                throw error;
            }
        }
        const videoDirection = output === 'video' && (nativeNarrativeVideo || s.videoDirection !== undefined) ? parseVideoSceneDirection(s.videoDirection, prefix) : undefined;
        if (nativeNarrativeVideo && videoDirection?.modelPolicy !== 'commercial-primary') invalid(`${prefix}:video_direction_model_policy`);
        const illustration = (nativeNarrativeVideo || output === 'image' && s.illustration !== undefined) ? parseIllustrationBrief(s.illustration, ids) : undefined;
        const styleRecommendations = illustrationOutput ? parseIllustrationStyleRecommendations(s.styleRecommendations) : undefined;
        if (illustration && s.visualAction !== describeIllustrationBrief(illustration)) invalid(`${prefix}:illustration_description_mismatch`);
        let paperOriginal: { assetId: string; objectKey: string; contentHash: string } | undefined;
        if (output === 'image' && s.paperOriginal !== undefined) {
            const po = object(s.paperOriginal, `${prefix}:paper_original_shape`);
            keys(po, ['assetId', 'objectKey', 'contentHash'], [], `${prefix}:paper_original_keys`);
            const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (typeof po.assetId !== 'string' || !uuid.test(po.assetId)
                || typeof po.objectKey !== 'string'
                || typeof po.contentHash !== 'string' || !/^[0-9a-f]{64}$/u.test(po.contentHash)) invalid(`${prefix}:paper_original_values`);
            const parts = po.objectKey.split('/');
            const legacyKey = parts.length === 4 && parts[0] === 'presentation' && uuid.test(parts[1]) && uuid.test(parts[2]) && parts[3] === `${po.contentHash}.png`;
            if (po.objectKey !== getBlobStorageKey(po.contentHash) && !legacyKey) invalid(`${prefix}:paper_original_values`);
            paperOriginal = { assetId: po.assetId, objectKey: po.objectKey, contentHash: po.contentHash };
        }
        return { title: text(s.title, 120, `${prefix}:title`), narration: text(s.narration, nativeNarrativeVideo ? 120 : 600, `${prefix}:narration`), visualAction: text(illustration ? describeIllustrationBrief(illustration) : s.visualAction, illustrationOutput ? STORYBOARD_IMAGE_VISUAL_ACTION_MAX : STORYBOARD_VIDEO_VISUAL_ACTION_STORED_MAX, `${prefix}:visual_action`), ...(illustration ? { illustration } : {}), ...(styleRecommendations ? { styleRecommendations } : {}), ...(output === 'video' ? { durationSeconds: s.durationSeconds as number } : {}), sourceClaimIds: [...ids], ...(animation ? { animation } : {}), ...(videoDirection ? { videoDirection } : {}), ...(paperOriginal ? { paperOriginal } : {}) };
    });
    const duration = scenes.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);
    if (output === 'video' && (duration < 24 || duration > 90)) return invalid('total_duration');
    if (nativeNarrativeVideo && scenes.reduce((n, s) => n + s.narration.length, 0) > 450) return invalid('total_narration');
    if (output === 'video' && selected.some(id => !covered.has(id))) return invalid('claim_coverage');
    const hasDynamicAction = scenes.some(scene => {
        if (!scene.animation) return false;
        const objects = new Map(scene.animation.objects.map(item => [item.id, item]));
        return scene.animation.actions.some(action => ['translate', 'pulse', 'draw'].includes(action.kind) && objects.get(action.target)?.kind !== 'label');
    });
    if (output === 'video' && scenes.some(scene => scene.animation) && !hasDynamicAction) return invalid('dynamic_action_required');
    let narrative: StoryboardDocument['narrative'];
    if ('narrative' in v) {
        const n = object(v.narrative, 'narrative_shape');
        keys(n, ['mainMessage', 'audience'], [], 'narrative_keys');
        narrative = { mainMessage: text(n.mainMessage, 240, 'narrative_main_message'), audience: text(n.audience, 160, 'narrative_audience') };
    }
    const videoProduction = output === 'video' && (nativeNarrativeVideo || v.videoProduction !== undefined) ? parseVideoProductionDirection(v.videoProduction) : undefined;
    if (nativeNarrativeVideo && videoProduction?.modelPolicy !== 'commercial-primary') invalid('video_production_model_policy');
    return { schemaVersion: 1, title: text(v.title, 120, 'title'), scenes, ...(narrative ? { narrative } : {}), ...(videoProduction ? { videoProduction } : {}) };
}
/** Never expose arbitrary provenance or a malformed saved plan. */
export function presentationStoryboardView(asset: {
    kind: string;
    provenance: unknown;
}, claimIds: readonly string[]): StoryboardView | undefined {
    try {
        const p = object(asset.provenance, 'saved_provenance');
        if (asset.kind !== 'interactive_html' || p.subtype !== 'sourced_storyboard')
            return undefined;
        const settings = parseStoryboardRequest({ ...object(p.storyboardSettings, 'saved_settings') });
        const document = parseStoryboardDocument(p.storyboardDocument, claimIds, settings.output, { nativeNarrativeVideo: settings.output === 'video' && settings.narrative === true });
        if (Boolean(settings.narrative) !== Boolean(document.narrative)) return undefined;
        const review = p.illustrationReview && typeof p.illustrationReview === 'object' && !Array.isArray(p.illustrationReview)
            ? p.illustrationReview as Record<string, unknown> : undefined;
        const scientificReview = settings.output === 'image' && p.source === 'verified_claims' && review?.stage === 'final-brief'
            && typeof p.taskId === 'string' && review.requestId === p.taskId
            && typeof p.sourceEvidenceIdentity === 'string' && review.sourceEvidenceIdentity === p.sourceEvidenceIdentity
            && review.candidateHash === createHash('sha256').update(JSON.stringify(document)).digest('hex')
            && typeof review.promptHash === 'string' && /^[a-f0-9]{64}$/u.test(review.promptHash)
            && typeof review.responseHash === 'string' && /^[a-f0-9]{64}$/u.test(review.responseHash)
            && (review.provider === 'chatgpt-web-science-review'
                || (typeof review.provider === 'string' && /^minimax-key-[1-9]\d*-model-[1-9]\d*$/u.test(review.provider)))
            && typeof review.summary === 'string' && Boolean(review.summary.trim())
            && ['accepted', 'revised', 'blocked'].includes(String(review.decision))
            ? review.decision as NonNullable<StoryboardView['scientificReview']> : undefined;
        return { document, locale: settings.locale, style: settings.style, output: settings.output,
            ...(scientificReview ? { scientificReview } : {}),
            ...(settings.narrative ? { narrative: true as const } : {}), ...(settings.baseAssetId ? { baseAssetId: settings.baseAssetId } : {}),
            ...(settings.artSceneIndex !== undefined ? { artSceneIndex: settings.artSceneIndex } : {}),
            ...(settings.figurePlan ? { figurePlan: settings.figurePlan } : {}) };
    }
    catch {
        return undefined;
    }
}
