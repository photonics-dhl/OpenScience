import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SynclipVideoSpool, SynclipVideoTimingError, compileShotPrompt } from '../src/presentation/synclip-video-spool';

const TASK = '10000000-0000-4000-8000-000000000001';
const CLAIM = '20000000-0000-4000-8000-000000000001';
const ownedFixtures: string[] = [];
afterEach(async () => { for (const path of ownedFixtures.splice(0)) await rm(path, { recursive: true, force: true }); });
const png = () => { const value = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(value); value.write('IHDR', 12); return value; };
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
const direction = (index: number) => ({ shotType: index === 0 ? 'hook' : 'mechanism' as const, purpose: 'purpose ' + index, subjectLock: 'same approved subject', generatedElements: 'only the approved field and electron', motion: 'motion beat ' + index, camera: 'slow controlled push-in', reference: 'scene-artwork' as const, frameStrategy: 'start-reference' as const, audioMode: 'external-narration' as const, subtitleMode: 'sidecar' as const, negativeConstraints: ['no invented labels'], modelPolicy: 'commercial-primary' as const });
type Submitted = { id: string; inputHash: string; executionAttempt: number; audio: { provider: 'synclip'; voice: string; speed: number };
  scenes: Array<{ narration: string; durationSeconds: number }> };
async function nativeFixture(reply: (request: Submitted) => Record<string, unknown> = () => ({})) {
  const fixtures = resolve('../../tmp'); await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(join(fixtures, 'synclip-video-native-')); ownedFixtures.push(root);
  const inboxDir = join(root, 'inbox'), resultsDir = join(root, 'results'); await mkdir(inboxDir); await mkdir(resultsDir);
  const now = Date.now(), audio = { provider: 'synclip' as const, voice: 'test-catalog-voice', speed: 1 };
  const readyPath = join(resultsDir, '.ready');
  await writeFile(readyPath, JSON.stringify({ schemaVersion: 1, provider: 'synclip', model: 'ltx23', accepting: true, updatedAt: now, narration: audio }));
  const storyboard = { schemaVersion: 1 as const, title: 'Paper', narrative: { mainMessage: 'A connected system', audience: 'New readers' },
    videoProduction: { schemaVersion: 1 as const, narrativeArc: 'question-mechanism-takeaway' as const,
      visualContinuity: 'stable field identity', audioPolicy: 'external-narration' as const, modelPolicy: 'commercial-primary' as const },
    scenes: Array.from({ length: 3 }, (_, index) => ({ title: 'Scene ' + index, narration: 'Narration ' + index, visualAction: 'Action ' + index,
      durationSeconds: 10, sourceClaimIds: [CLAIM], videoDirection: { ...direction(index), subtitleMode: 'none' as const } })) };
  const input = { taskId: TASK, executionAttempt: 1, profile: 'content-driven-v1' as const, sourceClaimIds: [CLAIM], storyboard,
    sceneImages: Array.from({ length: 3 }, png), sceneImageTaskIds: [TASK, TASK, TASK],
    videoPrompts: storyboard.scenes.map(scene => compileShotPrompt(storyboard, scene, 'zh')) };
  const spool = new SynclipVideoSpool({ inboxDir, resultsDir, now: () => now, sleep: async () => {
    const request = JSON.parse(await readFile(join(inboxDir, TASK, 'request.json'), 'utf8')) as Submitted;
    const resultDir = join(resultsDir, TASK); await mkdir(resultDir);
    await writeFile(join(resultDir, 'result.mp4'), mp4); await writeFile(join(resultDir, 'metrics.json'), '{}');
    await writeFile(join(resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, id: TASK, inputHash: request.inputHash,
      executionAttempt: 1, status: 'succeeded', contentType: 'video/mp4', outputSha256: createHash('sha256').update(mp4).digest('hex'),
      outputSize: mp4.length, narration: { provider: 'synclip', speaker: audio.voice, speed: audio.speed, timingStatus: 'measured_aligned' }, ...reply(request) }));
  } });
  return { input, spool, inboxDir, readyPath };
}

