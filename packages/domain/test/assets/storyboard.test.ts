import { expect, it } from 'vitest';
import { parseStoryboardDocument, parseStoryboardRequest } from '../../src/assets/storyboard';
const id = '50000000-0000-4000-8000-000000000001';
const doc = () => ({ schemaVersion: 1, title: 'Study', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Qualified finding', visualAction: 'Draw wave', durationSeconds: 8, sourceClaimIds: [id] })) });
it('validates bounded sourced documents and strict settings', () => {
    expect(parseStoryboardRequest({ locale: 'en', style: 'ink', instruction: 'Explain' })).toEqual({ locale: 'en', style: 'ink', instruction: 'Explain', output: 'video' });
    expect(parseStoryboardDocument(doc(), [id])).toEqual(doc());
    for (const value of [{ ...doc(), extra: 1 }, { ...doc(), scenes: doc().scenes.slice(1) }, { ...doc(), scenes: doc().scenes.map(s => ({ ...s, durationSeconds: 4 })) }, { ...doc(), scenes: doc().scenes.map(s => ({ ...s, sourceClaimIds: ['unknown'] })) }])
        expect(() => parseStoryboardDocument(value, [id])).toThrow();
    expect(() => parseStoryboardDocument(doc(), [id, 'another'])).toThrow();
    expect(() => parseStoryboardRequest({ locale: 'en', style: 'ink', instruction: 'x'.repeat(1001) })).toThrow();
});
it('rejects coercible settings and empty instructions', () => { for (const settings of [{ locale: ['en'], style: 'ink', instruction: 'Explain' }, { locale: 'en', style: ['ink'], instruction: 'Explain' }, { locale: 'en', style: 'ink', instruction: '  ' }])
    expect(() => parseStoryboardRequest(settings)).toThrow(); });

it('preserves a source-grounded commercial video direction brief', () => {
    const production = {
        schemaVersion: 1,
        narrativeArc: 'question-mechanism-takeaway',
        visualContinuity: 'Keep the same teal object, scale and left-to-right reading direction across shots.',
        audioPolicy: 'compare-before-publish',
        modelPolicy: 'commercial-primary',
    };
    const direction = {
        shotType: 'mechanism',
        purpose: 'Show the supported transfer relationship.',
        subjectLock: 'The teal source stays the same size and remains left of the amber receiver.',
        generatedElements: 'A restrained luminous trace connects the two source-supported objects.',
        motion: 'The trace advances once from source to receiver; no extra particles or forces.',
        camera: 'Slow three-quarter push-in while keeping both objects readable.',
        reference: 'scene-artwork',
        frameStrategy: 'start-reference',
        audioMode: 'external-narration',
        subtitleMode: 'sidecar',
        negativeConstraints: ['No invented apparatus', 'No unsupported labels or measurements'],
        modelPolicy: 'commercial-primary',
    };
    const value = { ...doc(), videoProduction: production, scenes: doc().scenes.map(scene => ({ ...scene, videoDirection: direction })) };
    expect(parseStoryboardDocument(value, [id])).toEqual(value);
    expect(() => parseStoryboardDocument({ ...value, scenes: value.scenes.map(scene => ({ ...scene, videoDirection: { ...direction, audioMode: 'qwen-must-be-used' } })) }, [id])).toThrow();
    expect(() => parseStoryboardDocument({ ...value, videoProduction: { ...production, extra: true } }, [id])).toThrow();
});
