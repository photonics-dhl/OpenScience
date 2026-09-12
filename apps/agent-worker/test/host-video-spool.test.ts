import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HostVideoSpool } from '../src/presentation/host-video-spool';

const TASK = '10000000-0000-4000-8000-000000000001';
const ROLES = ['driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction'] as const;
const RUNTIME = { scriptDigest: 'a'.repeat(64), ttsImage: `sha256:${'b'.repeat(64)}`, rendererImage: `sha256:${'c'.repeat(64)}`, modelRevision: 'qwen3-tts-customvoice-0c0e305' };
const png = () => { const value = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(value); value.write('IHDR', 12); return value; };

describe('isolated host video spool', () => {
  it.each(['valid', 'wrong-attempt', 'wrong-runtime', 'stopped-runner', 'at-capacity'])('adopts only current runtime and attempt: %s', async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'host-video-'));
    const inboxDir = join(root, 'inbox'); const resultsDir = join(root, 'results');
    await mkdir(inboxDir); await mkdir(resultsDir);
    let now = Date.now();
    await writeFile(join(resultsDir, '.ready'), JSON.stringify({ schemaVersion: 1, accepting: mode !== 'at-capacity', updatedAt: mode === 'stopped-runner' ? 0 : now, runtime: RUNTIME }));
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
    const outputSha256 = createHash('sha256').update(mp4).digest('hex');
    const spool = new HostVideoSpool({ inboxDir, resultsDir, now: () => now, sleep: async () => {
      const request = JSON.parse(await readFile(join(inboxDir, TASK, 'request.json'), 'utf8'));
      expect(request).toMatchObject({ id: TASK, taskId: TASK, sceneRoles: ROLES, narration: { timingStatus: 'estimated_requires_review' } });
      const result = join(resultsDir, TASK); await mkdir(result);
      await writeFile(join(result, 'result.mp4'), mp4);
      await writeFile(join(result, 'metrics.json'), JSON.stringify({ durationSeconds: 20, completeDecode: true }));
      await writeFile(join(result, 'result.json'), JSON.stringify({
        schemaVersion: 1, id: TASK, inputHash: request.inputHash, status: 'succeeded', executionAttempt: mode === 'wrong-attempt' ? 1 : 2,
        runtime: { ...RUNTIME, rendererImage: mode === 'wrong-runtime' ? `sha256:${'d'.repeat(64)}` : RUNTIME.rendererImage },
        outputSha256, outputSize: mp4.length, contentType: 'video/mp4', scriptDigest: 'a'.repeat(64),
        measuredDurationSeconds: 20,
      }));
      now += 1;
    } });
    const generated = spool.generate({
      taskId: TASK, executionAttempt: 2, profile: 'onchip-field-sampling-v1', sceneRoles: ROLES,
      sourceClaimIds: ['20000000-0000-4000-8000-000000000001'],
      storyboard: { schemaVersion: 1, title: 'On-chip sampling', scenes: Array.from({ length: 5 }, (_, index) => ({
        title: `Scene ${index}`, narration: `Narration ${index}`, visualAction: `Action ${index}`,
        durationSeconds: 4, sourceClaimIds: ['20000000-0000-4000-8000-000000000001'],
      })) },
      sceneImages: Array.from({ length: 5 }, png),
    });
    if (mode !== 'valid') {
      await expect(generated).rejects.toThrow(mode === 'wrong-attempt' ? 'UNCERTAIN' : mode === 'stopped-runner' || mode === 'at-capacity' ? 'VIDEO_RUNNER_UNAVAILABLE' : 'INVALID_VIDEO_SPOOL_OUTPUT');
      return;
    }
    const result = await generated;
    expect(result).toMatchObject({ filePath: join(resultsDir, TASK, 'result.mp4'), contentHash: outputSha256, size: mp4.length });
    expect(result.runtime).toEqual(RUNTIME);
    expect(JSON.parse(await readFile(join(inboxDir, TASK, 'request.json'), 'utf8')).executionAttempt).toBe(2);
  });
});
