import { isProxy } from 'node:util/types';

const DOCUMENT_BLOCK_KINDS = [
  'heading',
  'paragraph',
  'figure',
  'table',
  'equation',
  'caption',
  'reference',
] as const;

type DocumentBlockKind = (typeof DOCUMENT_BLOCK_KINDS)[number];

export interface DocumentParserMetadata {
  name: string;
  version: string;
  modelHash?: string;
}

export const PARSER_JOB_SCHEMA_VERSION = 2 as const;
export const PARSER_JOB_RESPONSE_MAX_BYTES = 24 * 1024 * 1024;

export const PARSER_JOB_OPERATIONS = [
  'extract_text',
  'detect_layout',
  'render_page',
  'ocr_page',
  'extract_references',
] as const;

export type ParserJobOperation = (typeof PARSER_JOB_OPERATIONS)[number];

export enum SafeParserErrorCode {
  INVALID_REQUEST = 'invalid_request',
  INVALID_INPUT = 'invalid_input',
  INPUT_TOO_LARGE = 'input_too_large',
  CONTENT_HASH_MISMATCH = 'content_hash_mismatch',
  UNSUPPORTED_OPERATION = 'unsupported_operation',
  PARSER_UNAVAILABLE = 'parser_unavailable',
  PARSER_FAILED = 'parser_failed',
  INVALID_RESPONSE = 'invalid_response',
  RESPONSE_TOO_LARGE = 'response_too_large',
  IDENTITY_MISMATCH = 'identity_mismatch',
  METADATA_MISMATCH = 'metadata_mismatch',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
  IO_FAILED = 'io_failed',
  SERVICE_FAILED = 'service_failed',
}

export enum SafeParserWarningCode {
  OCR_APPLIED = 'ocr_applied',
  LOW_CONFIDENCE = 'low_confidence',
  PARTIAL_RESULT = 'partial_result',
  LAYOUT_AMBIGUOUS = 'layout_ambiguous',
  REFERENCES_INCOMPLETE = 'references_incomplete',
  TRUNCATED_OUTPUT = 'truncated_output',
}

export class ParserJobProtocolError extends Error {
  readonly code: SafeParserErrorCode;

  constructor(code: SafeParserErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ParserJobProtocolError';
    this.code = code;
  }
}

export interface ParserJobOptions {
  pageNumbers?: number[];
  renderDpi?: number;
  languageHints?: string[];
}

export interface ParserJobRequestV2 {
  schemaVersion: 2;
  operation: ParserJobOperation;
  artifactId: string;
  contentHash: string;
  mediaType: string;
  options: ParserJobOptions;
}

export interface StageBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageBlock {
  kind: DocumentBlockKind;
  text?: string;
  boundingBox: StageBoundingBox;
  confidence?: number;
}

export interface StagePage {
  page: number;
  width: number;
  height: number;
  blocks: StageBlock[];
}

export interface ParserStageResult {
  schemaVersion: 2;
  parser: DocumentParserMetadata;
  pages: StagePage[];
  warnings: SafeParserWarningCode[];
}

export type ParserJobResponseV2 =
  | {
    schemaVersion: 2;
    ok: true;
    artifactId: string;
    contentHash: string;
    result: ParserStageResult;
  }
  | {
    schemaVersion: 2;
    ok: false;
    artifactId: string;
    contentHash: string;
    errorCode: SafeParserErrorCode;
  };

type Descriptors = Record<string, PropertyDescriptor>;

interface StringBudget {
  total: number;
}

const MAX_IDENTIFIER_LENGTH = 200;
const MAX_OPTION_PAGES = 1_000;
const MAX_LANGUAGE_HINTS = 16;
const MAX_LANGUAGE_HINT_LENGTH = 32;
const MAX_PAGE_COUNT = 10_000;
const MAX_PAGE_DIMENSION = 100_000;
const MAX_BLOCK_COUNT = 10_000;
const MAX_TEXT_LENGTH = 50_000;
const MAX_TEXT_CHARACTERS = 5_000_000;
const MAX_WARNING_COUNT = 100;
const MAX_SERIALIZED_STRING_CHARACTERS = 8_000_000;
const TEXT_BEARING_KINDS = new Set<DocumentBlockKind>(['heading', 'paragraph', 'caption', 'reference']);
const SAFE_ERROR_CODES = new Set<string>(Object.values(SafeParserErrorCode));
const SAFE_WARNING_CODES = new Set<string>(Object.values(SafeParserWarningCode));
const canonicalResponses = new WeakSet<object>();

