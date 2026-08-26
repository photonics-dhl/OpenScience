import { createHash } from 'node:crypto';

import { AiGatewayError } from './errors';

export const OCR_PROMPT_VERSION = 'openscience-ocr-v1';
export const DEFAULT_OCR_LIMITS: Readonly<OcrLimits> = Object.freeze({
  maxPages: 4,
  maxPageBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
  maxDimension: 8192,
  maxPixels: 40_000_000,
  maxOutputChars: 1_000_000,
});

export type OcrMediaType = 'image/jpeg' | 'image/png' | 'image/webp';
export type OcrSelectionReason = 'low_confidence' | 'formula' | 'complex_table' | 'layout_failure';
export type ProviderCapability = 'text' | 'ocr';

export interface OcrLimits {
  maxPages: number;
  maxPageBytes: number;
  maxTotalBytes: number;
  maxDimension: number;
  maxPixels: number;
  maxOutputChars: number;
}

export interface OcrAuthorizationContext {
  taskId: string;
  workspaceId: string;
  actorId: string;
}

export interface OcrSourceIdentity {
  artifactId: string;
  documentSha256: string;
}

export interface OcrPageInput {
  pageNumber: number;
  mediaType: OcrMediaType;
  bytes: Uint8Array;
  width: number;
  height: number;
  selectionReason: OcrSelectionReason;
}

export interface OcrRequest {
  authorizationContext: OcrAuthorizationContext;
  source: OcrSourceIdentity;
  pages: OcrPageInput[];
}

export interface OcrProviderPageRequest extends OcrPageInput {
  prompt: string;
  promptHash: string;
  inputContentHash: string;
}

export interface OcrProviderResult {
  text: string;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
  actualCostUsdMicros?: number | null;
}

export interface OcrCostEstimate {
  inputTokens: number | null;
  outputTokens: number | null;
  costUsdMicros: number | null;
  currency: 'USD';
  pricingVersion: string;
  effectiveDate: string | null;
  serviceTier: string;
}

export interface OcrProvider {
  readonly name: string;
  readonly model: string;
  estimate(request: OcrProviderPageRequest): OcrCostEstimate;
  recognize(request: OcrProviderPageRequest): Promise<OcrProviderResult>;
}

export interface ProviderCapabilityDecision {
  enabled: boolean;
  reason?: string;
}

export interface ProviderCapabilityPolicy {
  isEnabled(provider: string, capability: ProviderCapability): ProviderCapabilityDecision | Promise<ProviderCapabilityDecision>;
}

export type ExternalProcessingPolicy = (context: Readonly<OcrAuthorizationContext>) => boolean | Promise<boolean>;

export interface OcrCandidate {
  text: string;
  source: 'llm_ocr_candidate';
  provider: string;
  model: string;
  pageNumber: number;
  bbox: { x: 0; y: 0; width: number; height: number };
  selectionReason: OcrSelectionReason;
  promptVersion: typeof OCR_PROMPT_VERSION;
  promptHash: string;
  inputContentHash: string;
  artifactId: string;
  documentSha256: string;
  fallbackReason?: string;
}

export type OcrPageOutcome =
  | { status: 'succeeded'; pageNumber: number; candidate: OcrCandidate }
  | { status: 'failed'; pageNumber: number; code: 'providers_unavailable'; retryable: true };

export interface OcrResult {
  status: 'succeeded' | 'partial' | 'failed';
  source: OcrSourceIdentity;
  inputContentHash: string;
  pages: OcrPageOutcome[];
}

export type OcrProviderErrorCode =
  | 'provider_http'
  | 'provider_status'
  | 'provider_timeout'
  | 'provider_response_invalid'
  | 'provider_error';

