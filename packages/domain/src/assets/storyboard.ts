import { PresentationAssetError } from './errors';
import { parseSceneAnimation, type SceneAnimation } from './animation';
export interface StoryboardRequest {
    locale: 'zh' | 'en';
    style: 'watercolor' | 'technical' | 'ink';
    instruction: string;
    baseAssetId?: string;
}
export interface StoryboardDocument {
    schemaVersion: 1;
    title: string;
    scenes: Array<{
        title: string;
        narration: string;
        visualAction: string;
        durationSeconds: number;
        sourceClaimIds: string[];
        animation?: SceneAnimation;
    }>;
}
export interface StoryboardView {
    document: StoryboardDocument;
    locale: StoryboardRequest['locale'];
    style: StoryboardRequest['style'];
    baseAssetId?: string;
}
function invalid(reason: string): never { throw new PresentationAssetError('VALIDATION_ERROR', `storyboard:${reason}`); }
function object(value: unknown, reason: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid(reason); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, required: string[], optional: string[], reason: string) { if (required.some(k => !(k in value)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k)))
    invalid(reason); }
function text(value: unknown, max: number, reason: string): string { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value))
    return invalid(reason); return value; }
export function parseStoryboardRequest(value: unknown): StoryboardRequest {
    const v = object(value, 'request_shape');
    keys(v, ['locale', 'style', 'instruction'], ['baseAssetId'], 'request_keys');
    if (typeof v.locale !== 'string' || !['zh', 'en'].includes(v.locale) || typeof v.style !== 'string' || !['watercolor', 'technical', 'ink'].includes(v.style) || typeof v.instruction !== 'string' || !v.instruction.trim() || v.instruction.length > 1000 || ('baseAssetId' in v && (typeof v.baseAssetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.baseAssetId))))
        return invalid('request_values');
    return { locale: v.locale as StoryboardRequest['locale'], style: v.style as StoryboardRequest['style'], instruction: v.instruction.trim(), ...(v.baseAssetId ? { baseAssetId: v.baseAssetId as string } : {}) };
}
export function parseStoryboardDocument(value: unknown, selected: readonly string[]): StoryboardDocument {
    const v = object(value, 'document_shape');
    keys(v, ['schemaVersion', 'title', 'scenes'], [], 'document_keys');
    if (v.schemaVersion !== 1) return invalid('schema_version');
    if (!Array.isArray(v.scenes) || v.scenes.length < 3 || v.scenes.length > 6)
        return invalid('scene_count');
    const covered = new Set<string>();
    const scenes = v.scenes.map((raw, index) => {
        const prefix = `scene_${index}`;
        const s = object(raw, `${prefix}:shape`);
        keys(s, ['title', 'narration', 'visualAction', 'durationSeconds', 'sourceClaimIds'], ['animation'], `${prefix}:keys`);
        if (!Number.isInteger(s.durationSeconds) || Number(s.durationSeconds) < 4 || Number(s.durationSeconds) > 20)
            return invalid(`${prefix}:duration`);
        if (!Array.isArray(s.sourceClaimIds) || s.sourceClaimIds.length < 1 || s.sourceClaimIds.length > 12 || new Set(s.sourceClaimIds).size !== s.sourceClaimIds.length || s.sourceClaimIds.some(id => typeof id !== 'string' || !selected.includes(id)))
            return invalid(`${prefix}:source_claims`);
        const ids = s.sourceClaimIds as string[];
        ids.forEach(id => covered.add(id));
        let animation: SceneAnimation | undefined;
        if ('animation' in s) {
            try { animation = parseSceneAnimation(s.animation, ids); }
            catch (error) {
                if (error instanceof PresentationAssetError && error.message.startsWith('animation:')) invalid(`${prefix}:${error.message}`);
                throw error;
            }
        }
        return { title: text(s.title, 120, `${prefix}:title`), narration: text(s.narration, 600, `${prefix}:narration`), visualAction: text(s.visualAction, 1000, `${prefix}:visual_action`), durationSeconds: s.durationSeconds as number, sourceClaimIds: [...ids], ...(animation ? { animation } : {}) };
    });
    const duration = scenes.reduce((n, s) => n + s.durationSeconds, 0);
    if (duration < 24 || duration > 90) return invalid('total_duration');
    if (selected.some(id => !covered.has(id))) return invalid('claim_coverage');
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
        return { document: parseStoryboardDocument(p.storyboardDocument, claimIds), locale: settings.locale, style: settings.style, ...(settings.baseAssetId ? { baseAssetId: settings.baseAssetId } : {}) };
    }
    catch {
        return undefined;
    }
}