describe('Synclip commercial video spool', () => {
  it('requires the reviewed prompts, exact native shot duration and configured narration before publishing', async () => {
    const f = await nativeFixture();
    await expect(f.spool.generate({ ...f.input, videoPrompts: undefined })).rejects.toThrow('NATIVE_VIDEO_PROMPTS_REQUIRED');
    await expect(f.spool.generate({ ...f.input, videoPrompts: f.input.videoPrompts.map(prompt => prompt + 'unreviewed') })).rejects.toThrow('NATIVE_VIDEO_PLAN_CHANGED');
    const bad = { ...f.input, storyboard: structuredClone(f.input.storyboard) }; bad.storyboard.scenes[0]!.durationSeconds = 9;
    await expect(f.spool.generate(bad)).rejects.toThrow('NATIVE_VIDEO_PLAN_CHANGED');
    await writeFile(f.readyPath, JSON.stringify({ schemaVersion: 1, provider: 'synclip', model: 'ltx23', accepting: true, updatedAt: Date.now() }));
    await expect(f.spool.generate(f.input)).rejects.toThrow('SYNCLIP_NARRATION_UNAVAILABLE');
    await expect(readFile(join(f.inboxDir, TASK, 'request.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('adopts a complete measured audio result and never labels it pending', async () => {
    const f = await nativeFixture();
    expect((await f.spool.generate(f.input)).narration).toEqual({ provider: 'synclip', speaker: 'test-catalog-voice', speed: 1, timingStatus: 'measured_aligned' });
  });

  it.each(['pending', 'voice', 'speed'])('rejects incomplete or changed native narration: %s', async change => {
    const f = await nativeFixture(() => ({ narration: change === 'pending' ? { provider: 'synclip-audio-pending' }
      : { provider: 'synclip', speaker: change === 'voice' ? 'changed-voice' : 'test-catalog-voice', speed: change === 'speed' ? 1.2 : 1,
        timingStatus: 'measured_aligned' } }));
    await expect(f.spool.generate(f.input)).rejects.toThrow('SYNCLIP_NARRATION_INCOMPLETE');
  });

  it.each([false, true])('propagates only bound zero-video timing diagnostics (changed voice=%s)', async changed => {
    const f = await nativeFixture(request => ({ status: 'failed', errorCode: 'AUDIO_TIMING_REVISION_REQUIRED', audioTiming: {
      inputHash: request.inputHash, voice: changed ? 'other-voice' : request.audio.voice, speed: request.audio.speed, noVideoSubmissions: true,
      scenes: request.scenes.map((scene, sceneIndex) => ({ sceneIndex, narration: scene.narration, plannedDurationSeconds: scene.durationSeconds,
        durationSeconds: sceneIndex === 1 ? 11 : 2.5, taskId: 'tts-' + sceneIndex, contentHash: 'a'.repeat(64), size: 1024 })) } }));
    if (changed) await expect(f.spool.generate(f.input)).rejects.not.toBeInstanceOf(SynclipVideoTimingError);
    else await expect(f.spool.generate(f.input)).rejects.toMatchObject({ message: 'AUDIO_TIMING_REVISION_REQUIRED', diagnostic: {
      voice: 'test-catalog-voice', noVideoSubmissions: true, scenes: expect.any(Array) } });
  });

  it('persists a provider-neutral shot contract and adopts one broker result', async () => {
    const fixtures = resolve('../../tmp'); await mkdir(fixtures, { recursive: true });
    const root = await mkdtemp(join(fixtures, 'synclip-video-spool-')); ownedFixtures.push(root);
    const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
    await mkdir(inboxDir); await mkdir(resultsDir); const now = Date.now();
    await writeFile(join(resultsDir, '.ready'), JSON.stringify({ schemaVersion: 1, provider: 'synclip', model: 'ltx23', accepting: true, updatedAt: now }));
    const spool = new SynclipVideoSpool({ inboxDir, resultsDir, now: () => now, sleep: async () => {
      const request = JSON.parse(await readFile(join(inboxDir, TASK, 'request.json'), 'utf8'));
      expect(request.model).toBe('ltx23'); expect(request.scenes.map((scene: { durationSeconds: number }) => scene.durationSeconds)).toEqual([5, 10, 15]);
      expect(request.scenes[1].prompt).toContain('Global continuity bible: stable field identity'); expect(request.scenes[1].prompt).toContain('motion beat 1');
      expect(request.scenes[1].prompt).toContain('\nLocale:');
      expect(request.files.scenes.map((image: { requestId: string }) => image.requestId)).toEqual([TASK, TASK, TASK]);
      const resultDir = join(resultsDir, TASK); await mkdir(resultDir); const outputSha256 = createHash('sha256').update(mp4).digest('hex');
      await writeFile(join(resultDir, 'result.mp4'), mp4); await writeFile(join(resultDir, 'metrics.json'), JSON.stringify({ provider: 'synclip', model: 'ltx23', shotCount: 3 }));
      await writeFile(join(resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, id: TASK, inputHash: request.inputHash, executionAttempt: 1, status: 'succeeded', contentType: 'video/mp4', outputSha256, outputSize: mp4.length, adapterRevision: 'synclip-video-v1' }));
    } });
    const storyboard = { schemaVersion: 1 as const, title: 'Paper', videoProduction: { schemaVersion: 1 as const, narrativeArc: 'question-mechanism-takeaway' as const, visualContinuity: 'stable field identity', audioPolicy: 'external-narration' as const, modelPolicy: 'commercial-primary' as const }, scenes: Array.from({ length: 3 }, (_, index) => ({ title: 'Scene ' + index, narration: 'Narration ' + index, visualAction: 'Action ' + index, durationSeconds: index === 0 ? 4 : index === 1 ? 8 : 14, sourceClaimIds: [CLAIM], videoDirection: direction(index) })) };
    const input = { taskId: TASK, executionAttempt: 1, profile: 'content-driven-v1' as const, sourceClaimIds: [CLAIM], storyboard, sceneImages: Array.from({ length: 3 }, png) };
    await expect(spool.generate(input)).rejects.toThrow('SYNCLIP_VIDEO_IMAGE_RECEIPTS_REQUIRED');
    const result = await spool.generate({ ...input, sceneImageTaskIds: [TASK, TASK, TASK] });
    expect(result).toMatchObject({ contentType: 'video/mp4', generator: 'Synclip commercial video', generatorVersion: 'ltx23', size: mp4.length, contentHash: createHash('sha256').update(mp4).digest('hex') });
  });
});
