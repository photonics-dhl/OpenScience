import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import { encodedImageDimensions, sha256Text } from './ocr';
import { CODEX_SOL_REVIEW_MODEL, CODEX_SOL_REVIEW_PROVIDER, CODEX_SOL_REVIEW_EFFORT,
  validateCodexSolReviewRequest, validateCodexSolReviewResult, type CodexSolReviewRequest } from './codex-sol-review-protocol';
import { ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES, SCIENCE_REVIEW_ID_PATTERN, SCIENCE_REVIEW_MAX_DEADLINE_MS,
  SCIENCE_REVIEW_MAX_JSON_BYTES, SCIENCE_REVIEW_MAX_RESPONSE_BYTES, SCIENCE_REVIEW_MAX_PROMPT_CHARS,
  type ScienceReviewInput, type ScienceReviewProvider,
  type ScienceReviewProviderResult } from './science-review-protocol';

export interface CodexSolReviewConfig {
  inboxDir: string;
  resultsDir: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Required for Worker consumption; API may only inspect completed-result evidence. */
  withIllustrationSubmission?: <T>(input: ScienceReviewInput, publish: () => Promise<T>) => Promise<T>;
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
    if (!isAbsolute(config.inboxDir) || !isAbsolute(config.resultsDir)
      || config.inboxDir === config.resultsDir) fail();
    this.timeout = config.timeoutMs ?? SCIENCE_REVIEW_MAX_DEADLINE_MS;
    if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > SCIENCE_REVIEW_MAX_DEADLINE_MS
      || (config.pollIntervalMs !== undefined && (!Number.isSafeInteger(config.pollIntervalMs)
        || config.pollIntervalMs < 1 || config.pollIntervalMs > 60_000))) fail();
    this.now = config.now ?? Date.now;
    this.sleep = config.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  private async reservedRequest(id: string): Promise<CodexSolReviewRequest> {
    try {
      if (!SCIENCE_REVIEW_ID_PATTERN.test(id)) fail();
      await directory(this.config.inboxDir); await directory(this.config.resultsDir);
      const raw = await boundedRead(join(this.config.inboxDir, `${id}.submitted.json`), SCIENCE_REVIEW_MAX_JSON_BYTES);
      const request = validateCodexSolReviewRequest(JSON.parse(raw.toString('utf8')));
      if (request.id !== id) fail();
      return request;
    } catch { throw new Error('RETIRED_IMAGE_REVIEW'); }
  }

  async hasImageReviewReservation(id: string): Promise<boolean> {
    try { await this.reservedRequest(id); return true; } catch { return false; }
  }

  /** API admission evidence only; the Worker still compares the complete original request. */
  async canResumeFromCompletedResult(id: string): Promise<boolean> {
    try { return await this.output(await this.reservedRequest(id)) !== null; } catch { return false; }
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
    const { bytes, ...record } = attachment;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1
      || bytes.byteLength > ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES
      || createHash('sha256').update(bytes).digest('hex') !== attachment.sha256
      || (attachment.mediaType !== 'image/png' && attachment.mediaType !== 'image/jpeg' && attachment.mediaType !== 'image/webp')) fail();
    const dimensions = encodedImageDimensions(attachment.mediaType, bytes);
    if (dimensions.width !== attachment.width || dimensions.height !== attachment.height) fail();
    const withAuthority = this.config.withIllustrationSubmission;
    if (!withAuthority) return fail();
    const createdAt = this.now();
    const intended = validateCodexSolReviewRequest({ schemaVersion: 1, provider: this.name, model: this.model,
      reasoningEffort: CODEX_SOL_REVIEW_EFFORT, id: input.requestId, prompt: input.prompt,
      promptHash: sha256Text(input.prompt), source: input.source, attachments: [record], createdAt,
      deadlineAt: createdAt + this.timeout });
    // The original immutable reservation is the only positive payer identity.
    // Queue files, results directories, absent Web state and missing SQL audits
    // never authorize a new attempt. This retired adapter performs no writes.
    const saved = await withAuthority(input, async () => {
      const request = await this.reservedRequest(input.requestId);
      if (!sameRequest(request, intended)) throw new Error('RETIRED_IMAGE_REVIEW');
      return { request, completed: await this.output(request) };
    });
    if (saved.completed) return saved.completed;
    if (completedOnly) throw new Error('COMPLETED_REVIEW_UNAVAILABLE');
    const request = saved.request;
    // Waiting is outside the authority transaction and uses only the original deadline.
    validateCodexSolReviewRequest(request, this.now());
    while (this.now() < request.deadlineAt) {
      const completed = await this.output(request);
      if (completed) return completed;
      await this.sleep(Math.min(this.config.pollIntervalMs ?? 1000, request.deadlineAt - this.now()));
    }
    throw new Error('EXPIRED');
  }
}
