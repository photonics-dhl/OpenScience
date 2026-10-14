import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeIllustrationMaterializer, nativeIllustrationToolProfile, nativeMediaCapabilityGuidance, nativeScienceRepairGuidance, NATIVE_ILLUSTRATION_TOOLS } from '../src/native-agent/illustration-task';
import { createNativePaperTools, NATIVE_PAPER_TOOLS } from '../src/native-agent/paper-tools';
import type { DocumentSourceMap, StoryboardDocument } from '@openscience/domain';
import { materializeIllustrationArt, materializeIllustrationScience } from '../src/presentation/illustration-planner';
import { loadIllustrationStyleSkills } from '../src/presentation/illustration-styles';
import { normalizeScientificSourceNotation } from '../src/presentation/scientific-comparison';
import type { NativeAgentSessionState } from '../src/native-agent/session';
import type { ChatMessage } from '@openscience/ai-gateway';

const claims = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding', statement: 'A qualitative relation', assessment: 'supported',
  conditions: [], limitations: [], extractionStatus: 'succeeded', sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001', relation: 'supports', text: 'Two regions are connected under the stated condition.' }] }];
const settings = { locale: 'en' as const, style: 'aged-academia', instruction: 'Explain the relation.', output: 'image' as const, narrative: true, narrativeSceneLimit: 1 };
const science = { title: 'Two regions', narrative: { mainMessage: 'A supported relation', audience: 'A new reader' }, scenes: [{
  title: 'A relation', narration: 'These regions are connected.', message: 'A conditional relation', domain: 'conceptual',
  subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } }], encoding: 'A link represents the relationship of subject 0.',
  labels: ['Connected regions'], constraints: ['Not to scale'], paperOriginalAssetId: null }] };

const IMAGE_REPAIR_DESCRIPTION = "After invalid_illustration, use the actual diagnostic and named fields. If its source or conditions are uncertain, make a bounded paper_read/paper_view of the same authorized paper or read one relevant existing Skill before repairing. Then copy the latest returned scienceToolCallId and replace exactly one reported scene, preserving every other scene and root field. Never add Claims/evidence grants, change author meaning, resend full science or submit art while unresolved. Syntax alone may be malformed output, not a platform fault. On an explicit platform/resource/budget failure or no source-supported scene repair, preserve the candidate and diagnostic and stop. (exact scienceToolCallId feedback)";
const OLD_REPAIR_GUIDANCE = "如果paper_illustration_science返回invalid_illustration，下一条消息只能调用paper_illustration_science_repair，不得解释或重述，不得重发整份science或输出art JSON。立即复制结果中的精确scienceToolCallId（不要用工具名、序号或自造ID），只替换诊断指出的一个sceneIndex及完整scene；保留其他scene和根字段不变。根级错误才重新提交更窄的完整science；无法从原文修复就停止并blocked，不得猜测。";
// Saved compatibility fixtures use the actual original descriptors, not the new fresh profile.
const originalImageTools = [...NATIVE_PAPER_TOOLS, ...NATIVE_ILLUSTRATION_TOOLS];
const savedTools = (tools: typeof originalImageTools, messages: ChatMessage[] = []) => ({
  turns: [{ request: { messages, options: { tools: tools.map(tool => ({ type: 'function', function: structuredClone(tool) })) } } }],
}) as unknown as NativeAgentSessionState;

describe('unmarked fresh IMAGE planning guidance', () => {
  it('routes diagnostic-first repair without enabling the explicit-trig validator or changing science/context', () => {
    const fresh = nativeIllustrationToolProfile(null, 'image');
    const original = nativeIllustrationToolProfile(savedTools(originalImageTools), 'image');
    for (const name of ['paper_illustration_context', 'paper_illustration_science'])
      expect(fresh.sourceTools.find(tool => tool.name === name)).toEqual(original.sourceTools.find(tool => tool.name === name));
    expect(fresh).toMatchObject({ sourceExplicitTrig: false, nativeVideo: false, sourceNotation: true,
      scienceFeedback: true, sourceQuantityProse: true, sourceQuantityLocations: true });
    expect(fresh.sourceTools.map(tool => tool.name)).toEqual(original.sourceTools.map(tool => tool.name));
    expect(fresh.sourceTools.find(tool => tool.name === 'paper_illustration_science_repair')!.description).toBe(IMAGE_REPAIR_DESCRIPTION);
    expect(nativeScienceRepairGuidance(fresh.sourceTools)).toContain('paper_read/paper_view');
    expect(nativeScienceRepairGuidance(original.sourceTools)).toBe(OLD_REPAIR_GUIDANCE);
  });
  it('restores the new serialized IMAGE descriptors and flags exactly, without another fresh classification', () => {
    const fresh = nativeIllustrationToolProfile(null, 'image');
    const state = savedTools(fresh.sourceTools);
    const before = JSON.stringify(state);
    expect(nativeIllustrationToolProfile(state, 'image')).toEqual(fresh);
    expect(JSON.stringify(state)).toBe(before);
    expect(fresh.sourceTools.find(tool => tool.name === 'paper_illustration_review')!.description)
      .toContain('encoding, composition, treatment and constraints');
  });
  it.each([undefined, 'video-optional-audio-v1'] as const)('leaves the original VIDEO descriptors and resumed flags unchanged: %s', contract => {
    const video = nativeIllustrationToolProfile(null, 'video', contract);
    expect(nativeIllustrationToolProfile(savedTools(video.sourceTools), 'video', contract)).toEqual(video);
    for (const name of ['paper_illustration_science_repair', 'paper_illustration_art'])
      expect(video.sourceTools.find(tool => tool.name === name)).toEqual(originalImageTools.find(tool => tool.name === name));
    expect(nativeScienceRepairGuidance(video.sourceTools)).toBe(OLD_REPAIR_GUIDANCE);
  });
});

describe('saved image explicit trig reader', () => {
  const contract = 'image-source-explicit-trig-v1';
  const suffix = ' Image source explicit-trig contract: complete sin/cos/tan calls with one Greek argument are equivalent to their compact source notation only under this exact saved image contract. Retain every coefficient, function, argument and denominator; unknown or incomplete syntax stays unsupported.';
  const tex = 'The model gives $$\\tau_1 \\approx \\left(\\frac{FWHM_S}{V_e}\\right) \\cdot (1 - \\beta\\cos\\theta) \\quad (1)$$.';
  const explicit = 'τ₁ ≈ (FWHMs/Ve)*(1-(β*cos(θ)))';
  const compact = 'The source gives the factor (FWHM_S/Ve)·(1−βcosθ).';
  const saved = (newTools: boolean, messages: ChatMessage[] = []) => ({
    turns: [{ request: { messages, options: { tools: originalImageTools.map(tool => ({
      type: 'function', function: { ...structuredClone(tool),
        ...(newTools && tool.name === 'paper_illustration_science' ? { description: tool.description + suffix } : {}),
        ...(newTools && tool.name === 'paper_illustration_science_repair' ? { description: IMAGE_REPAIR_DESCRIPTION } : {}) },
    })) } } }],
  }) as unknown as NativeAgentSessionState;
  const candidate = (expression: string) => {
    const value = structuredClone(science);
    value.scenes[0]!.encoding = expression;
    value.scenes[0]!.subjects[0]!.description = expression;
    return value;
  };
  const build = (newTools: boolean) => {
    const profile = nativeIllustrationToolProfile(saved(newTools), 'image', newTools ? contract : undefined);
    return fixture({ ...profile, quote: tex, input: { sourceExplicitTrig: profile.sourceExplicitTrig } });
  };

  it('requires the exact saved image tools, marker and output without changing the saved request', () => {
    const state = saved(true), before = JSON.stringify(state);
    const profile = nativeIllustrationToolProfile(state, 'image', contract);
    expect(profile).toMatchObject({ sourceExplicitTrig: true, sourceNotation: true, nativeVideo: false });
    expect(profile.sourceTools).toEqual(state.turns[0]!.request.options.tools!.map(tool => tool.function));
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each([false, true])('reconstructs the full %s-profile saved successful transcript exactly', newTools => {
    const f = build(newTools);
    f.complete(candidate(newTools ? explicit : compact));
    const before = JSON.stringify(f.messages), state = saved(newTools, f.messages);
    const profile = nativeIllustrationToolProfile(state, 'image', newTools ? contract : undefined);
    const reader = createNativeIllustrationMaterializer({ ...f.input, ...profile, savedState: state });
    expect(reader.finish(f.messages, '{"reviewToolCallId":"review-call"}').review.decision).toBe('accepted');
    expect(JSON.stringify(f.messages)).toBe(before);
    expect(profile.sourceExplicitTrig).toBe(newTools);
  });

  it.each([false, true])('reconstructs the exact %s-profile saved scientific error', newTools => {
    const f = build(newTools), args = candidate(newTools ? explicit.replace('/Ve', '/c') : explicit);
    const error = f.invoke('paper_illustration_science', args, 'science-error');
    expect(error).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining(newTools ? '_source' : '_syntax') });
    const before = JSON.stringify(f.messages), state = saved(newTools, f.messages);
    const reader = createNativeIllustrationMaterializer({ ...f.input,
      ...nativeIllustrationToolProfile(state, 'image', newTools ? contract : undefined), savedState: state });
    expect(reader.call('paper_illustration_science', args, 0, 'science-error')).toEqual(error);
    expect(JSON.stringify(f.messages)).toBe(before);
  });

  it.each(['success', 'error'] as const)('refuses a changed saved %s receipt', mode => {
    const f = build(true), args = candidate(mode === 'error' ? explicit.replace('/Ve', '/c') : explicit);
    f.invoke('paper_illustration_science', args, 'science-call');
    const messages = structuredClone(f.messages);
    const receipt = messages.find(message => message.role === 'tool')!;
    receipt.content = JSON.stringify({ ...JSON.parse(receipt.content), changedReceipt: true });
    const state = saved(true, messages);
    const reader = createNativeIllustrationMaterializer({ ...f.input,
      ...nativeIllustrationToolProfile(state, 'image', contract), savedState: state });
    expect(() => reader.call('paper_illustration_science', args, 0, 'science-call')).toThrow();
  });

  it.each(['missing-marker', 'video-marker', 'unknown-marker', 'video-output', 'old-tools', 'science-schema',
    'context-description', 'duplicate-science', 'missing-tools'] as const)('blocks mismatched %s before materialization', failure => {
      const state = saved(failure !== 'old-tools');
      const tools = state.turns[0]!.request.options.tools!;
      if (failure === 'science-schema') Reflect.set(tools.find(tool => tool.function.name === 'paper_illustration_science')!.function, 'parameters', {});
      if (failure === 'context-description') tools.find(tool => tool.function.name === 'paper_illustration_context')!.function.description = 'Changed context';
      if (failure === 'duplicate-science') tools.push(structuredClone(tools.find(tool => tool.function.name === 'paper_illustration_science')!));
      if (failure === 'missing-tools') delete state.turns[0]!.request.options.tools;
      const marker = failure === 'missing-marker' ? undefined : failure === 'video-marker' ? 'video-optional-audio-v1'
        : failure === 'unknown-marker' ? 'image-source-explicit-trig-v2' : contract;
      expect(() => nativeIllustrationToolProfile(state, failure === 'video-output' ? 'video' : 'image', marker as never)).toThrow();
    });

  it('keeps fresh unmarked image tools historical and rejects a fresh marked NULL checkpoint', () => {
    const profile = nativeIllustrationToolProfile(null);
    expect(profile.sourceExplicitTrig).toBe(false);
    expect(profile.sourceTools).toEqual(saved(false).turns[0]!.request.options.tools!.map(tool => tool.function));
    expect(profile.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description).not.toContain(suffix);
    expect(() => nativeIllustrationToolProfile(null, 'image', contract)).toThrow();
  });

  it.each([undefined, 'video-optional-audio-v1'] as const)('keeps video %s and its saved reader trig-disabled', marker => {
    const profile = nativeIllustrationToolProfile(null, 'video', marker);
    const state = { turns: [{ request: { options: { tools: profile.sourceTools.map(tool => ({ type: 'function', function: tool })) } } }] } as unknown as NativeAgentSessionState;
    expect(profile.sourceExplicitTrig).toBe(false);
    expect(nativeIllustrationToolProfile(state, 'video', marker).sourceExplicitTrig).toBe(false);
  });
});

