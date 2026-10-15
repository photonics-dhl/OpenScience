import { sha256Text } from './ocr';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { snapshotChatMessages, TextProviderError, NATIVE_IMAGE_REQUEST_MAX_BYTES,
  type ChatMessage, type ProviderResult, type TextGenerationOptions } from './provider';
import { snapshotToolDefinitions, anthropicMessages, type ChatToolDefinition } from './native-tool-protocol';
import type { ScienceReviewInput } from './science-review-protocol';
import { ILLUSTRATION_PLAN_REVIEW_MAX_PROMPT_CHARS } from './science-review-protocol';

export type NativeImageReviewTarget = { provider: string; model: string; promptHash: string };
export type NativeImageReviewSubmission = (input: ScienceReviewInput, target: NativeImageReviewTarget,
  submit: () => Promise<ProviderResult>) => Promise<ProviderResult>;

export const NATIVE_IMAGE_REVIEW_RESULT_POLICY = 'image-review-tool-final-v1' as const;
export type PreparedNativeImageReviewTurn = {
  policy: typeof NATIVE_IMAGE_REVIEW_RESULT_POLICY;
  target: NativeImageReviewTarget;
  messages: ChatMessage[];
  tools: readonly ChatToolDefinition[];
  toolChoice: { type: 'tool'; name: 'image_review_result' };
  generation: Omit<TextGenerationOptions, 'tools'>;
};
export type SavedPreparedNativeImageReviewTurn = Omit<PreparedNativeImageReviewTurn, 'messages'> & { messagesFrom: 'request.messages' };
export type ReceivedImageReviewReply = {
  policy: typeof NATIVE_IMAGE_REVIEW_RESULT_POLICY;
  provider: string;
  status: number;
  body: string;
  decoded?: ProviderResult;
  /** Invalid UTF-8 only: exact captured bounded bytes; body is empty and decoded is absent. */
  rawBodyBase64?: string;
};
export type NativeImageReviewValidatedFinal = {
  policy: typeof NATIVE_IMAGE_REVIEW_RESULT_POLICY;
  rawCheckpoint: string;
  turnOrdinal: number;
  resultToolCallId: string;
  text: string;
  responseHash: string;
};
export type NativeImageReviewDecision = { decision: 'accepted' | 'blocked'; summary: string; repairInstruction: string | null };
export const NATIVE_IMAGE_REVIEW_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: object, allowed: string[]) => Object.keys(v).every(key => allowed.includes(key));
const tokens = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function invalid(): never { throw new TextProviderError('provider_response_shape', 'Invalid native image review protocol'); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const resultTool: ChatToolDefinition = freeze({ type: 'function', function: {
  name: 'image_review_result', description: 'Return the final image review decision. This is an output format, not an executable tool.',
  parameters: { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'repairInstruction'],
    properties: { decision: { type: 'string', enum: ['accepted', 'blocked'] }, summary: { type: 'string', minLength: 1, maxLength: 2000 },
      repairInstruction: { anyOf: [{ type: 'null' }, { type: 'string', minLength: 1, maxLength: 400 }] } },
    allOf: [{ if: { properties: { decision: { const: 'accepted' } } }, then: { properties: { repairInstruction: { type: 'null' } } } }],
  },
} });

/** Exact values, including whitespace and escapes, remain model-authored. */
export function readNativeImageReviewDecision(value: unknown): NativeImageReviewDecision {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'decision,repairInstruction,summary'
    || value.decision !== 'accepted' && value.decision !== 'blocked'
    || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 2000
    || (value.repairInstruction !== null && (typeof value.repairInstruction !== 'string' || !value.repairInstruction.trim() || value.repairInstruction.length > 400))
    || value.decision === 'accepted' && value.repairInstruction !== null) return invalid();
  return { decision: value.decision as NativeImageReviewDecision['decision'], summary: value.summary,
    repairInstruction: value.repairInstruction as string | null };
}

function checkGeneration(value: unknown): asserts value is PreparedNativeImageReviewTurn['generation'] {
  if (!object(value) || !keys(value, ['maxTokens', 'timeoutMs', 'maxRequestBytes', 'thinking', 'temperature', 'topP'])
    || !tokens(value.maxTokens) || value.maxTokens < 1 || !tokens(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 600000
    || !tokens(value.maxRequestBytes) || value.maxRequestBytes < 1 || value.maxRequestBytes > NATIVE_IMAGE_REQUEST_MAX_BYTES
    || value.thinking !== undefined && value.thinking !== 'adaptive' && value.thinking !== 'disabled'
    || [value.temperature, value.topP].some(n => n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1))) return invalid();
}

