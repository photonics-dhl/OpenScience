import { describe, expect, it } from 'vitest';
import { describeIllustrationBrief, type IllustrationBrief } from '../../src/assets/illustration-brief';
import { parseStoryboardDocument, parseStoryboardRequest, presentationStoryboardView, type StoryboardDocument } from '../../src/assets/storyboard';

const claimId = '50000000-0000-4000-8000-000000000001';
const otherClaimId = '50000000-0000-4000-8000-000000000002';
const assetId = '60000000-0000-4000-8000-000000000001';
const evidenceId = '70000000-0000-4000-8000-000000000001';
const nativeOptions = { nativeNarrativeVideo: true };
const settings = () => ({ locale: 'en', style: 'ink', instruction: 'Explain the supported mechanism', output: 'video', narrative: true });
const illustration = (): IllustrationBrief => ({
    schemaVersion: 2,
    message: 'The source transfers energy to the receiver.',
    domain: 'real-space',
    encoding: 'Left-to-right placement represents the supported transfer direction.',
    subjects: [{ description: 'A teal source left of an amber receiver', basis: { claimId, evidenceId, quote: 'The source transfers energy to the receiver.' } }],
    composition: 'Keep both objects visible at the same scale.',
    treatment: 'Clean scientific linework with restrained color.',
    labels: ['Source', 'Receiver'],
    constraints: ['Do not add apparatus or measurements.'],
});
const production = (): NonNullable<StoryboardDocument['videoProduction']> => ({
    schemaVersion: 1,
    narrativeArc: 'question-mechanism-takeaway',
    visualContinuity: 'Keep the teal source left of the amber receiver throughout.',
    audioPolicy: 'external-narration',
    modelPolicy: 'commercial-primary',
});
const direction = (): NonNullable<StoryboardDocument['scenes'][number]['videoDirection']> => ({
    shotType: 'mechanism',
    purpose: 'Explain the supported transfer.',
    subjectLock: 'Keep both objects at the same scale and relative position.',
    generatedElements: 'One trace between the source and receiver.',
    motion: 'The trace advances once from the source to the receiver.',
    camera: 'Slow push-in with both objects visible.',
    reference: 'scene-artwork',
    frameStrategy: 'start-reference',
    audioMode: 'external-narration',
    subtitleMode: 'sidecar',
    negativeConstraints: ['No invented apparatus or measurements'],
    modelPolicy: 'commercial-primary',
});
const nativeDocument = (count = 3) => ({
    schemaVersion: 1,
    title: 'Supported energy transfer',
    narrative: { mainMessage: 'Explain how the source transfers energy.', audience: 'Researchers outside this field' },
    videoProduction: production(),
    scenes: Array.from({ length: count }, (_, index) => {
        const brief = illustration();
        return { title: `Scene ${index + 1}`, narration: 'The source transfers energy to the receiver.',
            visualAction: describeIllustrationBrief(brief), illustration: brief, durationSeconds: [5, 10, 15][index % 3]!,
            sourceClaimIds: [claimId], videoDirection: direction() };
    }),
});
const legacyDocument = () => ({
    schemaVersion: 1, title: 'Legacy video',
    scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'n'.repeat(600), visualAction: 'Draw the supported transfer.', durationSeconds: 8, sourceClaimIds: [claimId] })),
});
const imageDocument = () => {
    const scene = nativeDocument().scenes[0]!;
    const { durationSeconds, videoDirection, ...imageScene } = scene;
    return { schemaVersion: 1, title: 'Image narrative', narrative: nativeDocument().narrative, scenes: [{ ...imageScene, narration: 'n'.repeat(600) }] };
};
const saved = (storyboardSettings: unknown, storyboardDocument: unknown) => ({
    kind: 'interactive_html', provenance: { subtype: 'sourced_storyboard', storyboardSettings, storyboardDocument, internal: 'not projected' },
});
const parseNative = (value: unknown, selected: readonly string[] = [claimId]) => parseStoryboardDocument(value, selected, 'video', nativeOptions);

