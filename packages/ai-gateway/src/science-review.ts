import { constants } from 'node:fs';
import { lstat, open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { encodedImageDimensions, sha256Text } from './ocr';
import {
  SCIENCE_REVIEW_MAX_DEADLINE_MS,
  SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES,
  ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES,
  SCIENCE_REVIEW_MAX_JSON_BYTES,
  SCIENCE_REVIEW_MAX_RESPONSE_BYTES,
  SCIENCE_REVIEW_MAX_TOTAL_ATTACHMENT_BYTES,
  SCIENCE_REVIEW_READY_MAX_AGE_MS,
  SCIENCE_REVIEW_ID_PATTERN,
  validateScienceReviewRequest,
  validateScienceReviewResult,
  type ScienceReviewInput,
  type ScienceReviewProvider,
  type ScienceReviewProviderResult,
  type ScienceReviewRequest,
} from './science-review-protocol';

export interface ChatGptWebScienceReviewConfig {
  inboxDir: string;
  resultsDir: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  withSubmission?: <T>(owner: { taskId: string; executionAttempt?: number; artifactId?: string }, publish: () => Promise<T>) => Promise<T>;
  withIllustrationSubmission?: <T>(input: ScienceReviewInput, publish: () => Promise<T>) => Promise<T>;
}

const fail = (): never => { throw new Error('INVALID_OUTPUT'); };
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
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
    const { bytesRead } = await file.read(data, 0, data.length, 0);
    if (bytesRead !== after.size || bytesRead > limit) fail();
    return data.subarray(0, bytesRead);
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

function validPdf(bytes: Uint8Array): boolean {
  const value = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return value.length >= 16 && value.subarray(0, 5).toString('ascii') === '%PDF-'
    && value.subarray(Math.max(0, value.length - 2048)).includes(Buffer.from('%%EOF'));
}

function sameIllustrationRequest(left: ScienceReviewRequest, right: ScienceReviewRequest): boolean {
  return (left.schemaVersion === 2 || left.schemaVersion === 3) && (right.schemaVersion === 2 || right.schemaVersion === 3)
    && left.schemaVersion === right.schemaVersion
    && left.id === right.id && left.prompt === right.prompt && left.promptHash === right.promptHash
    && left.source.kind === right.source.kind && left.source.researchObjectId === right.source.researchObjectId
    && left.source.versionId === right.source.versionId && left.source.sourceEvidenceIdentity === right.source.sourceEvidenceIdentity
    && left.source.candidateHash === right.source.candidateHash
    && JSON.stringify(left.attachments ?? []) === JSON.stringify(right.attachments ?? []);
}

function quotaRefusal(text: string): boolean {
  return /^You've hit your limit\. Please try again later\.(?:\s+Retry)?$/i.test(text.trim());
}

async function successfulOutput(resultsDir: string, request: ScienceReviewRequest): Promise<ScienceReviewProviderResult | null> {
  const output = join(resultsDir, request.id);
  try { await directory(output); } catch (error) { if (missing(error)) return null; throw error; }
  let primary;
  try {
    primary = validateScienceReviewResult(JSON.parse((await boundedRead(join(output, 'result.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
  } catch (error) { if (missing(error)) return null; throw error; }
  if (primary.id !== request.id || primary.promptHash !== request.promptHash) fail();
  if (primary.status === 'succeeded') {
    const response = await boundedRead(join(output, 'response.txt'), SCIENCE_REVIEW_MAX_RESPONSE_BYTES);
    if (sha256Text(response.toString('utf8')) !== primary.responseHash) fail();
    if (quotaRefusal(response.toString('utf8'))) throw new Error('MODEL_QUOTA_EXHAUSTED');
    return { text: response.toString('utf8'), promptHash: request.promptHash, responseHash: primary.responseHash! };
  }
  try {
    const recovered = validateScienceReviewResult(JSON.parse((await boundedRead(join(output, 'recovered-result.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
    if (recovered.id !== request.id || recovered.promptHash !== request.promptHash || recovered.status !== 'succeeded') fail();
    const response = await boundedRead(join(output, 'recovered-response.txt'), SCIENCE_REVIEW_MAX_RESPONSE_BYTES);
    if (sha256Text(response.toString('utf8')) !== recovered.responseHash) fail();
    if (quotaRefusal(response.toString('utf8'))) throw new Error('MODEL_QUOTA_EXHAUSTED');
    return { text: response.toString('utf8'), promptHash: request.promptHash, responseHash: recovered.responseHash! };
  } catch (error) {
    if (missing(error)) throw new Error(primary.errorCode ?? (primary.status === 'uncertain' ? 'UNCERTAIN' : 'EXECUTION_FAILED'));
    throw error;
  }
}

export class ChatGptWebScienceReviewProvider implements ScienceReviewProvider {
  readonly name = 'chatgpt-web-science-review';
  readonly model = 'chatgpt-web/6-pro';
  private readonly timeout: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly config: ChatGptWebScienceReviewConfig) {
    if (!isAbsolute(config.inboxDir) || !isAbsolute(config.resultsDir) || config.inboxDir === config.resultsDir) fail();
    this.timeout = config.timeoutMs ?? SCIENCE_REVIEW_MAX_DEADLINE_MS;
    if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > SCIENCE_REVIEW_MAX_DEADLINE_MS) fail();
    this.now = config.now ?? Date.now;
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Read only an existing image-review reservation and its verified completed response. */
  async canResumeFromCompletedResult(requestId: string): Promise<boolean> {
    if (!SCIENCE_REVIEW_ID_PATTERN.test(requestId)) return false;
    try {
      await directory(this.config.inboxDir);
      await directory(this.config.resultsDir);
      const request = validateScienceReviewRequest(JSON.parse((await boundedRead(
        join(this.config.inboxDir, `${requestId}.submitted.json`), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      if (request.id !== requestId || request.schemaVersion !== 3) return false;
      return await successfulOutput(this.config.resultsDir, request) !== null;
    } catch { return false; }
  }

  /** A completed-result miss is never evidence that the original request was not sent. */
  async canRetryBeforeSubmission(input: { requestId: string; promptHash: string; researchObjectId: string;
    versionId: string; candidateHash: string; sourceEvidenceIdentity: string }): Promise<boolean> {
    if (!SCIENCE_REVIEW_ID_PATTERN.test(input.requestId)) return false;
    try {
      await directory(this.config.inboxDir); await directory(this.config.resultsDir);
      const output = join(this.config.resultsDir, input.requestId); await directory(output);
      const request = validateScienceReviewRequest(JSON.parse((await boundedRead(join(this.config.inboxDir,
        `${input.requestId}.submitted.json`), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      const result = validateScienceReviewResult(JSON.parse((await boundedRead(join(output, 'result.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      const proof = JSON.parse((await boundedRead(join(output, 'not-submitted.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')) as Record<string, unknown>;
      if (request.id !== input.requestId || request.schemaVersion !== 3 || request.promptHash !== input.promptHash
        || request.source.kind !== 'illustration-image' || request.source.researchObjectId !== input.researchObjectId
        || request.source.versionId !== input.versionId || request.source.candidateHash !== input.candidateHash
        || request.source.sourceEvidenceIdentity !== input.sourceEvidenceIdentity
        || request.attachments?.length !== 1 || request.attachments[0]!.sha256 !== input.candidateHash
        || result.status !== 'failed' || result.id !== request.id || result.promptHash !== request.promptHash
        || !proof || typeof proof !== 'object' || Array.isArray(proof)
        || Object.keys(proof).sort().join(',') !== 'id,promptHash,provider,state'
        || proof.id !== request.id || proof.promptHash !== request.promptHash || proof.provider !== this.name || proof.state !== 'not_submitted') return false;
      for (const name of ['response.txt', 'recovered-result.json', 'recovered-response.txt']) {
        try { await lstat(join(output, name)); return false; } catch (error) { if (!missing(error)) throw error; }
      }
      return true;
    } catch { return false; }
  }

  /** The old request was submitted, but its verified answer was a quota notice, not a review. */
  async canRetryAfterQuotaRefusal(input: { requestId: string; promptHash: string; researchObjectId: string;
    versionId: string; candidateHash: string; sourceEvidenceIdentity: string }): Promise<boolean> {
    if (!SCIENCE_REVIEW_ID_PATTERN.test(input.requestId)) return false;
    try {
      await directory(this.config.inboxDir); await directory(this.config.resultsDir);
      const output = join(this.config.resultsDir, input.requestId); await directory(output);
      const request = validateScienceReviewRequest(JSON.parse((await boundedRead(join(this.config.inboxDir,
        `${input.requestId}.submitted.json`), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      const result = validateScienceReviewResult(JSON.parse((await boundedRead(join(output, 'result.json'),
        SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      if (request.id !== input.requestId || request.schemaVersion !== 3 || request.promptHash !== input.promptHash
        || request.source.kind !== 'illustration-image' || request.source.researchObjectId !== input.researchObjectId
        || request.source.versionId !== input.versionId || request.source.candidateHash !== input.candidateHash
        || request.source.sourceEvidenceIdentity !== input.sourceEvidenceIdentity
        || request.attachments?.length !== 1 || request.attachments[0]!.sha256 !== input.candidateHash
        || result.status !== 'succeeded' || result.id !== request.id || result.promptHash !== request.promptHash
        || typeof result.responseHash !== 'string') return false;
      const response = await boundedRead(join(output, 'response.txt'), SCIENCE_REVIEW_MAX_RESPONSE_BYTES);
      if (sha256Text(response.toString('utf8')) !== result.responseHash || !quotaRefusal(response.toString('utf8'))) return false;
      for (const name of ['recovered-result.json', 'recovered-response.txt', 'not-submitted.json']) {
        try { await lstat(join(output, name)); return false; } catch (error) { if (!missing(error)) throw error; }
      }
      return true;
    } catch { return false; }
  }

  async review(input: ScienceReviewInput): Promise<ScienceReviewProviderResult> {
    return this.reviewControlled(input, false);
  }

  async resumeFromCompletedResult(input: ScienceReviewInput): Promise<ScienceReviewProviderResult> {
    if (!('kind' in input.source) || input.source.kind !== 'illustration-image') fail();
    return this.reviewControlled(input, true);
  }

  private async reviewControlled(input: ScienceReviewInput, completedOnly: boolean): Promise<ScienceReviewProviderResult> {
    const illustration = 'kind' in input.source;
    const image = 'kind' in input.source && input.source.kind === 'illustration-image';
    if (illustration) {
      if (!this.config.withIllustrationSubmission || (!image && input.attachments !== undefined)
        || (image && input.attachments?.length !== 1)
        || input.requestId !== input.authorizationContext.taskId || !input.illustrationContext
        || !Number.isSafeInteger(input.illustrationContext.executionAttempt) || input.illustrationContext.executionAttempt < 1
        || typeof input.illustrationContext.claimContent !== 'string' || !input.illustrationContext.claimContent.trim()
        || (input.illustrationContext.baseIdentity !== null && typeof input.illustrationContext.baseIdentity !== 'string')) fail();
      input = Object.freeze({ ...input, source: Object.freeze({ ...input.source }),
        authorizationContext: Object.freeze({ ...input.authorizationContext }),
        illustrationContext: Object.freeze({ ...input.illustrationContext! }) });
    }
    await directory(this.config.inboxDir);
    await directory(this.config.resultsDir);
    const requireReady = async () => {
      await boundedRead(join(this.config.resultsDir, '.ready'), SCIENCE_REVIEW_MAX_JSON_BYTES);
      const ready = await lstat(join(this.config.resultsDir, '.ready'));
      if (this.now() - ready.mtimeMs > SCIENCE_REVIEW_READY_MAX_AGE_MS || ready.mtimeMs > this.now() + 5000) fail();
    };
    if (!image) await requireReady();
    const createdAt = this.now();
    const attachmentByteLimit = image ? ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES : SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES;
    const attachments = input.attachments?.map(({ bytes, ...attachment }) => {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > attachmentByteLimit
        || createHash('sha256').update(bytes).digest('hex') !== attachment.sha256) fail();
      if (attachment.mediaType !== 'application/pdf') {
        const dimensions = encodedImageDimensions(attachment.mediaType, bytes);
        if (dimensions.width !== attachment.width || dimensions.height !== attachment.height) fail();
      } else if (!validPdf(bytes)) fail();
      return { record: attachment, bytes: Uint8Array.from(bytes) };
    });
    if ((attachments?.reduce((total, attachment) => total + attachment.bytes.byteLength, 0) ?? 0) > SCIENCE_REVIEW_MAX_TOTAL_ATTACHMENT_BYTES) fail();
    let request = validateScienceReviewRequest({
      schemaVersion: image ? 3 : illustration ? 2 : 1,
      provider: this.name,
      id: input.requestId,
      prompt: input.prompt,
      promptHash: sha256Text(input.prompt),
      createdAt,
      deadlineAt: createdAt + this.timeout,
      source: input.source,
      ...(attachments?.length ? { attachments: attachments.map(({ record }) => record) } : {}),
    });
    if (Buffer.byteLength(JSON.stringify(request), 'utf8') > SCIENCE_REVIEW_MAX_JSON_BYTES) fail();
    const intendedRequest = request;
    const submit = async (): Promise<ScienceReviewProviderResult | null> => {
      const reservation = join(this.config.inboxDir, `${input.requestId}.submitted.json`);
      const reuseImageReservation = async (reserved: Buffer): Promise<ScienceReviewProviderResult | null> => {
        request = validateScienceReviewRequest(JSON.parse(reserved.toString('utf8')));
        if (!sameIllustrationRequest(request, intendedRequest)) fail();
        const result = await successfulOutput(this.config.resultsDir, request);
        if (result) return result;
        if (completedOnly) fail();
        validateScienceReviewRequest(request, this.now());
        // The reservation may already have been consumed by the broker. Do not recreate
        // its queue entry or reset its deadline after an uncertain publication/submission.
        return null;
      };
      if (image) {
        let reserved: Buffer | undefined;
        try { reserved = await boundedRead(reservation, SCIENCE_REVIEW_MAX_JSON_BYTES); }
        catch (error) { if (!missing(error)) throw error; }
        if (reserved) return reuseImageReservation(reserved);
        if (completedOnly) fail();
        // Readiness must precede every new durable reservation. A browser outage before
        // queuing must not spend this task's review deadline or leave a submitted marker.
        await requireReady();
      }
      for (const attachment of attachments ?? []) {
        const path = join(this.config.inboxDir, `${request.id}.${attachment.record.fileName}`);
        if (!await publish(path, attachment.bytes)) {
          const existing = await boundedRead(path, attachmentByteLimit);
          if (existing.byteLength !== attachment.bytes.byteLength
            || createHash('sha256').update(existing).digest('hex') !== attachment.record.sha256) fail();
        }
      }
      if (!await publish(reservation, JSON.stringify(request))) {
        if (image) return reuseImageReservation(await boundedRead(reservation, SCIENCE_REVIEW_MAX_JSON_BYTES));
        request = validateScienceReviewRequest(JSON.parse((await boundedRead(reservation, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
        if (illustration ? !sameIllustrationRequest(request, intendedRequest)
          : request.schemaVersion !== 1 || request.promptHash !== sha256Text(input.prompt) || request.source.candidateHash !== input.source.candidateHash
            || JSON.stringify(request.attachments ?? []) !== JSON.stringify(attachments?.map(({ record }) => record) ?? [])) fail();
      }
      const existingOutput = await successfulOutput(this.config.resultsDir, request);
      if (existingOutput) return existingOutput;
      validateScienceReviewRequest(request, this.now());
      const queued = join(this.config.inboxDir, `${input.requestId}.json`);
      if (!await publish(queued, JSON.stringify(request))) {
        const existing = validateScienceReviewRequest(JSON.parse((await boundedRead(queued, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
        if (illustration ? !sameIllustrationRequest(existing, request) : existing.promptHash !== request.promptHash) fail();
      }
      return null;
    };
    const existingOutput = illustration
      ? await this.config.withIllustrationSubmission!(input, submit)
      : this.config.withSubmission
        ? await this.config.withSubmission({ taskId: input.authorizationContext.taskId,
          artifactId: 'artifactId' in input.source ? input.source.artifactId : undefined }, submit)
        : await submit();
    if (existingOutput) return existingOutput;
    while (this.now() < request.deadlineAt) {
      try {
        const result = await successfulOutput(this.config.resultsDir, request);
        if (result) return result;
      } catch (error) {
        if (!missing(error)) throw error;
      }
      await this.sleep(Math.min(this.config.pollIntervalMs ?? 1000, request.deadlineAt - this.now()));
    }
    throw new Error('EXPIRED');
  }
}