export class OcrProviderError extends Error {
  constructor(readonly code: OcrProviderErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

const PROMPTS: Readonly<Record<OcrSelectionReason, string>> = Object.freeze({
  low_confidence: `${OCR_PROMPT_VERSION}: Extract all visible text exactly. Preserve reading order and line breaks. Do not infer missing text.`,
  formula: `${OCR_PROMPT_VERSION}: Transcribe visible text and mathematical notation exactly. Preserve equation structure. Do not solve or reinterpret it.`,
  complex_table: `${OCR_PROMPT_VERSION}: Transcribe the visible table faithfully. Preserve headers, row and column relationships, units and footnotes. Do not invent cells.`,
  layout_failure: `${OCR_PROMPT_VERSION}: Extract all visible text exactly and preserve columns, headings, captions and reading order. Do not infer missing text.`,
});

const MEDIA_MAGIC: Readonly<Record<OcrMediaType, readonly number[]>> = Object.freeze({
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
});

const ALLOWED_REASONS = new Set<OcrSelectionReason>(Object.keys(PROMPTS) as OcrSelectionReason[]);
const ALLOWED_MEDIA = new Set<OcrMediaType>(Object.keys(MEDIA_MAGIC) as OcrMediaType[]);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REASON = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function ocrPromptFor(reason: OcrSelectionReason): string {
  const prompt = PROMPTS[reason];
  if (!prompt) throw new AiGatewayError('OCR_REQUEST_INVALID', 'unsupported OCR selection reason');
  return prompt;
}

export class MutableProviderKillSwitch implements ProviderCapabilityPolicy {
  private readonly disabled = new Map<string, string>();

  disable(provider: string, reason = 'operator_disabled'): void {
    assertSafeIdentifier(provider, 'provider');
    if (!SAFE_REASON.test(reason)) throw new AiGatewayError('OCR_REQUEST_INVALID', 'invalid kill-switch reason');
    this.disabled.set(provider, reason);
  }

  enable(provider: string): void {
    this.disabled.delete(provider);
  }

  isEnabled(provider: string): ProviderCapabilityDecision {
    const reason = this.disabled.get(provider);
    return reason ? { enabled: false, reason } : { enabled: true };
  }
}

interface CanonicalOcrPage extends OcrPageInput {
  contentHash: string;
}

interface CanonicalOcrRequest {
  authorizationContext: OcrAuthorizationContext;
  source: OcrSourceIdentity;
  pages: CanonicalOcrPage[];
  inputContentHash: string;
}

export function validateAndSnapshotOcrRequest(request: OcrRequest, overrides: Partial<OcrLimits> = {}): CanonicalOcrRequest {
  const limits = resolveOcrLimits(overrides);
  assertPlainExactObject(request, ['authorizationContext', 'source', 'pages'], 'OCR request');
  assertPlainExactObject(request.authorizationContext, ['taskId', 'workspaceId', 'actorId'], 'OCR authorization context');
  assertPlainExactObject(request.source, ['artifactId', 'documentSha256'], 'OCR source');
  for (const [key, value] of Object.entries(request.authorizationContext)) assertSafeIdentifier(value, `authorization ${key}`);
  assertSafeIdentifier(request.source.artifactId, 'artifactId');
  if (!SHA256.test(request.source.documentSha256)) throw new AiGatewayError('OCR_REQUEST_INVALID', 'invalid document SHA-256');
  if (!Array.isArray(request.pages) || request.pages.length === 0 || request.pages.length > limits.maxPages) {
    throw new AiGatewayError('OCR_REQUEST_INVALID', 'OCR page selection is empty or exceeds limit');
  }

  let totalBytes = 0;
  const selected = new Set<number>();
  const pages = request.pages.map((page): CanonicalOcrPage => {
    assertPlainExactObject(page, ['pageNumber', 'mediaType', 'bytes', 'width', 'height', 'selectionReason'], 'OCR page');
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > 1_000_000 || selected.has(page.pageNumber)) {
      throw new AiGatewayError('OCR_REQUEST_INVALID', 'invalid or duplicate OCR page number');
    }
    selected.add(page.pageNumber);
    if (!ALLOWED_MEDIA.has(page.mediaType)) throw new AiGatewayError('OCR_REQUEST_INVALID', 'unsupported OCR media type');
    if (!ALLOWED_REASONS.has(page.selectionReason)) throw new AiGatewayError('OCR_REQUEST_INVALID', 'unsupported OCR selection reason');
    if (!(page.bytes instanceof Uint8Array) || page.bytes.byteLength === 0 || page.bytes.byteLength > limits.maxPageBytes) {
      throw new AiGatewayError('OCR_REQUEST_INVALID', 'OCR page size limit exceeded');
    }
    const encodedDimensions = encodedImageDimensions(page.mediaType, page.bytes);
    if (!Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height) || page.width < 1 || page.height < 1 ||
      page.width > limits.maxDimension || page.height > limits.maxDimension || page.width * page.height > limits.maxPixels) {
      throw new AiGatewayError('OCR_REQUEST_INVALID', 'invalid OCR page dimensions');
    }
    if (page.width !== encodedDimensions.width || page.height !== encodedDimensions.height) {
      throw new AiGatewayError('OCR_REQUEST_INVALID', 'OCR page dimensions do not match encoded image');
    }
    totalBytes += page.bytes.byteLength;
    if (totalBytes > limits.maxTotalBytes) throw new AiGatewayError('OCR_REQUEST_INVALID', 'OCR request byte limit exceeded');
    const bytes = Uint8Array.from(page.bytes);
    return {
      pageNumber: page.pageNumber,
      mediaType: page.mediaType,
      bytes,
      width: page.width,
      height: page.height,
      selectionReason: page.selectionReason,
      contentHash: hashPage(bytes, page),
    };
  });