describe('fresh image diagnostic guidance', () => {
  const state = (messages: ChatMessage[] = [], fresh = false) => {
    if (fresh) return savedTools(nativeIllustrationToolProfile(null).sourceTools, messages);
    const suffix = ' Image source explicit-trig contract: complete sin/cos/tan calls with one Greek argument are equivalent to their compact source notation only under this exact saved image contract. Retain every coefficient, function, argument and denominator; unknown or incomplete syntax stays unsupported.';
    return { turns: [{ request: { messages, options: { tools: originalImageTools.map(tool => ({
      type: 'function', function: { ...structuredClone(tool),
        ...(tool.name === 'paper_illustration_science' ? { description: tool.description + suffix } : {}),
        ...(tool.name === 'paper_illustration_science_repair' ? { description: IMAGE_REPAIR_DESCRIPTION } : {}) },
    })) } } }] } as unknown as NativeAgentSessionState;
  };
  const profile = () => nativeIllustrationToolProfile(state(), 'image', 'image-source-explicit-trig-v1');
  const scene = (value: string) => ({ ...structuredClone(science.scenes[0]!), narration: value, message: value,
    encoding: value, labels: [value], subjects: [{ description: value, basis: { sourceId: 's1' } }] });
  const setup = (fresh = false) => {
    const selected = [{ ...structuredClone(claims[0]!), sourcePassages: [...claims[0]!.sourcePassages,
      { evidenceId: '20000000-0000-4000-8000-000000000002', relation: 'supports', text: 'The reported width is w=27 nm under the stated condition.' }] }];
    const p = fresh ? nativeIllustrationToolProfile(null) : profile(), input = { ...structuredClone(science), scenes: [structuredClone(science.scenes[0]!), scene('w=28 nm')] };
    const f = fixture({ ...p, input: { claims: selected as never, settings: { ...settings, narrativeSceneLimit: 2 }, sourceExplicitTrig: p.sourceExplicitTrig } });
    return { f, input, selected, p };
  };
  const replay = (f: ReturnType<typeof fixture>, messages = f.messages, fresh = false) => createNativeIllustrationMaterializer({
    ...f.input, ...nativeIllustrationToolProfile(state(messages, fresh), 'image', fresh ? undefined : 'image-source-explicit-trig-v1'), savedState: state(messages, fresh),
  }).finish(messages, '{"reviewToolCallId":"review-call"}');

  it('keeps the old tool array and instruction value exact, including the empty-tool case', () => {
    const old = nativeIllustrationToolProfile(savedTools(originalImageTools));
    expect(old.sourceTools).toEqual([...NATIVE_PAPER_TOOLS, ...NATIVE_ILLUSTRATION_TOOLS]);
    expect(nativeScienceRepairGuidance(old.sourceTools)).toBe(OLD_REPAIR_GUIDANCE);
    expect(nativeScienceRepairGuidance(old.sourceTools, false)).toBe(OLD_REPAIR_GUIDANCE);
    expect(nativeScienceRepairGuidance([])).toBe('');
    const newProfile = profile();
    expect(newProfile.sourceTools.find(tool => tool.name === 'paper_illustration_science_repair')!.description).toBe(IMAGE_REPAIR_DESCRIPTION);
    expect(nativeScienceRepairGuidance(newProfile.sourceTools, true)).not.toBe(OLD_REPAIR_GUIDANCE);
    expect(old.sourceTools.find(tool => tool.name === 'paper_illustration_science_repair')!.description).not.toBe(IMAGE_REPAIR_DESCRIPTION);
  });

  it.each([false, true])('reconstructs invalid -> actual authorized paper read -> same-call-ID repair without changing root/other scene (unmarked fresh=%s)', async fresh => {
    const { f, input, selected, p } = setup(fresh), before = structuredClone(input);
    const parser = { name: 'fixture', version: '1' };
    const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'a'.repeat(64), parser,
      pages: selected[0]!.sourcePassages.map((passage, index) => ({ page: index + 1, width: 100, height: 100,
        blocks: [{ id: 'block-' + index, kind: 'paragraph', text: passage.text, parser, transformations: [],
          boundingBox: { x: 0, y: 0, width: 100, height: 100 } }] })) };
    const paper = createNativePaperTools(map, async () => [], p.sourceTools);
    const overview = await paper.call('paper_overview', {}) as { pages: Array<{ passageIds: string[] }> };
    const args = { passageIds: overview.pages[1]!.passageIds.slice(0, 1) };
    const invalid = f.invoke('paper_illustration_science', input, 'science-invalid');
    expect(invalid).toMatchObject({ status: 'invalid_illustration', scienceToolCallId: 'science-invalid', error: expect.stringContaining('_source') });
    const read = await paper.call('paper_read', args) as { passages: Array<{ text: string }> };
    await expect(paper.call('paper_read', { passageIds: ['foreign-passage'] })).rejects.toThrow();
    // Canonical passages can retain a complete cross-page span; the bounded
    // read includes the exact selected source, rather than a truncated quote.
    expect(read.passages[0]!.text).toContain(selected[0]!.sourcePassages[1]!.text);
    f.messages.push({ role: 'assistant', content: '', toolCalls: [{ id: 'read-source', type: 'function',
      function: { name: 'paper_read', arguments: JSON.stringify(args) } }] }, { role: 'tool', toolCallId: 'read-source', content: JSON.stringify(read) });
    const repaired = f.invoke('paper_illustration_science_repair', { scienceToolCallId: invalid.scienceToolCallId,
      sceneIndex: 1, scene: scene('w=27 nm') }, 'science-repaired');
    expect(repaired.status).toBe('science_ready');
    f.invoke('paper_illustration_art', { scienceToolCallId: 'science-repaired', scenes: [0, 1].map(() => ({
      layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.' })) }, 'art-call');
    f.invoke('paper_illustration_review', { planToolCallId: 'art-call', decision: 'accepted', summary: 'Fixture mapping agrees.',
      corrections: [], issues: [] }, 'review-call');
    const result = replay(f, f.messages, fresh), expected = materializeIllustrationScience({ ...before, scenes: [before.scenes[0]!] }, selected as never,
      { ...settings, narrativeSceneLimit: 2 }, new Map(), true, true, true, true, true, true, true);
    expect((repaired.intent as typeof expected).scenes[0]).toEqual(expected.scenes[0]);
    expect(result.document.scenes[0]!.illustration!.subjects).toEqual(expected.scenes[0]!.illustration.subjects);
    expect(result.document.narrative).toEqual(before.narrative);
    expect(result.document.title).toBe(before.title);
    expect(input).toEqual(before);
    expect(f.input.claims).toEqual(selected);
    const names = f.messages.filter(message => message.role === 'assistant').flatMap(message => message.toolCalls!.map(tool => tool.function.name));
    expect(names).toEqual(['paper_illustration_science', 'paper_read', 'paper_illustration_science_repair', 'paper_illustration_art', 'paper_illustration_review']);
    expect(nativeScienceRepairGuidance(p.sourceTools, p.sourceExplicitTrig)).toContain('paper_read/paper_view');
    for (const failure of ['call-id', 'scene', 'source', 'receipt']) {
      const changed = structuredClone(f.messages);
      if (failure === 'receipt') {
        const tool = changed.find(message => message.role === 'tool' && message.toolCallId === 'science-repaired')!;
        tool.content = JSON.stringify({ ...JSON.parse(tool.content), changedReceipt: true });
      } else {
        const call = changed.flatMap(message => message.role === 'assistant' ? message.toolCalls ?? [] : []).find(tool => tool.id === 'science-repaired')!;
        const repair = JSON.parse(call.function.arguments);
        if (failure === 'call-id') repair.scienceToolCallId = 'wrong-id';
        if (failure === 'scene') repair.sceneIndex = 0;
        if (failure === 'source') repair.scene.subjects[0].basis.sourceId = 'foreign';
        call.function.arguments = JSON.stringify(repair);
      }
      expect(() => replay(f, changed, fresh), failure).toThrow();
    }
  });

  it.each([false, true])('keeps local-only repair and an unresolved stop prefix free of new science/art/review calls (unmarked fresh=%s)', fresh => {
    const { f, input, p } = setup(fresh);
    f.invoke('paper_illustration_science', input, 'science-invalid');
    const stopped = structuredClone(f.messages), reader = createNativeIllustrationMaterializer({ ...f.input, ...p, savedState: state(stopped, fresh) });
    expect(reader.call('paper_illustration_science', input, 0, 'science-invalid')).toEqual(JSON.parse(stopped[1]!.content));
    expect(() => reader.finish(stopped, '{"reviewToolCallId":"missing"}')).toThrow();
    f.invoke('paper_illustration_science_repair', { scienceToolCallId: 'science-invalid', sceneIndex: 1, scene: scene('w=27 nm') }, 'science-repaired');
    expect(f.messages.filter(message => message.role === 'assistant').flatMap(message => message.toolCalls!.map(tool => tool.function.name)))
      .toEqual(['paper_illustration_science', 'paper_illustration_science_repair']);
    expect(stopped).toHaveLength(2);
  });
});

describe('fresh native description-binding feedback', () => {
  const sourceClaims = [{ ...claims[0]!, sourcePassages: [claims[0]!.sourcePassages[0]!,
    { evidenceId: '20000000-0000-4000-8000-000000000002', relation: 'supports', text: 'The spatial bound is FWHM_S ≥ λ0/2.' }] }];
  const rejectedScene = () => ({ ...structuredClone(science.scenes[0]!),
    subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } },
      { description: 'FWHM_S ≥ λ0/2 (source note)', basis: { sourceId: 's1' } }],
    encoding: 'FWHM_S ≥ λ0/2', labels: ['FWHM_S ≥ λ0/2'] });

  it('reports the related subject in the second scene alongside its original usage fields', () => {
    const value = { ...structuredClone(science), scenes: [structuredClone(science.scenes[0]!), rejectedScene()] };
    const before = structuredClone(value);
    const f = fixture({ ...nativeIllustrationToolProfile(null), input: { claims: sourceClaims as never,
      settings: { ...settings, narrativeSceneLimit: 2 } } });
    const result = f.invoke('paper_illustration_science', value, 'description-location');
    expect(result).toMatchObject({ status: 'invalid_illustration', scienceToolCallId: 'description-location' });
    expect(result.error).toContain('unbound_expression_(λ0/2)_description');
    expect(result.error).toContain('scenes[1].encoding');
    expect(result.error).toContain('scenes[1].labels[0]');
    expect(result.error).toContain('scenes[1].subjects[1].description');
    expect(result.error).not.toContain('scenes[0].subjects');
    expect(result.error).not.toContain('scenes[1].subjects[0]');
    expect(value).toEqual(before);
  });

  it('does not identify another source as the rejected subject\'s evidence', () => {
    const value = { ...structuredClone(science), scenes: [rejectedScene()] };
    value.scenes[0]!.subjects[1]!.basis.sourceId = 's0';
    const f = fixture({ ...nativeIllustrationToolProfile(null), input: { claims: sourceClaims as never } });
    const result = f.invoke('paper_illustration_science', value, 'wrong-own-source');
    expect(result).toMatchObject({ status: 'invalid_illustration' });
    expect(result.error).toContain('unbound_expression_(λ0/2)_description');
    expect(result.error).not.toContain('.subjects[');
  });

  it('retains the subject location when the description error is an additional diagnostic', () => {
    const value = { ...structuredClone(science), scenes: [rejectedScene()] };
    value.scenes[0]!.narration = 'The temporal width is FWHM_T = 20 as.';
    const f = fixture({ ...nativeIllustrationToolProfile(null), input: { claims: sourceClaims as never } });
    const result = f.invoke('paper_illustration_science', value, 'additional-description');
    expect(result).toMatchObject({ status: 'invalid_illustration' });
    expect(result.error).toContain('unbound_numeric_20_as_description Fields: scenes[0].narration.');
    expect(result.error).toContain('Also: unbound_expression_(λ0/2)_description: scenes[0].encoding, scenes[0].labels[0], scenes[0].subjects[1].description.');
  });

  it('does not borrow a reported 20 as value from another subject\'s quote', () => {
    const value = { ...structuredClone(science), scenes: [{ ...structuredClone(science.scenes[0]!),
      subjects: [{ description: 'FWHM_T = 20 as', basis: { sourceId: 's0' } },
        { description: 'An independent control', basis: { sourceId: 's1' } }],
      encoding: 'FWHM_T = 20 as', labels: ['FWHM_T = 20 as'] }] };
    const ownSources = [{ ...claims[0]!, sourcePassages: [
      { ...claims[0]!.sourcePassages[0]!, text: 'The temporal width is FWHM_T = 19 as.' },
      { ...sourceClaims[0]!.sourcePassages[1]!, text: 'The independent control has FWHM_T = 20 as.' },
    ] }];
    const f = fixture({ ...nativeIllustrationToolProfile(null), input: { claims: ownSources as never } });
    const result = f.invoke('paper_illustration_science', value, 'wrong20');
    expect(result).toMatchObject({ status: 'invalid_illustration' });
    expect(result.error).toContain('unbound_numeric_20_as_source');
  });

  it.each(['notation', 'locations'] as const)('preserves the old error fields without fresh %s', mode => {
    const value = { ...structuredClone(science), scenes: [rejectedScene()] };
    const f = fixture({ ...nativeIllustrationToolProfile(null),
      ...(mode === 'notation' ? { sourceNotation: false } : { sourceQuantityLocations: false }),
      input: { claims: sourceClaims as never } });
    const result = f.invoke('paper_illustration_science', value, 'legacy-fields');
    expect(result).toEqual({ status: 'invalid_illustration', scienceToolCallId: 'legacy-fields',
      error: mode === 'notation'
        ? 'unbound_expression_(λ0/2)_description Fields: scenes[0].encoding, scenes[0].labels[0].'
        : 'unbound_expression_(λ0/2)_description Fields: encoding, labels[0].' });
  });
});

describe('native source notation compatibility', () => {
  const tex = String.raw`The model gives $$\tau_1 \approx \left(\frac{FWHM_S}{V_e}\right) \cdot (1 - \beta\cos\theta) \quad (1)$$.`;
  const displayed = 'The source gives the factor (FWHM_S/Ve)·(1−βcosθ).';
  function evaluate(source: string, expression: string, constraint = 'Conceptual, not to scale',
    profile = nativeIllustrationToolProfile(null), describeExpression = true) {
    const sourceClaims = [{ ...claims[0]!, sourcePassages: [{ ...claims[0]!.sourcePassages[0]!, text: source }] }];
    const value = structuredClone(science);
    value.scenes[0]!.encoding = expression;
    if (describeExpression) value.scenes[0]!.subjects[0]!.description = expression;
    value.scenes[0]!.labels = ['Supported relation'];
    value.scenes[0]!.constraints = [constraint];
    return createNativeIllustrationMaterializer({ claims: sourceClaims, settings, paperOriginals: new Map(),
      ...profile }).call('paper_illustration_science', value, 0, 'science-notation');
  }
  it('recognizes the complete published TeX RHS when the same expression is displayed in Unicode', () => {
    const source = String.raw`The model gives $$\\tau_1 \\approx \\left(\\frac{FWHM_S}{V_e}\\right) \\cdot (1 - \\beta\\cos\\theta) \\quad (1)$$.`;
    const result = evaluate(source, 'The source gives the factor (FWHM_S/Ve)·(1−βcosθ).');
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'science_ready' });
  });
  it('accepts a sourced comparison through the native tool with or without prose parentheses', () => {
    const source = 'The confined field satisfies FWHM_S ≪ λ0/2.';
    expect(evaluate(source, 'The field satisfies FWHM_S ≪ λ0/2.')).toMatchObject({ status: 'science_ready' });
    expect(evaluate(source, 'The field satisfies (FWHM_S ≪ λ0/2).')).toMatchObject({ status: 'science_ready' });
  });
  it('retains the complete denominator when a parenthesized comparison has no matching source', () => {
    const result = evaluate('The confined field satisfies FWHM_S ≪ λ0/2.', 'The field satisfies (FWHM_S ≪ λ0/3).');
    expect(result).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_source') });
  });
  it('rejects an ambiguous display footer without an equation relation, retaining the full Eq.1 positive', () => {
    const ambiguous = String.raw`$$ (FWHM_S/V_e) \cdot (1-\beta\cos\theta) \quad (2)$$`;
    expect(normalizeScientificSourceNotation(ambiguous)).toEqual({ text: ambiguous,
      unsupported: [{ start: 0, end: ambiguous.length, key: ambiguous, unsupported: true }] });
    expect(evaluate(ambiguous, displayed)).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_source') });
    expect(evaluate(tex, ambiguous)).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_syntax') });
    expect(normalizeScientificSourceNotation(tex).unsupported).toEqual([]);
    expect(evaluate(tex, displayed)).toMatchObject({ status: 'science_ready' });
  });
  it('never matches a shortened product across an unsupported TeX factor', () => {
    const source = String.raw`The model gives (FWHM_S/Ve)·(1−β $f(\theta)$ cosθ).`;
    expect(evaluate(source, displayed)).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('_source') });
    expect(evaluate(tex, source)).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_syntax') });
    expect(evaluate(tex, displayed)).toMatchObject({ status: 'science_ready' });
  });
  it.each([
    String.raw`The model gives (FWHM_S/Ve)·(1−βcosθ) $f(\theta)$.`,
    String.raw`The model gives $f(\theta)$ (FWHM_S/Ve)·(1−βcosθ).`,
  ])('does not recover the shorter product beside an unsupported factor: %s', source => {
    expect(evaluate(source, displayed)).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_source') });
  });
  it('does not bind a scalar while dropping an adjacent unsupported factor', () => {
    const source = String.raw`The model gives τ1≈2 $f(\theta)$.`;
    const description = nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    const paid = nativeIllustrationToolProfile(savedProfile(description.slice(0, description.indexOf(' Complete numbered Fig'))));
    // This scalar-only hole already exists in the paid baseline. Preserve that
    // replay behavior, while fresh notation must retain the failed factor.
    expect(evaluate(source, 'The source gives τ1≈2.', undefined, paid)).toMatchObject({ status: 'science_ready' });
    expect(evaluate(source, 'The source gives τ1≈2.')).toMatchObject({ status: 'invalid_illustration' });
    expect(evaluate(String.raw`The model gives τ1≈2; separately $f(\theta)$ is unsupported.`, 'The source gives τ1≈2.'))
      .toMatchObject({ status: 'science_ready' });
  });
  it.each([
    [String.raw`The model gives τ1≈2 * $f(\theta)$.`, 'The source gives τ1≈2.'],
    [String.raw`The model gives τ1≈2 nm $f(\theta)$.`, 'The source gives τ1≈2 nm.'],
    [String.raw`The model gives $f(\theta)$ * 2.`, 'The source gives 2.'],
    [String.raw`The model gives τ1≈2${' '.repeat(41)}$f(\theta)$.`, 'The source gives τ1≈2.'],
  ])('keeps an adjacent opaque factor bound to its scalar: %s', (source, candidate) => {
    expect(evaluate(source, candidate)).toMatchObject({ status: 'invalid_illustration' });
  });
  it('treats the complete Fig. 1b/1c reference as a reference, without inventing a speed-of-light quantity', () => {
    const result = evaluate('Two regions are connected.', 'A link represents the supported relationship.', 'See Fig. 1b/1c for the illustrated relationship.');
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'science_ready' });
  });
  it.each(['See Fig. 1b/1c.', 'See (Fig. 1b/1c).', 'See Fig. S1b/S1c for the relationship.'])(
    'accepts a complete panel reference at a prose boundary: %s', constraint => {
      expect(evaluate('Two regions are connected.', 'A supported relation', constraint)).toMatchObject({ status: 'science_ready' });
    });
  it.each([1, 2, 4])('keeps literal/escaped TeX command transport compatible (%i slashes)', width => {
    const quote = tex.replaceAll('\\', '\\'.repeat(width));
    const result = evaluate(quote, displayed);
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'science_ready' });
    const intent = result.intent as { scenes: Array<{ illustration: { subjects: Array<{ basis: { quote: string; claimId: string } }> } }> };
    expect(intent.scenes[0]!.illustration.subjects[0]!.basis).toMatchObject({ quote, claimId: claims[0]!.id });
  });
  it.each(['Fig. 1b/0.94c', 'Fig. 1b/20nm', 'Fig. 1b/1MeV', 'Fig. 1b/1c; the speed is 1c',
    'Fig. 1b/1c2', 'Fig. 1b/1cosθ', 'Fig. 1b/1c/20nm'])('does not hide a true quantity behind %s', reference => {
    expect(evaluate('Two regions are connected.', 'A supported relation', `See ${reference}.`))
      .toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('unbound_') });
  });
  it.each([
    '(FWHM_T/Ve)·(1−βcosθ)', '(FWHM_S/c)·(1−βcosθ)', '(FWHM_S/Ve)·(2−βcosθ)',
    '(FWHM_S/Ve)·(1−βsinθ)', '(FWHM_S/Ve)·(1−βcosφ)', '(FWHM_S/Ve)·(1−βcosθ)·2',
    '(FWHM_S/(Ve·β))·(1−βcosθ)', '(FWHM_S/Ve)·(1−βcosθ) nm',
    '(FWHM_S/Ve)·(1−β f(θ))', '(FWHM_S/Ve)·(1−βcosθ',
  ])('rejects a changed or unsupported candidate %s', candidate => {
    expect(evaluate(tex, `The source gives ${candidate}.`))
      .toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('unbound_') });
  });
  it.each([
    tex.replace('V_e', 'c'), tex.replace('1 -', '2 -'), tex.replace('\\cos', '\\sin'),
    tex.replace('V_e', 'V_e \\cdot \\beta'), tex.replace('\\quad (1)', '\\cdot (1)'),
    tex.replace('\\quad (1)', '\\cdot (2)'), tex.replace('\\quad (1)', '\\quad (1) nm'),
    tex.replace('\\cos', '\\cosh'), tex.replace('\\beta\\cos\\theta', '\\beta f(\\theta)'),
    tex.replace('\\right)', '\\right) \\unknown'), tex.replace('$$.', '$.'),
    tex.replace('\\beta', '\\\\beta'), tex.replace('\\right)', ')'),
    tex.replace('1 -', `1 - ${'('.repeat(200)}β${')'.repeat(200)} -`),
  ])('does not recover a supported prefix from altered/unsupported TeX %s', source => {
    expect(evaluate(source, displayed)).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('unbound_') });
  });
  it('still requires the full expression in the subject description', () => {
    expect(evaluate(tex, displayed, undefined, undefined, false)).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('_description') });
  });
  it('keeps the previously saved optional description and failed receipts unchanged', () => {
    const fresh = nativeIllustrationToolProfile(null);
    const description = fresh.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    const old = savedProfile(description.slice(0, description.indexOf(' Complete numbered Fig')));
    const before = structuredClone(old), profile = nativeIllustrationToolProfile(old);
    expect(profile).toMatchObject({ sourceNotation: false, sourceQuantityLocations: true, defaultPaperOriginalRef: true });
    expect(profile.sourceTools).toEqual(before.turns[0]!.request.options.tools!.map(tool => tool.function));
    expect(old).toEqual(before);
    expect(evaluate(tex, displayed, undefined, profile)).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('_source') });
    expect(evaluate('Two regions are connected.', 'A supported relation', 'See Fig. 1b/1c.', profile))
      .toMatchObject({ status: 'invalid_illustration', error: 'unbound_numeric_1_c_description Fields: scenes[0].constraints[0].' });
    const f = fixture({ ...profile, quote: tex });
    const rejected = structuredClone(science);
    rejected.scenes[0]!.encoding = displayed;
    rejected.scenes[0]!.subjects[0]!.description = displayed;
    expect(f.invoke('paper_illustration_science', rejected, 'paid-rejected')).toMatchObject({ status: 'invalid_illustration',
      error: 'unbound_expression_((fwhms/ve)*(1-(β*cos(θ))))_source Fields: scenes[0].encoding.' });
    f.complete();
    const receipts = structuredClone(f.messages);
    expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}').review.decision).toBe('accepted');
    expect(f.messages).toEqual(receipts);
    expect(() => createNativeIllustrationMaterializer({ ...f.input, sourceNotation: true })
      .finish(f.messages, '{"reviewToolCallId":"review-call"}')).toThrow(/history changed/u);
    expect(nativeIllustrationToolProfile(savedProfile(description)).sourceNotation).toBe(true);
    for (const saved of [savedProfile(PAID_SCIENCE_DESCRIPTION), savedProfile(PAID_PROSE_SCIENCE_DESCRIPTION),
      savedProfile('unknown saved science'), savedProfile(undefined, true)]) expect(nativeIllustrationToolProfile(saved).sourceNotation).toBe(false);
  });
});

