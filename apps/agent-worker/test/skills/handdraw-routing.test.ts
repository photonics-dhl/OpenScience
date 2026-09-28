import { describe, expect, it } from 'vitest';
import { CODEX_IMAGE_MAX_JSON_BYTES, imageSpoolRequestByteUpperBound } from '@openscience/ai-gateway';
import type { IllustrationBrief } from '@openscience/domain';
import { compileIllustrationImagePrompt } from '../../src/presentation/scene-image';
import { automaticStyleReviewGuidance, automaticStyleTreatment, loadInstalledMediaSkills, selectedAutomaticArtStyle, selectedHanddrawStyle } from '../../src/skills/installed-media-skills';
import { SCIENTIFIC_CRITICAL_THINKING_SKILL } from '../../src/skills/scientific-critical-thinking';

describe('Hermes media skill stages', () => {
  it('keeps scientific visual clarity in science without adding art routing', () => {
    const science = loadInstalledMediaSkills('editorial', '', 'science');
    expect(science.instructions).toContain('one-sentence takeaway');
    expect(science.instructions).toContain('A dot-product condition constrains a projection');
    expect(science.usage).toContainEqual(expect.objectContaining({ id: 'openscience-research-illustration', version: '17' }));
    expect(science.instructions).toContain('encoding-feasibility failure');
    expect(science.instructions).toContain('A replaceable artistic container is not scientific encoding');
    expect(science.instructions).toContain('reader-facing scientific explanation');
    expect(science.instructions).toContain('A poor narration needs ordinary scientific planning revision');
    expect(science.instructions).toContain('state that fact directly');
    expect(science.instructions).toContain('lead with that mechanism before result metrics');
    expect(science.instructions).toContain('split into focused scenes rather than omit those limits');
    expect(science.instructions).toContain('A row of interchangeable motifs plus an equation arrow and result');
    expect(science.instructions).toContain('explicit visible-label budget');
    expect(science.usage.map((item) => item.id)).toContain('openscience-scientific-visual-clarity');
    expect(science.instructions).not.toContain('Hand-drawn treatment routing');
  });

  // These cases verify the guidance delivered by the real stage loader, not a model's judgment.
  it.each([
    {
      scenario: 'an extended material shown by two circular sections',
      request: 'Use the accepted cross-section arrangement; correct the material treatment.',
      required: ['material identity, the actual entity', 'A circular section of an extended object does not establish a sphere'],
    },
    {
      scenario: 'orthogonal optical propagation, polarization and electron incidence',
      request: 'Explain the interaction with the source coordinate frame, keeping the observer direction distinct.',
      required: ['field propagation, polarization, particle trajectory and observer direction',
        'For an angle, identify both directions and the reference axis or frame', 'Rotate the whole construction consistently'],
    },
    {
      scenario: 'a gap, spatial field width and temporal pulse width in one explanation',
      request: 'Retain the sourced gap and pulse conditions without interchanging the transverse gap and longitudinal field width.',
      required: ['object, physical quantity, axis, definition and case',
        'A geometric opening, the spatial width of field amplitude or intensity, and a temporal pulse width are different quantities'],
    },
    {
      scenario: 'a caption refers to an original figure absent from the input',
      request: 'Use the described figure only to the extent established by the supplied evidence.',
      required: ['not evidence that the original figure pixels were inspected', 'identify what is missing or select a narrower supported explanation'],
    },
  ])('delivers source reconstruction guidance for $scenario to science and review', ({ request, required }) => {
    for (const stage of ['science', 'review'] as const) {
      const skill = loadInstalledMediaSkills('editorial', request, stage);
      for (const criterion of required) expect(skill.instructions).toContain(criterion);
      expect(skill.instructions).toContain('原文定义、图注和实际提供的原图');
      expect(skill.instructions).toContain('每个尺寸或宽度须对应具体对象、物理量、方向、定义和算例');
      expect(skill.usage).toContainEqual(expect.objectContaining({ id: 'scientific-critical-thinking', version: '5' }));
      expect(skill.usage).toContainEqual(expect.objectContaining({ id: 'openscience-research-illustration', version: '17',
        resources: expect.arrayContaining(['SKILL.md#Scientific encoding']) }));
    }
  });

  it('delivers disclosure-layer distinctions to scientific planning and review', () => {
    for (const stage of ['science', 'review'] as const) {
      const skill = loadInstalledMediaSkills('editorial', 'Explain the reported equations and parameters without assuming code availability.', stage);
      expect(skill.instructions).toContain('模型定义与方程、参数与求解方法、可执行代码、网格与收敛设置');
      expect(skill.instructions).toContain('已给方程不证明代码可用，未取得代码不证明模型方法未交代');
      expect(skill.instructions).toContain('不能概括为“模型未公开”或“完整复现输入已披露”');
      expect(skill.usage).toContainEqual(expect.objectContaining({ id: 'scientific-critical-thinking', version: '5' }));
    }
  });

  it('routes scientific evidence guidance to illustration stages without source-analysis output conventions', () => {
    for (const stage of ['science', 'review'] as const) {
      const skill = loadInstalledMediaSkills('auto', 'Explain a sourced interaction and its applicable conditions in one image.', stage);
      expect(skill.instructions).not.toMatch(/六字段|观察编号|程序将回填|不要输出审核通过|literature-note|six-field|limitations\/reproducibility/u);
      for (const rule of ['前提与对象→操作或推导→研究输出→验证与适用边界', '方法可以跨正文、公式、图注和附录',
        '保留每条观察的来源和限定关系', '去掉重复表述但不丢独有条件',
        '尚未解决的实质疑問需说明影响什么结论及需要回读的原文位置', '不虚构置信度',
        '对象、强度、条件、参数和算例', '坐标基底和观察平面',
        '场传播、偏振、粒子轨迹与观测方向', '原文未报告、当前材料未取得、解析有疑误是三种状态',
        '公式识别或排版成功不能证明物理正确', '不能把context改成支持结论的证据',
        '模型定义与方程、参数与求解方法、可执行代码、网格与收敛设置']) {
        expect(skill.instructions).toContain(rule);
      }
      expect(skill.instructions).toContain("Use the caller's illustration JSON schema and supplied sourceIds");
      expect(skill.usage).toContainEqual({ id: 'scientific-critical-thinking', version: '5',
        resources: ['apps/agent-worker/src/skills/scientific-critical-thinking.ts#illustrationInstructions'] });
    }
    expect(SCIENTIFIC_CRITICAL_THINKING_SKILL.instructions).toContain('六字段保持凝练');
    expect(SCIENTIFIC_CRITICAL_THINKING_SKILL.instructions).toContain('只引用输入中存在的观察编号，程序将回填原始来源');
    expect(SCIENTIFIC_CRITICAL_THINKING_SKILL.sourceReviewInstructions).toContain('你是已有六字段候选的来源审校者');
    expect(SCIENTIFIC_CRITICAL_THINKING_SKILL.sourceReviewInstructions).toContain('sourcePassageIds与sourceBindings只引用本轮原文中实际提供的P编号');
  });

  it('keeps material fidelity in art planning without rerunning scientific reconstruction', () => {
    const art = loadInstalledMediaSkills('editorial', 'Use a restrained material palette.', 'plan');
    expect(art.instructions).toContain('source-supported material and entity identity, section/view');
    expect(art.instructions).toContain('material treatment must not imply unsupported properties such as metallic reflection or optical transparency');
    for (const stage of ['plan', 'render'] as const) {
      const skill = loadInstalledMediaSkills('editorial', '', stage);
      expect(skill.instructions).not.toContain('Reconstruct the physical subjects');
      expect(skill.usage.map(item => item.id)).not.toContain('scientific-critical-thinking');
    }
  });

  it('offers scoped hand-drawn treatment selection to art planning and rendering', () => {
    for (const style of ['scientific', 'editorial', 'watercolor']) {
      const plan = loadInstalledMediaSkills(style, '', 'plan');
      expect(plan.instructions).toContain('Hand-drawn treatment routing');
      expect(plan.instructions).toContain('Reader-first hand-drawn direction');
      expect(plan.usage.map((item) => item.id)).toContain('openscience-handdraw-router');
      expect(plan.usage.map((item) => item.id)).toContain('openscience-handdraw-style');

      const render = loadInstalledMediaSkills(style, '', 'render');
      expect(render.instructions).toContain('Reader-first hand-drawn direction');
      expect(render.instructions).toContain('a third digit, changed unit or dropped subscript');
      expect(render.instructions).toContain('endpoints must touch the specified nearest surfaces');
      expect(render.usage).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', version: '3' }));
      expect(render.usage.map((item) => item.id)).not.toContain('openscience-handdraw-router');
    }
  });

  it('does not displace source context from final scientific review', () => {
    const review = loadInstalledMediaSkills('editorial', '', 'review');
    expect(review.instructions).toContain('Check vector operations and frequency/wavelength language');
    expect(review.instructions).toContain('encoding-feasibility failure');
    expect(review.instructions).toContain('If encoding or narration prescribes a rejected decorative form');
    expect(review.instructions).toContain('inspect the title and `narration` as text the reader will actually see');
    expect(review.instructions).toContain('block it for upstream planning correction');
    expect(review.instructions).toContain('direct statement of a material evidence limit');
    expect(review.instructions).toContain('metric inventory instead of the selected mechanism');
    expect(review.instructions).toContain('exceeds the explicit visible-label budget');
    expect(review.instructions).toContain('the central relation can only be recovered by reading a long formula');
    expect(review.instructions).not.toContain('Hand-drawn treatment routing');
    expect(review.instructions).not.toContain('Reader-first hand-drawn direction');
    expect(review.usage.map((item) => item.id)).not.toContain('openscience-handdraw-style');
  });

  it('does not inject hand-drawn guidance into unrelated styles', () => {
    for (const style of ['technical-schematic', 'minimal', 'pixel-art']) {
      for (const stage of ['plan', 'render'] as const) {
        const selected = loadInstalledMediaSkills(style, '', stage);
        expect(selected.usage.map((item) => item.id)).not.toContain('openscience-handdraw-router');
        expect(selected.usage.map((item) => item.id)).not.toContain('openscience-handdraw-style');
      }
    }
  });

  it('offers selectable numbered styles in art planning, then scopes rendering to the chosen style', () => {
    const science = loadInstalledMediaSkills('auto', '', 'science');
    expect(science.instructions).not.toContain('NUMBERED HAND-DRAWN STYLE INDEX');
    const plan = loadInstalledMediaSkills('auto', '', 'plan');
    expect(plan.instructions).toContain('#001 Playful Deadpan Doodle');
    expect(plan.instructions).toContain('#277');
    expect(plan.instructions).not.toContain('#055 Chaotic Color Doodle Crowd');
    expect(plan.instructions).toContain('article:scientific');
    expect(plan.instructions).toContain('infographic:subway-map');
    expect(plan.usage).toContainEqual(expect.objectContaining({ id: 'baoyu-article-illustrator' }));
    expect(plan.usage).toContainEqual(expect.objectContaining({ id: 'baoyu-infographic' }));
    expect(plan.usage).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', resources: expect.arrayContaining(['references/style-catalogue.json#index']) }));

    expect(selectedHanddrawStyle('material HANDDRAW_STYLE=#002 fine ink')?.name).toBe('Conceptual Continuous-Line Editorial');
    expect(selectedHanddrawStyle('HANDDRAW_STYLE=#999')).toBeUndefined();
    expect(selectedHanddrawStyle('HANDDRAW_STYLE=#002 HANDDRAW_STYLE=#003')).toBeUndefined();
    const render = loadInstalledMediaSkills('auto', 'HANDDRAW_STYLE=#002; fine ink, no extra subject.', 'render');
    expect(render.instructions).toContain('Conceptual Continuous-Line Editorial');
    expect(render.instructions).not.toContain('Playful Deadpan Doodle');
    expect(render.usage).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', resources: expect.arrayContaining(['references/style-catalogue.json#002']) }));
    const baoyu = loadInstalledMediaSkills('auto', 'BAOYU_STYLE=infographic:subway-map; editorial transit lines.', 'render');
    expect(baoyu.instructions).toContain('Colored route lines');
    expect(baoyu.instructions).not.toContain('NUMBERED HAND-DRAWN STYLE INDEX');
    expect(baoyu.usage).toContainEqual(expect.objectContaining({ id: 'baoyu-infographic', resources: expect.arrayContaining(['references/styles/subway-map.md#Visual Elements']) }));
    expect(selectedAutomaticArtStyle('BAOYU_STYLE=article:scientific; precise ink.')).toEqual({ kind: 'baoyu', family: 'article', id: 'scientific' });
    expect(automaticStyleReviewGuidance('BAOYU_STYLE=infographic:subway-map; precise ink.')).toContain('Colored route lines');
    expect(selectedAutomaticArtStyle('BAOYU_STYLE=article:missing; invalid.')).toBeUndefined();
    expect(automaticStyleTreatment('handdraw:#002', 'Fine ink.')).toBe('HANDDRAW_STYLE=#002; Fine ink.');
    expect(automaticStyleTreatment('infographic:subway-map', 'Direct labels.')).toBe('BAOYU_STYLE=infographic:subway-map; Direct labels.');
    expect(automaticStyleTreatment('handdraw:#055', 'Unavailable style.')).toBeUndefined();
    expect(() => loadInstalledMediaSkills('auto', 'No selected marker', 'render')).toThrow('no valid selected style');
  });

  it('keeps the approved science and hand-drawn direction in the bounded image request', () => {
    const brief: IllustrationBrief = {
      schemaVersion: 2, message: 'A supported conceptual relation', domain: 'conceptual',
      subjects: [{ description: 'Sourced subject', basis: {
        claimId: '10000000-0000-4000-8000-000000000001', evidenceId: '20000000-0000-4000-8000-000000000001',
        quote: 'The source describes the relation.',
      } }], encoding: 'A labeled line indicates the supported relation.',
      composition: 'One focal relation with clear spacing.', treatment: 'Fine ink on a calm ground.',
      labels: ['Supported relation', 'FWHM_S≈77 nm'], constraints: ['Conceptual, not to scale'],
    };
    const design = loadInstalledMediaSkills('editorial', '', 'render');
    const prompt = compileIllustrationImagePrompt(brief, design.instructions);
    expect(prompt).toContain('A supported conceptual relation');
    expect(prompt).toContain('Conceptual, not to scale');
    expect(prompt).toContain('Reader-first hand-drawn direction');
    expect(prompt).toContain('FWHM_S≈77 nm');
    expect(prompt).toContain('a third digit, changed unit or dropped subscript');
    expect(imageSpoolRequestByteUpperBound(prompt)).toBeLessThanOrEqual(CODEX_IMAGE_MAX_JSON_BYTES);
    const fullBrief = { ...brief, message: `A supported conceptual relation ${'source detail '.repeat(185)}` };
    const fullPrompt = compileIllustrationImagePrompt(fullBrief, design.instructions);
    expect(fullPrompt).toContain(fullBrief.message);
    expect(fullPrompt).toContain('Reader-first hand-drawn direction');
    expect(fullPrompt).toContain('a third digit, changed unit or dropped subscript');
    expect(imageSpoolRequestByteUpperBound(fullPrompt)).toBeLessThanOrEqual(CODEX_IMAGE_MAX_JSON_BYTES);
  });
});
