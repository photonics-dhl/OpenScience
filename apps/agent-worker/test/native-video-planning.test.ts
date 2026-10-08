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
