import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@openscience/ai-gateway';
import type { NativeAgentSessionState } from '../src/native-agent/session';
import { createNativeIllustrationMaterializer, nativeIllustrationToolProfile } from '../src/native-agent/illustration-task';
import { materializeIllustrationScience } from '../src/presentation/illustration-planner';
import { compileShotPrompt } from '../src/presentation/synclip-video-spool';

const claims = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding', statement: 'Two regions are connected.', assessment: 'supported',
  conditions: [], limitations: [], extractionStatus: 'succeeded', sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001',
    relation: 'supports', text: 'Two regions are connected under the stated condition.' }] }];
const settings = { locale: 'en' as const, style: 'aged-academia', instruction: 'Explain the source relation with restrained motion.',
  output: 'video' as const, narrative: true as const, narrativeSceneLimit: 3 };
const direction = { shotType: 'mechanism', purpose: 'Explain the relation', subjectLock: 'Two fixed regions', generatedElements: 'Only the connected regions',
  motion: 'Reveal the connection without moving its endpoints', camera: 'Fixed view', reference: 'scene-artwork', frameStrategy: 'start-reference',
  audioMode: 'external-narration', subtitleMode: 'none', negativeConstraints: ['Do not invent a measurement'], modelPolicy: 'commercial-primary' };
const science = { title: 'A connected system', narrative: { mainMessage: 'A source-supported connection', audience: 'A new reader' },
  videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway', visualContinuity: 'Keep both regions and the connection fixed',
    audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
  scenes: ['Question', 'Mechanism', 'Takeaway'].map(title => ({ title, narration: 'These regions are connected.',
    message: 'A conditional relation', domain: 'conceptual', subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } }],
    encoding: 'A link represents the relationship of subject 0.', labels: ['Connected regions'], constraints: ['Not to scale'],
    paperOriginalAssetId: null, durationSeconds: 10, videoDirection: direction })) };
const art = { scienceToolCallId: 'science-video', scenes: Array.from({ length: 3 }, () => ({
  layout: 'Place subject 0 at the centre; attach label 0 to it.', treatment: 'Restrained academic linework and readable labels.' })) };
const externalPrompt = [
  'Scientific explainer shot. Preserve approved subject identity, geometry, direction, and causal relationship exactly.',
  'Locale: en. Global continuity bible: Keep both regions and the connection fixed',
  'Scene: Question. Reader-facing narration context: These regions are connected.',
  'Approved visual action: 核心关系：A conditional relation。科学域：conceptual。对象：Connected regions。科学编码：A link represents the relationship of subject 0.。构图：Place subject 0 at the centre; attach label 0 to it.。视觉处理：Restrained academic linework and readable labels.。可见标签：Connected regions。科学限定：Not to scale。',
  'Shot type: mechanism. Purpose: Explain the relation. Locked subject: Two fixed regions. Generated elements: Only the connected regions. Motion: Reveal the connection without moving its endpoints. Camera: Fixed view. Do not: Do not invent a measurement.',
  'Use smooth physically plausible motion, restrained cinematic lighting, and clean scientific composition. Do not render subtitles, formulas, logos, watermarks, or invented labels. Do not change scientific meaning. Spoken narration is external; use only subtle non-verbal ambience if supplied.',
].join('\n');

