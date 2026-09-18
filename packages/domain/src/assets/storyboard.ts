import { PresentationAssetError } from './errors';
import { parseSceneAnimation, type SceneAnimation } from './animation';
import { parseIllustrationBrief, describeIllustrationBrief, type IllustrationBrief } from './illustration-brief';
export const STORYBOARD_IMAGE_VISUAL_ACTION_MAX = 4000;
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
    baseAssetId?: string;
    /** Restyle a sourced image plan without regenerating its scientific fields. */
    revisionMode?: 'art';
    /** Reuse an owned scientifically blocked image plan for a bounded revision. */
    revisionTaskId?: string;
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
export interface StoryboardDocument {
    schemaVersion: 1;
    title: string;
    scenes: Array<{
        title: string;
        narration: string;
        visualAction: string;
        illustration?: IllustrationBrief;
        durationSeconds?: number;
        sourceClaimIds: string[];
        animation?: SceneAnimation;
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
    baseAssetId?: string;
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
export function parseStoryboardRequest(value: unknown): StoryboardRequest {
    const v = object(value, 'request_shape');
    keys(v, ['locale', 'style', 'instruction'], ['baseAssetId', 'revisionTaskId', 'revisionMode', 'output', 'figurePlan'], 'request_keys');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof v.locale !== 'string' || !['zh', 'en'].includes(v.locale)
        || typeof v.style !== 'string' || !v.style.trim() || v.style.length > 100
        || typeof v.instruction !== 'string' || !v.instruction.trim() || v.instruction.length > 1000
        || ('baseAssetId' in v && (typeof v.baseAssetId !== 'string' || !uuid.test(v.baseAssetId)))
        || ('revisionTaskId' in v && (typeof v.revisionTaskId !== 'string' || !uuid.test(v.revisionTaskId) || v.output !== 'image' || 'baseAssetId' in v))
        || ('revisionMode' in v && (v.revisionMode !== 'art' || v.output !== 'image' || !v.baseAssetId || 'revisionTaskId' in v))
        || ('output' in v && v.output !== 'image' && v.output !== 'video')) return invalid('request_values');
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
    }
    return {
        locale: v.locale as StoryboardRequest['locale'],
        style: v.style,
        instruction: v.instruction.trim(),
        output: (v.output ?? 'video') as StoryboardRequest['output'],
        ...(v.baseAssetId ? { baseAssetId: v.baseAssetId as string } : {}),
        ...(v.revisionTaskId ? { revisionTaskId: v.revisionTaskId as string } : {}),
        ...(v.revisionMode ? { revisionMode: v.revisionMode as 'art' } : {}),
        ...(figurePlan ? { figurePlan } : {}),
    };
}
export function parseStoryboardDocument(value: unknown, selected: readonly string[], output: StoryboardRequest['output'] = 'video'): StoryboardDocument {
    const v = object(value, 'document_shape');
    keys(v, ['schemaVersion', 'title', 'scenes'], [], 'document_keys');
    if (v.schemaVersion !== 1) return invalid('schema_version');
    if (!Array.isArray(v.scenes) || v.scenes.length < (output === 'image' ? 1 : 3) || v.scenes.length > 6)
        return invalid('scene_count');
    const covered = new Set<string>();
    const scenes = v.scenes.map((raw, index) => {
        const prefix = `scene_${index}`;
        const s = object(raw, `${prefix}:shape`);
        keys(s, output === 'video' ? ['title', 'narration', 'visualAction', 'durationSeconds', 'sourceClaimIds'] : ['title', 'narration', 'visualAction', 'sourceClaimIds'], output === 'video' ? ['animation'] : ['illustration', 'paperOriginal'], `${prefix}:keys`);
        if (output === 'video' && (!Number.isInteger(s.durationSeconds) || Number(s.durationSeconds) < 4 || Number(s.durationSeconds) > 20))
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
        const illustration = output === 'image' && s.illustration !== undefined ? parseIllustrationBrief(s.illustration, ids) : undefined;
        if (illustration && s.visualAction !== describeIllustrationBrief(illustration)) invalid(`${prefix}:illustration_description_mismatch`);
        let paperOriginal: { assetId: string; objectKey: string; contentHash: string } | undefined;
        if (output === 'image' && s.paperOriginal !== undefined) {
            const po = object(s.paperOriginal, `${prefix}:paper_original_shape`);
            keys(po, ['assetId', 'objectKey', 'contentHash'], [], `${prefix}:paper_original_keys`);
            const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (typeof po.assetId !== 'string' || !uuid.test(po.assetId)
                || typeof po.objectKey !== 'string' || !po.objectKey.startsWith('presentation/')
                || typeof po.contentHash !== 'string' || !/^[0-9a-f]{64}$/u.test(po.contentHash)) invalid(`${prefix}:paper_original_values`);
            paperOriginal = { assetId: po.assetId, objectKey: po.objectKey, contentHash: po.contentHash };
        }
        return { title: text(s.title, 120, `${prefix}:title`), narration: text(s.narration, 600, `${prefix}:narration`), visualAction: text(illustration ? describeIllustrationBrief(illustration) : s.visualAction, output === 'image' ? STORYBOARD_IMAGE_VISUAL_ACTION_MAX : STORYBOARD_VIDEO_VISUAL_ACTION_STORED_MAX, `${prefix}:visual_action`), ...(illustration ? { illustration } : {}), ...(output === 'video' ? { durationSeconds: s.durationSeconds as number } : {}), sourceClaimIds: [...ids], ...(animation ? { animation } : {}), ...(paperOriginal ? { paperOriginal } : {}) };
    });
    const duration = scenes.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);
    if (output === 'video' && (duration < 24 || duration > 90)) return invalid('total_duration');
    if (output === 'video' && selected.some(id => !covered.has(id))) return invalid('claim_coverage');
    const hasDynamicAction = scenes.some(scene => {
        if (!scene.animation) return false;
        const objects = new Map(scene.animation.objects.map(item => [item.id, item]));
        return scene.animation.actions.some(action => ['translate', 'pulse', 'draw'].includes(action.kind) && objects.get(action.target)?.kind !== 'label');
    });
    if (output === 'video' && scenes.some(scene => scene.animation) && !hasDynamicAction) return invalid('dynamic_action_required');
    return { schemaVersion: 1, title: text(v.title, 120, 'title'), scenes };
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
        return { document: parseStoryboardDocument(p.storyboardDocument, claimIds, settings.output), locale: settings.locale, style: settings.style, output: settings.output, ...(settings.baseAssetId ? { baseAssetId: settings.baseAssetId } : {}) };
    }
    catch {
        return undefined;
    }
}
