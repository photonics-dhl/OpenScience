import { PresentationAssetError } from './errors';
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
    }>;
}
export interface StoryboardView {
    document: StoryboardDocument;
    locale: StoryboardRequest['locale'];
    style: StoryboardRequest['style'];
    baseAssetId?: string;
}
function invalid(): never { throw new PresentationAssetError('VALIDATION_ERROR', 'Storyboard is invalid or exceeds supported bounds'); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid(); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) { if (required.some(k => !(k in value)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k)))
    invalid(); }
function text(value: unknown, max: number): string { if (typeof value !== 'string' || !value.trim() || value.length > max)
    return invalid(); return value; }
export function parseStoryboardRequest(value: unknown): StoryboardRequest {
    const v = object(value);
    keys(v, ['locale', 'style', 'instruction'], ['baseAssetId']);
    if (typeof v.locale !== 'string' || !['zh', 'en'].includes(v.locale) || typeof v.style !== 'string' || !['watercolor', 'technical', 'ink'].includes(v.style) || typeof v.instruction !== 'string' || !v.instruction.trim() || v.instruction.length > 1000 || ('baseAssetId' in v && (typeof v.baseAssetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.baseAssetId))))
        return invalid();
    return { locale: v.locale as StoryboardRequest['locale'], style: v.style as StoryboardRequest['style'], instruction: v.instruction.trim(), ...(v.baseAssetId ? { baseAssetId: v.baseAssetId as string } : {}) };
}
export function parseStoryboardDocument(value: unknown, selected: readonly string[]): StoryboardDocument {
    const v = object(value);
    keys(v, ['schemaVersion', 'title', 'scenes']);
    if (v.schemaVersion !== 1 || !Array.isArray(v.scenes) || v.scenes.length < 3 || v.scenes.length > 6)
        return invalid();
    const covered = new Set<string>();
    const scenes = v.scenes.map(raw => {
        const s = object(raw);
        keys(s, ['title', 'narration', 'visualAction', 'durationSeconds', 'sourceClaimIds']);
        if (!Number.isInteger(s.durationSeconds) || Number(s.durationSeconds) < 4 || Number(s.durationSeconds) > 20 || !Array.isArray(s.sourceClaimIds) || s.sourceClaimIds.length < 1 || s.sourceClaimIds.length > 12 || new Set(s.sourceClaimIds).size !== s.sourceClaimIds.length || s.sourceClaimIds.some(id => typeof id !== 'string' || !selected.includes(id)))
            return invalid();
        const ids = s.sourceClaimIds as string[];
        ids.forEach(id => covered.add(id));
        return { title: text(s.title, 120), narration: text(s.narration, 600), visualAction: text(s.visualAction, 1000), durationSeconds: s.durationSeconds as number, sourceClaimIds: [...ids] };
    });
    const duration = scenes.reduce((n, s) => n + s.durationSeconds, 0);
    if (duration < 24 || duration > 90 || selected.some(id => !covered.has(id)))
        return invalid();
    return { schemaVersion: 1, title: text(v.title, 120), scenes };
}
/** Never expose arbitrary provenance or a malformed saved plan. */
export function presentationStoryboardView(asset: {
    kind: string;
    provenance: unknown;
}, claimIds: readonly string[]): StoryboardView | undefined {
    try {
        const p = object(asset.provenance);
        if (asset.kind !== 'interactive_html' || p.subtype !== 'sourced_storyboard')
            return undefined;
        const settings = parseStoryboardRequest({ ...object(p.storyboardSettings) });
        return { document: parseStoryboardDocument(p.storyboardDocument, claimIds), locale: settings.locale, style: settings.style, ...(settings.baseAssetId ? { baseAssetId: settings.baseAssetId } : {}) };
    }
    catch {
        return undefined;
    }
}
