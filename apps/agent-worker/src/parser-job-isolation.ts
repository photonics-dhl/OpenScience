import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IngestionAdapters } from './ingestion-parser';
import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  ParserJobProtocolError,
  SafeParserErrorCode,
  SafeParserWarningCode,
  deserializeParserJobResponseV2,
  parseParserJobRequestV2,
  serializeParserJobRequestV2,
  serializeParserJobResponseV2,
  type ParserJobRequestV2,
  type ParserJobResponseV2,
  type ParserStageResult,
  type DocumentParserMetadata,
} from './parsers/job-protocol';

type ParserKind = 'pdf' | 'docx' | 'image';
type ParserResponseV1 = { ok: true; text: string } | { ok: false; errorCode: SafeParserErrorCode };
export type ParserStageProcessor = (request: ParserJobRequestV2, content: Buffer) => Promise<ParserStageResult>;
export const TRANSITION_PARSER_METADATA = Object.freeze({ name: 'v1-text-transition', version: '2.0.0' });
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const JOB_SUFFIXES = ['input', 'request.json', 'processing.json', 'response.tmp', 'response.json', 'cancelled'] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jobPath(jobDir: string, id: string, suffix: string): string {
  return join(jobDir, `${id}.${suffix}`);
}

export class SafeParserBoundaryError extends Error {
  readonly code: SafeParserErrorCode;

  constructor(code: SafeParserErrorCode) {
    super(code);
    this.name = 'SafeParserBoundaryError';
    this.code = code;
  }
}

function safeErrorCode(error: unknown, fallback = SafeParserErrorCode.PARSER_FAILED): SafeParserErrorCode {
  if (error instanceof SafeParserBoundaryError || error instanceof ParserJobProtocolError) return error.code;
  return fallback;
}

function parseParserResponseV1(value: unknown): ParserResponseV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_RESPONSE);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ok = descriptors.ok?.value;
  const allowed = ok === true ? ['ok', 'text'] : ok === false ? ['ok', 'errorCode'] : [];
  const keys = Reflect.ownKeys(descriptors);
  if (allowed.length === 0 || keys.some((key) => typeof key !== 'string' || !allowed.includes(key))) {
    throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_RESPONSE);
  }
  if (keys.some((key) => {
    const descriptor = descriptors[key as string];
    return !descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value');
  })) {
    throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_RESPONSE);
  }
  if (ok === true && typeof descriptors.text?.value === 'string') return { ok: true, text: descriptors.text.value };
  const errorCode = descriptors.errorCode?.value;
  if (ok === false && typeof errorCode === 'string' && Object.values(SafeParserErrorCode).includes(errorCode as SafeParserErrorCode)) {
    return { ok: false, errorCode: errorCode as SafeParserErrorCode };
  }
  throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_RESPONSE);
}

function parseParserRequestV1(value: unknown): ParserKind {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_REQUEST);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const kindDescriptor = descriptors.kind;
  if (keys.length !== 1 || keys[0] !== 'kind' || !kindDescriptor?.enumerable
    || !Object.prototype.hasOwnProperty.call(kindDescriptor, 'value')) {
    throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_REQUEST);
  }
  const kind: unknown = kindDescriptor.value;
  if (kind !== 'pdf' && kind !== 'docx' && kind !== 'image') {
    throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_REQUEST);
  }
  return kind;
}

async function readRegularFileNoFollow(path: string, maximumBytes: number, oversizedCode: SafeParserErrorCode): Promise<Buffer> {
  let handle;
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_INPUT);
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_INPUT);
    if (metadata.size > maximumBytes) throw new SafeParserBoundaryError(oversizedCode);
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maximumBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      total += bytesRead;
    }
    if (total > maximumBytes) throw new SafeParserBoundaryError(oversizedCode);
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof SafeParserBoundaryError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error;
    throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_INPUT);
  } finally {
    await handle?.close();
  }
}

export async function readVerifiedParserInput(path: string, request: ParserJobRequestV2): Promise<Buffer> {
  const content = await readRegularFileNoFollow(path, MAX_INPUT_BYTES, SafeParserErrorCode.INPUT_TOO_LARGE);
  if (createHash('sha256').update(content).digest('hex') !== request.contentHash) {
    throw new SafeParserBoundaryError(SafeParserErrorCode.CONTENT_HASH_MISMATCH);
  }
  return content;
}

export async function writeCancellationMarker(path: string): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644);
  await handle.close();
}

