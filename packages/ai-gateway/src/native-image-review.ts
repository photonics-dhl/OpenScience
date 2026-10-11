import { sha256Text } from './ocr';
import { createHash } from 'node:crypto';
import { snapshotChatMessages, type ChatMessage, type ProviderResult } from './provider';
import type { ScienceReviewInput } from './science-review-protocol';
import { ILLUSTRATION_PLAN_REVIEW_MAX_PROMPT_CHARS } from './science-review-protocol';

export type NativeImageReviewTarget = { provider: string; model: string; promptHash: string };
export type NativeImageReviewSubmission = (input: ScienceReviewInput, target: NativeImageReviewTarget,
  submit: () => Promise<ProviderResult>) => Promise<ProviderResult>;

/** Same canonical messages are used for the actual request, audit and durable checkpoint. */
export function nativeImageReviewMessages(input: ScienceReviewInput): ChatMessage[] {
  const image = input.attachments?.[0];
  if (!('kind' in input.source) || input.source.kind !== 'illustration-image'
    || !['model-native', 'agent-native'].includes(input.illustrationContext?.imageReviewMode ?? '') || input.attachments?.length !== 1
    || !image || image.mediaType === 'application/pdf' || !input.prompt.trim() || input.prompt.length > ILLUSTRATION_PLAN_REVIEW_MAX_PROMPT_CHARS
    || image.sha256 !== input.source.candidateHash
    || createHash('sha256').update(image.bytes).digest('hex') !== image.sha256)
    throw new Error('Native image review input does not match the saved image');
  return snapshotChatMessages([{ role: 'user', content: input.prompt,
    images: [{ mediaType: image.mediaType, data: Buffer.from(image.bytes).toString('base64') }] }]);
}
export function nativeImageReviewPromptHash(input: ScienceReviewInput): string {
  return sha256Text(JSON.stringify(nativeImageReviewMessages(input)));
}