function fail(code: SafeParserErrorCode, detail: string): never {
  throw new ParserJobProtocolError(code, detail);
}

function safeObject<T extends Record<string, unknown>>(value: T): T {
  return Object.assign(Object.create(null) as T, value);
}

function safeResponseObject<T extends ParserJobResponseV2>(value: T): T {
  const result = safeObject(value);
  canonicalResponses.add(result);
  return result;
}

function safeArray<T>(values: readonly T[]): T[] {
  const result = Array.from(values);
  Object.defineProperty(result, 'toJSON', { value: undefined, enumerable: false });
  return result;
}

function dataObject(value: unknown, label: string, allowed: readonly string[], code: SafeParserErrorCode): Descriptors {
  if (isProxy(value)) fail(code, `${label} must not be a Proxy`);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    fail(code, `${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as Descriptors;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string' || !allowed.includes(key))) fail(code, `${label} has an unknown field`);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, `${label} must use enumerable data properties`);
    }
  }
  return descriptors;
}

function required(fields: Descriptors, key: string, label: string, code: SafeParserErrorCode): unknown {
  const descriptor = fields[key];
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, `${label} is required and must be a data property`);
  return descriptor.value;
}

function optional(fields: Descriptors, key: string, label: string, code: SafeParserErrorCode): unknown {
  const descriptor = fields[key];
  if (!descriptor) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, `${label} must be a data property`);
  return descriptor.value;
}

function dataArray(value: unknown, label: string, maximum: number, code: SafeParserErrorCode): unknown[] {
  if (isProxy(value)) fail(code, `${label} must not be a Proxy`);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(code, `${label} must be an ordinary array`);
  const descriptors = Object.getOwnPropertyDescriptors(value) as Descriptors;
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) fail(code, `${label} exceeds its maximum length`);
  const values = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, `${label} must not be sparse or contain accessors`);
    }
    values[index] = descriptor.value;
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    if (key === 'toJSON') {
      const descriptor = descriptors.toJSON;
      if (descriptor && !descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === undefined) {
        continue;
      }
    }
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
      fail(code, `${label} has unsupported properties`);
    }
  }
  return values;
}

function boundedString(
  value: unknown,
  label: string,
  maximum: number,
  code: SafeParserErrorCode,
  budget?: StringBudget,
): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || !value.trim()) {
    fail(code, `${label} must be a bounded non-empty string`);
  }
  if (budget) {
    budget.total += value.length;
    if (budget.total > MAX_SERIALIZED_STRING_CHARACTERS) fail(code, 'string budget exceeded');
  }
  return value;
}

function contentHash(value: unknown, code: SafeParserErrorCode): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code, 'contentHash must be a lowercase SHA-256 digest');
  return value;
}

function positiveInteger(value: unknown, label: string, maximum: number, code: SafeParserErrorCode): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    fail(code, `${label} must be a bounded positive integer`);
  }
  return value as number;
}

function positiveFinite(value: unknown, label: string, maximum: number, code: SafeParserErrorCode): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum) {
    fail(code, `${label} must be a bounded positive finite number`);
  }
  return value;
}

function canonicalMetadata(value: unknown, code: SafeParserErrorCode, budget: StringBudget): DocumentParserMetadata {
  const fields = dataObject(value, 'parser metadata', ['name', 'version', 'modelHash'], code);
  const name = boundedString(required(fields, 'name', 'parser name', code), 'parser name', MAX_IDENTIFIER_LENGTH, code, budget);
  const version = boundedString(required(fields, 'version', 'parser version', code), 'parser version', MAX_IDENTIFIER_LENGTH, code, budget);
  const modelHash = optional(fields, 'modelHash', 'parser modelHash', code);
  return safeObject({
    name,
    version,
    ...(modelHash === undefined ? {} : {
      modelHash: boundedString(modelHash, 'parser modelHash', MAX_IDENTIFIER_LENGTH, code, budget),
    }),
  });
}

function canonicalOptions(value: unknown): ParserJobOptions {
  const code = SafeParserErrorCode.INVALID_REQUEST;
  const fields = dataObject(value, 'ParserJobRequestV2 options', ['pageNumbers', 'renderDpi', 'languageHints'], code);
  const rawPageNumbers = optional(fields, 'pageNumbers', 'pageNumbers', code);
  const rawDpi = optional(fields, 'renderDpi', 'renderDpi', code);
  const rawLanguageHints = optional(fields, 'languageHints', 'languageHints', code);
  const pageNumbers = rawPageNumbers === undefined
    ? undefined
    : safeArray(dataArray(rawPageNumbers, 'pageNumbers', MAX_OPTION_PAGES, code).map((entry) => (
      positiveInteger(entry, 'page number', MAX_PAGE_COUNT, code)
    )));
  if (pageNumbers && new Set(pageNumbers).size !== pageNumbers.length) fail(code, 'pageNumbers must be unique');
  let renderDpi: number | undefined;
  if (rawDpi !== undefined) {
    if (!Number.isSafeInteger(rawDpi) || (rawDpi as number) < 72 || (rawDpi as number) > 600) {
      fail(code, 'renderDpi must be an integer between 72 and 600');
    }
    renderDpi = rawDpi as number;
  }
  const languageHints = rawLanguageHints === undefined
    ? undefined
    : safeArray(dataArray(rawLanguageHints, 'languageHints', MAX_LANGUAGE_HINTS, code).map((entry) => (
      boundedString(entry, 'language hint', MAX_LANGUAGE_HINT_LENGTH, code)
    )));
  return safeObject({
    ...(pageNumbers === undefined ? {} : { pageNumbers }),
    ...(renderDpi === undefined ? {} : { renderDpi }),
    ...(languageHints === undefined ? {} : { languageHints }),
  });
}

export function parseParserJobRequestV2(value: unknown): ParserJobRequestV2 {
  const code = SafeParserErrorCode.INVALID_REQUEST;
  const fields = dataObject(
    value,
    'ParserJobRequestV2',
    ['schemaVersion', 'operation', 'artifactId', 'contentHash', 'mediaType', 'options'],
    code,
  );
  if (required(fields, 'schemaVersion', 'schemaVersion', code) !== PARSER_JOB_SCHEMA_VERSION) fail(code, 'schema version mismatch');
  const operation = required(fields, 'operation', 'operation', code);
  if (typeof operation !== 'string' || !PARSER_JOB_OPERATIONS.includes(operation as ParserJobOperation)) {
    fail(code, 'operation is unsupported');
  }
  return safeObject({
    schemaVersion: PARSER_JOB_SCHEMA_VERSION,
    operation: operation as ParserJobOperation,
    artifactId: boundedString(required(fields, 'artifactId', 'artifactId', code), 'artifactId', MAX_IDENTIFIER_LENGTH, code),
    contentHash: contentHash(required(fields, 'contentHash', 'contentHash', code), code),
    mediaType: boundedString(required(fields, 'mediaType', 'mediaType', code), 'mediaType', MAX_IDENTIFIER_LENGTH, code),
    options: canonicalOptions(required(fields, 'options', 'options', code)),
  });
}

function canonicalBoundingBox(value: unknown, page: { width: number; height: number }): StageBoundingBox {
  const code = SafeParserErrorCode.INVALID_RESPONSE;
  const fields = dataObject(value, 'StageBlock boundingBox', ['x', 'y', 'width', 'height'], code);
  const x = required(fields, 'x', 'boundingBox x', code);
  const y = required(fields, 'y', 'boundingBox y', code);
  const width = positiveFinite(required(fields, 'width', 'boundingBox width', code), 'boundingBox width', MAX_PAGE_DIMENSION, code);
  const height = positiveFinite(required(fields, 'height', 'boundingBox height', code), 'boundingBox height', MAX_PAGE_DIMENSION, code);
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || typeof y !== 'number' || !Number.isFinite(y) || y < 0) {
    fail(code, 'boundingBox origin must be finite and non-negative');
  }
  const xTolerance = Number.EPSILON * Math.max(Math.abs(x), width, page.width) * 16;
  const yTolerance = Number.EPSILON * Math.max(Math.abs(y), height, page.height) * 16;
  if (x + width - page.width > xTolerance || y + height - page.height > yTolerance) {
    fail(code, 'boundingBox must be within its page');
  }
  return safeObject({ x, y, width, height });
}

export function parseParserStageResult(value: unknown): ParserStageResult {
  const code = SafeParserErrorCode.INVALID_RESPONSE;
  const fields = dataObject(value, 'ParserStageResult', ['schemaVersion', 'parser', 'pages', 'warnings'], code);
  if (required(fields, 'schemaVersion', 'schemaVersion', code) !== PARSER_JOB_SCHEMA_VERSION) fail(code, 'schema version mismatch');
  const budget: StringBudget = { total: 0 };
  const parser = canonicalMetadata(required(fields, 'parser', 'parser', code), code, budget);
  const rawPages = dataArray(required(fields, 'pages', 'pages', code), 'pages', MAX_PAGE_COUNT, code);
  const pageNumbers = new Set<number>();
  let blockCount = 0;
  let textCharacters = 0;
  const pages = safeArray(rawPages.map((pageValue) => {
    const pageFields = dataObject(pageValue, 'StagePage', ['page', 'width', 'height', 'blocks'], code);
    const pageNumber = positiveInteger(required(pageFields, 'page', 'page number', code), 'page number', MAX_PAGE_COUNT, code);
    if (pageNumbers.has(pageNumber)) fail(code, 'page numbers must be unique');
    pageNumbers.add(pageNumber);
    const page = {
      width: positiveFinite(required(pageFields, 'width', 'page width', code), 'page width', MAX_PAGE_DIMENSION, code),
      height: positiveFinite(required(pageFields, 'height', 'page height', code), 'page height', MAX_PAGE_DIMENSION, code),
    };
    const rawBlocks = dataArray(required(pageFields, 'blocks', 'blocks', code), 'blocks', MAX_BLOCK_COUNT - blockCount, code);
    blockCount += rawBlocks.length;
    const blocks = safeArray(rawBlocks.map((blockValue) => {
      const blockFields = dataObject(blockValue, 'StageBlock', ['kind', 'text', 'boundingBox', 'confidence'], code);
      const kind = required(blockFields, 'kind', 'block kind', code);
      if (typeof kind !== 'string' || !DOCUMENT_BLOCK_KINDS.includes(kind as DocumentBlockKind)) fail(code, 'block kind is unsupported');
      const textValue = optional(blockFields, 'text', 'block text', code);
      const text = textValue === undefined
        ? undefined
        : boundedString(textValue, 'block text', MAX_TEXT_LENGTH, code, budget);
      if (TEXT_BEARING_KINDS.has(kind as DocumentBlockKind) && text === undefined) fail(code, 'text-bearing block requires text');
      if (text !== undefined) {
        textCharacters += text.length;
        if (textCharacters > MAX_TEXT_CHARACTERS) fail(code, 'text character budget exceeded');
      }
      const confidenceValue = optional(blockFields, 'confidence', 'block confidence', code);
      let confidence: number | undefined;
      if (confidenceValue !== undefined) {
        if (typeof confidenceValue !== 'number' || !Number.isFinite(confidenceValue) || confidenceValue < 0 || confidenceValue > 1) {
          fail(code, 'confidence must be between zero and one');
        }
        confidence = confidenceValue;
      }
      return safeObject({
        kind: kind as DocumentBlockKind,
        ...(text === undefined ? {} : { text }),
        boundingBox: canonicalBoundingBox(required(blockFields, 'boundingBox', 'boundingBox', code), page),
        ...(confidence === undefined ? {} : { confidence }),
      });
    }));
    return safeObject({ page: pageNumber, width: page.width, height: page.height, blocks });
  }));
  const warnings = safeArray(dataArray(required(fields, 'warnings', 'warnings', code), 'warnings', MAX_WARNING_COUNT, code).map((warning) => {
    if (typeof warning !== 'string' || !SAFE_WARNING_CODES.has(warning)) fail(code, 'warning is not a safe parser code');
    budget.total += warning.length;
    if (budget.total > MAX_SERIALIZED_STRING_CHARACTERS) fail(code, 'string budget exceeded');
    return warning as SafeParserWarningCode;
  }));
  return safeObject({ schemaVersion: PARSER_JOB_SCHEMA_VERSION, parser, pages, warnings });
}

function canonicalResponse(value: unknown): ParserJobResponseV2 {
  const code = SafeParserErrorCode.INVALID_RESPONSE;
  if (isProxy(value)) fail(code, 'ParserJobResponseV2 must not be a Proxy');
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && !canonicalResponses.has(value))) {
    fail(code, 'ParserJobResponseV2 must be a plain object');
  }
  const okDescriptor = Object.getOwnPropertyDescriptor(value, 'ok');
  if (!okDescriptor || !okDescriptor.enumerable || !Object.prototype.hasOwnProperty.call(okDescriptor, 'value')) {
    fail(code, 'ParserJobResponseV2 ok is required and must be a data property');
  }
  if (okDescriptor.value !== true && okDescriptor.value !== false) fail(code, 'ParserJobResponseV2 ok must be boolean');
  const allowed = okDescriptor.value
    ? ['schemaVersion', 'ok', 'artifactId', 'contentHash', 'result']
    : ['schemaVersion', 'ok', 'artifactId', 'contentHash', 'errorCode'];
  const fields = dataObject(value, 'ParserJobResponseV2', allowed, code);
  if (required(fields, 'schemaVersion', 'schemaVersion', code) !== PARSER_JOB_SCHEMA_VERSION) fail(code, 'schema version mismatch');
  const artifactId = boundedString(required(fields, 'artifactId', 'artifactId', code), 'artifactId', MAX_IDENTIFIER_LENGTH, code);
  const hash = contentHash(required(fields, 'contentHash', 'contentHash', code), code);
  if (okDescriptor.value === true) {
    return safeResponseObject({
      schemaVersion: PARSER_JOB_SCHEMA_VERSION,
      ok: true,
      artifactId,
      contentHash: hash,
      result: parseParserStageResult(required(fields, 'result', 'result', code)),
    });
  }
  const errorCode = required(fields, 'errorCode', 'errorCode', code);
  if (typeof errorCode !== 'string' || !SAFE_ERROR_CODES.has(errorCode)) fail(code, 'errorCode is not a safe parser code');
  return safeResponseObject({
    schemaVersion: PARSER_JOB_SCHEMA_VERSION,
    ok: false,
    artifactId,
    contentHash: hash,
    errorCode: errorCode as SafeParserErrorCode,
  });
}

function assertSerializedSize(serialized: string): void {
  if (Buffer.byteLength(serialized) > PARSER_JOB_RESPONSE_MAX_BYTES) {
    fail(SafeParserErrorCode.RESPONSE_TOO_LARGE, 'response exceeds byte ceiling');
  }
}

export function serializeParserJobRequestV2(value: unknown): string {
  return JSON.stringify(parseParserJobRequestV2(value));
}

export function serializeParserJobResponseV2(value: unknown): string {
  const serialized = JSON.stringify(canonicalResponse(value));
  assertSerializedSize(serialized);
  return serialized;
}

export function deserializeParserJobResponseV2(
  serialized: string | Buffer,
  expectedRequest: ParserJobRequestV2,
  expectedParser?: DocumentParserMetadata,
): ParserJobResponseV2 {
  const byteLength = typeof serialized === 'string' ? Buffer.byteLength(serialized) : serialized.byteLength;
  if (byteLength > PARSER_JOB_RESPONSE_MAX_BYTES) fail(SafeParserErrorCode.RESPONSE_TOO_LARGE, 'response exceeds byte ceiling');
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof serialized === 'string' ? serialized : serialized.toString('utf8'));
  } catch {
    fail(SafeParserErrorCode.INVALID_RESPONSE, 'response JSON is invalid');
  }
  const response = canonicalResponse(parsed);
  if (response.artifactId !== expectedRequest.artifactId || response.contentHash !== expectedRequest.contentHash) {
    fail(SafeParserErrorCode.IDENTITY_MISMATCH, 'response identity does not match request');
  }
  if (response.ok && expectedParser && (
    response.result.parser.name !== expectedParser.name
    || response.result.parser.version !== expectedParser.version
    || response.result.parser.modelHash !== expectedParser.modelHash
  )) {
    fail(SafeParserErrorCode.METADATA_MISMATCH, 'response parser metadata does not match selected parser');
  }
  return response;
}
