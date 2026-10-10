import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import type { StoryboardDocument, StoryboardView, VideoSceneDirection } from '@openscience/domain';
import type { HostVideoInput, AudioAuditionInput, AudioAuditionProposal, AudioAuditionGrant, AudioAuditionResult } from './host-video-spool';

const MAX_JSON = 512 * 1024; const MAX_PNG = 10 * 1024 * 1024; const MAX_MP4 = 256 * 1024 * 1024;
const MAX_DEADLINE = 30 * 60_000; const READY_MAX_AGE = 60_000; const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface SynclipVideoSpoolConfig { inboxDir: string; resultsDir: string; timeoutMs?: number; pollIntervalMs?: number; now?: () => number; sleep?: (milliseconds: number) => Promise<void>; withSubmission?: <T>(owner: { taskId: string; executionAttempt?: number }, publish: () => Promise<T>) => Promise<T>;
  authorizeAudioAudition?: (proposal: AudioAuditionProposal) => Promise<AudioAuditionGrant>;
}
export interface SynclipVideoInput { taskId: string; executionAttempt: number; profile: 'content-driven-v1'; sourceClaimIds: string[]; storyboard: StoryboardDocument; locale?: StoryboardView['locale']; style?: StoryboardView['style']; sceneImages: Buffer[]; sceneImageTaskIds?: string[]; videoPrompts?: string[]; }
type SynclipNarration = { provider: 'synclip'; speaker: string; speed: number; timingStatus: 'measured_aligned' }
  | { provider: 'synclip-audio-pending'; speaker: 'none'; timingStatus: 'not_available' };
