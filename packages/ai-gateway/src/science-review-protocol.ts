import { sha256Text, type OcrAuthorizationContext, type OcrSourceIdentity, type OcrMediaType } from './ocr';

// Leave room for the browser runner's fixed safety preface inside ChatGPT's
// 64 KiB submission boundary.
export const SCIENCE_REVIEW_MAX_PROMPT_CHARS = 60 * 1024;
// Plan reviews use the text pool, with the existing illustration planning input bound.
// They do not pass through the browser submission protocol above.
export const ILLUSTRATION_PLAN_REVIEW_MAX_PROMPT_CHARS = 100_000;
export const SCIENCE_REVIEW_MAX_RESPONSE_BYTES = 64 * 1024;
export const SCIENCE_REVIEW_MAX_JSON_BYTES = 96 * 1024;
export const SCIENCE_REVIEW_MAX_DEADLINE_MS = 1_800_000;
export const SCIENCE_REVIEW_READY_MAX_AGE_MS = 60_000;
export const SCIENCE_REVIEW_MAX_ATTACHMENTS = 8;
export const SCIENCE_REVIEW_MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
/** Schema 3 only: one unchanged image, matching the existing generation byte limit. */
export const ILLUSTRATION_IMAGE_REVIEW_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ILLUSTRATION_IMAGE_REVIEW_MAX_EDGE = 8192;
export const ILLUSTRATION_IMAGE_REVIEW_MAX_PIXELS = 40_000_000;
export const SCIENCE_REVIEW_MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024;
export const SCIENCE_REVIEW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ScienceReviewSource extends OcrSourceIdentity {
  candidateHash: string;
  sourceMapHash: string;
}

export interface IllustrationReviewSource {
  kind: 'illustration-plan';
  researchObjectId: string;
  versionId: string;
  sourceEvidenceIdentity: string;
  candidateHash: string;
}

export interface IllustrationImageReviewSource extends Omit<IllustrationReviewSource, 'kind'> {
  kind: 'illustration-image';
}

export interface ScienceReviewImageAttachmentRecord {
  fileName: string;
  mediaType: 'image/png';
  pageNumber: number;
  width: number;
  height: number;
  sha256: string;
}

export interface IllustrationImageReviewAttachmentRecord extends Omit<ScienceReviewImageAttachmentRecord, 'mediaType'> {
  mediaType: OcrMediaType;
}

export interface ScienceReviewDocumentAttachmentRecord {
  fileName: 'source.pdf';
  mediaType: 'application/pdf';
  sha256: string;
}

export type ScienceReviewAttachmentRecord = ScienceReviewImageAttachmentRecord | ScienceReviewDocumentAttachmentRecord | IllustrationImageReviewAttachmentRecord;
export type ScienceReviewAttachment = ScienceReviewAttachmentRecord & { bytes: Uint8Array };

export interface ScienceReviewInput {
  requestId: string;
  authorizationContext: OcrAuthorizationContext;
  source: ScienceReviewSource | IllustrationReviewSource | IllustrationImageReviewSource;
  prompt: string;
  attachments?: readonly ScienceReviewAttachment[];
  /** Worker-only authorization snapshot; never serialized into the review job. */
  illustrationContext?: {
    executionAttempt: number;
    claimContent: string;
    baseIdentity: string | null;
    /** An explicitly authorized same-task correction must not switch key/model on failure. */
    primaryProviderOnly?: true;
    /** Existing output-resume receipt, checked by the worker before each plan-review provider attempt. */
    outputResumeReceiptId?: string;
    /** Explicit saved-plan continuation; the worker replays its immutable receipt before each paid call. */
    outputResumeMode?: 'saved-final-review';
    outputResumeTarget?: { provider: string; model: string; promptHash: string };
    /** Gateway-supplied attempt within this review invocation, for exact audit-history replay. */
    outputResumeSubmissionAttempt?: number;
  };
}