describe('Native media capability guidance', () => {
  it('loads the Synclip and research-video skills for a fresh video intent', () => {
    const guidance = nativeMediaCapabilityGuidance({ output: 'video' }, false).join('\n');
    expect(guidance).toContain('openscience-synclip-capabilities');
    expect(guidance).toContain('openscience-research-video');
    expect(guidance).toContain('不得在合同核验前调用未接通的 Synclip 视频 API');
  });

  it('keeps the fresh image route on the verified still contract and does not add guidance to saved sessions', () => {
    const image = nativeMediaCapabilityGuidance({ output: 'image' }, false).join('\n');
    expect(image).toContain('gpt-image-2.5');
    expect(image).toContain('明确返回模型不可用');
    expect(image).toContain('gpt-image-2');
    expect(image).toContain('openscience-synclip-capabilities');
    expect(nativeMediaCapabilityGuidance({ output: 'video' }, true)).toEqual([]);
  });
});

function fixture(options: { scienceFeedback?: boolean; deferDesignGuidance?: boolean; sourceQuantityAnnotations?: boolean; sourceQuantityProse?: boolean; sourceQuantityLocations?: boolean; defaultPaperOriginalRef?: boolean; scienceRepairCallIdFeedback?: boolean; sourceNotation?: boolean; quote?: string;
  input?: Partial<Parameters<typeof createNativeIllustrationMaterializer>[0]> } = {}) {
  const selectedClaims = structuredClone(claims);
  if (options.quote !== undefined) selectedClaims[0]!.sourcePassages[0]!.text = options.quote;
  const input = { claims: selectedClaims as never, settings, paperOriginals: new Map(), narrativeSource: undefined,
    scienceFeedback: options.scienceFeedback, deferDesignGuidance: options.deferDesignGuidance, sourceQuantityAnnotations: options.sourceQuantityAnnotations,
    sourceQuantityProse: options.sourceQuantityProse, sourceQuantityLocations: options.sourceQuantityLocations,
    defaultPaperOriginalRef: options.defaultPaperOriginalRef, scienceRepairCallIdFeedback: options.scienceRepairCallIdFeedback, sourceNotation: options.sourceNotation, ...options.input };
  const tool = createNativeIllustrationMaterializer(input); const messages: ChatMessage[] = [];
  const invoke = (name: string, args: unknown, id: string) => {
    const result = tool.call(name, args, messages.length, id);
    messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
    return result;
  };
  const complete = (value = science) => {
    invoke('paper_illustration_science', value, 'science-call');
    invoke('paper_illustration_art', { scienceToolCallId: 'science-call', scenes: [{ layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.' }] }, 'art-call');
    invoke('paper_illustration_review', { planToolCallId: 'art-call', decision: 'accepted', summary: 'Sources, geometry and caption agree.', corrections: [], issues: [] }, 'review-call');
  };
  return { tool, messages, invoke, complete, input, restore: () => createNativeIllustrationMaterializer(input) };
}
describe('Native VIDEO art follows its accepted scientific scene list', () => {
  it.each([undefined, 'video-optional-audio-v1'] as const)('clarifies fresh %s art without rewriting an old saved tool definition', contract => {
    const fresh = nativeIllustrationToolProfile(null, 'video', contract);
    const art = fresh.sourceTools.find(tool => tool.name === 'paper_illustration_art')!;
    expect(art.description).toContain('latest accepted science');
    expect(art.description).toContain('same order');
    expect(art.description).toContain('styleRecommendations');
    const oldDescription = NATIVE_ILLUSTRATION_TOOLS.find(tool => tool.name === 'paper_illustration_art')!.description
      + ' The returned plan also includes inherited video direction and exact video prompts. Preserve science and the complete spoken script.';
    const oldTools = structuredClone(fresh.sourceTools).map(tool => tool.name === 'paper_illustration_art'
      ? { ...tool, description: oldDescription } : tool);
    const saved = { turns: [{ request: { options: { tools: oldTools.map(tool => ({ type: 'function', function: tool })) } } }] } as unknown as NativeAgentSessionState;
    const before = JSON.stringify(saved);
    expect(nativeIllustrationToolProfile(saved, 'video', contract).sourceTools).toEqual(oldTools);
    expect(JSON.stringify(saved)).toBe(before);
    expect(nativeMediaCapabilityGuidance({ output: 'video' }, true)).toEqual([]);
    expect(nativeMediaCapabilityGuidance({ output: 'video' }, false).join('\n')).toContain('styleRecommendations');
  });
  it('requires exactly the five designed scenes and the accepted science ID, without trimming an extra style scene', () => {
    const profile = nativeIllustrationToolProfile(null, 'video', 'video-optional-audio-v1');
    const videoSettings = { ...settings, output: 'video' as const, narrativeSceneLimit: undefined };
    const f = fixture({ ...profile, input: { ...profile, settings: videoSettings } });
    f.invoke('paper_illustration_context', {}, 'context');
    const candidate = { ...structuredClone(science), videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway',
      visualContinuity: 'Preserve the same connected regions.', audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
      scenes: Array.from({ length: 5 }, () => ({ ...structuredClone(science.scenes[0]!), durationSeconds: 5,
        videoDirection: { shotType: 'mechanism', purpose: 'Explain the connected regions.', subjectLock: 'The same connected regions',
          generatedElements: 'Only the connected regions', motion: 'Highlight the connection without moving the regions.', camera: 'Fixed camera',
          reference: 'scene-artwork', frameStrategy: 'start-reference', audioMode: 'external-narration', subtitleMode: 'none',
          negativeConstraints: ['No invented scientific objects'], modelPolicy: 'commercial-primary' } })) };
    const accepted = f.invoke('paper_illustration_science', candidate, 'accepted-science');
    expect(accepted, JSON.stringify(accepted)).toMatchObject({ status: 'science_ready' });
    const entries = Array.from({ length: 5 }, () => ({ layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.' }));
    expect(f.invoke('paper_illustration_art', { scienceToolCallId: 'wrong-science', scenes: entries }, 'wrong-id'))
      .toMatchObject({ status: 'invalid_illustration', error: 'exact_science_tool_required' });
    expect(f.invoke('paper_illustration_art', { scienceToolCallId: 'accepted-science', scenes: [...entries, entries[0]] }, 'extra-style-scene'))
      .toMatchObject({ status: 'invalid_illustration', error: 'art_scene_count_expected_5_actual_6' });
    const result = f.invoke('paper_illustration_art', { scienceToolCallId: 'accepted-science', scenes: entries }, 'correct-art');
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'art_ready' });
    expect(() => f.tool.finish(f.messages, '{"reviewToolCallId":"correct-art"}')).toThrow();
    const intent = accepted.intent as ReturnType<typeof materializeIllustrationScience>;
    const document = result.document as StoryboardDocument;
    const base = { document, style: videoSettings.style, locale: videoSettings.locale, output: 'video' };
    const localSettings = { ...videoSettings, revisionSceneIndex: 2 };
    expect(() => materializeIllustrationArt({ scenes: entries }, intent, claims as never, localSettings, new Map(), base as never))
      .toThrow('art_scene_count_expected_1_actual_5');
    const local = materializeIllustrationArt({ scenes: [entries[2]] }, intent, claims as never, localSettings, new Map(), base as never);
    for (const index of [0, 1, 3, 4]) expect(local.scenes[index]).toEqual(document.scenes[index]);
    // IMAGE originals use the existing available-source path; VIDEO cannot gain paperOriginal fields.
    const imageSettings = { ...settings, narrativeSceneLimit: undefined };
    const originalRef = { assetId: '30000000-0000-4000-8000-000000000001', objectKey: `blobs/aa/aa/${'a'.repeat(64)}`,
      contentHash: 'a'.repeat(64), figureId: 'Fig. 1', sourceClaimId: claims[0]!.id };
    const originals = new Map([[originalRef.assetId, originalRef]]);
    const imageScience = { ...structuredClone(science), scenes: Array.from({ length: 5 }, () => structuredClone(science.scenes[0]!)) };
    imageScience.scenes[0]!.paperOriginalAssetId = originalRef.assetId as never;
    const original = materializeIllustrationScience(imageScience, claims as never, imageSettings, originals);
    expect(() => materializeIllustrationArt({ scenes: entries }, original, claims as never, imageSettings, originals))
      .toThrow('art_scene_count_expected_4_actual_5');
    const reused = materializeIllustrationArt({ scenes: entries.slice(1) }, original, claims as never, imageSettings, originals);
    expect(reused.scenes[0]!.paperOriginal).toEqual(original.scenes[0]!.paperOriginal);
    expect(reused.scenes).toHaveLength(5);
  });
});
describe('Native designed scenes omit the nullable original reference', () => {
  it('requires a compact direct science repair call after validator feedback', () => {
    const description = nativeIllustrationToolProfile(null).sourceTools
      .find(tool => tool.name === 'paper_illustration_science_repair')!.description;
    expect(description).toContain('the next assistant message must be exactly one paper_illustration_science_repair tool call');
    expect(description).toContain('no prose, explanation, full-science resubmission or art JSON');
  });
  const omitted = () => { const value = structuredClone(science); Reflect.deleteProperty(value.scenes[0]!, 'paperOriginalAssetId'); return value; };
  it('advertises the nullable reference as optional only for fresh tasks', () => {
    const profile = nativeIllustrationToolProfile(null);
    const schema = profile.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.parameters as {
      properties: { scenes: { items: { required: string[]; properties: Record<string, unknown> } } } };
    expect(schema.properties.scenes.items.required).not.toContain('paperOriginalAssetId');
    expect(schema.properties.scenes.items.properties.paperOriginalAssetId).toEqual({ type: ['string', 'null'] });
    expect(profile.defaultPaperOriginalRef).toBe(true);
  });
  it('produces the exact explicit-null receipt without changing the model arguments', () => {
    const profile = nativeIllustrationToolProfile(null), value = omitted(), before = structuredClone(value);
    expect(fixture(profile).invoke('paper_illustration_science', value, 'same')).toEqual(
      fixture(profile).invoke('paper_illustration_science', science, 'same'));
    expect(value).toEqual(before);
  });
  it('replays the same omitted reference through finish and rejects a required-schema replay', () => {
    const f = fixture(nativeIllustrationToolProfile(null)); f.complete(omitted());
    expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}').review.decision).toBe('accepted');
    expect(() => createNativeIllustrationMaterializer({ ...f.input, defaultPaperOriginalRef: false })
      .finish(f.messages, '{"reviewToolCallId":"review-call"}')).toThrow(/Native|native/u);
  });
  it('uses only the first known optional schema, keeping required, absent and unknown definitions strict', () => {
    const description = nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    const optional = savedProfile(description);
    expect(nativeIllustrationToolProfile(optional).defaultPaperOriginalRef).toBe(true);
    const required = structuredClone(optional);
    const definition = required.turns[0]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_science')!;
    const schema = definition.function.parameters as { properties: { scenes: { items: { required: string[] } } } };
    schema.properties.scenes.items.required.push('paperOriginalAssetId');
    required.turns.push(structuredClone(optional.turns[0]!));
    for (const saved of [required, savedProfile('unknown saved science'), savedProfile(undefined, true)]) {
      const profile = nativeIllustrationToolProfile(saved);
      expect(profile.defaultPaperOriginalRef).toBe(false);
      expect(fixture(profile).invoke('paper_illustration_science', omitted(), 'old')).toMatchObject({ status: 'invalid_illustration' });
    }
  });
  it.each(['foreign-original', 'invalid-type', 'extra-key', 'unsupported-source', 'unsupported-number'])('retains rejection of %s', mode => {
    const value = omitted();
    if (mode === 'foreign-original') value.scenes[0]!.paperOriginalAssetId = '00000000-0000-4000-8000-000000000099' as never;
    if (mode === 'invalid-type') value.scenes[0]!.paperOriginalAssetId = 42 as never;
    if (mode === 'extra-key') Object.assign(value.scenes[0]!, { unauthorized: true });
    if (mode === 'unsupported-source') value.scenes[0]!.subjects[0]!.basis.sourceId = 'foreign';
    if (mode === 'unsupported-number') value.scenes[0]!.labels = ['7 fs'];
    expect(fixture(nativeIllustrationToolProfile(null)).invoke('paper_illustration_science', value, 'bad')).toMatchObject({ status: 'invalid_illustration' });
  });
});
describe('native illustration selects actual private tool history', () => {
  it('restores the exact reviewed plan and portable prompt without another model', () => {
    const f = fixture(); f.complete();
    const result = f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}');
    expect(result.review.decision).toBe('accepted');
    expect(result.document.scenes[0]!.illustration!.labels).toEqual(['Connected regions']);
    expect(result.prompts[0]!.prompt).toContain('Connected regions');
    expect(result.prompts[0]!.prompt).not.toContain('API');
  });
  it.each(['wrong-review', 'changed-receipt', 'changed-science', 'new-plan'] as const)('rejects %s without adopting or rendering', mode => {
    const f = fixture(); f.complete();
    if (mode === 'changed-receipt') f.messages[3]!.content = JSON.stringify({ status: 'art_ready', planToolCallId: 'forged' });
    if (mode === 'changed-science') f.messages[0]!.toolCalls![0]!.function.arguments = JSON.stringify({ ...science, title: 'An altered result' });
    if (mode === 'new-plan') f.invoke('paper_illustration_science', science, 'new-science');
    expect(() => f.restore().finish(f.messages, JSON.stringify({ reviewToolCallId: mode === 'wrong-review' ? 'science-call' : 'review-call' }))).toThrow(/Native|native/u);
  });
  it('returns repairable validation feedback without accepting unsupported source data', () => {
    const f = fixture(); const invalid = structuredClone(science); invalid.scenes[0]!.subjects[0]!.basis.sourceId = 'foreign';
    expect(f.invoke('paper_illustration_science', invalid, 'bad')).toMatchObject({ status: 'invalid_illustration', error: 'unknown_original_source' });
    f.complete(); expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}').review.decision).toBe('accepted');
  });
  it('repairs only the rejected scene through the bounded science contract', () => {
    const f = fixture({ quote: 'The reported output duration is 7 fs.', scienceFeedback: true, scienceRepairCallIdFeedback: true });
    const invalid = structuredClone(science); invalid.scenes[0]!.labels = ['7 fs'];
    const rejected = f.invoke('paper_illustration_science', invalid, 'actual-science-call');
    expect(rejected).toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('labels[0]'), scienceToolCallId: 'actual-science-call' });
    const repaired = structuredClone(invalid.scenes[0]!);
    repaired.subjects[0]!.description = 'The reported output duration is 7 fs.';
    expect(f.invoke('paper_illustration_science_repair', { scienceToolCallId: rejected.scienceToolCallId, sceneIndex: 0, scene: repaired }, 'repair'))
      .toMatchObject({ status: 'science_ready', scienceToolCallId: 'repair' });
    f.invoke('paper_illustration_art', { scienceToolCallId: 'repair', scenes: [{ layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.' }] }, 'art');
    f.invoke('paper_illustration_review', { planToolCallId: 'art', decision: 'accepted', summary: 'Sources, geometry and caption agree.', corrections: [], issues: [] }, 'review');
    expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review"}').review.decision).toBe('accepted');
  });
  it('keeps the exact rejected science call ID out of legacy replay feedback', () => {
    const f = fixture({ quote: 'The reported output duration is 7 fs.', scienceFeedback: true });
    const invalid = structuredClone(science); invalid.scenes[0]!.labels = ['7 fs'];
    expect(f.invoke('paper_illustration_science', invalid, 'legacy-science-call')).toEqual({
      status: 'invalid_illustration', error: expect.stringContaining('labels[0]'),
    });
  });
  it('does not let a repair tool choose an unrelated rejected candidate', () => {
    const f = fixture({ quote: 'The reported output duration is 7 fs.' });
    const repaired = structuredClone(science.scenes[0]!);
    expect(f.invoke('paper_illustration_science_repair', { scienceToolCallId: 'missing', sceneIndex: 0, scene: repaired }, 'repair'))
      .toMatchObject({ status: 'invalid_illustration', error: 'science_repair_requires_latest_rejected_science' });
  });
});

// Exact paid description from before the quantity/feedback correction. Its receipts are immutable.
const PAID_SCIENCE_DESCRIPTION = 'Save the scientific visual narrative before art. Choose only the scenes needed to convey the paper. Each subject has one exact supporting sN source. Encode direction, quantity meaning, comparison and model conditions explicitly. Labels are the complete visible text inventory, including axis symbols and qualifiers; no citations or hidden extra text. Constraints at most two. Narration <=600 characters; title <=120, mainMessage <=240, audience <=160. Subject and label indices are zero-based. paperOriginalAssetId is null for a designed image or an exact available original asset. This validates structure and binding, not scientific truth.';
const PAID_HZ_SCIENCE_DESCRIPTION = PAID_SCIENCE_DESCRIPTION + ' Each scene must include paperOriginalAssetId; for a designed image emit "paperOriginalAssetId": null, not an omitted key. Bibliographic Table/Fig references are structural labels; independent numeric-Hz-family quantities retain their value and unit. Validation feedback identifies affected fields and the explicit source variable when available; it never establishes symbol aliases or substitutes source evidence.';
const PAID_ANNOTATION_SCIENCE_DESCRIPTION = PAID_HZ_SCIENCE_DESCRIPTION + ' Recognized hyphenated scientific units in source prose or consecutive typed quantities are quantities, not subtraction; a complete parenthetical named-variable assignment remains distinct from arithmetic. Explicit local source symbols may have spaced subscripts and an is/of approximation statement; preserve their exact symbol identity, not aliases or arithmetic factors.';
const PAID_PROSE_SCIENCE_DESCRIPTION = PAID_ANNOTATION_SCIENCE_DESCRIPTION + ' A bare expression reference can match only that exact whole expression explicitly reported in the same supporting quote. Ordinary complete predicates after a comparison are prose, not units; unknown units remain binding. Use exact case-sensitive source IDs, supports relations and complete supporting text of 12..12000 characters; page markers or qualifiers cannot serve as subject bases. If an independent comparison is written after prose, separate it with a semicolon instead of an ambiguous mathematical wrapper; never remove functions, factors, terms or units.';
const PAID_CONTEXT_DESCRIPTION = 'Read the exact reviewed six-dimensional paper understanding, Claims and bound sources, eligible originals, style catalogue and requested scope. Start here; source IDs sN belong to this immutable selection, whereas paper tools use P IDs.';
function savedProfile(description: string | undefined, omitTools = false, contextDescription = PAID_CONTEXT_DESCRIPTION, repairCallIdFeedback = false): NativeAgentSessionState {
  const tools = originalImageTools.map(tool => ({ type: 'function' as const,
    function: { ...structuredClone(tool), ...(tool.name === 'paper_illustration_science' ? { description } : {}),
      ...(tool.name === 'paper_illustration_science_repair' && !repairCallIdFeedback ? { description: tool.description.replace(' (exact scienceToolCallId feedback)', '') } : {}),
      ...(tool.name === 'paper_illustration_context' ? { description: contextDescription } : {}) } }));
  return { kind: 'hermes-native-agent', binding: { taskId: 'task', artifactId: 'artifact', documentSha256: 'document', sourceMapHash: 'map',
    runtimeId: 'runtime', skillCatalogueId: 'catalogue', model: 'MiniMax-M3', allowedTools: tools.map(tool => tool.function.name),
    maxTurns: 32, maxOutputTokens: 32768, maxTotalOutputTokens: 98304, maxInputBytes: 500000, deadlineAt: 2000000000000 },
  initialMessages: [], turns: [{ state: 'started', target: { provider: 'minimax', model: 'MiniMax-M3', promptHash: 'existing-request' },
    request: { messages: [], options: omitTools ? {} : { tools } }, effectiveOptions: {} }] } as NativeAgentSessionState;
}

describe('Native planner locates quantity repairs without changing paid science', () => {
  it('advertises exactly the existing supported domains and accepts each through the real materializer', () => {
    const domains = ['real-space', 'wavevector-space', 'time', 'frequency', 'parameter-space', 'conceptual'];
    const profile = nativeIllustrationToolProfile(null);
    const schema = profile.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.parameters as {
      properties: { scenes: { items: { properties: { domain: { type: string; enum?: string[] } } } } };
    };
    expect(schema.properties.scenes.items.properties.domain).toEqual({ type: 'string', enum: domains });
    for (const domain of domains) {
      const value = structuredClone(science); value.scenes[0]!.domain = domain;
      expect(fixture(profile).invoke('paper_illustration_science', value, domain).status).toBe('science_ready');
    }
  });
  it('identifies the second scene label while retaining the same rejection', () => {
    const value = structuredClone(science); value.scenes.push(structuredClone(value.scenes[0]!));
    value.scenes[1]!.labels = ['7 fs'];
    const quote = 'The reported output duration is 7 fs.';
    const input = { settings: { ...settings, narrativeSceneLimit: 2 } };
    const fresh = fixture({ ...nativeIllustrationToolProfile(null), quote, input });
    const old = fixture({ ...nativeIllustrationToolProfile(savedProfile(PAID_PROSE_SCIENCE_DESCRIPTION)), quote, input });
    const repaired = fresh.invoke('paper_illustration_science', value, 'failed');
    expect(repaired).toMatchObject({ status: 'invalid_illustration', error: expect.stringMatching(/^unbound_numeric_7_fs_description/u) });
    expect(repaired.error).toBe('unbound_numeric_7_fs_description Fields: scenes[1].labels[0], scenes[1].subjects[0].description.');
    expect(old.invoke('paper_illustration_science', value, 'failed')).toEqual({ status: 'invalid_illustration',
      error: 'unbound_numeric_7_fs_description Fields: labels[0].' });
    value.scenes[1]!.subjects[0]!.description = 'The reported output duration is 7 fs.';
    expect(fresh.invoke('paper_illustration_science', value, 'repaired').status).toBe('science_ready');
    expect(old.invoke('paper_illustration_science', value, 'repaired').status).toBe('science_ready');
  });
  it('identifies the root narrative separately from scene messages', () => {
    const value = structuredClone(science); value.narrative.mainMessage = 'The output duration is 7 fs.';
    const quote = 'The reported output duration is 7 fs.';
    const fresh = fixture({ ...nativeIllustrationToolProfile(null), quote });
    const old = fixture({ ...nativeIllustrationToolProfile(savedProfile(PAID_PROSE_SCIENCE_DESCRIPTION)), quote });
    expect(fresh.invoke('paper_illustration_science', value, 'failed')).toEqual({ status: 'invalid_illustration',
      error: 'unbound_numeric_7_fs_description Fields: narrative.mainMessage.', scienceToolCallId: 'failed' });
    expect(old.invoke('paper_illustration_science', value, 'failed')).toEqual({ status: 'invalid_illustration',
      error: 'unbound_numeric_7_fs_description Fields: mainMessage.' });
  });
  it('keeps the actual be20 paid tool schema, prose grammar and unqualified feedback on restart', () => {
    const saved = savedProfile(PAID_PROSE_SCIENCE_DESCRIPTION);
    const definition = saved.turns[0]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_science')!;
    definition.function.parameters = { type: 'object', properties: { paidMarker: { type: 'string' } } };
    saved.turns.push(structuredClone(saved.turns[0]!));
    saved.turns[1]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_science')!.function =
      structuredClone(nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_science')!);
    const before = structuredClone(saved); const profile = nativeIllustrationToolProfile(saved);
    expect(profile).toMatchObject({ scienceFeedback: true, sourceQuantityAnnotations: true, sourceQuantityProse: true, sourceQuantityLocations: false });
    expect(profile.sourceTools.find(tool => tool.name === 'paper_illustration_science')).toEqual(definition.function);
    expect(saved).toEqual(before);
  });
  it.each([
    { mode: 'base', description: PAID_SCIENCE_DESCRIPTION }, { mode: 'Hz', description: PAID_HZ_SCIENCE_DESCRIPTION },
    { mode: 'annotations', description: PAID_ANNOTATION_SCIENCE_DESCRIPTION }, { mode: 'be20 prose', description: PAID_PROSE_SCIENCE_DESCRIPTION },
    { mode: 'unknown', description: 'unknown paid science' },
  ])('never upgrades the quantity locations of a saved description: $mode', ({ description }) => {
    expect(nativeIllustrationToolProfile(savedProfile(description)).sourceQuantityLocations).toBe(false);
    expect(nativeIllustrationToolProfile(savedProfile(undefined, true)).sourceQuantityLocations).toBe(false);
  });
  it('keeps the legacy string domain schema when the first paid tool list is absent', () => {
    const tools = nativeIllustrationToolProfile(savedProfile(undefined, true)).sourceTools;
    const schema = tools.find(tool => tool.name === 'paper_illustration_science')!.parameters as {
      properties: { scenes: { items: { properties: { domain: unknown } } } };
    };
    expect(schema.properties.scenes.items.properties.domain).toEqual({ type: 'string' });
  });
  it('strictly replays located failure receipts and does not accept a changed scene path', () => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const profile = nativeIllustrationToolProfile(null);
    const saved = savedProfile(profile.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description, false,
      profile.sourceTools.find(tool => tool.name === 'paper_illustration_context')!.description, true);
    const f = fixture({ ...profile, quote: 'The reported output duration is 7 fs.' });
    const value = structuredClone(science); value.scenes[0]!.labels = ['7 fs'];
    expect(f.invoke('paper_illustration_science', value, 'invalid').error).toContain('scenes[0].labels[0]');
    f.complete();
    const restore = () => createNativeIllustrationMaterializer({ ...f.input, ...nativeIllustrationToolProfile(saved) });
    const final = '{"reviewToolCallId":"review-call"}';
    expect(restore().finish(f.messages, final).review.decision).toBe('accepted');
    const changed = structuredClone(f.messages);
    const receipt = changed.find(message => message.role === 'tool' && message.toolCallId === 'invalid')!;
    receipt.content = receipt.content.replace('scenes[0]', 'scenes[1]');
    expect(() => restore().finish(changed, final)).toThrow(/history changed/u);
    expect(http).not.toHaveBeenCalled();
  });
});

describe('Native source prose retains whole expressions and exact source identities', () => {
  const quantityScene = (label: string) => {
    const value = structuredClone(science);
    value.narrative.mainMessage = label;
    value.scenes[0]!.labels = [label]; value.scenes[0]!.subjects[0]!.description = label;
    return value;
  };
  const current = (quote: string) => fixture({ scienceFeedback: true, sourceQuantityAnnotations: true, sourceQuantityProse: true, quote });
  it('binds a bare reference to its exact expression in a reported quantity, including the root narrative', () => {
    const f = current('The reference period is T_r/2 (i.e., 0.26 fs) for the stated numerical example.');
    expect(f.invoke('paper_illustration_science', quantityScene('T_r/2'), 'science')).toMatchObject({ status: 'science_ready' });
    f.invoke('paper_illustration_art', { scienceToolCallId: 'science', scenes: [{ layout: 'Display label 0.', treatment: 'Crisp ink.' }] }, 'art');
    f.invoke('paper_illustration_review', { planToolCallId: 'art', decision: 'accepted', summary: 'Exact source period is retained.', corrections: [], issues: [] }, 'review');
    expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review"}').document.scenes[0]!.illustration!.labels).toEqual(['T_r/2']);
  });
  it.each(['T_q/2', 'T_r/3', '2*T_r/2', 'T_r/(2*f)'])('rejects a different whole reference %s despite the same source number', label => {
    const f = current('The reference period is T_r/2 (i.e., 0.26 fs) for the stated numerical example.');
    expect(f.invoke('paper_illustration_science', quantityScene(label), 'science').status).toBe('invalid_illustration');
  });
  it.each(['sets a', 'defines the', 'marks a'])('distinguishes the ordinary predicate %s from a unit', predicate => {
    const f = current(`The criterion Q > 2 ${predicate} threshold for this numerical example.`);
    expect(f.invoke('paper_illustration_science', quantityScene('Q > 2'), 'science')).toMatchObject({ status: 'science_ready' });
  });
  it.each(['fs', 'm', 'frobs', 'sets'])('does not silently drop a real or unknown source unit %s', unit => {
    const f = current(`The reported quantity Q > 2 ${unit}; it applies to the stated numerical example.`);
    expect(f.invoke('paper_illustration_science', quantityScene('Q > 2'), 'science').status).toBe('invalid_illustration');
  });
  it('names the exact failed source position without changing its case or selecting another source', () => {
    const f = current('The criterion Q > 2 sets a threshold for this numerical example.');
    const value = quantityScene('Q > 2'); value.scenes[0]!.subjects[0]!.basis.sourceId = 'S0';
    const invalid = f.invoke('paper_illustration_science', value, 'invalid');
    expect(invalid.status).toBe('invalid_illustration');
    expect(invalid.error).toContain('scenes[0].subjects[0].basis.sourceId');
    expect(invalid.error).toContain('case-sensitive');
    value.scenes[0]!.subjects[0]!.basis.sourceId = 's0';
    expect(f.invoke('paper_illustration_science', value, 'fixed').status).toBe('science_ready');
  });
  it('explains a too-short bound quote instead of encouraging invented source IDs', () => {
    const f = current('Page 5.');
    const invalid = f.invoke('paper_illustration_science', science, 'invalid');
    expect(invalid.status).toBe('invalid_illustration');
    expect(invalid.error).toContain('scenes[0].subjects[0].basis.sourceId');
    expect(invalid.error).toContain('7'); expect(invalid.error).toContain('12');
    expect(invalid.error).toContain('paper_illustration_context');
  });
  it('locates a qualifier used as direct support while preserving its recorded relation', () => {
    const selected = structuredClone(claims); selected[0]!.sourcePassages[0]!.relation = 'qualifies';
    const f = fixture({ sourceQuantityProse: true, input: { claims: selected as never } });
    const invalid = f.invoke('paper_illustration_science', science, 'invalid');
    expect(invalid.status).toBe('invalid_illustration');
    expect(invalid.error).toContain('scenes[0].subjects[0].basis.sourceId');
    expect(invalid.error).toContain('supports');
    expect(f.invoke('paper_illustration_context', {}, 'context').claims).toMatchObject([{ sources: [{ sourceId: 's0', relation: 'qualifies' }] }]);
  });
  it('keeps ambiguous math shells rejected and gives an independent prose comparison repair', () => {
    const f = current('The criterion Q > 2; this is the reported threshold for the stated example.');
    const invalid = f.invoke('paper_illustration_science', quantityScene('pulse-period (Q > 2)'), 'invalid');
    expect(invalid.status).toBe('invalid_illustration');
    expect(invalid.error).toContain('semicolon');
    expect(f.invoke('paper_illustration_science', quantityScene('pulse-period; Q > 2'), 'fixed').status).toBe('science_ready');
    for (const label of ['f(Q > 2)', '2*(Q > 2)', '(x*(Q > 2))', 'pulse-period (Q > 2']) {
      expect(f.invoke('paper_illustration_science', quantityScene(label), label).status).toBe('invalid_illustration');
    }
  });
  it('preserves the previously paid annotation mode and all of its failed receipts', () => {
    const profile = nativeIllustrationToolProfile(savedProfile(PAID_ANNOTATION_SCIENCE_DESCRIPTION));
    expect(profile.sourceQuantityAnnotations).toBe(true); expect(profile.scienceFeedback).toBe(true);
    expect(profile.sourceQuantityProse).toBe(false);
    expect(nativeIllustrationToolProfile(null).sourceQuantityProse).toBe(true);
    const f = fixture({ ...profile, quote: 'The reference period is T_r/2 (i.e., 0.26 fs) for the stated numerical example.' });
    expect(f.invoke('paper_illustration_science', quantityScene('T_r/2'), 'old').status).toBe('invalid_illustration');
    const invalid = structuredClone(science); invalid.scenes[0]!.subjects[0]!.basis.sourceId = 'S0';
    expect(f.invoke('paper_illustration_science', invalid, 'old-source')).toEqual({ status: 'invalid_illustration', error: 'unknown_original_source' });
  });
});
function quantityScene(text: string, description = text) {
  const value = structuredClone(science);
  value.scenes[0]!.narration = text;
  value.scenes[0]!.subjects[0]!.description = description;
  return value;
}
afterEach(() => vi.unstubAllGlobals());

describe('native illustration defers design guidance until science is saved', () => {
  const freshDescriptions = () => {
    const tools = nativeIllustrationToolProfile(null).sourceTools;
    return { context: tools.find(tool => tool.name === 'paper_illustration_context')!.description,
      science: tools.find(tool => tool.name === 'paper_illustration_science')!.description };
  };
  it('omits only design guidance from fresh context and returns the full guidance on every successful science receipt', () => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const input = {
      claims: [{ ...structuredClone(claims[0]!), conditions: ['The stated condition'], limitations: ['One source case'],
        sourcePassages: [...structuredClone(claims[0]!.sourcePassages), { evidenceId: 'another-evidence', relation: 'context', text: 'The condition is part of the source case.' }] }] as never,
      paperOriginals: new Map([['original', { assetId: 'original', sourceClaimId: claims[0]!.id }]]) as never,
      narrativeSource: { versionSdf: { problem: 'A source question', method: 'A source method', results: 'A source result', insight: 'The author explanation',
        limitations: 'The source scope', reproducibility: 'The reported method' }, reviewedAnalysis: { authorIntent: 'Explain the relation' },
      scientificReview: { status: 'review_received', fieldReviews: { method: { verdict: 'accepted' } }, needsMoreEvidence: [] },
      sourceContext: { excerpts: [{ id: 'P00001', text: 'The full original paragraph.', sourceLocator: { page: 2 }, range: { start: 0, end: 28, total: 28 },
        origin: { kind: 'paragraph', parser: 'fixture', confidence: 0.9 } }],
      coverage: { complete: true, selectedCharacters: 28, totalCharacters: 28, omittedSegments: 0 } } } as never,
    };
    const legacy = fixture({ input });
    const oldContext = legacy.invoke('paper_illustration_context', {}, 'context');
    const { designGuidance, ...scienceContext } = oldContext;
    expect(designGuidance).toBe(loadIllustrationStyleSkills([settings.style], settings.instruction, 'plan').instructions);
    expect((designGuidance as string).length).toBeGreaterThan(1000);
    const f = fixture({ ...nativeIllustrationToolProfile(null), input });
    const context = f.invoke('paper_illustration_context', {}, 'context');
    expect(context).not.toHaveProperty('designGuidance');
    expect(context).toEqual(scienceContext);
    expect(context.claims).toMatchObject([{ conditions: ['The stated condition'], limitations: ['One source case'],
      sources: [{ sourceId: 's0' }, { sourceId: 's1' }] }]);
    expect(context.paper).toMatchObject({ sourceContext: { excerpts: [{ id: 'P00001', text: 'The full original paragraph.', page: 2 }] } });
    const invalid = structuredClone(science); invalid.scenes[0]!.subjects[0]!.basis.sourceId = 'foreign';
    expect(f.invoke('paper_illustration_science', invalid, 'invalid')).toEqual({ status: 'invalid_illustration',
      error: 'unknown_original_source: scenes[0].subjects[0].basis.sourceId must select an exact case-sensitive sourceId from paper_illustration_context. Do not invent or convert IDs.', scienceToolCallId: 'invalid' });
    for (const id of ['first-science', 'revised-science']) {
      expect(f.invoke('paper_illustration_science', science, id)).toEqual({
        ...legacy.invoke('paper_illustration_science', science, id), designGuidance,
      });
    }
    expect(http).not.toHaveBeenCalled();
  });
  it.each(['fresh', 'new-restart', 'f4b', 'legacy', 'unknown', 'missing-tools'] as const)('selects deferred guidance from the first context description only: %s', mode => {
    const descriptions = freshDescriptions();
    const saved = mode === 'fresh' ? null : savedProfile(mode === 'legacy' ? PAID_SCIENCE_DESCRIPTION : descriptions.science,
      mode === 'missing-tools', mode === 'new-restart' ? descriptions.context : mode === 'unknown' ? 'Unknown paid context' : PAID_CONTEXT_DESCRIPTION);
    const profile = nativeIllustrationToolProfile(saved);
    expect(profile.deferDesignGuidance).toBe(mode === 'fresh' || mode === 'new-restart');
    expect(profile.scienceFeedback).toBe(mode !== 'legacy' && mode !== 'missing-tools');
    const f = fixture(profile);
    const context = f.invoke('paper_illustration_context', {}, 'context');
    const ready = f.invoke('paper_illustration_science', science, 'science');
    expect(Object.hasOwn(context, 'designGuidance')).toBe(!profile.deferDesignGuidance);
    expect(Object.hasOwn(ready, 'designGuidance')).toBe(profile.deferDesignGuidance);
    if (mode === 'missing-tools') expect(profile.sourceTools.find(tool => tool.name === 'paper_illustration_context')!.description).toBe(PAID_CONTEXT_DESCRIPTION);
    if (saved && mode !== 'missing-tools') expect(profile.sourceTools).toEqual(saved.turns[0]!.request.options.tools!.map(tool => tool.function));
  });
  it('ignores a later upgraded context description, retains the first schema, and rejects a missing description', () => {
    const descriptions = freshDescriptions();
    const saved = savedProfile(descriptions.science);
    saved.turns.push(structuredClone(saved.turns[0]!));
    saved.turns[1]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_context')!.function.description = descriptions.context;
    const definition = saved.turns[0]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_context')!;
    definition.function.parameters = { type: 'object', properties: { paidMarker: { type: 'string' } } };
    const before = structuredClone(saved);
    const restored = nativeIllustrationToolProfile(saved);
    expect(restored.deferDesignGuidance).toBe(false);
    expect(restored.sourceTools.find(tool => tool.name === 'paper_illustration_context')).toEqual(definition.function);
    restored.sourceTools[0]!.description = 'a local copy';
    expect(saved).toEqual(before);
    delete definition.function.description;
    expect(() => nativeIllustrationToolProfile(saved)).toThrow(/history changed/u);
  });
  it.each(['new', 'f4b', 'legacy', 'unknown'] as const)('strictly replays context, success and failure receipts without HTTP: %s', mode => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const descriptions = freshDescriptions();
    const saved = savedProfile(mode === 'legacy' ? PAID_SCIENCE_DESCRIPTION : descriptions.science, false,
      mode === 'new' ? descriptions.context : mode === 'unknown' ? 'Unknown paid context' : PAID_CONTEXT_DESCRIPTION);
    const profile = nativeIllustrationToolProfile(saved);
    const f = fixture({ ...profile, quote: 'FWHM_T = 7 fs' });
    f.invoke('paper_illustration_context', {}, 'context');
    f.invoke('paper_illustration_science', quantityScene('FWHM_S = 7 fs'), 'invalid');
    f.complete();
    const history = structuredClone(f.messages);
    const restore = () => createNativeIllustrationMaterializer({ ...f.input, ...nativeIllustrationToolProfile(saved) });
    const final = '{"reviewToolCallId":"review-call"}';
    expect(restore().finish(f.messages, final)).toEqual(f.restore().finish(f.messages, final));
    expect(f.messages).toEqual(history);
    for (const id of ['context', 'science-call', 'invalid']) {
      const changed = structuredClone(f.messages);
      const receipt = changed.find(message => message.role === 'tool' && message.toolCallId === id)!;
      const payload = JSON.parse(receipt.content);
      if (id === 'invalid') payload.error += ' tampered'; else payload.designGuidance = `${payload.designGuidance ?? ''} tampered`;
      receipt.content = JSON.stringify(payload);
      expect(() => restore().finish(changed, final)).toThrow(/history changed/u);
    }
    expect(http).not.toHaveBeenCalled();
  });
  it('preserves auto style choices, render resources, portable prompts and design usage', () => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const input = { settings: { ...settings, style: 'auto' } };
    const art = { scienceToolCallId: 'science-call', scenes: [{ layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.',
      styleId: 'article:scientific', styleRecommendations: { selectedStyleId: 'article:scientific', choices: [
        { styleId: 'article:scientific', name: 'Scientific', reason: 'Clear source relation.' },
        { styleId: 'article:watercolor', name: 'Watercolor', reason: 'A softer appearance for the same relation.' },
      ] } }] };
    const finish = (deferDesignGuidance: boolean) => {
      const f = fixture({ input, scienceFeedback: true, deferDesignGuidance });
      f.invoke('paper_illustration_context', {}, 'context');
      const ready = f.invoke('paper_illustration_science', science, 'science-call');
      if (deferDesignGuidance) expect(ready.designGuidance).toBe(loadIllustrationStyleSkills(['auto'], settings.instruction, 'plan').instructions);
      expect(f.invoke('paper_illustration_art', art, 'art-call').status).toBe('art_ready');
      expect(f.invoke('paper_illustration_review', { planToolCallId: 'art-call', decision: 'accepted', summary: 'Source and visual mapping agree.', corrections: [], issues: [] }, 'review-call').status).toBe('illustration_review_ready');
      return f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}');
    };
    const prior = finish(false); const current = finish(true);
    expect(current).toEqual(prior);
    expect(current.document.scenes[0]!.styleRecommendations?.choices).toHaveLength(2);
    expect(current.prompts[0]!.prompt.length).toBeGreaterThan(1000);
    expect(current.designSkills).toEqual(prior.designSkills);
    expect(http).not.toHaveBeenCalled();
  });
});