describe('native narrative video storyboard shape', () => {
    it('accepts the explicit video option and preserves the complete document through its saved view', () => {
        const request = parseStoryboardRequest({ ...settings(), baseAssetId: assetId, revisionSceneIndex: 0 });
        expect(request).toEqual({ ...settings(), baseAssetId: assetId, revisionSceneIndex: 0 });
        const document = parseNative(nativeDocument());
        expect(document).toEqual(nativeDocument());
        expect(presentationStoryboardView(saved(request, JSON.parse(JSON.stringify(document))), [claimId])).toEqual({
            document, locale: 'en', style: 'ink', output: 'video', narrative: true, baseAssetId: assetId,
        });
    });

    it('accepts native video requests without a revision and preserves zero and five as revision scene indices', () => {
        expect(parseStoryboardRequest(settings())).toEqual(settings());
        for (const revisionSceneIndex of [0, 5]) {
            expect(parseStoryboardRequest({ ...settings(), baseAssetId: assetId, revisionSceneIndex }).revisionSceneIndex).toBe(revisionSceneIndex);
        }
    });

    it('uses the illustration visual-action budget and preserves optional style recommendations', () => {
        const document = nativeDocument();
        const brief = { ...illustration(), composition: 'c'.repeat(1200) };
        document.scenes[0] = { ...document.scenes[0]!, illustration: brief, visualAction: describeIllustrationBrief(brief) };
        const styleRecommendations = { selectedStyleId: 'article:editorial', choices: [{ styleId: 'article:editorial', name: 'Editorial', reason: 'Keep both subjects readable.' }] };
        const value = { ...document, scenes: document.scenes.map(scene => ({ ...scene, styleRecommendations })) };
        expect(parseNative(value)).toEqual(value);
        const malformedMetadata = { ...document, scenes: document.scenes.map(scene => ({ ...scene, styleRecommendations: { choices: [] } })) };
        expect(parseNative(malformedMetadata)).toEqual(document);
    });

    it.each([5, 10, 15])('accepts a %i-second scene within the existing total duration bounds', durationSeconds => {
        const document = nativeDocument();
        document.scenes[0]!.durationSeconds = durationSeconds;
        expect(parseNative(document)).toEqual(document);
    });

    it('accepts six scenes at 90 seconds and enforces the existing minimum total duration', () => {
        const document = nativeDocument(6);
        document.scenes.forEach(scene => { scene.durationSeconds = 15; });
        expect(parseNative(document)).toEqual(document);
        const tooShort = nativeDocument();
        tooShort.scenes.forEach(scene => { scene.durationSeconds = 5; });
        expect(() => parseNative(tooShort)).toThrow('storyboard:total_duration');
    });

    it.each([2, 7])('rejects %i scenes', count => {
        expect(() => parseNative(nativeDocument(count))).toThrow('storyboard:scene_count');
    });

    it.each(['narrative', 'videoProduction'])('requires root %s, including when explicitly undefined', field => {
        const document: Record<string, unknown> = nativeDocument();
        delete document[field];
        expect(() => parseNative(document)).toThrow('storyboard:document_keys');
        document[field] = undefined;
        expect(() => parseNative(document)).toThrow(field === 'narrative' ? 'storyboard:narrative_shape' : 'storyboard:video_production_shape');
    });

    it.each(['illustration', 'videoDirection'])('requires scene %s, including when explicitly undefined', field => {
        const document = nativeDocument();
        const scene = document.scenes[0]! as Record<string, unknown>;
        delete scene[field];
        expect(() => parseNative(document)).toThrow('storyboard:scene_0:keys');
        scene[field] = undefined;
        expect(() => parseNative(document)).toThrow(field === 'illustration' ? 'illustration_brief:root:object_required' : 'storyboard:scene_0:video_direction_shape');
    });

    it.each([4, 6, 8, 20, 5.5, '10', null])('rejects a native scene duration of %s', durationSeconds => {
        const document = nativeDocument();
        const value = { ...document, scenes: document.scenes.map((scene, index) => index === 0 ? { ...scene, durationSeconds } : scene) };
        expect(() => parseNative(value)).toThrow('storyboard:scene_0:duration');
    });

    it('limits narration to 120 characters per scene and 450 across the document', () => {
        const document = nativeDocument(4);
        document.scenes.forEach((scene, index) => { scene.narration = 'n'.repeat(index === 3 ? 90 : 120); });
        expect(parseNative(document)).toEqual(document);
        document.scenes[3]!.narration += 'n';
        expect(() => parseNative(document)).toThrow('storyboard:total_narration');
        document.scenes[3]!.narration = 'n'.repeat(90);
        document.scenes[0]!.narration += 'n';
        expect(() => parseNative(document)).toThrow('storyboard:scene_0:narration:length_121:max_120');
    });

    it('requires commercial model policies at root and scene level', () => {
        const document = nativeDocument();
        document.videoProduction.modelPolicy = 'local-preview';
        expect(() => parseNative(document)).toThrow('storyboard:video_production_model_policy');
        document.videoProduction.modelPolicy = 'commercial-primary';
        document.scenes[0]!.videoDirection.modelPolicy = 'local-preview';
        expect(() => parseNative(document)).toThrow('storyboard:scene_0:video_direction_model_policy');
    });

    it('uses the existing direction and production field validators', () => {
        const document = nativeDocument();
        expect(() => parseNative({ ...document, videoProduction: { ...document.videoProduction, audioPolicy: 'unknown' } })).toThrow('storyboard:video_production_audio_policy');
        document.scenes[0]!.videoDirection.motion = '';
        expect(() => parseNative(document)).toThrow('storyboard:scene_0:video_direction_motion:empty');
    });

    it('validates illustration sources against the scene and requires its exact visual-action description', () => {
        const document = nativeDocument();
        document.scenes[0]!.illustration.subjects[0]!.basis.claimId = otherClaimId;
        expect(() => parseNative(document, [claimId, otherClaimId])).toThrow('illustration_brief:subjects_0_basis:invalid_bound_source');
        document.scenes[0]!.illustration.subjects[0]!.basis.claimId = claimId;
        document.scenes[0]!.visualAction += ' Invent a second transfer.';
        expect(() => parseNative(document)).toThrow('storyboard:scene_0:illustration_description_mismatch');
    });

    it('retains selected-claim coverage and rejects unknown scene claims', () => {
        const document = nativeDocument();
        expect(() => parseNative(document, [claimId, otherClaimId])).toThrow('storyboard:claim_coverage');
        document.scenes[0]!.sourceClaimIds = [otherClaimId];
        expect(() => parseNative(document)).toThrow('storyboard:scene_0:source_claims');
    });

    it('rejects paper-original bindings and unrecognized native fields', () => {
        const document = nativeDocument();
        const paperOriginal = { assetId, objectKey: `blobs/aa/${'a'.repeat(64)}`, contentHash: 'a'.repeat(64) };
        expect(() => parseNative({ ...document, scenes: document.scenes.map(scene => ({ ...scene, paperOriginal })) })).toThrow('storyboard:scene_0:keys');
        expect(() => parseNative({ ...document, extra: true })).toThrow('storyboard:document_keys');
        expect(() => parseNative({ ...document, scenes: document.scenes.map(scene => ({ ...scene, extra: true })) })).toThrow('storyboard:scene_0:keys');
    });

    it('hides saved native plans with missing fields or mismatched settings', () => {
        const document = nativeDocument();
        expect(presentationStoryboardView(saved(settings(), { ...document, videoProduction: undefined }), [claimId])).toBeUndefined();
        expect(presentationStoryboardView(saved({ ...settings(), narrative: undefined }, document), [claimId])).toBeUndefined();
        expect(presentationStoryboardView(saved({ ...settings(), output: 'image' }, document), [claimId])).toBeUndefined();
    });
});