async function createClientJobFiles(
  jobDir: string,
  inputPath: string,
  requestPath: string,
  content: Buffer,
  serializedRequest: string,
): Promise<void> {
  let inputCreated = false;
  try {
    await mkdir(jobDir, { recursive: true });
    await writeFile(inputPath, content, { mode: 0o644, flag: 'wx' });
    inputCreated = true;
    await writeFile(requestPath, serializedRequest, { mode: 0o644, flag: 'wx' });
  } catch {
    if (inputCreated) await rm(inputPath, { force: true }).catch(() => undefined);
    throw new SafeParserBoundaryError(SafeParserErrorCode.IO_FAILED);
  }
}

async function writeClientCancellationMarker(path: string): Promise<void> {
  try {
    await writeCancellationMarker(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new SafeParserBoundaryError(SafeParserErrorCode.CANCELLED);
    }
    throw new SafeParserBoundaryError(SafeParserErrorCode.IO_FAILED);
  }
}

export async function reapParserJobOrphans(
  jobDir: string,
  now = Date.now(),
  maxAgeMs = 90_000,
  afterSnapshot?: () => Promise<void>,
): Promise<number> {
  const entries = await readdir(jobDir);
  const grouped = new Map<string, string[]>();
  for (const name of entries) {
    const match = /^([0-9a-f-]{36})\.(input|request\.json|processing\.json|response\.tmp|response\.json|cancelled)$/.exec(name);
    if (!match) continue;
    const names = grouped.get(match[1]!) ?? [];
    names.push(name);
    grouped.set(match[1]!, names);
  }
  await afterSnapshot?.();
  let reaped = 0;
  for (const [id, names] of grouped) {
    if (names.some((name) => name.endsWith('.request.json') || name.endsWith('.processing.json'))) continue;
    const timestamps = await Promise.all(names.map(async (name) => {
      try {
        return (await lstat(join(jobDir, name))).mtimeMs;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }));
    if (timestamps.some((timestamp) => timestamp === null)) continue;
    if (Math.max(...(timestamps as number[])) > now - maxAgeMs) continue;
    await Promise.all(JOB_SUFFIXES.map((suffix) => rm(jobPath(jobDir, id, suffix), { force: true }).catch(() => undefined)));
    reaped += 1;
  }
  return reaped;
}

export function createParserJobAdapters(jobDir: string, timeoutMs = 75_000): IngestionAdapters {
  const submit = async (kind: ParserKind, content: Buffer): Promise<string> => {
    if (!Buffer.isBuffer(content) || content.byteLength > MAX_INPUT_BYTES) {
      throw new SafeParserBoundaryError(SafeParserErrorCode.INPUT_TOO_LARGE);
    }
    const id = randomUUID();
    const inputPath = jobPath(jobDir, id, 'input');
    const requestPath = jobPath(jobDir, id, 'request.json');
    const responsePath = jobPath(jobDir, id, 'response.json');
    const cancelledPath = jobPath(jobDir, id, 'cancelled');
    await createClientJobFiles(jobDir, inputPath, requestPath, content, JSON.stringify({ kind }));
    const deadline = Date.now() + timeoutMs;
    let timedOut = false;
    try {
      while (Date.now() < deadline) {
        try {
          const serialized = await readRegularFileNoFollow(
            responsePath,
            PARSER_JOB_RESPONSE_MAX_BYTES,
            SafeParserErrorCode.RESPONSE_TOO_LARGE,
          );
          let response: ParserResponseV1;
          try {
            response = parseParserResponseV1(JSON.parse(serialized.toString('utf8')));
          } catch {
            throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_RESPONSE);
          }
          if (response.ok && typeof response.text === 'string') return response.text;
          if (!response.ok && Object.values(SafeParserErrorCode).includes(response.errorCode)) {
            throw new SafeParserBoundaryError(response.errorCode);
          }
          throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_RESPONSE);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await sleep(50);
      }
      timedOut = true;
      await writeClientCancellationMarker(cancelledPath);
      throw new SafeParserBoundaryError(SafeParserErrorCode.TIMEOUT);
    } finally {
      const cleanupSuffixes = timedOut
        ? ['response.tmp', 'response.json']
        : ['input', 'request.json', 'processing.json', 'response.tmp', 'response.json', 'cancelled'];
      await Promise.all(cleanupSuffixes.map((suffix) => (
        rm(jobPath(jobDir, id, suffix), { force: true }).catch(() => undefined)
      )));
    }
  };
  return {
    pdf: (content) => submit('pdf', content),
    docx: (content) => submit('docx', content),
    image: (content) => submit('image', content),
  };
}

