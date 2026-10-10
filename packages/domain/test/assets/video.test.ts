import { describe, expect, it } from 'vitest';
import { ONCHIP_SCENE_ROLES, parseVideoGenerationRequest } from '../../src/assets/video';

const UUIDS = Array.from({ length: 6 }, (_, index) => `${index + 1}0000000-0000-4000-8000-000000000001`);

describe('fixed on-chip video contract', () => {
  it('requires five unique images and the explicit reviewed mechanism-role order', () => {
    const valid = {
      storyboardAssetId: UUIDS[0], sceneImageAssetIds: UUIDS.slice(1),
      sceneRoles: ONCHIP_SCENE_ROLES, profile: 'onchip-field-sampling-v1',
    };
    expect(parseVideoGenerationRequest(valid)).toEqual(valid);
    expect(() => parseVideoGenerationRequest({ ...valid, sceneRoles: [...ONCHIP_SCENE_ROLES].reverse() })).toThrow();
    expect(() => parseVideoGenerationRequest({ ...valid, sceneImageAssetIds: [UUIDS[1], UUIDS[1], ...UUIDS.slice(3)] })).toThrow();
  });
});

describe('source-bound short narration audition request', () => {
  const base = { profile: 'content-driven-v1', storyboardAssetId: UUIDS[0], sceneImageAssetIds: UUIDS.slice(1, 4) };
  const audition = { ...base, purpose: 'audio-audition', sceneIndex: 1,
    audio: { provider: 'synclip', voice: 'catalog-selected-voice', speed: 1 }, locale: 'en' };

  it('accepts only explicit original-scene narration with the chosen voice and language', () => {
    expect(parseVideoGenerationRequest(audition)).toEqual(audition);
  });

  it('preserves the exact absent-purpose legacy object and serialization', () => {
    const original = { profile: base.profile, storyboardAssetId: base.storyboardAssetId, sceneImageAssetIds: base.sceneImageAssetIds };
    expect(JSON.stringify(parseVideoGenerationRequest(base))).toBe(JSON.stringify(original));
    expect(parseVideoGenerationRequest(base)).not.toHaveProperty('purpose');
  });

  it.each([
    { ...audition, purpose: 'video' }, { ...audition, sceneIndex: 3 },
    { ...audition, locale: 'fr' }, { ...audition, audio: { ...audition.audio, voice: '' } },
    { ...audition, audio: { ...audition.audio, speed: 0 } },
    { ...audition, text: 'Caller-supplied paper claims' },
    { ...audition, maxEstimatedCoins: 999999 },
    { ...base, sceneIndex: 1 },
  ])('rejects unbound selection, narration, language and caller budget: %j', value => {
    expect(() => parseVideoGenerationRequest(value)).toThrow();
  });
});