  const aggregate = createHash('sha256');
  for (const item of pages) aggregate.update(`${item.pageNumber}\0${item.contentHash}\0`, 'utf8');
  return {
    authorizationContext: { ...request.authorizationContext },
    source: { ...request.source },
    pages,
    inputContentHash: aggregate.digest('hex'),
  };
}

export function validateProviderPageRequest(request: OcrProviderPageRequest, maxPageBytes: number): void {
  if (!ALLOWED_MEDIA.has(request.mediaType)) throw new OcrProviderError('provider_error', 'unsupported OCR media type');
  if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0 || request.bytes.byteLength > maxPageBytes) {
    throw new OcrProviderError('provider_error', 'OCR page size limit exceeded');
  }
  const encodedDimensions = encodedImageDimensions(request.mediaType, request.bytes, true);
  if (!Number.isSafeInteger(request.width) || !Number.isSafeInteger(request.height) ||
    request.width !== encodedDimensions.width || request.height !== encodedDimensions.height) {
    throw new OcrProviderError('provider_error', 'OCR page dimensions do not match encoded image');
  }
  if (!SHA256.test(request.promptHash) || !SHA256.test(request.inputContentHash)) {
    throw new OcrProviderError('provider_error', 'invalid OCR request hash');
  }
}

export function validateCostEstimate(value: OcrCostEstimate): OcrCostEstimate {
  assertPlainExactObject(value, ['inputTokens', 'outputTokens', 'costUsdMicros', 'currency', 'pricingVersion', 'effectiveDate', 'serviceTier'], 'OCR cost estimate');
  for (const field of ['inputTokens', 'outputTokens', 'costUsdMicros'] as const) assertNullableNonNegativeInteger(value[field], field);
  if (value.currency !== 'USD' || !SAFE_IDENTIFIER.test(value.pricingVersion) || !SAFE_IDENTIFIER.test(value.serviceTier)) {
    throw new OcrProviderError('provider_response_invalid', 'invalid OCR pricing metadata');
  }
  if (value.effectiveDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveDate)) {
    throw new OcrProviderError('provider_response_invalid', 'invalid OCR pricing effective date');
  }
  return { ...value };
}

export function canonicalizeProviderResult(value: OcrProviderResult, maxOutputChars: number): Required<OcrProviderResult> {
  assertPlainExactObject(value, ['text', 'usage', 'actualCostUsdMicros'], 'OCR provider result', true);
  if (typeof value.text !== 'string' || value.text.trim().length === 0 || value.text.length > maxOutputChars) {
    throw new OcrProviderError('provider_response_invalid', 'invalid OCR provider text');
  }
  const usage = value.usage ?? { inputTokens: null, outputTokens: null };
  assertPlainExactObject(usage, ['inputTokens', 'outputTokens'], 'OCR provider usage');
  assertNullableNonNegativeInteger(usage.inputTokens, 'inputTokens');
  assertNullableNonNegativeInteger(usage.outputTokens, 'outputTokens');
  const actualCostUsdMicros = value.actualCostUsdMicros ?? null;
  assertNullableNonNegativeInteger(actualCostUsdMicros, 'actualCostUsdMicros');
  return { text: value.text, usage: { ...usage }, actualCostUsdMicros };
}