export function createParserStageJobClient(
  jobDir: string,
  expectedParser: DocumentParserMetadata,
  timeoutMs = 75_000,
): (request: ParserJobRequestV2, content: Buffer) => Promise<ParserStageResult> {
  return async (requestValue: ParserJobRequestV2, content: Buffer): Promise<ParserStageResult> => {
    const serializedRequest = serializeParserJobRequestV2(requestValue);
    const request = parseParserJobRequestV2(JSON.parse(serializedRequest));
    if (!Buffer.isBuffer(content) || content.byteLength > MAX_INPUT_BYTES) {
      throw new SafeParserBoundaryError(SafeParserErrorCode.INPUT_TOO_LARGE);
    }
    if (createHash('sha256').update(content).digest('hex') !== request.contentHash) {
      throw new SafeParserBoundaryError(SafeParserErrorCode.CONTENT_HASH_MISMATCH);
    }
    const id = randomUUID();
    const inputPath = jobPath(jobDir, id, 'input');
    const requestPath = jobPath(jobDir, id, 'request.json');
    const responsePath = jobPath(jobDir, id, 'response.json');
    const cancelledPath = jobPath(jobDir, id, 'cancelled');
    await createClientJobFiles(jobDir, inputPath, requestPath, content, serializedRequest);
    const deadline = Date.now() + timeoutMs;
    let timedOut = false;
    try {
      while (Date.now() < deadline) {
        try {
          const serialized = await readRegularFileNoFollow(
            responsePath,
            PARSER_JOB_RESPONSE_MAX_BYTES,
            SafeParserErrorCode.RESPONSE_TOO_LARGE,
          );
          const response = deserializeParserJobResponseV2(serialized, request, expectedParser);
          if (response.ok) return response.result;
          throw new SafeParserBoundaryError(response.errorCode);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            await sleep(50);
            continue;
          }
          if (error instanceof SafeParserBoundaryError) throw error;
          throw new SafeParserBoundaryError(safeErrorCode(error, SafeParserErrorCode.INVALID_RESPONSE));
        }
      }
      timedOut = true;
      await writeClientCancellationMarker(cancelledPath);
      throw new SafeParserBoundaryError(SafeParserErrorCode.TIMEOUT);
    } finally {
      const cleanupSuffixes = timedOut
        ? ['response.tmp', 'response.json']
        : ['input', 'request.json', 'processing.json', 'response.tmp', 'response.json', 'cancelled'];
      await Promise.all(cleanupSuffixes.map((suffix) => (
        rm(jobPath(jobDir, id, suffix), { force: true }).catch(() => undefined)
      )));
    }
  };
}

export function createTransitionParserStageProcessor(adapters: IngestionAdapters): ParserStageProcessor {
  return async (requestValue, content) => {
    const request = parseParserJobRequestV2(requestValue);
    if (request.operation !== 'extract_text' || Reflect.ownKeys(request.options).length !== 0) {
      throw new SafeParserBoundaryError(SafeParserErrorCode.UNSUPPORTED_OPERATION);
    }
    const kind: ParserKind | undefined = request.mediaType === 'application/pdf'
      ? 'pdf'
      : request.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? 'docx'
        : request.mediaType.startsWith('image/')
          ? 'image'
          : undefined;
    if (!kind) throw new SafeParserBoundaryError(SafeParserErrorCode.UNSUPPORTED_OPERATION);
    const adapter = adapters[kind];
    if (!adapter) throw new SafeParserBoundaryError(SafeParserErrorCode.PARSER_UNAVAILABLE);
    let text: string;
    try {
      text = await adapter(Buffer.from(content));
    } catch {
      throw new SafeParserBoundaryError(SafeParserErrorCode.PARSER_FAILED);
    }
    if (typeof text !== 'string' || !text.trim() || text.length > 5_000_000) {
      throw new SafeParserBoundaryError(SafeParserErrorCode.PARSER_FAILED);
    }
    const chunks = Array.from({ length: Math.ceil(text.length / 50_000) }, (_, index) => (
      text.slice(index * 50_000, (index + 1) * 50_000)
    ));
    const height = Math.max(24, chunks.length * 24);
    return {
      schemaVersion: 2,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1,
        width: 1000,
        height,
        blocks: chunks.map((chunk, index) => ({
          kind: 'paragraph',
          text: chunk,
          boundingBox: { x: 0, y: index * 24, width: 1000, height: 24 },
        })),
      }],
      warnings: [SafeParserWarningCode.PARTIAL_RESULT],
    };
  };
}

function responseV2Failure(request: ParserJobRequestV2, errorCode: SafeParserErrorCode): ParserJobResponseV2 {
  return {
    schemaVersion: 2,
    ok: false,
    artifactId: request.artifactId,
    contentHash: request.contentHash,
    errorCode,
  };
}

