import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import {
  parseDocumentSourceMap, parseExtractionResult,
  type DocumentParserMetadata, type DocumentSourceMap, type ExtractionResult,
} from '@openscience/domain';
import type { DocumentParser, ParserInput } from './types';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_WARNING_OR_REASON_COUNT = 100;
const MAX_PAGE_COUNT = 10_000;
const MAX_BLOCK_COUNT = 10_000;
const MAX_TRANSFORMATION_COUNT = 25_000;
const MAX_TEXT_LENGTH = 50_000;
const MAX_SERIALIZED_STRING_LENGTH = 8_000_000;

export class ParserContractError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ParserContractError';
  }
}

type Descriptors = Record<string, PropertyDescriptor>;
interface Budget { strings: number; blocks: number; transformations: number }
interface ParserSnapshot { input: ParserInput; metadata: DocumentParserMetadata }

function contract(message: string): never { throw new ParserContractError(message); }

function rejectProxy(value: unknown, label: string): void {
  if (isProxy(value)) contract(`preflight ${label} must not be a Proxy`);
}

function safeObject<T extends Record<string, unknown>>(value: T): T {
  return Object.assign(Object.create(null) as T, value);
}

function safeArray<T>(values: readonly T[]): T[] {
  const result = Array.from(values);
  Object.defineProperty(result, 'toJSON', { value: undefined, enumerable: false });
  return result;
}