export function normalizeOcrProviderError(error: unknown): OcrProviderErrorCode {
  return error instanceof OcrProviderError ? error.code : 'provider_error';
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function resolveOcrLimits(overrides: Partial<OcrLimits>): OcrLimits {
  const limits = { ...DEFAULT_OCR_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new AiGatewayError('OCR_REQUEST_INVALID', `invalid OCR limit ${name}`);
  }
  return limits;
}

function hashPage(bytes: Uint8Array, page: Pick<OcrPageInput, 'pageNumber' | 'mediaType' | 'width' | 'height' | 'selectionReason'>): string {
  const hash = createHash('sha256');
  hash.update(`${page.pageNumber}\0${page.mediaType}\0${page.width}\0${page.height}\0${page.selectionReason}\0${bytes.byteLength}\0`, 'utf8');
  hash.update(bytes);
  return hash.digest('hex');
}

function encodedImageDimensions(mediaType: OcrMediaType, bytes: Uint8Array, providerError = false): { width: number; height: number } {
  const invalid = (): never => {
    if (providerError) throw new OcrProviderError('provider_error', 'invalid OCR image structure');
    throw new AiGatewayError('OCR_REQUEST_INVALID', 'invalid OCR image structure');
  };
  const prefix = MEDIA_MAGIC[mediaType];
  if (!prefix.every((value, index) => bytes[index] === value)) invalid();

  if (mediaType === 'image/png') {
    if (bytes.byteLength < 24 || readU32Be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') invalid();
    const width = readU32Be(bytes, 16);
    const height = readU32Be(bytes, 20);
    if (width < 1 || height < 1) invalid();
    return { width, height };
  }

  if (mediaType === 'image/jpeg') {
    let offset = 2;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset < bytes.byteLength) {
      while (offset < bytes.byteLength && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.byteLength) invalid();
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) invalid();
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.byteLength) invalid();
      const length = readU16Be(bytes, offset);
      if (length < 2 || offset + length > bytes.byteLength) invalid();
      if (sofMarkers.has(marker)) {
        if (length < 7) invalid();
        const height = readU16Be(bytes, offset + 3);
        const width = readU16Be(bytes, offset + 5);
        if (width < 1 || height < 1) invalid();
        return { width, height };
      }
      offset += length;
    }
    return invalid();
  }

  if (bytes.byteLength < 25 || ascii(bytes, 8, 4) !== 'WEBP' || readU32Le(bytes, 4) !== bytes.byteLength - 8) invalid();
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    if (bytes.byteLength < 30) invalid();
    return { width: 1 + readU24Le(bytes, 24), height: 1 + readU24Le(bytes, 27) };
  }
  if (chunk === 'VP8L') {
    if (bytes.byteLength < 25 || bytes[20] !== 0x2f) invalid();
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  if (chunk === 'VP8 ') {
    if (bytes.byteLength < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) invalid();
    const width = readU16Le(bytes, 26) & 0x3fff;
    const height = readU16Le(bytes, 28) & 0x3fff;
    if (width < 1 || height < 1) invalid();
    return { width, height };
  }
  return invalid();
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readU16Be(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x100 + bytes[offset + 1];
}

function readU16Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100;
}

function readU24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000;
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 + bytes[offset + 2] * 0x100 + bytes[offset + 3];
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000 + bytes[offset + 3] * 0x1000000;
}

function assertPlainExactObject(value: unknown, keys: readonly string[], label: string, allowMissing = false): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new AiGatewayError('OCR_REQUEST_INVALID', `${label} must be a plain object`);
  }
  const actual = Object.keys(value);
  if (actual.some((key) => !keys.includes(key)) || (!allowMissing && keys.some((key) => !actual.includes(key)))) {
    throw new AiGatewayError('OCR_REQUEST_INVALID', `${label} contains unknown or missing fields`);
  }
}

function assertSafeIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) throw new AiGatewayError('OCR_REQUEST_INVALID', `invalid ${label}`);
}

function assertNullableNonNegativeInteger(value: unknown, label: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)) {
    throw new OcrProviderError('provider_response_invalid', `invalid ${label}`);
  }
}