/** Complete identity of the actual v1 request, without its own hash. Legacy hashes are untouched. */
export function nativeImageReviewTurnPromptHash(prepared: PreparedNativeImageReviewTurn): string {
  return sha256Text(JSON.stringify({ policy: prepared.policy,
    target: { provider: prepared.target.provider, model: prepared.target.model }, messages: prepared.messages,
    tools: prepared.tools, toolChoice: prepared.toolChoice, generation: prepared.generation }));
}

/** Internal builder; only the Gateway binds this snapshot to the trusted role. */
export function prepareNativeImageReviewDescriptor(messages: ChatMessage[], opts: TextGenerationOptions,
  target: Pick<NativeImageReviewTarget, 'provider' | 'model'>): PreparedNativeImageReviewTurn {
  if (!keys(opts, ['tools', 'maxTokens', 'timeoutMs', 'maxRequestBytes', 'thinking', 'temperature', 'topP'])) return invalid();
  const tools = snapshotToolDefinitions(opts.tools) ?? [];
  if (tools.some(tool => tool.function.name === 'image_review_result')) return invalid();
  const generation = { maxTokens: opts.maxTokens ?? 4096, timeoutMs: opts.timeoutMs ?? 60000,
    maxRequestBytes: opts.maxRequestBytes ?? NATIVE_IMAGE_REQUEST_MAX_BYTES,
    ...(opts.thinking !== undefined ? { thinking: opts.thinking } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}), ...(opts.topP !== undefined ? { topP: opts.topP } : {}) };
  const prepared: PreparedNativeImageReviewTurn = { policy: NATIVE_IMAGE_REVIEW_RESULT_POLICY,
    target: { ...target, promptHash: '' }, messages: snapshotChatMessages(messages),
    tools: [...tools, resultTool], toolChoice: { type: 'tool', name: 'image_review_result' }, generation };
  prepared.target.promptHash = nativeImageReviewTurnPromptHash(prepared);
  const { messages: snapshot, ...saved } = prepared;
  return restoreNativeImageReviewTurn({ ...saved, messagesFrom: 'request.messages' }, snapshot);
}

/** Replay uses saved effective fields only. It never calls today's preparer/default resolver. */
export function restoreNativeImageReviewTurn(saved: SavedPreparedNativeImageReviewTurn, messages: ChatMessage[]): PreparedNativeImageReviewTurn {
  if (!object(saved) || !keys(saved, ['policy', 'target', 'tools', 'toolChoice', 'generation', 'messagesFrom'])
    || saved.policy !== NATIVE_IMAGE_REVIEW_RESULT_POLICY || saved.messagesFrom !== 'request.messages'
    || !object(saved.target) || !keys(saved.target, ['provider', 'model', 'promptHash'])
    || typeof saved.target.provider !== 'string' || !saved.target.provider.trim()
    || !['MiniMax-M3', 'MiniMax-M3.1-Flash-Preview'].includes(saved.target.model)
    || !/^[a-f0-9]{64}$/u.test(saved.target.promptHash)
    || !isDeepStrictEqual(saved.toolChoice, { type: 'tool', name: 'image_review_result' })) return invalid();
  checkGeneration(saved.generation);
  const tools = snapshotToolDefinitions(saved.tools);
  if (!tools || !isDeepStrictEqual(tools.at(-1), resultTool)
    || tools.slice(0, -1).some(tool => !['skills_list', 'skill_view', 'paper_image_view'].includes(tool.function.name))) return invalid();
  const snapshot = snapshotChatMessages(messages);
  if (snapshot.flatMap(m => m.images ?? []).length !== 1
    || snapshot.some(m => m.toolCalls?.some(c => c.function.name === 'image_review_result')
      || m.providerContent?.content.some(b => b.type === 'tool_use' && b.name === 'image_review_result'))) return invalid();
  // The pure restore must also verify text/call equality with the saved opaque history.
  anthropicMessages(snapshot, tools, saved.target.provider, saved.target.model);
  const prepared: PreparedNativeImageReviewTurn = { policy: saved.policy, target: { ...saved.target }, messages: snapshot, tools,
    toolChoice: { ...saved.toolChoice }, generation: { ...saved.generation } };
  if (nativeImageReviewTurnPromptHash(prepared) !== saved.target.promptHash) return invalid();
  return freeze(prepared);
}