describe('native illustration preserves paid quantity and feedback semantics', () => {
  it.each([
    ['0.4', 'THz', 'an ICS pulse generated using a 3-MeV 1-fs 1-nC electron bunch and a 0.4-THz ( λ 0=750 μ m) 1-ps pulsed driving field'],
    ['2.5', 'GHz', 'A 2.5–GHz (λ=0.12 m) signal connects the regions.'],
    ['15', 'kHz', 'A 15-kHz (f=15 kHz) signal connects the regions.'],
  ])('binds the independent %s %s quantity before a parenthetical source annotation', (value, unit, quote) => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote });
    const result = f.invoke('paper_illustration_science', quantityScene(`A ${value} ${unit} signal connects the regions.`, `Frequency ${value} ${unit}`), 'quantity');
    expect(result, JSON.stringify(result))
      .toMatchObject({ status: 'science_ready' });
    expect(http).not.toHaveBeenCalled();
  });
  it('preserves the actual old rejection receipt and does not upgrade its first paid description', () => {
    const saved = savedProfile(PAID_HZ_SCIENCE_DESCRIPTION);
    saved.turns.push(structuredClone(saved.turns[0]!));
    saved.turns[1]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_science')!.function.description =
      nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    const f = fixture({ ...nativeIllustrationToolProfile(saved), quote: 'A 0.4-THz ( λ 0=750 μ m) pulsed driving field.' });
    f.invoke('paper_illustration_context', {}, 'context');
    expect(f.invoke('paper_illustration_science', quantityScene('A 0.4 THz field.', 'Frequency 0.4 THz'), 'quantity'))
      .toEqual({ status: 'invalid_illustration', error: 'unbound_numeric_0_4_thz_source Fields: narration.' });
    f.complete();
    expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}').review.decision).toBe('accepted');
    const changed = structuredClone(f.messages);
    changed.find(message => message.role === 'tool' && message.toolCallId === 'quantity')!.content = JSON.stringify({ status: 'science_ready' });
    expect(() => f.restore().finish(changed, '{"reviewToolCallId":"review-call"}')).toThrow(/history changed/u);
  });
  it.each(['(2.5-GHz)/2', '2.5-GHz + x', '2.5-GHz (x)/2', 'x-2.5-GHz', '1-β', 'λ/2'])('does not turn the larger expression %s into an independent frequency', expression => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote: 'An unrelated frequency is 2.5 GHz.' });
    expect(f.invoke('paper_illustration_science', quantityScene(expression), 'expression')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('unbound_expression_') });
  });
  it('continues to reject a changed value or unit against the annotated source', () => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote: 'A 0.4-THz (λ0=750 μm) pulsed field.' });
    for (const value of ['0.5 THz', '0.4 GHz'])
      expect(f.invoke('paper_illustration_science', quantityScene(`Frequency ${value}.`, `Frequency ${value}`), value)).toMatchObject({ status: 'invalid_illustration',
        error: expect.stringContaining('_source') });
  });
  it.each([
    '(0.4-THz (λ0=750 μm))/2', 'x-0.4-THz (λ0=750 μm)',
    '0.4-THz (λ0=750 μm) / 2', '0.4-THz (λ0=750 μm) + x',
    '0.4-THz (λ0=750 μm) x', '0.4-THz (λ0=750 μm) β',
    '0.4-THz (λ0=750 μm) (x)', '0.4-THz (λ0=750 μm) exp(x)', '0.4-THz (λ0=750 μm) exp (x)',
    '0.4-THz (λ0=750 μm) gain*x', '0.4-THz (λ0=750 μm) gain * x',
    '0.4-THz (λ0=750 μm) gain1', '0.4-THz (λ0=750 μm) gain_1',
    '0.4-THz (λ0=750 μm',
  ])('does not extract a reported frequency from the expression or incomplete annotation %s', quote => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote });
    expect(f.invoke('paper_illustration_science', quantityScene('A 0.4 THz signal.', 'Frequency 0.4 THz'), 'quantity'))
      .toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_source') });
  });
  it('keeps an annotation quantity bound to its own source variable rather than inventing an alias', () => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote: 'A 15-kHz (f=15 kHz) signal connects the regions.' });
    expect(f.invoke('paper_illustration_science', quantityScene('f = 15 kHz', 'f = 15 kHz'), 'frequency'))
      .toMatchObject({ status: 'science_ready' });
    expect(f.invoke('paper_illustration_science', quantityScene('w = 15 kHz', 'w = 15 kHz'), 'alias'))
      .toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_source') });
  });
  it.each([PAID_SCIENCE_DESCRIPTION, PAID_HZ_SCIENCE_DESCRIPTION, 'unknown paid science description'])('uses fresh annotation recognition only from the first exact new description: %s', description => {
    const saved = savedProfile(description);
    saved.turns.push(structuredClone(saved.turns[0]!));
    saved.turns[1]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_science')!.function.description =
      nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    expect(nativeIllustrationToolProfile(saved).sourceQuantityAnnotations).toBe(false);
    expect(nativeIllustrationToolProfile(saved).scienceFeedback).toBe(description === PAID_HZ_SCIENCE_DESCRIPTION);
    expect(nativeIllustrationToolProfile(null).sourceQuantityAnnotations).toBe(true);
    expect(nativeIllustrationToolProfile(savedProfile(undefined, true)).sourceQuantityAnnotations).toBe(false);
  });
  it('strictly restores a new successful annotated-source plan without changing static or historical defaults', () => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const profile = nativeIllustrationToolProfile(null);
    const f = fixture({ ...profile, quote: 'A 0.4-THz ( λ 0=750 μ m) pulsed driving field.' });
    const value = quantityScene('A 0.4 THz field.', 'Frequency 0.4 THz');
    expect(() => materializeIllustrationScience(value, f.input.claims, settings, new Map(), true)).toThrow('unbound_numeric_0_4_thz_source');
    f.complete(value);
    const description = profile.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    const context = profile.sourceTools.find(tool => tool.name === 'paper_illustration_context')!.description;
    const restore = () => createNativeIllustrationMaterializer({ ...f.input, ...nativeIllustrationToolProfile(savedProfile(description, false, context)) });
    const result = restore().finish(f.messages, '{"reviewToolCallId":"review-call"}');
    expect(result).toEqual(f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}'));
    expect(result.prompts[0]!.prompt).toContain('0.4 THz');
    const changed = structuredClone(f.messages);
    const receipt = changed.find(message => message.role === 'tool' && message.toolCallId === 'science-call')!;
    receipt.content = JSON.stringify({ ...JSON.parse(receipt.content), sceneCount: 9 });
    expect(() => restore().finish(changed, '{"reviewToolCallId":"review-call"}')).toThrow(/history changed/u);
    expect(http).not.toHaveBeenCalled();
  });
  it.each([
    ['Here τ 1 is ∼ 3.6 fs, for this source case.', 'τ₁ ≈ 3.6 fs', 'τ₂ ≈ 3.6 fs'],
    ['Calculated ν p is ∼ 26 THz for this source case.', 'ν_p ≈ 26 THz', 'ν_q ≈ 26 THz'],
    ['This corresponds to a T c1 of ~38 fs.', 'T_c1 ≈ 38 fs', 'T_c2 ≈ 38 fs'],
    ['A 0.4-THz ( λ 0=750 μ m) pulsed field.', 'λ₀ = 750 μm', 'λ₁ = 750 μm'],
  ])('binds the explicitly written source symbol in %s without allowing a different variable', (quote, asserted, alias) => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote });
    const result = f.invoke('paper_illustration_science', quantityScene(asserted, asserted), 'quantity');
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'science_ready' });
    expect(f.invoke('paper_illustration_science', quantityScene(alias, alias), 'alias'))
      .toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_source') });
    const historical = fixture({ ...nativeIllustrationToolProfile(savedProfile(PAID_HZ_SCIENCE_DESCRIPTION)), quote });
    expect(historical.invoke('paper_illustration_science', quantityScene(asserted, asserted), 'old'))
      .toMatchObject({ status: 'invalid_illustration' });
  });
  it.each(['(τ 1/2) ≈ 3.6 fs', 'x + τ 1 is ∼ 3.6 fs', 'a τ 1≈3.6 fs', 'x + a τ 1 of ~3.6 fs', 'The width is ∼ 3.6 fs.'])('does not reinterpret %s as a plain source variable assignment', quote => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote });
    expect(f.invoke('paper_illustration_science', quantityScene('τ₁ ≈ 3.6 fs', 'τ₁ ≈ 3.6 fs'), 'quantity'))
      .toMatchObject({ status: 'invalid_illustration' });
  });
  it.each([
    ['19', 'fs', 'The 19-fs width of a Gaussian-profile output pulse.'],
    ['3', 'MeV', 'A 3-MeV electron bunch produces the reported signal.'],
    ['1', 'nC', 'A 1-nC electron bunch produces the reported signal.'],
    ['25', 'μm', 'A 25-μm slit confines the driving field.'],
  ])('recognizes a hyphenated %s %s unit as source prose rather than subtraction', (value, unit, quote) => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote });
    const result = f.invoke('paper_illustration_science', quantityScene(`Reported ${value} ${unit}.`, `Reported ${value} ${unit}`), 'quantity');
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'science_ready' });
    expect(f.invoke('paper_illustration_science', quantityScene(`Reported ${Number(value) + 1} ${unit}.`, `Reported ${Number(value) + 1} ${unit}`), 'wrong'))
      .toMatchObject({ status: 'invalid_illustration', error: expect.stringContaining('_source') });
  });
  it.each(['(3-MeV)/2', '3-MeV + x', '3-MeV β', '3-MeV (x)/2', '3-MeV exp (x)', '3-MeV gain*x', '3-MeV gain * x', '3-MeV gain1', '3-MeV gain_1'])('does not reinterpret the full expression %s as a reported energy', quote => {
    const f = fixture({ ...nativeIllustrationToolProfile(null), quote });
    expect(f.invoke('paper_illustration_science', quantityScene('Reported 3 MeV.', 'Reported 3 MeV'), 'quantity'))
      .toMatchObject({ status: 'invalid_illustration' });
  });
  it('selects the new mode only from the exact first paid science description and retains saved schemas', () => {
    const fresh = nativeIllustrationToolProfile(null);
    expect(fresh.scienceFeedback).toBe(true);
    const description = fresh.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description;
    expect(description).not.toBe(PAID_SCIENCE_DESCRIPTION);
    const saved = savedProfile(description);
    const definition = saved.turns[0]!.request.options.tools!.find(tool => tool.function.name === 'paper_illustration_science')!;
    definition.function.parameters = { type: 'object', properties: { savedSchemaMarker: { type: 'string' } } };
    const before = structuredClone(saved);
    const restored = nativeIllustrationToolProfile(saved);
    expect(restored.scienceFeedback).toBe(true);
    expect(restored.sourceTools.find(tool => tool.name === 'paper_illustration_science')).toEqual(definition.function);
    restored.sourceTools[0]!.description = 'a local copy';
    expect(saved).toEqual(before);
  });
  it.each([PAID_SCIENCE_DESCRIPTION, 'unknown paid science description'])('never upgrades a saved legacy or unknown description: %s', description => {
    const restored = nativeIllustrationToolProfile(savedProfile(description));
    expect(restored.scienceFeedback).toBe(false);
    expect(restored.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description).toBe(description);
  });
  it('does not advertise the new mode when paid tools are missing, and rejects a missing saved description', () => {
    const restored = nativeIllustrationToolProfile(savedProfile(undefined, true));
    expect(restored.scienceFeedback).toBe(false);
    expect(restored.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description).toBe(PAID_SCIENCE_DESCRIPTION);
    expect(() => nativeIllustrationToolProfile(savedProfile(undefined))).toThrow(/Native/u);
  });
  it.each(['Table 3 / Fig. S4', '(Table 3 / Figure S4)'])('treats %s as bibliography while retaining actual numeric source requirements', reference => {
    const f = fixture({ scienceFeedback: true });
    const value = structuredClone(science); value.scenes[0]!.narration = `The connection is shown in ${reference}.`;
    expect(f.invoke('paper_illustration_science', value, 'reference')).toMatchObject({ status: 'science_ready' });
    value.scenes[0]!.narration += ' Frequency 2.5 GHz.';
    expect(f.invoke('paper_illustration_science', value, 'unsupported')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('unbound_numeric_2_5_ghz_description') });
  });
  it.each([['2.5-GHz', '2.5 GHz'], ['0.4-THz', '0.4 THz'], ['2.5–GHz', '2.5 GHz']])('retains the value/unit and own source for %s', (formatted, original) => {
    const f = fixture({ scienceFeedback: true, quote: `The frequency is ${original}.` });
    const value = quantityScene(`A ${formatted} signal connects the regions.`, `Frequency ${original}`);
    expect(f.invoke('paper_illustration_science', value, 'quantity')).toMatchObject({ status: 'science_ready' });
    expect(value.scenes[0]!.narration).toContain(formatted);
    const wrong = fixture({ scienceFeedback: true, quote: 'The frequency is 3.7 MHz.' });
    expect(wrong.invoke('paper_illustration_science', value, 'wrong-source')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('_source') });
  });
  it.each(['1-β', '2.5-x', 'λ/2', '(2.5-GHz)/2', '2.5-GHz+x'])('keeps the full real expression %s source bound', expression => {
    const f = fixture({ scienceFeedback: true, quote: 'An unrelated frequency is 2.5 GHz.' });
    expect(f.invoke('paper_illustration_science', quantityScene(expression), 'expression')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('unbound_expression_') });
  });
  it('returns only existing field locations and expected variable, without changing legacy or static defaults', () => {
    const value = quantityScene('FWHM_S = 7 fs'); value.scenes[0]!.labels = ['FWHM_S = 7 fs'];
    const f = fixture({ scienceFeedback: true, quote: 'FWHM_T = 7 fs' });
    let original: unknown;
    try { materializeIllustrationScience(value, f.input.claims, settings); } catch (error) { original = error; }
    expect(original).toMatchObject({ message: 'unbound_numeric_7_fs_source', fields: ['narration', 'labels[0]'], expectedVariable: 'FWHM_T' });
    const result = f.invoke('paper_illustration_science', value, 'details');
    expect(result).toEqual({ status: 'invalid_illustration', error: expect.stringMatching(/^unbound_numeric_7_fs_source/u) });
    expect(result.error).toContain('narration'); expect(result.error).toContain('labels[0]'); expect(result.error).toContain('FWHM_T');
    expect((result.error as string).length).toBeLessThanOrEqual(500);
    expect(result.error).not.toContain('FWHM_T = 7 fs');
    const old = fixture({ quote: 'FWHM_T = 7 fs' });
    expect(old.invoke('paper_illustration_science', value, 'old')).toEqual({ status: 'invalid_illustration', error: 'unbound_numeric_7_fs_source' });
    const bibliography = structuredClone(science); bibliography.scenes[0]!.narration = 'See Table 3 / Fig. S4.';
    expect(() => materializeIllustrationScience(bibliography, old.input.claims, settings)).toThrow(/unbound_expression_/u);
  });
  it('keeps the complete fresh numeric repair diagnostic so one repair can fix a scene in one turn', () => {
    const f = fixture({ scienceFeedback: true });
    const value = structuredClone(science);
    value.scenes[0]!.labels = Array.from({ length: 12 }, (_, index) => `${index + 1} GHz`);
    const result = f.invoke('paper_illustration_science', value, 'many-diagnostics');
    expect(result).toMatchObject({ status: 'invalid_illustration' });
    expect(result.error).toContain('unbound_numeric_12_ghz_description');
    expect((result.error as string).length).toBeGreaterThan(500);
  });
  it('distinguishes an explicitly absent source symbol from unavailable variable guidance and bounds many diagnostics', () => {
    const f = fixture({ scienceFeedback: true, quote: 'The width is 7 fs.' });
    const value = quantityScene('FWHM_S = 7 fs');
    const prose = f.invoke('paper_illustration_science', value, 'prose');
    expect(prose.error).toContain('prose');
    expect(prose.error).not.toContain('undefined'); expect(prose.error).not.toContain('null');
    const unknown = fixture({ scienceFeedback: true, quote: 'An unrelated qualitative relation.' });
    const result = unknown.invoke('paper_illustration_science', value, 'unknown-variable');
    expect(result.error).toContain('narration'); expect(result.error).not.toContain('prose');
    value.scenes[0]!.labels = Array.from({ length: 15 }, (_, index) => `Frequency ${index + 100} GHz`);
    const many = unknown.invoke('paper_illustration_science', value, 'many');
    expect(many.status).toBe('invalid_illustration'); expect((many.error as string).length).toBeLessThanOrEqual(4_000);
  });
  it.each([false, true])('never defaults required nullable original metadata, mode %s', scienceFeedback => {
    const f = fixture({ scienceFeedback }); const value = structuredClone(science);
    delete (value.scenes[0] as { paperOriginalAssetId?: null }).paperOriginalAssetId;
    expect(f.invoke('paper_illustration_science', value, 'missing')).toMatchObject({ status: 'invalid_illustration',
      error: expect.stringContaining('missing_paperOriginalAssetId') });
  });
  it.each([false, true])('restarts with exact failed and successful receipts, rejects either tamper, and makes no HTTP calls: new=%s', fresh => {
    const http = vi.fn(() => { throw new Error('Unexpected HTTP'); }); vi.stubGlobal('fetch', http);
    const first = nativeIllustrationToolProfile(fresh ? null : savedProfile(PAID_SCIENCE_DESCRIPTION));
    const saved = savedProfile(first.sourceTools.find(tool => tool.name === 'paper_illustration_science')!.description);
    const f = fixture({ scienceFeedback: first.scienceFeedback, quote: 'FWHM_T = 7 fs' });
    f.invoke('paper_illustration_science', quantityScene('FWHM_S = 7 fs'), 'invalid');
    const bibliography = structuredClone(science); bibliography.scenes[0]!.narration = 'See Table 3 / Fig. S4.';
    expect(f.invoke('paper_illustration_science', bibliography, 'bibliography').status).toBe(fresh ? 'science_ready' : 'invalid_illustration');
    f.complete();
    const originalHistory = structuredClone(f.messages);
    const restore = () => createNativeIllustrationMaterializer({ ...f.input, scienceFeedback: nativeIllustrationToolProfile(saved).scienceFeedback });
    const final = '{"reviewToolCallId":"review-call"}';
    expect(restore().finish(f.messages, final).review.decision).toBe('accepted');
    expect(f.messages).toEqual(originalHistory);
    for (const callId of ['invalid', 'science-call']) {
      const altered = structuredClone(f.messages);
      const receipt = altered.find(message => message.role === 'tool' && message.toolCallId === callId)!;
      const payload = JSON.parse(receipt.content);
      if (callId === 'invalid') payload.error += ' tampered'; else payload.intent.title = 'tampered';
      receipt.content = JSON.stringify(payload);
      expect(() => restore().finish(altered, final)).toThrow(/history changed/u);
    }
    expect(http).not.toHaveBeenCalled();
  });
});