describe('revision scene request combinations', () => {
    it.each([
        ['negative', { revisionSceneIndex: -1 }],
        ['above five', { revisionSceneIndex: 6 }],
        ['fractional', { revisionSceneIndex: 0.5 }],
        ['string', { revisionSceneIndex: '0' }],
        ['null', { revisionSceneIndex: null }],
        ['undefined', { revisionSceneIndex: undefined }],
        ['missing parent', { baseAssetId: undefined }],
        ['invalid parent', { baseAssetId: 'invalid' }],
        ['image output', { output: 'image' }],
        ['missing output', { output: undefined }],
        ['missing narrative', { narrative: undefined }],
        ['false narrative', { narrative: false }],
        ['image art mode', { revisionMode: 'art' }],
        ['image art index', { artSceneIndex: 0 }],
        ['image task revision', { revisionTaskId: assetId }],
        ['image asset revision', { revisionImageAssetId: assetId, narrativeSceneLimit: 3 }],
        ['figure plan', { figurePlan: { figures: [{ id: 'Fig. 1', decision: 're-render' }] } }],
    ])('rejects %s for a video scene revision', (_label, fields) => {
        expect(() => parseStoryboardRequest({ ...settings(), baseAssetId: assetId, revisionSceneIndex: 0, ...fields })).toThrow('storyboard:request_values');
    });

    it('requires present output, narrative and parent fields rather than inferred revision defaults', () => {
        for (const field of ['output', 'narrative', 'baseAssetId']) {
            const request: Record<string, unknown> = { ...settings(), baseAssetId: assetId, revisionSceneIndex: 0 };
            delete request[field];
            expect(() => parseStoryboardRequest(request)).toThrow('storyboard:request_values');
        }
    });
});

