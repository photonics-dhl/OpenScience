import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import type { StoryboardDocument } from '@openscience/domain';

const MAX_JSON = 128 * 1024;
const MAX_PNG = 10 * 1024 * 1024;
const MAX_MP4 = 128 * 1024 * 1024;
const MAX_DEADLINE = 6 * 60_000;
const READY_MAX_AGE = 45_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface HostVideoSpoolConfig {
  inboxDir: string;
  resultsDir: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface HostVideoInput {
  taskId: string;
  executionAttempt: number;
  profile: 'onchip-field-sampling-v1' | 'content-driven-v1';
  sceneRoles?: readonly ['driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction'];
  sourceClaimIds: string[];
  storyboard: StoryboardDocument;
  sceneImages: Buffer[];
}

export interface HostVideoResult {
  filePath: string;
  size: number;
  contentHash: string;
  contentType: 'video/mp4';
  generator: 'OpenScience isolated on-chip video renderer' | 'OpenScience isolated content-driven video renderer';
  generatorVersion: 'onchip-field-sampling-v1' | 'content-driven-v1';
  inputHash: string;
  narration: { provider: 'Qwen3-TTS'; speaker: 'Serena'; timingStatus: 'estimated_requires_review' };
  metrics: Record<string, unknown>;
  runtime: { scriptDigest: string; ttsImage: string; rendererImage: string; modelRevision: string };
}

function fail(message = 'INVALID_VIDEO_SPOOL_OUTPUT'): never { throw new Error(message); }

async function requireDirectory(path: string): Promise<void> {
  if (!isAbsolute(path)) fail();
  let current = path;
  for (;;) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    if (current === parse(current).root) return;
    current = dirname(current);
  }
}

async function boundedRead(path: string, maximum: number): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > maximum) fail();
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const after = await file.stat();
    if (!after.isFile() || after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size) fail();
    return await file.readFile();
  } finally { await file.close(); }
}

async function exclusiveWrite(path: string, bytes: Buffer): Promise<void> {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}

async function boundedHash(path: string, maximum: number): Promise<{ size: number; hash: string }> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > maximum) fail();
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length; if (size > before.size || size > maximum) fail(); hash.update(bytes);
    }
    const after = await file.stat();
    if (size !== before.size || after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size) fail();
    return { size, hash: hash.digest('hex') };
  } finally { await file.close(); }
}

async function mp4Header(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try { const buffer = Buffer.alloc(12); const read = await file.read(buffer, 0, 12, 0); return buffer.subarray(0, read.bytesRead); }
  finally { await file.close(); }
}

export class HostVideoSpool {
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeout: number;

