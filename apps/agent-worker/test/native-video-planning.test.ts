import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@openscience/ai-gateway';
import type { NativeAgentSessionState } from '../src/native-agent/session';
import { createNativeIllustrationMaterializer, nativeIllustrationToolProfile } from '../src/native-agent/illustration-task';

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

describe('native Hermes complete video planning', () => {
  function basePlan(selectedSettings = settings, selectedArt: unknown = art) {
    const materializer = createNativeIllustrationMaterializer({ claims, settings: selectedSettings, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    materializer.call('paper_illustration_science', science, 0, 'science-video');
    const planned = materializer.call('paper_illustration_art', selectedArt, 1, 'art-video');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    return { settings: selectedSettings, view: { document: planned.document, locale: selectedSettings.locale, style: selectedSettings.style, output: 'video', narrative: true },
      prompts: planned.prompts, designSkills: [] } as unknown as import('../src/native-agent/illustration-task').VerifiedNativeVideoBase;
  }

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

  it('restores the original Stage A video contract and its exact context/prompt receipts without upgrading them', () => {
    // 5f0a80e9 used the image context definition and allowed none/sidecar in the video tool schema.
    const originalTools = structuredClone(nativeIllustrationToolProfile(null, 'video').sourceTools);
    const oldContext = nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_context')!;
    for (const tool of originalTools) {
      if (tool.name === 'paper_illustration_context') tool.description = oldContext.description;
      if (tool.name === 'paper_illustration_science' || tool.name === 'paper_illustration_science_repair') {
        const schema = tool.parameters as unknown as { properties: {
          scenes: { items: { properties: { videoDirection: { properties: { subtitleMode: { enum: string[] } } } } } };
          scene: { properties: { videoDirection: { properties: { subtitleMode: { enum: string[] } } } } };
        } };
        const scene = tool.name === 'paper_illustration_science' ? schema.properties.scenes.items : schema.properties.scene;
        scene.properties.videoDirection.properties.subtitleMode.enum = ['none', 'sidecar'];
      }
    }
    const saved = { turns: [{ request: { options: { tools: originalTools.map(definition => ({ type: 'function', function: definition })) }, messages: [] } }] } as unknown as NativeAgentSessionState;
    const profile = nativeIllustrationToolProfile(saved);
    expect(profile).toMatchObject({ nativeVideo: true, videoContext: false, scienceFeedback: true, sourceQuantityAnnotations: true,
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
      if (name === 'paper_illustration_context') expect(Object.keys(value).sort()).toEqual(['availableOriginals', 'claims', 'paper', 'settings', 'status']);
      if (name === 'paper_illustration_art') expect((value.prompts as Array<unknown>).every(prompt => Object.keys(prompt as object).sort().join(',') === 'prompt,sceneIndex,videoPrompt')).toBe(true);
    }
    const final = '{"reviewToolCallId":"review-old"}', first = materializer.finish(messages, final);
    saved.turns[0]!.request.messages = messages;
    const restored = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), savedState: saved, ...nativeIllustrationToolProfile(saved) });
    expect(restored.finish(messages, final)).toEqual(first);
    const changed = structuredClone(messages), receipt = changed.find(message => message.role === 'tool' && message.toolCallId === 'context-old')!;
    receipt.content = JSON.stringify({ ...JSON.parse(receipt.content), videoCapabilities: { durationSeconds: [5, 10, 15] } });
    expect(() => restored.finish(changed, final)).toThrow(/history changed/u);
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