interface ScienceReviewRequestBase {
  provider: 'chatgpt-web-science-review';
  id: string;
  prompt: string;
  promptHash: string;
  createdAt: number;
  deadlineAt: number;
}

export type ScienceReviewRequest = ScienceReviewRequestBase & (
  | { schemaVersion: 1; source: ScienceReviewSource; attachments?: Array<ScienceReviewImageAttachmentRecord | ScienceReviewDocumentAttachmentRecord> }
  | { schemaVersion: 2; source: IllustrationReviewSource; attachments?: never }
  | { schemaVersion: 3; source: IllustrationImageReviewSource; attachments: [IllustrationImageReviewAttachmentRecord] }
);

export type ScienceReviewErrorCode = 'EXECUTION_FAILED' | 'UNCERTAIN' | 'EXPIRED' | 'INVALID_OUTPUT';
export interface ScienceReviewResultRecord {
  schemaVersion: 1;
  provider: 'chatgpt-web-science-review';
  id: string;
  promptHash: string;
  responseHash?: string;
  status: 'succeeded' | 'failed' | 'uncertain';
  errorCode?: ScienceReviewErrorCode;
}

export interface ScienceReviewProviderResult {
  text: string;
  promptHash: string;
  responseHash: string;
  /** Actual execution metadata; legacy browser receipts omit these fields. */
  provider?: string;
  model?: string;
}

export interface ScienceReviewProvider {
  readonly name: string;
  readonly model: string;
  review(input: ScienceReviewInput): Promise<ScienceReviewProviderResult>;
  /** Consume an exact saved image-review response without publishing another request. */
  resumeFromCompletedResult?(input: ScienceReviewInput): Promise<ScienceReviewProviderResult>;
}