describe('legacy storyboard compatibility', () => {
    it('keeps legacy videos, long narrations and local-preview directions unchanged', () => {
        const document = legacyDocument();
        expect(parseStoryboardDocument(document, [claimId])).toEqual(document);
        expect(parseStoryboardDocument(document, [claimId], 'video', {})).toEqual(document);
        expect(parseStoryboardDocument(document, [claimId], 'video', { nativeNarrativeVideo: false })).toEqual(document);
        const directed = { ...document, videoProduction: { ...production(), modelPolicy: 'local-preview' },
            scenes: document.scenes.map(scene => ({ ...scene, videoDirection: { ...direction(), modelPolicy: 'local-preview' } })) };
        expect(parseStoryboardDocument(directed, [claimId])).toEqual(directed);
        expect(presentationStoryboardView(saved({ locale: 'en', style: 'ink', instruction: 'Explain' }, document), [claimId])).toEqual({ document, locale: 'en', style: 'ink', output: 'video' });
    });

    it('rejects the new root and scene keys unless native video parsing is explicitly enabled', () => {
        const document = legacyDocument();
        expect(() => parseStoryboardDocument(nativeDocument(), [claimId])).toThrow('storyboard:document_keys');
        expect(() => parseStoryboardDocument(nativeDocument(), [claimId], 'video', { nativeNarrativeVideo: false })).toThrow('storyboard:document_keys');
        for (const fields of [{ illustration: illustration() }, { styleRecommendations: { choices: [] } }]) {
            expect(() => parseStoryboardDocument({ ...document, scenes: document.scenes.map(scene => ({ ...scene, ...fields })) }, [claimId])).toThrow('storyboard:scene_0:keys');
        }
    });

    it('keeps image parsing and views unchanged even when the native video option is present', () => {
        const document = imageDocument();
        expect(parseStoryboardDocument(document, [claimId], 'image')).toEqual(document);
        expect(parseStoryboardDocument(document, [claimId], 'image', nativeOptions)).toEqual(document);
        const request = { ...settings(), output: 'image', baseAssetId: assetId, revisionMode: 'art', artSceneIndex: 0 };
        expect(parseStoryboardRequest(request)).toEqual(request);
        expect(presentationStoryboardView(saved(request, document), [claimId])).toEqual({ document, locale: 'en', style: 'ink', output: 'image', narrative: true, baseAssetId: assetId, artSceneIndex: 0 });
        expect(() => parseStoryboardDocument({ ...document, videoProduction: production() }, [claimId], 'image', nativeOptions)).toThrow('storyboard:document_keys');
    });
});