async function publishAtomicResponse(temporaryPath: string, responsePath: string, serialized: string): Promise<void> {
  await rm(temporaryPath, { force: true });
  const handle = await open(
    temporaryPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await handle.writeFile(serialized, 'utf8');
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, responsePath);
}

export async function processParserJobsOnce(
  jobDir: string,
  adapters: IngestionAdapters,
  stageProcessor?: ParserStageProcessor,
): Promise<number> {
  await mkdir(jobDir, { recursive: true });
  const entries = await readdir(jobDir);
  const requests = entries.filter((name) => name.endsWith('.request.json') || name.endsWith('.processing.json')).sort();
  let processed = 0;
  for (const name of requests) {
    const id = name.replace(/\.(?:request|processing)\.json$/, '');
    if (!/^[0-9a-f-]{36}$/.test(id)) continue;
    const processingPath = jobPath(jobDir, id, 'processing.json');
    const cancelledPath = jobPath(jobDir, id, 'cancelled');
    const cleanupCancelled = async () => {
      await Promise.all(JOB_SUFFIXES.map((suffix) => (
        rm(jobPath(jobDir, id, suffix), { force: true }).catch(() => undefined)
      )));
    };
    try {
      await access(cancelledPath);
      await cleanupCancelled();
      processed += 1;
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (name.endsWith('.request.json')) {
      try {
        await rename(jobPath(jobDir, id, 'request.json'), processingPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
    let response: ParserResponseV1 | ParserJobResponseV2;
    let requestV2: ParserJobRequestV2 | undefined;
    try {
      const requestBytes = await readRegularFileNoFollow(
        processingPath,
        MAX_REQUEST_BYTES,
        SafeParserErrorCode.INVALID_REQUEST,
      );
      let request: unknown;
      try {
        request = JSON.parse(requestBytes.toString('utf8'));
      } catch {
        throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_REQUEST);
      }
      const schemaVersion = request && typeof request === 'object' && !Array.isArray(request)
        ? Object.getOwnPropertyDescriptor(request, 'schemaVersion')
        : undefined;
      if (schemaVersion) {
        if (!schemaVersion.enumerable || !Object.prototype.hasOwnProperty.call(schemaVersion, 'value')
          || schemaVersion.value !== 2) {
          throw new SafeParserBoundaryError(SafeParserErrorCode.INVALID_REQUEST);
        }
        requestV2 = parseParserJobRequestV2(request);
        if (!stageProcessor) throw new SafeParserBoundaryError(SafeParserErrorCode.PARSER_UNAVAILABLE);
        const content = await readVerifiedParserInput(jobPath(jobDir, id, 'input'), requestV2);
        response = {
          schemaVersion: 2,
          ok: true,
          artifactId: requestV2.artifactId,
          contentHash: requestV2.contentHash,
          result: await stageProcessor(requestV2, content),
        };
      } else {
        const kind = parseParserRequestV1(request);
        const adapter = adapters[kind];
        if (!adapter) throw new SafeParserBoundaryError(SafeParserErrorCode.PARSER_UNAVAILABLE);
        const content = await readRegularFileNoFollow(
          jobPath(jobDir, id, 'input'),
          MAX_INPUT_BYTES,
          SafeParserErrorCode.INPUT_TOO_LARGE,
        );
        response = { ok: true, text: await adapter(content) };
      }
    } catch (error) {
      const errorCode = safeErrorCode(error);
      response = requestV2
        ? responseV2Failure(requestV2, errorCode)
        : { ok: false, errorCode };
    }
    try {
      await access(cancelledPath);
      await cleanupCancelled();
      processed += 1;
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporaryResponse = jobPath(jobDir, id, 'response.tmp');
    let serialized: string;
    try {
      serialized = 'schemaVersion' in response
        ? serializeParserJobResponseV2(response)
        : JSON.stringify(response);
      if (Buffer.byteLength(serialized) > PARSER_JOB_RESPONSE_MAX_BYTES) {
        throw new SafeParserBoundaryError(SafeParserErrorCode.RESPONSE_TOO_LARGE);
      }
    } catch (error) {
      const errorCode = safeErrorCode(error, SafeParserErrorCode.INVALID_RESPONSE);
      response = requestV2
        ? responseV2Failure(requestV2, errorCode)
        : { ok: false, errorCode };
      serialized = 'schemaVersion' in response
        ? serializeParserJobResponseV2(response)
        : JSON.stringify(response);
    }
    await publishAtomicResponse(temporaryResponse, jobPath(jobDir, id, 'response.json'), serialized);
    try {
      await access(cancelledPath);
      await cleanupCancelled();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await Promise.all([rm(processingPath, { force: true }), rm(jobPath(jobDir, id, 'input'), { force: true })]);
    }
    processed += 1;
  }
  return processed;
}