const invalid = (): never => { throw new Error('INVALID_OUTPUT'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function validSource(value: unknown): value is ScienceReviewSource {
  const source = record(value);
  return Object.keys(source).sort().join(',') === 'artifactId,candidateHash,documentSha256,sourceMapHash'
    && typeof source.artifactId === 'string' && source.artifactId.length > 0 && source.artifactId.length <= 256
    && hash(source.documentSha256) && hash(source.candidateHash) && hash(source.sourceMapHash);
}

function validIllustrationSource(value: unknown, kind: 'illustration-plan' | 'illustration-image'): value is IllustrationReviewSource | IllustrationImageReviewSource {
  const source = record(value);
  return Object.keys(source).sort().join(',') === 'candidateHash,kind,researchObjectId,sourceEvidenceIdentity,versionId'
    && source.kind === kind
    && typeof source.researchObjectId === 'string' && SCIENCE_REVIEW_ID_PATTERN.test(source.researchObjectId)
    && typeof source.versionId === 'string' && SCIENCE_REVIEW_ID_PATTERN.test(source.versionId)
    && hash(source.sourceEvidenceIdentity) && hash(source.candidateHash);
}

function validAttachment(value: unknown, imageReview = false): value is ScienceReviewAttachmentRecord {
  const attachment = record(value);
  if (attachment.mediaType === 'application/pdf') {
    return !imageReview && Object.keys(attachment).sort().join(',') === 'fileName,mediaType,sha256'
      && attachment.fileName === 'source.pdf' && hash(attachment.sha256);
  }
  return Object.keys(attachment).sort().join(',') === 'fileName,height,mediaType,pageNumber,sha256,width'
    && typeof attachment.fileName === 'string'
    && (imageReview ? (attachment.mediaType === 'image/png' && attachment.fileName === 'page-1.png')
      || (attachment.mediaType === 'image/jpeg' && attachment.fileName === 'page-1.jpg')
      || (attachment.mediaType === 'image/webp' && attachment.fileName === 'page-1.webp')
      : attachment.mediaType === 'image/png' && /^page-[1-9][0-9]{0,4}\.png$/u.test(attachment.fileName))
    && Number.isSafeInteger(attachment.pageNumber) && (attachment.pageNumber as number) > 0
    && Number.isSafeInteger(attachment.width) && (attachment.width as number) > 0 && (attachment.width as number) <= 8192
    && Number.isSafeInteger(attachment.height) && (attachment.height as number) > 0 && (attachment.height as number) <= 8192
    && (attachment.width as number) * (attachment.height as number) <= 40_000_000 && hash(attachment.sha256);
}

export function validateScienceReviewRequest(value: unknown, now?: number): ScienceReviewRequest {
  const v = record(value);
  const keys = Object.keys(v).sort().join(',');
  const attachments = v.attachments === undefined ? undefined : v.attachments;
  if (!['createdAt,deadlineAt,id,prompt,promptHash,provider,schemaVersion,source', 'attachments,createdAt,deadlineAt,id,prompt,promptHash,provider,schemaVersion,source'].includes(keys)
    || ![1, 2, 3].includes(v.schemaVersion as number) || v.provider !== 'chatgpt-web-science-review'
    || typeof v.id !== 'string' || !SCIENCE_REVIEW_ID_PATTERN.test(v.id)
    || typeof v.prompt !== 'string' || !v.prompt.trim() || v.prompt.length > SCIENCE_REVIEW_MAX_PROMPT_CHARS
    || !hash(v.promptHash) || sha256Text(v.prompt) !== v.promptHash
    || !Number.isSafeInteger(v.createdAt) || (v.createdAt as number) < 0
    || !Number.isSafeInteger(v.deadlineAt) || (v.deadlineAt as number) <= (v.createdAt as number)
    || (v.deadlineAt as number) - (v.createdAt as number) > SCIENCE_REVIEW_MAX_DEADLINE_MS
    || (v.schemaVersion === 1 ? !validSource(v.source)
      : v.schemaVersion === 2 ? !validIllustrationSource(v.source, 'illustration-plan') || Object.hasOwn(v, 'attachments')
      : !validIllustrationSource(v.source, 'illustration-image') || !Array.isArray(attachments) || attachments.length !== 1
        || attachments[0]?.pageNumber !== 1
        || attachments[0]?.sha256 !== record(v.source).candidateHash)
    || (attachments !== undefined && (!Array.isArray(attachments) || attachments.length < 1
      || attachments.length > SCIENCE_REVIEW_MAX_ATTACHMENTS || !attachments.every(attachment => validAttachment(attachment, v.schemaVersion === 3))
      || new Set(attachments.map((attachment) => attachment.fileName)).size !== attachments.length
      || new Set(attachments.filter((attachment): attachment is ScienceReviewImageAttachmentRecord => attachment.mediaType === 'image/png').map((attachment) => attachment.pageNumber)).size
        !== attachments.filter((attachment) => attachment.mediaType === 'image/png').length))) return invalid();
  if (now !== undefined && ((v.deadlineAt as number) <= now || (v.createdAt as number) > now)) throw new Error('EXPIRED');
  return v as unknown as ScienceReviewRequest;
}

export function validateScienceReviewResult(value: unknown): ScienceReviewResultRecord {
  const v = record(value);
  if (Object.keys(v).some((key) => !['schemaVersion', 'provider', 'id', 'promptHash', 'responseHash', 'status', 'errorCode'].includes(key))
    || v.schemaVersion !== 1 || v.provider !== 'chatgpt-web-science-review'
    || typeof v.id !== 'string' || !SCIENCE_REVIEW_ID_PATTERN.test(v.id) || !hash(v.promptHash)
    || !['succeeded', 'failed', 'uncertain'].includes(String(v.status))
    || (v.status === 'succeeded' ? !hash(v.responseHash) || v.errorCode !== undefined : v.responseHash !== undefined)
    || (v.errorCode !== undefined && !['EXECUTION_FAILED', 'UNCERTAIN', 'EXPIRED', 'INVALID_OUTPUT'].includes(String(v.errorCode)))) return invalid();
  return v as unknown as ScienceReviewResultRecord;
}
