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