/** Capture has no executable-tool validator: unknown and duplicate calls are paid evidence. */
export function decodeNativeImageReviewBody(body: string, provider: string): ProviderResult | undefined {
  // Decoding must never discard a definitely received body, including malformed nested JSON shapes.
  try {
  const data: unknown = JSON.parse(body);
  if (!object(data) || typeof data.model !== 'string' || !data.model.trim() || !object(data.usage)
    || !tokens(data.usage.input_tokens) || !tokens(data.usage.output_tokens) || !Array.isArray(data.content) || !data.content.length
    || data.content.some(b => !object(b) || typeof b.type !== 'string'
      || b.type === 'text' && typeof b.text !== 'string'
      || b.type === 'tool_use' && (typeof b.id !== 'string' || typeof b.name !== 'string' || !Object.hasOwn(b, 'input')))) return undefined;
  const blocks = data.content as Record<string, unknown>[];
  const calls = blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id as string, type: 'function' as const,
    function: { name: b.name as string, arguments: JSON.stringify(b.input) } }));
  const stop = data.stop_reason;
  const providerStopReason = typeof stop === 'string' && ['end_turn', 'max_tokens', 'tool_use', 'stop_sequence', 'pause_turn', 'refusal'].includes(stop)
    ? stop as ProviderResult['providerStopReason'] : stop == null ? 'missing' : 'unrecognized';
  const buckets = [data.usage.input_tokens, data.usage.cache_read_input_tokens, data.usage.cache_creation_input_tokens];
  const context = buckets.every(tokens) ? (buckets as number[]).reduce((a, b) => a + b, 0) : undefined;
  return freeze({ text: blocks.filter(b => b.type === 'text').map(b => b.text).join('\n'),
    usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }, model: data.model,
    finishReason: stop === 'end_turn' ? 'stop' : stop === 'max_tokens' ? 'length' : typeof stop === 'string' && stop ? 'other' : 'unknown',
    providerStopReason, ...(context !== undefined && Number.isSafeInteger(context) ? { contextInputTokens: context } : {}),
    ...(calls.length ? { toolCalls: calls } : {}), providerContent: { provider, model: data.model, content: blocks } });
  } catch { return undefined; }
}

/** Same representability rules at derivation and SDK projection; not an additional token budget. */
export function nativeImageReviewSdkPromptTokens(raw: ProviderResult): number {
  const promptTokens = raw.contextInputTokens ?? raw.usage.inputTokens;
  if (![raw.usage.inputTokens, raw.usage.outputTokens].every(v => Number.isSafeInteger(v) && v >= 0)
    || !Number.isSafeInteger(promptTokens) || promptTokens < raw.usage.inputTokens
    || !Number.isSafeInteger(promptTokens + raw.usage.outputTokens)) return invalid();
  return promptTokens;
}

export function validateNativeImageReviewFinal(prepared: PreparedNativeImageReviewTurn, received: ReceivedImageReviewReply,
  identity: { rawCheckpoint: string; turnOrdinal: number }): NativeImageReviewValidatedFinal {
  const { messages, ...saved } = prepared;
  prepared = restoreNativeImageReviewTurn({ ...saved, messagesFrom: 'request.messages' }, messages);
  if (!object(received) || Object.hasOwn(received, 'rawBodyBase64')
    || !keys(received, ['policy', 'provider', 'status', 'body', 'decoded', 'rawBodyBase64'])
    || received.policy !== prepared.policy || received.provider !== prepared.target.provider || received.status !== 200
    || typeof received.body !== 'string' || Buffer.byteLength(received.body, 'utf8') > NATIVE_IMAGE_REVIEW_MAX_RESPONSE_BYTES
    || !/^[a-f0-9]{64}$/u.test(identity.rawCheckpoint) || !Number.isSafeInteger(identity.turnOrdinal) || identity.turnOrdinal < 0) return invalid();
  const raw = decodeNativeImageReviewBody(received.body, received.provider);
  if (!raw || !isDeepStrictEqual(raw, received.decoded) || raw.model !== prepared.target.model
    || raw.providerStopReason !== 'tool_use' || raw.finishReason !== 'other' || raw.text !== ''
    || raw.usage.outputTokens > prepared.generation.maxTokens! || raw.toolCalls?.length !== 1) return invalid();
  nativeImageReviewSdkPromptTokens(raw);
  const blocks = raw.providerContent!.content;
  if (blocks.some(b => b.type !== 'tool_use' && b.type !== 'thinking' && b.type !== 'redacted_thinking'
    || b.type === 'thinking' && (typeof b.thinking !== 'string' || b.signature !== undefined && typeof b.signature !== 'string')
    || b.type === 'redacted_thinking' && typeof b.data !== 'string') || blocks.filter(b => b.type === 'tool_use').length !== 1) return invalid();
  const call = raw.toolCalls[0];
  if (call.function.name !== 'image_review_result' || !call.id.trim() || call.id.length > 200
    || prepared.messages.some(m => m.toolCalls?.some(c => c.id === call.id))) return invalid();
  const text = JSON.stringify(readNativeImageReviewDecision(JSON.parse(call.function.arguments)));
  return freeze({ policy: prepared.policy, rawCheckpoint: identity.rawCheckpoint, turnOrdinal: identity.turnOrdinal,
    resultToolCallId: call.id, text, responseHash: sha256Text(text) });
}

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