function dataObject(value: unknown, label: string, allowed: readonly string[]): Descriptors {
  rejectProxy(value, label);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    contract(`preflight ${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as Descriptors;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string' || !allowed.includes(key))) contract(`preflight ${label} has an unknown field`);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) contract(`preflight ${label} must use enumerable data properties`);
  }
  if (Object.prototype.hasOwnProperty.call(descriptors, 'toJSON')) contract(`preflight ${label} must not define toJSON`);
  return descriptors;
}

function required(descriptors: Descriptors, key: string, label: string): unknown {
  const descriptor = descriptors[key];
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) contract(`preflight ${label} is required and must be a data property`);
  return descriptor.value;
}

function optional(descriptors: Descriptors, key: string, label: string): unknown {
  const descriptor = descriptors[key];
  if (!descriptor) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) contract(`preflight ${label} must be a data property`);
  return descriptor.value;
}

function boundedString(value: unknown, label: string, maximum: number, budget?: Budget): string {
  if (typeof value !== 'string' || value.length > maximum || !value.trim()) contract(`preflight ${label} must be a bounded non-empty string`);
  if (budget) {
    budget.strings += value.length;
    if (budget.strings > MAX_SERIALIZED_STRING_LENGTH) contract('preflight string budget exceeded');
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) contract(`preflight ${label} must be a finite number`);
  return value;
}

function dataArray(value: unknown, label: string, maximum: number): unknown[] {
  rejectProxy(value, label);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) contract(`preflight ${label} must be an ordinary array`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') || typeof lengthDescriptor.value !== 'number') {
    contract(`preflight ${label} has an invalid length`);
  }
  const length = lengthDescriptor.value;
  if (length > maximum) contract(`preflight ${label} exceeds its maximum length`);
  if (Object.getOwnPropertyDescriptor(value, 'toJSON')) contract(`preflight ${label} must not define toJSON`);
  const values: unknown[] = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) contract(`preflight ${label} must not be sparse or contain accessors`);
    values[index] = descriptor.value;
  }
  let seen = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    seen += 1;
    if (seen > length || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) contract(`preflight ${label} has unsupported properties`);
  }
  return values;
}

function canonicalMetadata(value: unknown, label: string, budget: Budget): DocumentParserMetadata {
  const fields = dataObject(value, label, ['name', 'version', 'modelHash']);
  const name = boundedString(required(fields, 'name', `${label} name`), `${label} name`, MAX_IDENTIFIER_LENGTH, budget);
  const version = boundedString(required(fields, 'version', `${label} version`), `${label} version`, MAX_IDENTIFIER_LENGTH, budget);
  const modelHash = optional(fields, 'modelHash', `${label} modelHash`);
  return safeObject({ name, version, ...(modelHash === undefined ? {} : { modelHash: boundedString(modelHash, `${label} modelHash`, MAX_IDENTIFIER_LENGTH, budget) }) });
}

function canonicalBox(value: unknown): { x: number; y: number; width: number; height: number } {
  const fields = dataObject(value, 'boundingBox', ['x', 'y', 'width', 'height']);
  return safeObject({
    x: finiteNumber(required(fields, 'x', 'boundingBox x'), 'boundingBox x'),
    y: finiteNumber(required(fields, 'y', 'boundingBox y'), 'boundingBox y'),
    width: finiteNumber(required(fields, 'width', 'boundingBox width'), 'boundingBox width'),
    height: finiteNumber(required(fields, 'height', 'boundingBox height'), 'boundingBox height'),
  });
}

function canonicalSourceMap(value: unknown, budget: Budget): unknown {
  const fields = dataObject(value, 'DocumentSourceMap', ['artifactId', 'contentHash', 'parser', 'pages']);
  const pages = safeArray(dataArray(required(fields, 'pages', 'DocumentSourceMap pages'), 'DocumentSourceMap pages', MAX_PAGE_COUNT).map((pageValue) => {
    const page = dataObject(pageValue, 'DocumentPage', ['page', 'width', 'height', 'blocks']);
    const blocks = dataArray(required(page, 'blocks', 'DocumentPage blocks'), 'DocumentPage blocks', MAX_BLOCK_COUNT - budget.blocks);
    budget.blocks += blocks.length;
    return safeObject({
      page: finiteNumber(required(page, 'page', 'DocumentPage page'), 'DocumentPage page'),
      width: finiteNumber(required(page, 'width', 'DocumentPage width'), 'DocumentPage width'),
      height: finiteNumber(required(page, 'height', 'DocumentPage height'), 'DocumentPage height'),
      blocks: safeArray(blocks.map((blockValue) => {
        const block = dataObject(blockValue, 'DocumentBlock', ['id', 'kind', 'text', 'boundingBox', 'confidence', 'parser', 'transformations']);
        const text = optional(block, 'text', 'DocumentBlock text');
        const confidence = optional(block, 'confidence', 'DocumentBlock confidence');
        const transformations = dataArray(required(block, 'transformations', 'DocumentBlock transformations'), 'DocumentBlock transformations', Math.min(100, MAX_TRANSFORMATION_COUNT - budget.transformations));
        budget.transformations += transformations.length;
        return safeObject({
          id: boundedString(required(block, 'id', 'DocumentBlock id'), 'DocumentBlock id', MAX_IDENTIFIER_LENGTH, budget),
          kind: boundedString(required(block, 'kind', 'DocumentBlock kind'), 'DocumentBlock kind', 20, budget),
          ...(text === undefined ? {} : { text: boundedString(text, 'DocumentBlock text', MAX_TEXT_LENGTH, budget) }),
          boundingBox: canonicalBox(required(block, 'boundingBox', 'DocumentBlock boundingBox')),
          ...(confidence === undefined ? {} : { confidence: finiteNumber(confidence, 'DocumentBlock confidence') }),
          parser: canonicalMetadata(required(block, 'parser', 'DocumentBlock parser'), 'DocumentBlock parser', budget),
          transformations: safeArray(transformations.map((transformationValue) => {
            const transformation = dataObject(transformationValue, 'DocumentTransformation', ['stage', 'processor']);
            return safeObject({
              stage: boundedString(required(transformation, 'stage', 'DocumentTransformation stage'), 'DocumentTransformation stage', 20, budget),
              processor: canonicalMetadata(required(transformation, 'processor', 'DocumentTransformation processor'), 'DocumentTransformation processor', budget),
            });
          })),
        });
      })),
    });
  }));
  return safeObject({
    artifactId: boundedString(required(fields, 'artifactId', 'DocumentSourceMap artifactId'), 'DocumentSourceMap artifactId', MAX_IDENTIFIER_LENGTH, budget),
    contentHash: boundedString(required(fields, 'contentHash', 'DocumentSourceMap contentHash'), 'DocumentSourceMap contentHash', 64, budget),
    parser: canonicalMetadata(required(fields, 'parser', 'DocumentSourceMap parser'), 'DocumentSourceMap parser', budget),
    pages,
  });
}

/** Copies only bounded own data properties; the provider object is never serialized. */
function canonicalExtractionResult(value: unknown): unknown {
  const fields = dataObject(value, 'ExtractionResult', ['status', 'sourceMap', 'warnings', 'reasons', 'code', 'message', 'retryable', 'provider']);
  const status = boundedString(required(fields, 'status', 'ExtractionResult status'), 'ExtractionResult status', 20);
  const budget: Budget = { strings: status.length, blocks: 0, transformations: 0 };
  if (status === 'succeeded' || status === 'needs_review') {
    const allowed = status === 'succeeded' ? ['status', 'sourceMap', 'warnings'] : ['status', 'sourceMap', 'reasons'];
    dataObject(value, 'ExtractionResult', allowed);
    const entries = safeArray(dataArray(required(fields, status === 'succeeded' ? 'warnings' : 'reasons', 'ExtractionResult entries'), 'ExtractionResult entries', MAX_WARNING_OR_REASON_COUNT)
      .map((entry) => boundedString(entry, 'ExtractionResult entry', 500, budget)));
    return status === 'succeeded'
      ? safeObject({ status, sourceMap: canonicalSourceMap(required(fields, 'sourceMap', 'ExtractionResult sourceMap'), budget), warnings: entries })
      : safeObject({ status, sourceMap: canonicalSourceMap(required(fields, 'sourceMap', 'ExtractionResult sourceMap'), budget), reasons: entries });
  }
  if (status === 'blocked') {
    dataObject(value, 'ExtractionResult', ['status', 'code', 'message']);
    return safeObject({ status, code: boundedString(required(fields, 'code', 'ExtractionResult code'), 'ExtractionResult code', 50, budget), message: boundedString(required(fields, 'message', 'ExtractionResult message'), 'ExtractionResult message', 2_000, budget) });
  }
  if (status === 'failed') {
    dataObject(value, 'ExtractionResult', ['status', 'retryable', 'provider', 'message']);
    const retryable = required(fields, 'retryable', 'ExtractionResult retryable');
    if (typeof retryable !== 'boolean') contract('preflight ExtractionResult retryable must be boolean');
    return safeObject({ status, retryable, provider: boundedString(required(fields, 'provider', 'ExtractionResult provider'), 'ExtractionResult provider', 2_000, budget), message: boundedString(required(fields, 'message', 'ExtractionResult message'), 'ExtractionResult message', 2_000, budget) });
  }
  contract('preflight ExtractionResult status is invalid');
}

function snapshotInput(input: unknown, parser: DocumentParser): ParserSnapshot {
  try {
    const fields = dataObject(input, 'ParserInput', ['artifactId', 'contentHash', 'content', 'mediaType']);
    const artifactId = boundedString(required(fields, 'artifactId', 'ParserInput artifactId'), 'ParserInput artifactId', MAX_IDENTIFIER_LENGTH);
    const contentHash = boundedString(required(fields, 'contentHash', 'ParserInput contentHash'), 'ParserInput contentHash', 64);
    const mediaType = boundedString(required(fields, 'mediaType', 'ParserInput mediaType'), 'ParserInput mediaType', MAX_IDENTIFIER_LENGTH);
    const sourceContent = required(fields, 'content', 'ParserInput content');
    if (!/^[a-f0-9]{64}$/.test(contentHash)) contract('ParserInput contentHash must be a SHA-256 hex digest');
    rejectProxy(sourceContent, 'ParserInput content');
    if (!Buffer.isBuffer(sourceContent)) contract('ParserInput content must be a Buffer');
    if (sourceContent.length > MAX_INPUT_BYTES) contract('ParserInput content exceeds maximum size');
    const privateContent = Buffer.from(sourceContent);
    if (contentHash !== createHash('sha256').update(privateContent).digest('hex')) contract('ParserInput contentHash does not match content');
    rejectProxy(parser, 'DocumentParser');
    const metadata = canonicalMetadata(Object.getOwnPropertyDescriptor(parser, 'metadata')?.value, 'DocumentParser metadata', { strings: 0, blocks: 0, transformations: 0 });
    return { input: { artifactId, contentHash, mediaType, content: privateContent }, metadata };
  } catch (error) {
    if (error instanceof ParserContractError) throw error;
    throw new ParserContractError('ParserInput preflight failed', { cause: error });
  }
}

function callbackInput(snapshot: ParserInput): ParserInput {
  return { artifactId: snapshot.artifactId, contentHash: snapshot.contentHash, mediaType: snapshot.mediaType, content: Buffer.from(snapshot.content) };
}

function parseResult(value: unknown): ExtractionResult<DocumentSourceMap> {
  try {
    return parseExtractionResult(JSON.stringify(canonicalExtractionResult(value)), parseDocumentSourceMap);
  } catch (error) {
    if (error instanceof ParserContractError) throw error;
    throw new ParserContractError('Document parser returned an invalid extraction result', { cause: error });
  }
}

function equalMetadata(actual: DocumentParserMetadata, expected: DocumentParserMetadata): boolean {
  return actual.name === expected.name && actual.version === expected.version && actual.modelHash === expected.modelHash;
}

/** Executes an untrusted parser behind a bounded, canonicalized domain contract. */
export async function runDocumentParser(input: ParserInput, parser: DocumentParser): Promise<ExtractionResult<DocumentSourceMap>> {
  const snapshot = snapshotInput(input, parser);
  if (typeof parser.supports !== 'function' || typeof parser.parse !== 'function') contract('DocumentParser must implement supports and parse');
  if (!await parser.supports(callbackInput(snapshot.input))) contract('Document parser does not support this input');
  const result = parseResult(await parser.parse(callbackInput(snapshot.input)));
  if (result.status !== 'succeeded' && result.status !== 'needs_review') return result;
  if (result.sourceMap.artifactId !== snapshot.input.artifactId) contract('DocumentSourceMap artifactId does not match parser input');
  if (result.sourceMap.contentHash !== snapshot.input.contentHash) contract('DocumentSourceMap contentHash does not match parser input');
  if (!equalMetadata(result.sourceMap.parser, snapshot.metadata)) contract('DocumentSourceMap parser metadata does not match selected parser');
  if (result.status === 'succeeded' && result.sourceMap.pages.every((page) => page.blocks.length === 0)) contract('Succeeded DocumentSourceMap must contain at least one block');
  return result;
}
