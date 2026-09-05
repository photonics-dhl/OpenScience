import { expect, it } from 'vitest';
import { parseStoryboardDocument, parseStoryboardRequest } from '../../src/assets/storyboard';
const id = '50000000-0000-4000-8000-000000000001';
const doc = () => ({ schemaVersion: 1, title: 'Study', scenes: Array.from({ length: 3 }, () => ({ title: 'Scene', narration: 'Qualified finding', visualAction: 'Draw wave', durationSeconds: 8, sourceClaimIds: [id] })) });
it('validates bounded sourced documents and strict settings', () => {
    expect(parseStoryboardRequest({ locale: 'en', style: 'ink', instruction: 'Explain' })).toEqual({ locale: 'en', style: 'ink', instruction: 'Explain' });
    expect(parseStoryboardDocument(doc(), [id])).toEqual(doc());
    for (const value of [{ ...doc(), extra: 1 }, { ...doc(), scenes: doc().scenes.slice(1) }, { ...doc(), scenes: doc().scenes.map(s => ({ ...s, durationSeconds: 4 })) }, { ...doc(), scenes: doc().scenes.map(s => ({ ...s, sourceClaimIds: ['unknown'] })) }])
        expect(() => parseStoryboardDocument(value, [id])).toThrow();
    expect(() => parseStoryboardDocument(doc(), [id, 'another'])).toThrow();
    expect(() => parseStoryboardRequest({ locale: 'en', style: 'ink', instruction: 'x'.repeat(1001) })).toThrow();
});
it('rejects coercible settings and empty instructions', () => { for (const settings of [{ locale: ['en'], style: 'ink', instruction: 'Explain' }, { locale: 'en', style: ['ink'], instruction: 'Explain' }, { locale: 'en', style: 'ink', instruction: '  ' }])
    expect(() => parseStoryboardRequest(settings)).toThrow(); });
