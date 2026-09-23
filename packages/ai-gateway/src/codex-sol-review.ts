import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import { encodedImageDimensions, sha256Text } from './ocr';
import { CODEX_SOL_REVIEW_MODEL, CODEX_SOL_REVIEW_PROVIDER, CODEX_SOL_REVIEW_EFFORT,
  validateCodexSolReviewRequest, validateCodexSolReviewResult, type CodexSolReviewRequest } from './codex-sol-review-protocol';
import { ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES, SCIENCE_REVIEW_ID_PATTERN, SCIENCE_REVIEW_MAX_DEADLINE_MS,
  SCIENCE_REVIEW_MAX_JSON_BYTES, SCIENCE_REVIEW_MAX_RESPONSE_BYTES, SCIENCE_REVIEW_MAX_PROMPT_CHARS,
  SCIENCE_REVIEW_READY_MAX_AGE_MS, type ScienceReviewInput, type ScienceReviewProvider,
  type ScienceReviewProviderResult } from './science-review-protocol';

export interface CodexSolReviewConfig {
  inboxDir: string;
  resultsDir: string;
  legacyInboxDir: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  withIllustrationSubmission: <T>(input: ScienceReviewInput, publish: () => Promise<T>) => Promise<T>;
}

const fail = (): never => { throw new Error('INVALID_OUTPUT'); };
const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
async function directory(path: string): Promise<void> {
  if (!isAbsolute(path)) fail();
  let current = path;
  for (;;) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    if (current === parse(current).root) break;
    current = dirname(current);
  }
}
async function boundedRead(path: string, limit: number): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) fail();
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const after = await file.stat();
    if (!after.isFile() || after.ino !== before.ino || after.dev !== before.dev || after.size > limit) fail();
    const data = Buffer.alloc(limit + 1);
    let count = 0;
    while (count <= limit) {
      const { bytesRead } = await file.read(data, count, data.length - count, count);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count !== after.size || count > limit) fail();
    return data.subarray(0, count);
  } finally { await file.close(); }
}
async function publish(path: string, data: string | Uint8Array): Promise<boolean> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
  try {
    await link(temporary, path);
    if (process.platform !== 'win32') {
      const parent = await open(dirname(path), constants.O_RDONLY);
      try { await parent.sync(); } finally { await parent.close(); }
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally { await unlink(temporary); }
}

function sameRequest(left: CodexSolReviewRequest, right: CodexSolReviewRequest): boolean {
  return left.id === right.id && left.model === right.model && left.reasoningEffort === right.reasoningEffort
    && left.prompt === right.prompt && left.promptHash === right.promptHash
    && JSON.stringify(left.source) === JSON.stringify(right.source)
    && JSON.stringify(left.attachments) === JSON.stringify(right.attachments);
}

export class CodexSolImageReviewProvider implements ScienceReviewProvider {
  readonly name = CODEX_SOL_REVIEW_PROVIDER;
  readonly model = CODEX_SOL_REVIEW_MODEL;
  private readonly timeout: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly config: CodexSolReviewConfig) {
    if (!isAbsolute(config.inboxDir) || !isAbsolute(config.resultsDir) || !isAbsolute(config.legacyInboxDir)
      || new Set([config.inboxDir, config.resultsDir, config.legacyInboxDir]).size !== 3) fail();
    this.timeout = config.timeoutMs ?? SCIENCE_REVIEW_MAX_DEADLINE_MS;
    if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > SCIENCE_REVIEW_MAX_DEADLINE_MS
      || (config.pollIntervalMs !== undefined && (!Number.isSafeInteger(config.pollIntervalMs)
        || config.pollIntervalMs < 1 || config.pollIntervalMs > 60_000))) fail();
    this.now = config.now ?? Date.now;
    this.sleep = config.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  async hasImageReviewReservation(id: string): Promise<boolean> {
    if (!SCIENCE_REVIEW_ID_PATTERN.test(id)) return false;
    await directory(this.config.inboxDir); await directory(this.config.resultsDir);
    for (const path of [join(this.config.inboxDir, `${id}.submitted.json`),
      join(this.config.inboxDir, `${id}.json`), join(this.config.resultsDir, id)]) {
      try { await lstat(path); return true; } catch (error) { if (!missing(error)) throw error; }
    }
    return false;
  }

  async ownsLegacyImageReviewReservation(id: string): Promise<boolean> {
    if (!SCIENCE_REVIEW_ID_PATTERN.test(id)) return false;
    await directory(this.config.legacyInboxDir);
    try {
      const raw = await boundedRead(join(this.config.legacyInboxDir, `${id}.submitted.json`), SCIENCE_REVIEW_MAX_JSON_BYTES);
      const value = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      return value.id === id && value.provider === this.name && value.model === this.model;
    } catch (error) { if (missing(error)) return false; throw error; }
  }

  private async output(request: CodexSolReviewRequest): Promise<ScienceReviewProviderResult | null> {
    const root = join(this.config.resultsDir, request.id);
    try { await directory(root); } catch (error) { if (missing(error)) return null; throw error; }
    let raw: Buffer;
    try { raw = await boundedRead(join(root, 'result.json'), SCIENCE_REVIEW_MAX_JSON_BYTES); }
    catch (error) { if (missing(error)) return null; throw error; }
    const result = validateCodexSolReviewResult(JSON.parse(raw.toString('utf8')));
    if (result.id !== request.id || result.promptHash !== request.promptHash) fail();
    if (result.status !== 'succeeded') throw new Error(result.errorCode ?? (result.status === 'uncertain' ? 'UNCERTAIN' : 'EXECUTION_FAILED'));
    const text = (await boundedRead(join(root, 'response.txt'), SCIENCE_REVIEW_MAX_RESPONSE_BYTES)).toString('utf8');
    if (sha256Text(text) !== result.responseHash) fail();
    return { text, promptHash: request.promptHash, responseHash: result.responseHash!, provider: this.name, model: this.model };
  }

  async review(input: ScienceReviewInput): Promise<ScienceReviewProviderResult> { return this.reviewControlled(input, false); }
  async resumeFromCompletedResult(input: ScienceReviewInput): Promise<ScienceReviewProviderResult> { return this.reviewControlled(input, true); }

  private async reviewControlled(input: ScienceReviewInput, completedOnly: boolean): Promise<ScienceReviewProviderResult> {
    if (!('kind' in input.source) || input.source.kind !== 'illustration-image'
      || input.requestId !== input.authorizationContext.taskId || !input.illustrationContext
      || !Number.isSafeInteger(input.illustrationContext.executionAttempt) || input.illustrationContext.executionAttempt < 1
      || !input.illustrationContext.claimContent.trim() || input.attachments?.length !== 1
      || !input.prompt.trim() || input.prompt.length > SCIENCE_REVIEW_MAX_PROMPT_CHARS) fail();
    const attachment = input.attachments?.[0];
    if (!attachment || attachment.mediaType === 'application/pdf') throw new Error('INVALID_OUTPUT');
    if (!(attachment.bytes instanceof Uint8Array) || attachment.bytes.byteLength < 1
      || attachment.bytes.byteLength > ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES
      || createHash('sha256').update(attachment.bytes).digest('hex') !== attachment.sha256
      || (attachment.mediaType !== 'image/png' && attachment.mediaType !== 'image/jpeg' && attachment.mediaType !== 'image/webp')) fail();
    const dimensions = encodedImageDimensions(attachment.mediaType, attachment.bytes);
    if (dimensions.width !== attachment.width || dimensions.height !== attachment.height) fail();
    const { bytes: _bytes, ...record } = attachment;
    await directory(this.config.inboxDir); await directory(this.config.resultsDir); await directory(this.config.legacyInboxDir);
    const createdAt = this.now();
    let request = validateCodexSolReviewRequest({ schemaVersion: 1, provider: this.name, model: this.model,
      reasoningEffort: CODEX_SOL_REVIEW_EFFORT, id: input.requestId, prompt: input.prompt,
      promptHash: sha256Text(input.prompt), source: input.source, attachments: [record], createdAt,
      deadlineAt: createdAt + this.timeout });
    const intended = request;
    const submit = async (): Promise<ScienceReviewProviderResult | null> => {
      const reservation = join(this.config.inboxDir, `${request.id}.submitted.json`);
      let existing: Buffer | undefined;
      try { existing = await boundedRead(reservation, SCIENCE_REVIEW_MAX_JSON_BYTES); }
      catch (error) { if (!missing(error)) throw error; }
      if (existing) {
        request = validateCodexSolReviewRequest(JSON.parse(existing.toString('utf8')));
        if (!sameRequest(request, intended)) fail();
        const completed = await this.output(request);
        if (completed) return completed;
        if (completedOnly) fail();
        validateCodexSolReviewRequest(request, this.now());
        return null;
      }
      if (completedOnly) fail();
      await boundedRead(join(this.config.resultsDir, '.ready'), SCIENCE_REVIEW_MAX_JSON_BYTES);
      const ready = await lstat(join(this.config.resultsDir, '.ready'));
      if (this.now() - ready.mtimeMs > SCIENCE_REVIEW_READY_MAX_AGE_MS || ready.mtimeMs > this.now() + 5000) fail();
      const sidecar = join(this.config.inboxDir, `${request.id}.${record.fileName}`);
      if (!await publish(sidecar, attachment.bytes)) {
        const saved = await boundedRead(sidecar, ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES);
        if (createHash('sha256').update(saved).digest('hex') !== attachment.sha256) fail();
      }
      // Share the old provider's durable reservation name so a rollback worker
      // fails closed instead of sending this task to Chat as a second provider.
      const legacyReservation = join(this.config.legacyInboxDir, `${request.id}.submitted.json`);
      if (!await publish(legacyReservation, JSON.stringify(request))) {
        const saved = validateCodexSolReviewRequest(JSON.parse((await boundedRead(legacyReservation, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
        if (!sameRequest(saved, request)) fail();
      }
      if (!await publish(reservation, JSON.stringify(request))) {
        request = validateCodexSolReviewRequest(JSON.parse((await boundedRead(reservation, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
        if (!sameRequest(request, intended)) fail();
      }
      const completed = await this.output(request);
      if (completed) return completed;
      validateCodexSolReviewRequest(request, this.now());
      const queued = join(this.config.inboxDir, `${request.id}.json`);
      if (!await publish(queued, JSON.stringify(request))) {
        const saved = validateCodexSolReviewRequest(JSON.parse((await boundedRead(queued, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
        if (!sameRequest(saved, request)) fail();
      }
      return null;
    };
    const result = await this.config.withIllustrationSubmission(input, submit);
    if (result) return result;
    while (this.now() < request.deadlineAt) {
      const completed = await this.output(request);
      if (completed) return completed;
      await this.sleep(Math.min(this.config.pollIntervalMs ?? 1000, request.deadlineAt - this.now()));
    }
    throw new Error('EXPIRED');
  }
}
