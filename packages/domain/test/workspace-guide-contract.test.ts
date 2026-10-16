import { describe, expect, it } from 'vitest';

import { parseWorkspaceGuidePayload, readWorkspaceGuidePayloadWithSelectedImage, selectedImageProductionIntent } from '../src/agent/workspace-guide-contract';

describe('selected-image production intent', () => {
  it.each(['Make the left arrow thinner', 'Please redraw the selected image', 'Could you change its style to watercolor?',
    'Clarify the left connecting line', '把左边箭头改细一点',
    '把左边箭头画细一点', '把左边箭头画细一点，不要修改其他内容',
    'Please redraw the left arrow; do not change the other regions', 'Change the label “为什么” to Why',
    '请把文字“不要”移到右下角', 'Change the left arrow, but do not publish anything',
    '把图中左边的箭头改细一点并解释原因',
    'Change the left arrow and explain why', '把图中左边的箭头改细一点',
    '把“MQED”移到右下角'])('accepts an explicit current imperative: %s', goal => {
    expect(selectedImageProductionIntent(goal)).toBe(true);
  });
  it.each(['Can you explain how to modify the arrow?', 'Tell me how to redraw this', 'Suggest a plan to improve the image',
    'Generate a plan for a new image', 'The paper says to redraw the arrow', 'The phrase "generate an image" is in the title',
    'Should we change this figure?', 'If needed, redraw it', 'Do not regenerate this image', 'Why change the arrow?',
    '论文说“生成图片”这几个字是什么意思', '先不生成，只讨论修改方案', '请解释如何修改箭头',
    'Change the arrow only if the author supports it', '把箭头改细，但不要生成新图', '请不要把箭头改细',
    '请给我解释如何修改图中的箭头', '给我解释如何修改图中的箭头', '请给大家解释如何修改图中的箭头',
    '请为我们解释如何修改图中的箭头', '给我一份修改这张图的方案',
    '请给我说明怎么生成这张图片', '为读者解释修改箭头的方案',
    '给大家一份修改这张图的方案', '给这张图的修改方案提些建议',
    '给这张图的说明标签改细一点', '给大家解释如何修改箭头并解释原因',
    '把修改图的方法告诉我', '修改图的方法告诉我',
    '把图中左边的箭头改细一点后告诉我原因', '把标签“改细一点”告诉我',
    '把改细一点', '把“”改细一点', '请把左边箭头千万别改细', '把箭头不改细',
    '给我示范把箭头改细一点', 'Modify the arrow but do not redraw it',
    '将来再把箭头改细一点'])('does not turn discussion into production: %s', goal => {
    expect(selectedImageProductionIntent(goal)).toBe(false);
  });
  it.each(['给这张图修改左边箭头', '给这张图修改左边箭头并解释原因',
    '请把第二张图换成水彩风格', '修改这张图的右上角', '为我们重画第二张图的右上角',
    '请给我把左边箭头改细一点', '将图中左边的箭头改细一点'])(
    'retains an unsupported complete-argument form without production authority: %s', goal => {
      expect(selectedImageProductionIntent(goal)).toBe(false);
    });
  it.each(['把这句原话“把箭头改细一点', '把“箭头改细一点', '把「箭头改细一点',
    '把《箭头改细一点', '把‘箭头改细一点', '把"箭头改细一点', '把箭头改细一点”',
    '把“箭头」改细一点', '“把箭头改细一点”'])(
    'refuses unmatched quotes and quoted instruction-only text: %s', goal => {
      expect(selectedImageProductionIntent(goal)).toBe(false);
    });
  it.each(['“MQED”', '‘MQED’', '「MQED」', '《MQED》', '"MQED"', '“标签‘不要’”'])(
    'binds a balanced quoted object only to the outside predicate: %s', label => {
      expect(selectedImageProductionIntent(`把${label}移到右下角`)).toBe(true);
    });
});

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