export interface SynclipVideoResult { filePath: string; size: number; contentHash: string; contentType: 'video/mp4'; generator: 'Synclip commercial video'; generatorVersion: 'ltx23'; inputHash: string; narration: SynclipNarration; metrics: Record<string, unknown>; runtime: { provider: 'synclip'; model: 'ltx23'; adapterRevision: string }; }
export interface VideoAudioTimingDiagnostic {
  inputHash: string; voice: string; speed: number; noVideoSubmissions: true;
  scenes: Array<{ sceneIndex: number; narration: string; plannedDurationSeconds: number; durationSeconds: number;
    taskId: string; contentHash: string; size: number }>;
}
export class SynclipVideoTimingError extends Error {
  constructor(readonly diagnostic: VideoAudioTimingDiagnostic) { super('AUDIO_TIMING_REVISION_REQUIRED'); }
}
function fail(message = 'INVALID_SYNCLIP_VIDEO_SPOOL_OUTPUT'): never { throw new Error(message); }
async function directory(path: string): Promise<void> { if (!isAbsolute(path)) fail(); let current = path; for (;;) { const info = await lstat(current); if (!info.isDirectory() || info.isSymbolicLink()) fail(); if (current === parse(current).root) return; current = dirname(current); } }
async function boundedRead(path: string, maximum: number): Promise<Buffer> { const before = await lstat(path); if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > maximum) fail(); const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); try { const after = await file.stat(); if (!after.isFile() || after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size) fail(); return await file.readFile(); } finally { await file.close(); } }
async function exclusiveWrite(path: string, bytes: Buffer): Promise<void> { const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); } }
function durationForScene(value: number): 5 | 10 | 15 { return value <= 7 ? 5 : value <= 12 ? 10 : 15; }
function narrationConfig(value: unknown): { provider: 'synclip'; voice: string; speed: number } {
  const audio = value as Record<string, unknown> | null;
  if (!audio || audio.provider !== 'synclip' || typeof audio.voice !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(audio.voice)
    || typeof audio.speed !== 'number' || !Number.isFinite(audio.speed) || audio.speed <= 0) fail('SYNCLIP_NARRATION_UNAVAILABLE');
  return { provider: 'synclip', voice: audio.voice, speed: audio.speed };
}
function timingDiagnostic(value: unknown, inputHash: string, audio: ReturnType<typeof narrationConfig>, scenes: Array<{ narration: string; durationSeconds: number }>): VideoAudioTimingDiagnostic {
  const timing = value as VideoAudioTimingDiagnostic | null;
  if (!timing || timing.inputHash !== inputHash || timing.voice !== audio.voice || timing.speed !== audio.speed
    || timing.noVideoSubmissions !== true || !Array.isArray(timing.scenes) || timing.scenes.length !== scenes.length
    || timing.scenes.some((scene, index) => !scene || scene.sceneIndex !== index || scene.narration !== scenes[index]!.narration
      || scene.plannedDurationSeconds !== scenes[index]!.durationSeconds || !Number.isFinite(scene.durationSeconds) || scene.durationSeconds <= 0
      || typeof scene.taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(scene.taskId)
      || !/^[a-f0-9]{64}$/u.test(scene.contentHash) || !Number.isSafeInteger(scene.size) || scene.size <= 0 || scene.size > 32 * 1024 * 1024)
    || !timing.scenes.some(scene => scene.durationSeconds + 0.3 > scene.plannedDurationSeconds)) fail();
  return { inputHash, voice: audio.voice, speed: audio.speed, noVideoSubmissions: true,
    scenes: timing.scenes.map(scene => ({ sceneIndex: scene.sceneIndex, narration: scene.narration, plannedDurationSeconds: scene.plannedDurationSeconds,
      durationSeconds: scene.durationSeconds, taskId: scene.taskId, contentHash: scene.contentHash, size: scene.size })) };
}
function directionText(direction: VideoSceneDirection | undefined): string { if (!direction) throw new Error('VIDEO_DIRECTION_REQUIRED'); const exclusions = direction.negativeConstraints.length ? ' Do not: ' + direction.negativeConstraints.join('; ') + '.' : ''; return 'Shot type: ' + direction.shotType + '. Purpose: ' + direction.purpose + '. Locked subject: ' + direction.subjectLock + '. Generated elements: ' + direction.generatedElements + '. Motion: ' + direction.motion + '. Camera: ' + direction.camera + '.' + exclusions; }
export function compileShotPrompt(storyboard: StoryboardDocument, scene: StoryboardDocument['scenes'][number], locale: string): string { if (!storyboard.videoProduction || storyboard.videoProduction.modelPolicy !== 'commercial-primary') throw new Error('COMMERCIAL_VIDEO_PLAN_REQUIRED'); return ['Scientific explainer shot. Preserve approved subject identity, geometry, direction, and causal relationship exactly.', 'Locale: ' + locale + '. Global continuity bible: ' + storyboard.videoProduction.visualContinuity, 'Scene: ' + scene.title + '. Reader-facing narration context: ' + scene.narration, 'Approved visual action: ' + scene.visualAction, directionText(scene.videoDirection), 'Use smooth physically plausible motion, restrained cinematic lighting, and clean scientific composition. Do not render subtitles, formulas, logos, watermarks, or invented labels. Do not change scientific meaning. Spoken narration is external; use only subtle non-verbal ambience if supplied.'].join('\n'); }
export class SynclipVideoSpool {
  readonly provider = 'synclip' as const;
  private readonly now: () => number; private readonly sleep: (milliseconds: number) => Promise<void>; private readonly timeout: number;
  constructor(private readonly config: SynclipVideoSpoolConfig) { if (!isAbsolute(config.inboxDir) || !isAbsolute(config.resultsDir) || config.inboxDir === config.resultsDir) fail(); this.timeout = config.timeoutMs ?? MAX_DEADLINE; if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > MAX_DEADLINE || (config.pollIntervalMs !== undefined && (!Number.isSafeInteger(config.pollIntervalMs) || config.pollIntervalMs < 1 || config.pollIntervalMs > 60_000))) fail(); this.now = config.now ?? Date.now; this.sleep = config.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))); }
  async audition(input: AudioAuditionInput): Promise<AudioAuditionResult> {
    if (!this.config.authorizeAudioAudition) fail('AUDIO_AUDITION_AUTHORITY_REQUIRED');
    await directory(this.config.inboxDir); await directory(this.config.resultsDir);
    if (input.purpose !== 'audio-audition' || input.profile !== 'content-driven-v1' || !UUID.test(input.taskId)
      || !Number.isSafeInteger(input.executionAttempt) || input.executionAttempt < 1 || !input.storyboard.narrative
      || !['zh', 'en'].includes(input.locale) || !Number.isSafeInteger(input.sceneIndex) || input.sceneIndex < 0
      || input.sceneIndex >= input.storyboard.scenes.length || input.storyboard.scenes.length < 3 || input.storyboard.scenes.length > 6
      || input.sceneImages.length !== input.storyboard.scenes.length || !input.sceneImageTaskIds
      || input.sceneImageTaskIds.length !== input.sceneImages.length || input.sceneImageTaskIds.some(id => !UUID.test(id))
      || !input.sourceClaimIds.length || input.sourceClaimIds.length > 12) fail('AUDIO_AUDITION_INPUT');
    const audio = narrationConfig(input.audio);
    const scenes = input.storyboard.scenes.map((scene, index) => {
      const bytes = input.sceneImages[index]!;
      if (bytes.length < 33 || bytes.length > MAX_PNG || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || ![5, 10, 15].includes(scene.durationSeconds!) || !scene.narration.trim() || [...scene.narration].length > 120) fail('AUDIO_AUDITION_INPUT');
      return { index, title: scene.title, narration: scene.narration, sourceClaimIds: scene.sourceClaimIds,
        durationSeconds: scene.durationSeconds!, prompt: compileShotPrompt(input.storyboard, scene, input.locale),
        image: { name: 'scene-' + index + '.png', size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'), requestId: input.sceneImageTaskIds![index]! } };
    });
    const story = Buffer.from(JSON.stringify({ ...input.storyboard, locale: input.locale, style: input.style ?? 'scientific' }));
    if (story.length > MAX_JSON) fail('AUDIO_AUDITION_INPUT');
    const files = { storyboard: { name: 'storyboard.json', size: story.length, sha256: createHash('sha256').update(story).digest('hex') }, scenes: scenes.map(scene => scene.image) };
    // Only the new explicit operation extends the existing digest; legacy serialization stays unchanged.
    const inputHash = createHash('sha256').update(JSON.stringify({ files, audio, scenes,
      purpose: 'audio-audition', sceneIndex: input.sceneIndex, voice: audio.voice, locale: input.locale })).digest('hex');
    const createdAt = this.now();
    const proposal: AudioAuditionProposal = { taskId: input.taskId, executionAttempt: input.executionAttempt, profile: input.profile,
      sourceClaimIds: input.sourceClaimIds, sceneImageTaskIds: input.sceneImageTaskIds, locale: input.locale, style: input.style,
      purpose: 'audio-audition', sceneIndex: input.sceneIndex, audio, actorId: input.actorId, workspaceId: input.workspaceId,
      researchObjectId: input.researchObjectId, versionId: input.versionId, parentIdentity: input.parentIdentity,
      inputHash, createdAt, deadlineAt: createdAt + this.timeout };
    // This callback returns only after the dedicated grant transaction has committed.
    const grant = await this.config.authorizeAudioAudition(proposal);
    if (!grant || grant.schemaVersion !== 1 || grant.purpose !== 'audio-audition' || grant.taskId !== input.taskId
      || grant.inputHash !== inputHash || !Number.isSafeInteger(grant.executionAttempt) || grant.executionAttempt < 1
      || grant.executionAttempt > input.executionAttempt || grant.sceneIndex !== input.sceneIndex || grant.locale !== input.locale
      || grant.actorId !== input.actorId || grant.workspaceId !== input.workspaceId || grant.researchObjectId !== input.researchObjectId
      || grant.versionId !== input.versionId || grant.parentIdentity !== input.parentIdentity
      || JSON.stringify(grant.sourceClaimIds) !== JSON.stringify(input.sourceClaimIds) || JSON.stringify(grant.audio) !== JSON.stringify(audio)
      || !Number.isFinite(grant.workerMaxEstimatedCoins) || grant.workerMaxEstimatedCoins <= 0
      || !Number.isFinite(grant.hostMaxEstimatedCoins) || grant.hostMaxEstimatedCoins <= 0
      || !Number.isSafeInteger(grant.createdAt) || !Number.isSafeInteger(grant.deadlineAt)
      || grant.deadlineAt <= grant.createdAt || grant.deadlineAt - grant.createdAt > MAX_DEADLINE) fail('AUDIO_AUDITION_GRANT');
    const resultDir = join(this.config.resultsDir, input.taskId);
    const consume = async (): Promise<AudioAuditionResult | null> => {
      let result: Record<string, unknown>;
      try { result = JSON.parse((await boundedRead(join(resultDir, 'result.json'), MAX_JSON)).toString()) as Record<string, unknown>; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      if (result.schemaVersion !== 1 || result.id !== input.taskId || result.purpose !== 'audio-audition'
        || result.inputHash !== inputHash || result.executionAttempt !== grant.executionAttempt) fail('UNCERTAIN');
      if (result.status !== 'succeeded') throw new Error(result.status === 'uncertain' ? 'UNCERTAIN'
        : typeof result.errorCode === 'string' && /^AUDIO_[A-Z0-9_]{1,80}$/u.test(result.errorCode) ? result.errorCode : 'AUDIO_AUDITION_EXECUTION_FAILED');
      const saved = result.audio as Record<string, unknown> | undefined, quote = saved?.quote as AudioAuditionResult['quote'] | undefined;
      if (!saved || saved.sceneIndex !== input.sceneIndex || saved.locale !== input.locale || saved.voice !== audio.voice || saved.speed !== audio.speed
        || saved.contentType !== 'audio/mpeg' || typeof saved.audioTaskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(saved.audioTaskId)
        || typeof saved.outputSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(saved.outputSha256)
        || !Number.isSafeInteger(saved.outputSize) || Number(saved.outputSize) < 1 || Number(saved.outputSize) > 16 * 1024 * 1024
        || typeof saved.durationSeconds !== 'number' || !Number.isFinite(saved.durationSeconds) || saved.durationSeconds <= 0 || saved.durationSeconds > 600
        || !['decoded', 'requires_revision'].includes(String(saved.timingStatus)) || !quote
        || !Number.isFinite(quote.coinsPerCharacter) || quote.coinsPerCharacter < 0 || !Number.isSafeInteger(quote.characters) || quote.characters < 1
        || quote.characters !== [...scenes[input.sceneIndex]!.narration].length
        || quote.estimatedCoins !== quote.characters * quote.coinsPerCharacter || !Number.isFinite(quote.estimatedCoins)
        || !Number.isFinite(quote.workerCeiling) || quote.workerCeiling <= 0 || quote.workerCeiling > grant.workerMaxEstimatedCoins
        || !Number.isFinite(quote.hostCeiling) || quote.hostCeiling <= 0 || quote.hostCeiling > grant.hostMaxEstimatedCoins
        || quote.estimatedCoins > Math.min(quote.workerCeiling, quote.hostCeiling)
        || (saved.coinsUsed !== undefined && (typeof saved.coinsUsed !== 'number' || !Number.isFinite(saved.coinsUsed) || saved.coinsUsed < 0))) fail('AUDIO_AUDITION_RESULT');
      const filePath = join(resultDir, 'audition.mp3'), bytes = await boundedRead(filePath, 16 * 1024 * 1024);
      if (bytes.length !== saved.outputSize || createHash('sha256').update(bytes).digest('hex') !== saved.outputSha256) fail('AUDIO_AUDITION_RESULT');
      return { purpose: 'audio-audition', taskId: input.taskId, executionAttempt: grant.executionAttempt, inputHash,
        sceneIndex: input.sceneIndex, locale: input.locale, voice: audio.voice, speed: audio.speed, audioTaskId: saved.audioTaskId,
        filePath, contentType: 'audio/mpeg', contentHash: saved.outputSha256, size: bytes.length, durationSeconds: saved.durationSeconds,
        timingStatus: saved.timingStatus as AudioAuditionResult['timingStatus'], quote,
        ...(saved.coinsUsed === undefined ? {} : { coinsUsed: saved.coinsUsed as number }) };
    };
    const known = await consume(); if (known) return known;
    if (grant.executionAttempt === input.executionAttempt) {
      const ready = JSON.parse((await boundedRead(join(this.config.resultsDir, '.ready'), MAX_JSON)).toString()) as Record<string, unknown>;
      const stat = await lstat(join(this.config.resultsDir, '.ready')), budget = ready.audioAuditionBudget as Record<string, unknown> | undefined;
      if (ready.schemaVersion !== 1 || ready.provider !== 'synclip' || ready.adapterRevision !== 'synclip-video-v2' || ready.audioAccepting !== true
        || typeof ready.updatedAt !== 'number' || this.now() - ready.updatedAt > READY_MAX_AGE || stat.mtimeMs < this.now() - READY_MAX_AGE
        || JSON.stringify(narrationConfig(ready.narration)) !== JSON.stringify(audio) || !budget
        || typeof budget.maxEstimatedCoins !== 'number' || !Number.isFinite(budget.maxEstimatedCoins) || budget.maxEstimatedCoins <= 0) fail('AUDIO_AUDITION_UNAVAILABLE');
      if (this.now() >= grant.deadlineAt) fail('AUDIO_AUDITION_DEADLINE');
      const request = { schemaVersion: 1, id: input.taskId, taskId: input.taskId, executionAttempt: grant.executionAttempt,
        profile: input.profile, sourceClaimIds: input.sourceClaimIds, inputHash, createdAt: grant.createdAt, deadlineAt: grant.deadlineAt,
        provider: 'synclip', model: 'ltx23', resolution: '720p', files, scenes, audio, purpose: 'audio-audition',
        sceneIndex: input.sceneIndex, locale: input.locale, audioAuditionGrant: grant };
      const stage = join(this.config.inboxDir, '.' + input.taskId + '.' + Math.random().toString(36).slice(2) + '.tmp'), target = join(this.config.inboxDir, input.taskId);
      await mkdir(stage, { mode: 0o700 });
      try {
        await exclusiveWrite(join(stage, 'storyboard.json'), story);
        for (const [index, bytes] of input.sceneImages.entries()) await exclusiveWrite(join(stage, 'scene-' + index + '.png'), bytes);
        await exclusiveWrite(join(stage, 'request.json'), Buffer.from(JSON.stringify(request)));
        try { await rename(stage, target); }
        catch (error) {
          if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
          const prior = JSON.parse((await boundedRead(join(target, 'request.json'), MAX_JSON)).toString()) as Record<string, unknown>;
          if (prior.purpose !== request.purpose || prior.inputHash !== inputHash || prior.executionAttempt !== grant.executionAttempt) fail('UNCERTAIN');
        }
      } finally { await rm(stage, { recursive: true, force: true }); }
    }
    // A later claim only reads the original operation, even when its deadline or readiness expired.
    while (this.now() < grant.deadlineAt) {
      const result = await consume(); if (result) return result;
      await this.sleep(Math.min(this.config.pollIntervalMs ?? 1000, grant.deadlineAt - this.now()));
    }
    fail('UNCERTAIN');
  }
  async generate(input: SynclipVideoInput | HostVideoInput): Promise<SynclipVideoResult> {
    await directory(this.config.inboxDir); await directory(this.config.resultsDir);
    const readyPath = join(this.config.resultsDir, '.ready'); const ready = JSON.parse((await boundedRead(readyPath, MAX_JSON)).toString()) as Record<string, unknown>; const readyStat = await lstat(readyPath);
    if (ready.schemaVersion !== 1 || ready.provider !== 'synclip' || ready.accepting !== true || ready.model !== 'ltx23' || typeof ready.updatedAt !== 'number' || this.now() - ready.updatedAt > READY_MAX_AGE || readyStat.mtimeMs < this.now() - READY_MAX_AGE) fail('SYNCLIP_VIDEO_UNAVAILABLE');
    if (input.profile !== 'content-driven-v1' || !UUID.test(input.taskId) || !Number.isInteger(input.executionAttempt) || input.executionAttempt < 1 || input.sourceClaimIds.length < 1 || input.sourceClaimIds.length > 12 || input.sceneImages.length !== input.storyboard.scenes.length || input.storyboard.scenes.length < 3 || input.storyboard.scenes.length > 6) fail('INVALID_VIDEO_INPUT');
    input.sceneImages.forEach(bytes => { if (bytes.length < 33 || bytes.length > MAX_PNG || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('INVALID_VIDEO_INPUT'); });
    if (!input.sceneImageTaskIds || input.sceneImageTaskIds.length !== input.sceneImages.length
      || input.sceneImageTaskIds.some(id => !UUID.test(id))) fail('SYNCLIP_VIDEO_IMAGE_RECEIPTS_REQUIRED');
    const locale = input.locale ?? 'zh'; const style = input.style ?? 'scientific';
    const nativeVideo = Boolean(input.storyboard.narrative);
    if (nativeVideo && (!input.videoPrompts || input.videoPrompts.length !== input.storyboard.scenes.length)) fail('NATIVE_VIDEO_PROMPTS_REQUIRED');
    const audio = nativeVideo ? narrationConfig(ready.narration) : undefined;
    const scenes = input.storyboard.scenes.map((scene, index) => {
      const prompt = compileShotPrompt(input.storyboard, scene, locale);
      if (nativeVideo && (input.videoPrompts![index] !== prompt || ![5, 10, 15].includes(scene.durationSeconds!))) fail('NATIVE_VIDEO_PLAN_CHANGED');
      return { index, title: scene.title, narration: scene.narration, sourceClaimIds: scene.sourceClaimIds,
        durationSeconds: nativeVideo ? scene.durationSeconds! : durationForScene(scene.durationSeconds ?? 5), prompt,
        image: { name: 'scene-' + index + '.png', size: input.sceneImages[index]!.length,
          sha256: createHash('sha256').update(input.sceneImages[index]!).digest('hex'), requestId: input.sceneImageTaskIds![index]! } };
    });
    const storyboardBytes = Buffer.from(JSON.stringify({ ...input.storyboard, locale, style })); if (storyboardBytes.length > MAX_JSON) fail('INVALID_VIDEO_INPUT');
    const files = { storyboard: { name: 'storyboard.json', size: storyboardBytes.length, sha256: createHash('sha256').update(storyboardBytes).digest('hex') }, scenes: scenes.map(scene => scene.image) }; const inputHash = createHash('sha256').update(JSON.stringify(audio ? { files, audio, scenes } : files)).digest('hex');
    const request = { schemaVersion: 1, id: input.taskId, taskId: input.taskId, executionAttempt: input.executionAttempt, profile: input.profile, sourceClaimIds: input.sourceClaimIds, inputHash, createdAt: this.now(), deadlineAt: this.now() + this.timeout, provider: 'synclip', model: 'ltx23', resolution: '720p', files, scenes, ...(audio ? { audio } : {}) };
    const stage = join(this.config.inboxDir, '.' + input.taskId + '.' + Math.random().toString(36).slice(2) + '.tmp'); const target = join(this.config.inboxDir, input.taskId);
    const submit = async () => { await mkdir(stage, { mode: 0o700 }); try { await exclusiveWrite(join(stage, 'storyboard.json'), storyboardBytes); for (const [index, bytes] of input.sceneImages.entries()) await exclusiveWrite(join(stage, 'scene-' + index + '.png'), bytes); await exclusiveWrite(join(stage, 'request.json'), Buffer.from(JSON.stringify(request))); try { await rename(stage, target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; const existing = JSON.parse((await boundedRead(join(target, 'request.json'), MAX_JSON)).toString()) as Record<string, unknown>; if (existing.inputHash !== inputHash || existing.taskId !== input.taskId || existing.executionAttempt !== input.executionAttempt) fail('UNCERTAIN'); } } finally { await rm(stage, { recursive: true, force: true }).catch(() => undefined); } };
    if (this.config.withSubmission) await this.config.withSubmission({ taskId: input.taskId, executionAttempt: input.executionAttempt }, submit); else await submit();
    const resultDir = join(this.config.resultsDir, input.taskId);
    while (this.now() < request.deadlineAt) {
      try {
        await directory(resultDir);
        const result = JSON.parse((await boundedRead(join(resultDir, 'result.json'), MAX_JSON)).toString()) as Record<string, unknown>;
        if (result.schemaVersion !== 1 || result.id !== input.taskId || result.inputHash !== inputHash || result.executionAttempt !== input.executionAttempt) fail('UNCERTAIN');
        if (result.status !== 'succeeded') {
          if (audio && result.status === 'failed' && result.errorCode === 'AUDIO_TIMING_REVISION_REQUIRED')
            throw new SynclipVideoTimingError(timingDiagnostic(result.audioTiming, inputHash, audio, scenes));
          throw new Error(result.status === 'uncertain' ? 'UNCERTAIN'
            : audio && typeof result.errorCode === 'string' && /^(?:AUDIO|VIDEO|SYNCLIP_VIDEO)_[A-Z0-9_]{1,80}$/u.test(result.errorCode)
              ? result.errorCode : 'SYNCLIP_VIDEO_EXECUTION_FAILED');
        }
        if (result.contentType !== 'video/mp4' || typeof result.outputSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(result.outputSha256)
          || !Number.isSafeInteger(result.outputSize) || Number(result.outputSize) <= 0 || Number(result.outputSize) > MAX_MP4) fail();
        const filePath = join(resultDir, 'result.mp4'); const bytes = await boundedRead(filePath, MAX_MP4);
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (hash !== result.outputSha256 || bytes.length !== result.outputSize || !bytes.subarray(4, 12).includes(Buffer.from('ftyp'))) fail();
        let narration: SynclipNarration = { provider: 'synclip-audio-pending', speaker: 'none', timingStatus: 'not_available' };
        if (audio) {
          const saved = result.narration as Record<string, unknown> | null;
          if (!saved || saved.provider !== 'synclip' || saved.speaker !== audio.voice || saved.speed !== audio.speed
            || saved.timingStatus !== 'measured_aligned') fail('SYNCLIP_NARRATION_INCOMPLETE');
          narration = { provider: 'synclip', speaker: audio.voice, speed: audio.speed, timingStatus: 'measured_aligned' };
        }
        const metrics = JSON.parse((await boundedRead(join(resultDir, 'metrics.json'), MAX_JSON)).toString()) as Record<string, unknown>;
        return { filePath, size: bytes.length, contentHash: hash, contentType: 'video/mp4', generator: 'Synclip commercial video',
          generatorVersion: 'ltx23', inputHash, narration, metrics,
          runtime: { provider: 'synclip', model: 'ltx23', adapterRevision: String(result.adapterRevision ?? 'synclip-video-v1') } };
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await this.sleep(Math.min(this.config.pollIntervalMs ?? 1000, request.deadlineAt - this.now()));
    }
    throw new Error('EXPIRED');
  }
}