describe('native Hermes complete video planning', () => {
  it('offers optional native audio only alongside the default external mode in new video tools and context', () => {
    const profile = nativeIllustrationToolProfile(null, 'video');
    expect(profile.sourceTools.find(tool => tool.name === 'paper_illustration_science')).toMatchObject({
      description: expect.stringContaining('only when explicitly requested'), parameters: { properties: {
        videoProduction: { properties: { audioPolicy: { enum: ['external-narration', 'native-first'] } } },
        scenes: { items: { properties: { videoDirection: { properties: { audioMode: { enum: ['external-narration', 'native'] } } } } } },
      } },
    });
    expect(profile.sourceTools.find(tool => tool.name === 'paper_illustration_science_repair')).toMatchObject({ parameters: { properties: {
      scene: { properties: { videoDirection: { properties: { audioMode: { enum: ['external-narration', 'native'] } } } } },
    } } });
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...profile });
    expect(materializer.call('paper_illustration_context', {}, 0, 'context-new')).toMatchObject({
      videoCapabilities: { audioModes: ['external-narration', 'native'] },
    });
  });

  it('materializes and exactly replays an explicit native-first all-native plan with the stored compiler prompt', () => {
    const nativeSettings = { ...settings, instruction: 'Use native-first provider audio grounded in the source narration.' };
    const candidate = structuredClone(science);
    candidate.videoProduction.audioPolicy = 'native-first';
    candidate.scenes = candidate.scenes.map(scene => ({ ...scene, videoDirection: { ...scene.videoDirection, audioMode: 'native' } }));
    const profile = nativeIllustrationToolProfile(null, 'video');
    const materializer = createNativeIllustrationMaterializer({ claims, settings: nativeSettings, paperOriginals: new Map(), ...profile });
    const messages: ChatMessage[] = [];
    for (const [id, name, args] of [['context-new', 'paper_illustration_context', {}], ['science-video', 'paper_illustration_science', candidate],
      ['art-video', 'paper_illustration_art', art], ['review-video', 'paper_illustration_review', { planToolCallId: 'art-video', decision: 'accepted',
        summary: 'The complete source-bound native audio candidate needs output verification.', corrections: [], issues: [] }]] as const) {
      const result = materializer.call(name, args, messages.length, id);
      expect(result.status).not.toBe('invalid_illustration');
      messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
    }
    const final = '{"reviewToolCallId":"review-video"}', result = materializer.finish(messages, final);
    expect(result.document.videoProduction?.audioPolicy).toBe('native-first');
    for (const [index, scene] of result.document.scenes.entries()) {
      expect(scene.videoDirection?.audioMode).toBe('native');
      expect(result.prompts[index]!.videoPrompt).toBe(compileShotPrompt(result.document, scene, settings.locale));
      expect(result.prompts[index]!.videoPrompt).not.toContain('Spoken narration is external');
    }
    const saved = { turns: [{ request: { options: { tools: profile.sourceTools.map(definition => ({ type: 'function', function: definition })) }, messages } }] } as unknown as NativeAgentSessionState;
    const before = structuredClone(saved);
    const restored = createNativeIllustrationMaterializer({ claims, settings: nativeSettings, paperOriginals: new Map(), savedState: saved, ...nativeIllustrationToolProfile(saved) });
    expect(restored.finish(messages, final)).toEqual(result);
    expect(saved).toEqual(before);
  });

  it.each([
    ['external-narration', 'native'], ['native-first', 'external-narration'], ['native-first', 'mixed'], ['external-narration', 'mixed'],
    ['native-first', 'silent'], ['native-first', 'hybrid'], ['compare-before-publish', 'native'], ['unknown', 'native'],
    ['native-first', 'unknown'], ['native-first', 'missing'], ['missing', 'native'],
  ])('rejects %s/%s before science-plan materialization can succeed', (policy, mode) => {
    const candidate = structuredClone(science);
    candidate.videoProduction.audioPolicy = policy;
    candidate.scenes = candidate.scenes.map((scene, index) => ({ ...scene,
      videoDirection: { ...scene.videoDirection, audioMode: mode === 'mixed' ? index === 0 ? 'native' : 'external-narration' : mode },
    }));
    if (mode === 'missing') Reflect.deleteProperty(candidate.scenes[0]!, 'videoDirection');
    if (policy === 'missing') Reflect.deleteProperty(candidate, 'videoProduction');
    expect(() => materializeIllustrationScience(candidate, claims, settings)).toThrow();
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    expect(materializer.call('paper_illustration_science', candidate, 0, 'invalid-audio')).toMatchObject({ status: 'invalid_illustration' });
    expect(materializer.call('paper_illustration_art', art, 1, 'no-art')).toMatchObject({ status: 'invalid_illustration' });
  });

  function basePlan(selectedSettings = settings, selectedArt: unknown = art) {
    const materializer = createNativeIllustrationMaterializer({ claims, settings: selectedSettings, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    materializer.call('paper_illustration_science', science, 0, 'science-video');
    const planned = materializer.call('paper_illustration_art', selectedArt, 1, 'art-video');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    return { settings: selectedSettings, view: { document: planned.document, locale: selectedSettings.locale, style: selectedSettings.style, output: 'video', narrative: true },
      prompts: planned.prompts, designSkills: [] } as unknown as import('../src/native-agent/illustration-task').VerifiedNativeVideoBase;
  }

  it('keeps the default external plan and its complete prompt bytes unchanged', () => {
    const base = basePlan();
    expect(base.view.document.videoProduction?.audioPolicy).toBe('external-narration');
    expect(base.view.document.scenes.every(scene => scene.videoDirection?.audioMode === 'external-narration')).toBe(true);
    expect(base.prompts[0]!.videoPrompt).toBe(externalPrompt);
  });

  it('records exact frame resources so a local automatic style change leaves other frames reusable', () => {
    const automatic = { ...settings, style: 'auto' };
    const base = basePlan(automatic, { ...art, scenes: art.scenes.map(scene => ({ ...scene, styleId: 'infographic:aged-academia' })) });
    const materializer = createNativeIllustrationMaterializer({ claims, settings: { ...automatic, baseAssetId: 'auto-parent', revisionSceneIndex: 1 },
      base, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    expect(materializer.call('paper_illustration_science', science, 0, 'revised-auto')).toMatchObject({ status: 'science_ready' });
    const planned = materializer.call('paper_illustration_art', { scienceToolCallId: 'revised-auto', scenes: [{ ...art.scenes[1],
      styleId: 'article:watercolor', treatment: 'Transparent washes and precise readable labels.' }] }, 1, 'local-auto-art');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    const prompts = planned.prompts as typeof base.prompts;
    expect(prompts[0]).toEqual(base.prompts[0]); expect(prompts[2]).toEqual(base.prompts[2]);
    expect(prompts[1]!.renderResources).not.toEqual(base.prompts[1]!.renderResources);
  });

  it('restricts a local video revision to one scene and preserves the exact other frame and motion prompts', () => {
    const base = basePlan(), revision = { ...settings, baseAssetId: 'parent-video', revisionSceneIndex: 1, instruction: 'Shorten only this scene.' };
    const materializer = createNativeIllustrationMaterializer({ claims, settings: revision, base, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    const corrected = structuredClone(science); corrected.scenes[1]!.narration = 'A supported connection.';
    expect(materializer.call('paper_illustration_science', corrected, 0, 'revised-science')).toMatchObject({ status: 'science_ready' });
    expect(materializer.call('paper_illustration_art', { ...art, scienceToolCallId: 'revised-science' }, 1, 'wrong-all-art'))
      .toMatchObject({ status: 'invalid_illustration' });
    const planned = materializer.call('paper_illustration_art', { scienceToolCallId: 'revised-science', scenes: [art.scenes[1]] }, 2, 'local-art');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    const document = planned.document as typeof base.view.document, prompts = planned.prompts as typeof base.prompts;
    expect(document.scenes[0]).toEqual(base.view.document.scenes[0]); expect(document.scenes[2]).toEqual(base.view.document.scenes[2]);
    expect(prompts[0]).toEqual(base.prompts[0]); expect(prompts[2]).toEqual(base.prompts[2]);
    expect(document.scenes[1]!.narration).toBe('A supported connection.');
  });

  it.each(['continuity', 'narrative', 'title', 'count', 'order', 'other-narration', 'other-motion'] as const)('rejects a local revision that changes %s outside its authorized scene', change => {
      const base = basePlan(), altered = structuredClone(science);
      if (change === 'continuity') altered.videoProduction.visualContinuity = 'Switch between different regions';
      if (change === 'narrative') altered.narrative.mainMessage = 'A different question';
      if (change === 'title') altered.title = 'A different video';
      if (change === 'count') altered.scenes.pop();
      if (change === 'order') [altered.scenes[0], altered.scenes[2]] = [altered.scenes[2]!, altered.scenes[0]!];
      if (change === 'other-narration') altered.scenes[0]!.narration = 'A revised introductory sentence.';
      if (change === 'other-motion') altered.scenes[2]!.videoDirection = { ...direction, camera: 'Pan across the view' };
      const materializer = createNativeIllustrationMaterializer({ claims, settings: { ...settings, baseAssetId: 'parent', revisionSceneIndex: 1 },
        base, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
      expect(materializer.call('paper_illustration_science', altered, 0, 'changed')).toMatchObject({ status: 'invalid_illustration' });
    });

  it('uses the existing science/art/review tools and replays the full video plan without a provider call', () => {
    const profile = nativeIllustrationToolProfile(null, 'video');
    const make = () => createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...profile });
    const materializer = make(); const messages: ChatMessage[] = [];
    const call = (name: string, args: unknown, id: string) => {
      const result = materializer.call(name, args, messages.length, id);
      messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
      return result;
    };
    const scientific = call('paper_illustration_science', science, 'science-video');
    expect(scientific, JSON.stringify(scientific)).toMatchObject({ status: 'science_ready' });
    const planned = call('paper_illustration_art', art, 'art-video');
    expect(planned).toMatchObject({ status: 'art_ready', document: { videoProduction: science.videoProduction,
      scenes: science.scenes.map(scene => ({ narration: scene.narration, durationSeconds: 10, videoDirection: direction })) } });
    expect(planned.prompts).toEqual(expect.arrayContaining([expect.objectContaining({ sceneIndex: 0, prompt: expect.any(String),
      videoPrompt: expect.stringContaining(direction.motion) })]));
    expect(call('paper_illustration_review', { planToolCallId: 'art-video', decision: 'accepted', summary: 'The full source-bound video plan is faithful.',
      corrections: [], issues: [] }, 'review-video')).toMatchObject({ decision: 'accepted' });
    const final = '{"reviewToolCallId":"review-video"}';
    const result = materializer.finish(messages, final);
    expect(make().finish(messages, final)).toEqual(result);
    const changed = structuredClone(messages);
    const receipt = changed.find(message => message.role === 'tool' && message.toolCallId === 'art-video')!;
    const value = JSON.parse(receipt.content); value.prompts[0].videoPrompt += ' Add an unsupported motion.'; receipt.content = JSON.stringify(value);
    expect(() => make().finish(changed, final)).toThrow(/history changed/u);
  });

  it('restores every capability from the saved video definitions rather than the current output default', () => {
    const fresh = nativeIllustrationToolProfile(null, 'video');
    const saved = { turns: [{ request: { options: { tools: fresh.sourceTools.map(definition => ({ type: 'function', function: definition })) } } }] } as unknown as NativeAgentSessionState;
    expect(nativeIllustrationToolProfile(saved)).toEqual(fresh);
    expect(fresh.nativeVideo).toBe(true);
    expect(nativeIllustrationToolProfile(null).nativeVideo).toBe(false);
  });

  it.each(['Stage A', 'context'] as const)('restores the historical %s video contract and exact paid receipts without upgrading them', stage => {
    // 5f0a80e9 used the image context definition and allowed none/sidecar in the video tool schema.
    const originalTools = structuredClone(nativeIllustrationToolProfile(null, 'video').sourceTools);
    const oldContext = nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_context')!;
    for (const tool of originalTools) {
      if (tool.name === 'paper_illustration_context') tool.description = stage === 'Stage A' ? oldContext.description : tool.description.split(' Optional audio supports')[0]!;
      if (tool.name === 'paper_illustration_science') tool.description = tool.description.split(' Audio defaults')[0]!;
      if (tool.name === 'paper_illustration_science' || tool.name === 'paper_illustration_science_repair') {
        const schema = tool.parameters as unknown as { properties: {
          videoProduction: { properties: { audioPolicy: { enum: string[] } } };
          scenes: { items: { properties: { videoDirection: { properties: { subtitleMode: { enum: string[] }; audioMode: { enum: string[] } } } } } };
          scene: { properties: { videoDirection: { properties: { subtitleMode: { enum: string[] }; audioMode: { enum: string[] } } } } };
        } };
        const scene = tool.name === 'paper_illustration_science' ? schema.properties.scenes.items : schema.properties.scene;
        scene.properties.videoDirection.properties.subtitleMode.enum = stage === 'Stage A' ? ['none', 'sidecar'] : ['none'];
        scene.properties.videoDirection.properties.audioMode.enum = ['external-narration'];
        if (tool.name === 'paper_illustration_science') schema.properties.videoProduction.properties.audioPolicy.enum = ['external-narration'];
      }
    }
    const saved = { turns: [{ request: { options: { tools: originalTools.map(definition => ({ type: 'function', function: definition })) }, messages: [] } }] } as unknown as NativeAgentSessionState;
    const profile = nativeIllustrationToolProfile(saved);
    const before = structuredClone(saved);
    expect(profile.sourceTools).toEqual(originalTools);
    expect(profile).toMatchObject({ nativeVideo: true, videoContext: stage === 'context', scienceFeedback: true, sourceQuantityAnnotations: true,
      sourceQuantityProse: true, sourceQuantityLocations: true, defaultPaperOriginalRef: true, deferDesignGuidance: true,
      scienceRepairCallIdFeedback: true, sourceNotation: true });
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...profile });
    const messages: ChatMessage[] = [];
    for (const [id, name, args] of [['context-old', 'paper_illustration_context', {}], ['science-video', 'paper_illustration_science', science],
      ['art-old', 'paper_illustration_art', art], ['review-old', 'paper_illustration_review', { planToolCallId: 'art-old', decision: 'accepted',
        summary: 'The source-bound complete plan is faithful.', corrections: [], issues: [] }]] as const) {
      const value = materializer.call(name, args, messages.length, id);
      messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', toolCallId: id, content: JSON.stringify(value) });
      if (name === 'paper_illustration_context') {
        if (stage === 'Stage A') expect(Object.keys(value).sort()).toEqual(['availableOriginals', 'claims', 'paper', 'settings', 'status']);
        else expect(value).toMatchObject({ videoCapabilities: { audioModes: ['external-narration'] } });
      }
      if (name === 'paper_illustration_art') {
        if (stage === 'Stage A') expect((value.prompts as Array<unknown>).every(prompt => Object.keys(prompt as object).sort().join(',') === 'prompt,sceneIndex,videoPrompt')).toBe(true);
        expect((value.prompts as Array<{ videoPrompt: string }>)[0]!.videoPrompt).toBe(externalPrompt);
        expect((value.prompts as Array<{ videoPrompt: string }>).every(prompt => prompt.videoPrompt.endsWith('Spoken narration is external; use only subtle non-verbal ambience if supplied.'))).toBe(true);
      }
    }
    const final = '{"reviewToolCallId":"review-old"}', first = materializer.finish(messages, final);
    saved.turns[0]!.request.messages = messages;
    const restored = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), savedState: saved, ...nativeIllustrationToolProfile(saved) });
    expect(restored.finish(messages, final)).toEqual(first);
    expect(saved.turns[0]!.request.options.tools).toEqual(before.turns[0]!.request.options.tools);
    const changed = structuredClone(messages), receipt = changed.find(message => message.role === 'tool' && message.toolCallId === 'context-old')!;
    receipt.content = JSON.stringify({ ...JSON.parse(receipt.content), videoCapabilities: { durationSeconds: [5, 10, 15] } });
    expect(() => restored.finish(changed, final)).toThrow(/history changed/u);
    const changedPrompt = structuredClone(messages), artReceipt = changedPrompt.find(message => message.role === 'tool' && message.toolCallId === 'art-old')!;
    const artifact = JSON.parse(artReceipt.content); artifact.prompts[0].videoPrompt += ' changed'; artReceipt.content = JSON.stringify(artifact);
    expect(() => restored.finish(changedPrompt, final)).toThrow(/history changed/u);

    // The old producer could save native-first while still compiling external prompts.
    // Reconstructing that paid history must reject it, never upgrade its saved audio or prompt.
    const oldNative = structuredClone(saved);
    const oldMessages = oldNative.turns[0]!.request.messages;
    const scienceCall = oldMessages.find(message => message.role === 'assistant' && message.toolCalls?.[0]?.id === 'science-video')!.toolCalls![0]!;
    const oldArgs = JSON.parse(scienceCall.function.arguments); oldArgs.videoProduction.audioPolicy = 'native-first';
    scienceCall.function.arguments = JSON.stringify(oldArgs);
    for (const id of ['science-video', 'art-old']) {
      const receipt = oldMessages.find(message => message.role === 'tool' && message.toolCallId === id)!;
      const value = JSON.parse(receipt.content);
      (id === 'science-video' ? value.intent : value.document).videoProduction.audioPolicy = 'native-first';
      receipt.content = JSON.stringify(value);
    }
    const oldNativeBefore = structuredClone(oldNative);
    const rejected = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), savedState: oldNative, ...nativeIllustrationToolProfile(oldNative) });
    expect(() => rejected.finish(oldMessages, final)).toThrow(/history changed/u);
    expect(oldNative).toEqual(oldNativeBefore);

    // An all-native historical plan with the old external prompt must also fail exact replay.
    oldArgs.scenes.forEach((scene: typeof science.scenes[number]) => { scene.videoDirection.audioMode = 'native'; });
    scienceCall.function.arguments = JSON.stringify(oldArgs);
    for (const id of ['science-video', 'art-old']) {
      const receipt = oldMessages.find(message => message.role === 'tool' && message.toolCallId === id)!;
      const value = JSON.parse(receipt.content);
      (id === 'science-video' ? value.intent : value.document).scenes.forEach((scene: typeof science.scenes[number]) => { scene.videoDirection.audioMode = 'native'; });
      receipt.content = JSON.stringify(value);
    }
    const allNativeBefore = structuredClone(oldNative);
    const stalePrompt = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), savedState: oldNative, ...nativeIllustrationToolProfile(oldNative) });
    expect(() => stalePrompt.finish(oldMessages, final)).toThrow(/history changed/u);
    expect(oldNative).toEqual(allNativeBefore);
  });

  it('keeps video motion quantities source-bound and repairs only the exact rejected scene', () => {
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    const bad = structuredClone(science); bad.scenes[1]!.videoDirection = { ...direction, motion: 'A measured separation of 77 nm appears.' };
    const rejected = materializer.call('paper_illustration_science', bad, 0, 'rejected-video');
    expect(rejected).toMatchObject({ status: 'invalid_illustration', scienceToolCallId: 'rejected-video' });
    expect(String(rejected.error)).toContain('videoDirection.motion');
    expect(materializer.call('paper_illustration_science_repair', { scienceToolCallId: 'wrong-call', sceneIndex: 1, scene: science.scenes[1] }, 1, 'wrong-repair'))
      .toMatchObject({ status: 'invalid_illustration' });
    expect(materializer.call('paper_illustration_science_repair', { scienceToolCallId: 'rejected-video', sceneIndex: 1, scene: science.scenes[1] }, 2, 'fixed-video'))
      .toMatchObject({ status: 'science_ready', intent: { videoProduction: science.videoProduction } });
  });
});
