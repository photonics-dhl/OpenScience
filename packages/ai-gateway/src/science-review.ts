import { constants } from 'node:fs';
import { lstat, open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sha256Text } from './ocr';
import {
  SCIENCE_REVIEW_MAX_DEADLINE_MS,
  SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES,
  SCIENCE_REVIEW_MAX_JSON_BYTES,
  SCIENCE_REVIEW_MAX_RESPONSE_BYTES,
  SCIENCE_REVIEW_MAX_TOTAL_ATTACHMENT_BYTES,
  SCIENCE_REVIEW_READY_MAX_AGE_MS,
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

function attachmentDimensions(bytes: Uint8Array): { width: number; height: number } {
  const value = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (value.length < 24 || value.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || value.readUInt32BE(8) !== 13 || value.subarray(12, 16).toString('ascii') !== 'IHDR') fail();
  return { width: value.readUInt32BE(16), height: value.readUInt32BE(20) };
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
    return { text: response.toString('utf8'), promptHash: request.promptHash, responseHash: primary.responseHash! };
  }
  try {
    const recovered = validateScienceReviewResult(JSON.parse((await boundedRead(join(output, 'recovered-result.json'), SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
    if (recovered.id !== request.id || recovered.promptHash !== request.promptHash || recovered.status !== 'succeeded') fail();
    const response = await boundedRead(join(output, 'recovered-response.txt'), SCIENCE_REVIEW_MAX_RESPONSE_BYTES);
    if (sha256Text(response.toString('utf8')) !== recovered.responseHash) fail();
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

  async review(input: ScienceReviewInput): Promise<ScienceReviewProviderResult> {
    await directory(this.config.inboxDir);
    await directory(this.config.resultsDir);
    await boundedRead(join(this.config.resultsDir, '.ready'), SCIENCE_REVIEW_MAX_JSON_BYTES);
    const ready = await lstat(join(this.config.resultsDir, '.ready'));
    if (this.now() - ready.mtimeMs > SCIENCE_REVIEW_READY_MAX_AGE_MS || ready.mtimeMs > this.now() + 5000) fail();
    const createdAt = this.now();
    const attachments = input.attachments?.map(({ bytes, ...attachment }) => {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES
        || createHash('sha256').update(bytes).digest('hex') !== attachment.sha256) fail();
      const dimensions = attachmentDimensions(bytes);
      if (dimensions.width !== attachment.width || dimensions.height !== attachment.height) fail();
      return { record: attachment, bytes: Uint8Array.from(bytes) };
    });
    if ((attachments?.reduce((total, attachment) => total + attachment.bytes.byteLength, 0) ?? 0) > SCIENCE_REVIEW_MAX_TOTAL_ATTACHMENT_BYTES) fail();
    let request = validateScienceReviewRequest({
      schemaVersion: 1,
      provider: this.name,
      id: input.requestId,
      prompt: input.prompt,
      promptHash: sha256Text(input.prompt),
      createdAt,
      deadlineAt: createdAt + this.timeout,
      source: input.source,
      ...(attachments?.length ? { attachments: attachments.map(({ record }) => record) } : {}),
    });
    for (const attachment of attachments ?? []) {
      const path = join(this.config.inboxDir, `${request.id}.${attachment.record.fileName}`);
      if (!await publish(path, attachment.bytes)) {
        const existing = await boundedRead(path, SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES);
        if (existing.byteLength !== attachment.bytes.byteLength
          || createHash('sha256').update(existing).digest('hex') !== attachment.record.sha256) fail();
      }
    }
    const reservation = join(this.config.inboxDir, `${input.requestId}.submitted.json`);
    if (!await publish(reservation, JSON.stringify(request))) {
      request = validateScienceReviewRequest(JSON.parse((await boundedRead(reservation, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      if (request.promptHash !== sha256Text(input.prompt) || request.source.candidateHash !== input.source.candidateHash
        || JSON.stringify(request.attachments ?? []) !== JSON.stringify(attachments?.map(({ record }) => record) ?? [])) fail();
    }
    const existingOutput = await successfulOutput(this.config.resultsDir, request);
    if (existingOutput) return existingOutput;
    validateScienceReviewRequest(request, this.now());
    const queued = join(this.config.inboxDir, `${input.requestId}.json`);
    if (!await publish(queued, JSON.stringify(request))) {
      const existing = validateScienceReviewRequest(JSON.parse((await boundedRead(queued, SCIENCE_REVIEW_MAX_JSON_BYTES)).toString('utf8')));
      if (existing.promptHash !== request.promptHash) fail();
    }
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