  constructor(private readonly config: HostVideoSpoolConfig) {
    if (!isAbsolute(config.inboxDir) || !isAbsolute(config.resultsDir) || config.inboxDir === config.resultsDir) fail();
    this.timeout = config.timeoutMs ?? MAX_DEADLINE;
    if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > MAX_DEADLINE
      || (config.pollIntervalMs !== undefined && (!Number.isSafeInteger(config.pollIntervalMs)
        || config.pollIntervalMs < 1 || config.pollIntervalMs > 60_000))) fail();
    this.now = config.now ?? Date.now;
    this.sleep = config.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async generate(input: HostVideoInput): Promise<HostVideoResult> {
    await requireDirectory(this.config.inboxDir); await requireDirectory(this.config.resultsDir);
    const readyPath = join(this.config.resultsDir, '.ready');
    const heartbeat = JSON.parse((await boundedRead(readyPath, MAX_JSON)).toString()) as Record<string, unknown>;
    const runtime = heartbeat.runtime as HostVideoResult['runtime'] | undefined;
    if (heartbeat.schemaVersion !== 1 || heartbeat.accepting !== true || typeof heartbeat.updatedAt !== 'number'
      || !Number.isFinite(heartbeat.updatedAt) || heartbeat.updatedAt <= 0
      || this.now() - heartbeat.updatedAt > READY_MAX_AGE || heartbeat.updatedAt > this.now() + 5_000
      || !runtime || typeof runtime.scriptDigest !== 'string' || typeof runtime.ttsImage !== 'string' || typeof runtime.rendererImage !== 'string'
      || !/^[a-f0-9]{64}$/.test(runtime.scriptDigest)
      || !/^sha256:[a-f0-9]{64}$/.test(runtime.ttsImage) || !/^sha256:[a-f0-9]{64}$/.test(runtime.rendererImage)
      || typeof runtime.modelRevision !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(runtime.modelRevision)) fail('VIDEO_RUNNER_UNAVAILABLE');
    const ready = await lstat(readyPath);
    if (this.now() - ready.mtimeMs > READY_MAX_AGE || ready.mtimeMs > this.now() + 5_000) fail('VIDEO_RUNNER_UNAVAILABLE');
    const legacyProfile = input.profile === 'onchip-field-sampling-v1'
      && input.sceneImages.length === 5
      && JSON.stringify(input.sceneRoles) === JSON.stringify(['driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction']);
    const contentDrivenProfile = input.profile === 'content-driven-v1'
      && input.sceneRoles === undefined && input.sceneImages.length >= 3 && input.sceneImages.length <= 6;
    if ((!legacyProfile && !contentDrivenProfile) || input.sourceClaimIds.length < 1 || input.sourceClaimIds.length > 12) fail('INVALID_VIDEO_INPUT');
    input.sceneImages.forEach((bytes) => {
      if (bytes.length < 33 || bytes.length > MAX_PNG || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('INVALID_VIDEO_INPUT');
    });
    const storyboardBytes = Buffer.from(JSON.stringify(input.storyboard));
    if (storyboardBytes.length === 0 || storyboardBytes.length > MAX_JSON) fail('INVALID_VIDEO_INPUT');
    const files = {
      storyboard: { name: 'storyboard.json', size: storyboardBytes.length, sha256: createHash('sha256').update(storyboardBytes).digest('hex') },
      scenes: input.sceneImages.map((bytes, index) => ({ name: `scene-${index}.png`, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })),
    };
    const inputHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
    if (!UUID.test(input.taskId) || !Number.isInteger(input.executionAttempt) || input.executionAttempt < 1) fail('INVALID_VIDEO_TASK');
    const id = input.taskId;
    const createdAt = this.now();
    const request = {
      schemaVersion: 1, id, taskId: input.taskId, executionAttempt: input.executionAttempt,
      profile: input.profile, inputHash, sourceClaimIds: input.sourceClaimIds,
      ...(legacyProfile ? { sceneRoles: input.sceneRoles } : {}),
      files,
      createdAt, deadlineAt: createdAt + this.timeout,
      narration: { provider: 'Qwen3-TTS', speaker: 'Serena', timingStatus: 'estimated_requires_review' },
    };
    const stage = join(this.config.inboxDir, `.${id}.${randomUUID()}.tmp`);
    const target = join(this.config.inboxDir, id);
    await mkdir(stage, { mode: 0o700 });
    try {
      await exclusiveWrite(join(stage, 'storyboard.json'), storyboardBytes);
      for (let index = 0; index < input.sceneImages.length; index += 1) {
        await exclusiveWrite(join(stage, `scene-${index}.png`), input.sceneImages[index]!);
      }
      // The manifest is written last; directory rename publishes the complete request.
      await exclusiveWrite(join(stage, 'request.json'), Buffer.from(JSON.stringify(request)));
      try { await rename(stage, target); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error;
        const existing = JSON.parse((await boundedRead(join(target, 'request.json'), MAX_JSON)).toString()) as Record<string, unknown>;
        if (existing.inputHash !== inputHash || existing.taskId !== input.taskId
          || existing.executionAttempt !== input.executionAttempt
          || typeof existing.deadlineAt !== 'number' || existing.deadlineAt <= this.now()) fail('UNCERTAIN');
      }
    } finally { await rm(stage, { recursive: true, force: true }).catch(() => undefined); }
    const resultDir = join(this.config.resultsDir, id);
    while (this.now() < request.deadlineAt) {
      try {
        await requireDirectory(resultDir);
        const result = JSON.parse((await boundedRead(join(resultDir, 'result.json'), MAX_JSON)).toString()) as Record<string, unknown>;
        if (result.schemaVersion !== 1 || result.id !== id || result.inputHash !== inputHash) fail();
        if (result.executionAttempt !== input.executionAttempt) fail('UNCERTAIN');
        if (result.status !== 'succeeded') throw new Error(result.status === 'uncertain' ? 'UNCERTAIN' : 'VIDEO_EXECUTION_FAILED');
        if (typeof result.outputSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(result.outputSha256)
          || !Number.isSafeInteger(result.outputSize) || Number(result.outputSize) <= 0 || Number(result.outputSize) > MAX_MP4
          || result.contentType !== 'video/mp4' || typeof result.scriptDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(result.scriptDigest)
          || typeof result.measuredDurationSeconds !== 'number' || !Number.isFinite(result.measuredDurationSeconds)
          || result.measuredDurationSeconds <= 0 || result.measuredDurationSeconds > 90) fail();
        const resultRuntime = result.runtime as HostVideoResult['runtime'] | undefined;
        if (!resultRuntime || result.scriptDigest !== runtime.scriptDigest
          || resultRuntime.scriptDigest !== runtime.scriptDigest || resultRuntime.ttsImage !== runtime.ttsImage
          || resultRuntime.rendererImage !== runtime.rendererImage || resultRuntime.modelRevision !== runtime.modelRevision) fail();
        const filePath = join(resultDir, 'result.mp4');
        const header = await mp4Header(filePath);
        if (!header.subarray(4, 12).includes(Buffer.from('ftyp'))) fail();
        const verified = await boundedHash(filePath, MAX_MP4);
        if (verified.size !== result.outputSize || verified.hash !== result.outputSha256) fail();
        const metrics = JSON.parse((await boundedRead(join(resultDir, 'metrics.json'), MAX_JSON)).toString()) as Record<string, unknown>;
        return {
          filePath, size: verified.size, contentHash: verified.hash,
          contentType: 'video/mp4',
          generator: legacyProfile ? 'OpenScience isolated on-chip video renderer' : 'OpenScience isolated content-driven video renderer',
          generatorVersion: input.profile, inputHash,
          narration: { provider: 'Qwen3-TTS', speaker: 'Serena', timingStatus: 'estimated_requires_review' }, metrics, runtime,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await this.sleep(Math.min(this.config.pollIntervalMs ?? 1_000, request.deadlineAt - this.now()));
    }
    throw new Error('EXPIRED');
  }
}
