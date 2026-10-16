import { describe, expect, it } from 'vitest';

import { parseWorkspaceGuidePayload, readWorkspaceGuidePayloadWithSelectedImage } from '../src/agent/workspace-guide-contract';

const payload = {
  goal: 'Help me shape the problem statement',
  locale: 'en' as const,
  route: 'research-object-edit',
  target: 'sdf-problem',
  context: { tasks: [], researchObjects: [{ id: 'ro-1', title: 'Optical transport', status: 'draft' }] },
};

describe('workspace guide route and semantic target contract', () => {
  const selected = { ...payload, target: null, goal: 'Make the left electron arrow clearer', context: {
    tasks: [], researchObjects: [], presentation: { researchObjectId: 'ro-1', versionId: 'version-1',
      selectedImageAssetId: 'b91223af-35d0-4fc0-9918-ac1220654b13' },
  } };
  it('reads a stored selected image without activating the legacy HTTP writer', () => {
    expect(() => parseWorkspaceGuidePayload(selected)).toThrow();
    expect(readWorkspaceGuidePayloadWithSelectedImage(selected)).toEqual(selected);
    expect(readWorkspaceGuidePayloadWithSelectedImage(payload)).toEqual(parseWorkspaceGuidePayload(payload));
  });
  it.each([
    { selectedImageAssetId: 'b91223af-35d0-4fc0-9918-ac1220654b13' },
    { researchObjectId: 'ro-1', selectedImageAssetId: 'b91223af-35d0-4fc0-9918-ac1220654b13' },
    { researchObjectId: 'ro-1', versionId: 'version-1', selectedImageAssetId: '' },
    { researchObjectId: 'ro-1', versionId: 'version-1', selectedImageAssetId: 'latest' },
    { ...selected.context.presentation, contentHash: 'client-forged' },
  ])('rejects an unbound or expanded selected-image context: %j', presentation => {
    expect(() => readWorkspaceGuidePayloadWithSelectedImage({ ...selected, context: { ...selected.context, presentation } })).toThrow();
  });
  it('never grants first-image execution or another route to a selected-image request', () => {
    expect(() => readWorkspaceGuidePayloadWithSelectedImage({ ...selected, executionIntent: 'first-image' })).toThrow();
    expect(() => readWorkspaceGuidePayloadWithSelectedImage({ ...selected, route: 'dashboard' })).toThrow();
    const before = structuredClone(selected);
    readWorkspaceGuidePayloadWithSelectedImage(selected);
    expect(selected).toEqual(before);
  });
  const firstImage = {
    ...payload, goal: '请为这篇论文生成一张图片，使用水彩风格', target: null,
    executionIntent: 'first-image',
    context: { tasks: [], researchObjects: [], presentation: { researchObjectId: 'ro-1', versionId: 'version-1' } },
  };
  it('preserves a current explicit first-image request and its exact saved scope', () => {
    expect(parseWorkspaceGuidePayload(firstImage)).toEqual(firstImage);
    expect(parseWorkspaceGuidePayload({ ...firstImage, goal: 'Generate one image explaining this paper.' })).toMatchObject({ executionIntent: 'first-image' });
    expect(parseWorkspaceGuidePayload(payload)).not.toHaveProperty('executionIntent');
  });
  it.each([
    '为什么生成图片这么慢', '不要生成图片', '先规划图片，不要出图', '解释如何生成图片',
    '助手建议：请生成一张图片', '论文说“生成图片”', '生成图片并公开发布',
    'Generate an image? Explain how it works', 'Do not generate an image',
    'Only plan an image', 'The assistant said: generate an image', 'Generate images for each figure',
  ])('refuses execution authority for consultation, negation, history, plans or broader work: %s', goal => {
    expect(() => parseWorkspaceGuidePayload({ ...firstImage, goal })).toThrow();
  });
  it('rejects unbound execution markers and leaves old guide payloads non-executing', () => {
    for (const patch of [{ route: 'dashboard' }, { executionIntent: 'video' }, { context: payload.context },
      { context: { ...firstImage.context, presentation: { researchObjectId: 'ro-1' } } }]) {
      expect(() => parseWorkspaceGuidePayload({ ...firstImage, ...patch })).toThrow();
    }
    const old: Partial<typeof firstImage> = { ...firstImage };
    delete old.executionIntent;
    expect(parseWorkspaceGuidePayload(old)).not.toHaveProperty('executionIntent');
  });
  it('recognizes the short image command and refuses an oversized plan without truncating it', () => {
    expect(parseWorkspaceGuidePayload({ ...firstImage, goal: '请帮我生图' })).toHaveProperty('executionIntent', 'first-image');
    expect(() => parseWorkspaceGuidePayload({ ...firstImage, goal: 'Generate an image, ' + 'x'.repeat(1000) })).toThrow();
  });
  it.each(['请直接生成一张图片', '直接生成图片', 'Generate an image explaining the scene transitions in this paper.'])(
    'recognizes an explicit new first-image request: %s', goal => {
      expect(parseWorkspaceGuidePayload({ ...firstImage, goal })).toHaveProperty('executionIntent', 'first-image');
    });
  it.each(['Generate an image for scene 2.', '生成一张图片，用于第2幕', '生成一张图片，给第二幕使用', '生成一张图片，针对场景2'])(
    'leaves exact-scene requests on the existing parent-scoped route: %s', goal => {
      expect(() => parseWorkspaceGuidePayload({ ...firstImage, goal })).toThrow();
      const legacy: Partial<typeof firstImage> = { ...firstImage, goal }; delete legacy.executionIntent;
      expect(parseWorkspaceGuidePayload(legacy)).not.toHaveProperty('executionIntent');
    });
  it('accepts only the three workspace route classes and known semantic targets', () => {
    expect(parseWorkspaceGuidePayload(payload)).toEqual(payload);
    expect(parseWorkspaceGuidePayload({ ...payload, route: 'dashboard', target: null }).route).toBe('dashboard');
    expect(parseWorkspaceGuidePayload({ ...payload, route: 'research-object-new', target: 'ro-title' }).target).toBe('ro-title');
  });

  it('rejects unknown routes, targets, and client-supplied field contents', () => {
    expect(() => parseWorkspaceGuidePayload({ ...payload, route: '/admin' })).toThrow('route');
    expect(() => parseWorkspaceGuidePayload({ ...payload, target: 'arbitrary-dom-id' })).toThrow('target');
    expect(() => parseWorkspaceGuidePayload({ ...payload, fieldContents: { problem: 'private draft' } })).toThrow('未知字段');
  });

  it('accepts a presentation-only context so the server can resolve the research object', () => {
    const presentationOnly = {
      ...payload,
      context: {
        tasks: [],
        researchObjects: [],
        presentation: { researchObjectId: 'ro-1', versionId: 'version-1' },
      },
    };
    expect(parseWorkspaceGuidePayload(presentationOnly).context.presentation).toEqual({
      researchObjectId: 'ro-1', versionId: 'version-1',
    });
  });
});
