import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SynclipVideoSpool } from '../src/presentation/synclip-video-spool';

const TASK = '10000000-0000-4000-8000-000000000001';
const CLAIM = '20000000-0000-4000-8000-000000000001';
const png = () => { const value = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(value); value.write('IHDR', 12); return value; };
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
const direction = (index: number) => ({ shotType: index === 0 ? 'hook' : 'mechanism' as const, purpose: 'purpose ' + index, subjectLock: 'same approved subject', generatedElements: 'only the approved field and electron', motion: 'motion beat ' + index, camera: 'slow controlled push-in', reference: 'scene-artwork' as const, frameStrategy: 'start-reference' as const, audioMode: 'external-narration' as const, subtitleMode: 'sidecar' as const, negativeConstraints: ['no invented labels'], modelPolicy: 'commercial-primary' as const });

describe('Synclip commercial video spool', () => {
  it('persists a provider-neutral shot contract and adopts one broker result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'synclip-video-spool-')); const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
    await mkdir(inboxDir); await mkdir(resultsDir); const now = Date.now();
    await writeFile(join(resultsDir, '.ready'), JSON.stringify({ schemaVersion: 1, provider: 'synclip', model: 'ltx23', accepting: true, updatedAt: now }));
    const spool = new SynclipVideoSpool({ inboxDir, resultsDir, now: () => now, sleep: async () => {
      const request = JSON.parse(await readFile(join(inboxDir, TASK, 'request.json'), 'utf8'));
      expect(request.model).toBe('ltx23'); expect(request.scenes.map((scene: { durationSeconds: number }) => scene.durationSeconds)).toEqual([5, 10, 15]);
      expect(request.scenes[1].prompt).toContain('Global continuity bible: stable field identity'); expect(request.scenes[1].prompt).toContain('motion beat 1');
      const resultDir = join(resultsDir, TASK); await mkdir(resultDir); const outputSha256 = createHash('sha256').update(mp4).digest('hex');
      await writeFile(join(resultDir, 'result.mp4'), mp4); await writeFile(join(resultDir, 'metrics.json'), JSON.stringify({ provider: 'synclip', model: 'ltx23', shotCount: 3 }));
      await writeFile(join(resultDir, 'result.json'), JSON.stringify({ schemaVersion: 1, id: TASK, inputHash: request.inputHash, executionAttempt: 1, status: 'succeeded', contentType: 'video/mp4', outputSha256, outputSize: mp4.length, adapterRevision: 'synclip-video-v1' }));
    } });
    const storyboard = { schemaVersion: 1 as const, title: 'Paper', videoProduction: { schemaVersion: 1 as const, narrativeArc: 'question-mechanism-takeaway' as const, visualContinuity: 'stable field identity', audioPolicy: 'external-narration' as const, modelPolicy: 'commercial-primary' as const }, scenes: Array.from({ length: 3 }, (_, index) => ({ title: 'Scene ' + index, narration: 'Narration ' + index, visualAction: 'Action ' + index, durationSeconds: index === 0 ? 4 : index === 1 ? 8 : 14, sourceClaimIds: [CLAIM], videoDirection: direction(index) })) };
    const result = await spool.generate({ taskId: TASK, executionAttempt: 1, profile: 'content-driven-v1', sourceClaimIds: [CLAIM], storyboard, sceneImages: Array.from({ length: 3 }, png) });
    expect(result).toMatchObject({ contentType: 'video/mp4', generator: 'Synclip commercial video', generatorVersion: 'ltx23', size: mp4.length, contentHash: createHash('sha256').update(mp4).digest('hex') });
  });
});
