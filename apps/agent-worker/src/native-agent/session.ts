import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { AiGatewayError, TextProviderError, nativeAgentSdkRequest, nativeAgentSdkResponse, nativeAgentHasMissingToolCall, nativeAgentHasThinkingOnlyResponse, type AiGateway, type GatewayCompletion,
  nativeImageReviewSdkFinalProjection, restoreNativeImageReviewTurn, validateNativeImageReviewFinal,
  type PreparedNativeImageReviewTurn, type ReceivedImageReviewReply, type NativeImageReviewValidatedFinal,
  type ChatMessage, type TextGenerationOptions } from '@openscience/ai-gateway';
import type { ScienceReviewInput } from '@openscience/ai-gateway';
import type { AgentNativeImageReviewPrepared } from '@openscience/domain';

export type NativeAgentSessionBinding = {
  taskId: string;
  runtimeId: string; skillCatalogueId: string; model: string; allowedTools: string[];
  maxTurns: number; maxOutputTokens: number; maxTotalOutputTokens: number; maxInputBytes: number; deadlineAt: number;
  contextWindowTokens?: number;
  /** Trusted profile settings, not SDK/model-controlled supplier arguments. */
  generation?: Pick<TextGenerationOptions, 'thinking' | 'temperature' | 'topP'>;
  /** Private immutable review input; never included in the native host configuration. */
  sourceReview?: { sourceAgentTaskId: string; authorCheckpointSha256: string; boundDraft: unknown };
} & ({ sourceKind?: 'paper'; artifactId: string; documentSha256: string; sourceMapHash: string }
  | { sourceKind: 'journal-text'; journalText: { jobId: string; sourceDigest: string; revision: number; sourceTextSha256: string } }
  | { sourceKind: 'illustration-image'; imageReview: AgentNativeImageReviewPrepared });
type Target = { provider: string; model: string; promptHash: string };
type Request = { messages: ChatMessage[]; options: TextGenerationOptions };
type RejectedAttempt = { httpStatus: 529; maxOutputTokens: number };
type EffectiveImageRequest = Omit<PreparedNativeImageReviewTurn, 'messages'> & { messagesFrom: 'request.messages' };
type Turn = { target: Target; request: Request; effectiveOptions: TextGenerationOptions; rejectedAttempt?: RejectedAttempt;
  imageResultPolicy?: 'image-review-tool-final-v1'; effectiveRequest?: EffectiveImageRequest } &
  ({ state: 'started' } | { state: 'completed'; response: GatewayCompletion; received?: ReceivedImageReviewReply }
    | { state: 'received'; received: ReceivedImageReviewReply });
export interface NativeAgentSessionState {
  kind: 'hermes-native-agent'; binding: NativeAgentSessionBinding;
  initialMessages: ChatMessage[]; turns: Turn[];
  validatedFinal?: NativeImageReviewValidatedFinal;
}
export interface NativeAgentSessionStore {
  read(): Promise<NativeAgentSessionState | null>;
  /** The existing task lease and source authority must be fenced with this CAS. */
  compareAndSet(expected: NativeAgentSessionState | null, next: NativeAgentSessionState): Promise<void>;
  /** CP-only CAS against the exact committed started receipt. No authorization to consume or continue. */
  complete(started: NativeAgentSessionState, completed: NativeAgentSessionState): Promise<void>;
  /** Pure CP-R -> CP-F CAS, under current consumption authority, never paid-completion authority. */
  finalize?(received: NativeAgentSessionState, finalized: NativeAgentSessionState): Promise<void>;
  /** Revalidate the committed started receipt and live lease immediately around actual publication. */
  publish<T>(started: NativeAgentSessionState, submit: () => Promise<T>): Promise<T>;
}
export class NativeAgentSessionError extends Error {}
function blocked(reason: string): never { throw new NativeAgentSessionError(`[blocked] Native Agent ${reason}`); }
const semanticCalls = (calls: GatewayCompletion['toolCalls']) => (calls ?? []).map(call => ({ id: call.id,
  type: call.type, name: call.function.name, input: JSON.parse(call.function.arguments) }));
const reservedOutput = (turn: Turn) => (turn.state === 'completed' ? turn.response.usage.outputTokens : 0)
  + (turn.rejectedAttempt?.maxOutputTokens ?? 0);
const reservedCalls = (turn: Turn) => 1 + (turn.rejectedAttempt ? 1 : 0);
const checkpointSha = (state: NativeAgentSessionState) => createHash('sha256').update(JSON.stringify(state)).digest('hex');

/** Recompute the final from the immutable raw request/reply, never from SDK prose or current defaults. */
export function nativeImageReviewFinal(state: NativeAgentSessionState): NativeImageReviewValidatedFinal {
  try { return deriveNativeImageReviewFinal(state); }
  catch (error) {
    if (error instanceof NativeAgentSessionError) throw error;
    blocked('terminal image result invalid');
  }
}
function deriveNativeImageReviewFinal(state: NativeAgentSessionState): NativeImageReviewValidatedFinal {
  const binding = state.binding; const last = state.turns.at(-1);
  if (binding.sourceKind !== 'illustration-image' || binding.imageReview.imageResultPolicy !== 'image-review-tool-final-v1'
    || last?.state !== 'completed' || last.imageResultPolicy !== 'image-review-tool-final-v1' || !last.received?.decoded
    || !last.effectiveRequest || last.rejectedAttempt || last.effectiveRequest.messagesFrom !== 'request.messages')
    blocked('terminal image receipt is unavailable');
  const { validatedFinal: _final, ...rawState } = state; void _final;
  const prepared = restoreNativeImageReviewTurn(last.effectiveRequest, last.request.messages);
  if (!isDeepStrictEqual(prepared.target, last.target) || prepared.target.provider !== binding.imageReview.provider
    || prepared.target.model !== binding.model
    || !isDeepStrictEqual(last.response, { ...last.received.decoded, provider: last.target.provider, promptHash: last.target.promptHash })
    || !isDeepStrictEqual(prepared.tools.slice(0, -1), last.request.options.tools)
    || !isDeepStrictEqual(prepared.generation, Object.fromEntries(Object.entries(last.effectiveOptions).filter(([key]) => key !== 'tools')))
    || state.turns.length > binding.maxTurns || state.turns.some(turn => turn.state !== 'completed')
    || state.turns.reduce((sum, turn) => sum + reservedOutput(turn), 0) > binding.maxTotalOutputTokens
    || state.turns.reduce((sum, turn) => sum + reservedCalls(turn), 0) > binding.maxTurns)
    blocked('terminal image request identity changed');
  const result = validateNativeImageReviewFinal(prepared, last.received,
    { rawCheckpoint: checkpointSha(rawState), turnOrdinal: state.turns.length - 1 });
  if (state.validatedFinal && !isDeepStrictEqual(state.validatedFinal, result)) blocked('validated image final changed');
  return result;
}

/** A received visual turn may only finish deterministically; failure never opens another conversation. */
export async function finalizeNativeImageReviewState(store: NativeAgentSessionStore, state: NativeAgentSessionState) {
  const final = nativeImageReviewFinal(state);
  if (state.validatedFinal) return state;
  if (!store.finalize) blocked('pure image finalization is unavailable');
  const next = { ...state, validatedFinal: final };
  await store.finalize(state, next);
  return next;
}

/** Owns SDK transport checkpoints; the installed AIAgent still owns every conversation/tool iteration. */
export function createNativeAgentSession(input: { gateway: AiGateway; binding: NativeAgentSessionBinding; imageReviewInput?: ScienceReviewInput;
  validateImageHistory?: (messages: readonly ChatMessage[], final?: boolean) => void;
  store: NativeAgentSessionStore; authorize: () => Promise<void>; now?: () => number }) {
  const binding = structuredClone(input.binding);
  if (binding.sourceKind === 'illustration-image' && (!input.imageReviewInput || !input.validateImageHistory)) blocked('saved image authorization missing');
  const now = input.now ?? Date.now;
  let cursor = 0;
  let inFlight = false;
  async function read() {
    const state = await input.store.read();
    if (state && (state.kind !== 'hermes-native-agent' || !isDeepStrictEqual(state.binding, binding)
      || !Array.isArray(state.turns) || state.turns.length > binding.maxTurns)) blocked('identity changed');
    if (state?.turns.some(turn => (turn.imageResultPolicy !== undefined || turn.effectiveRequest !== undefined
      || turn.state === 'received' || turn.state === 'completed' && turn.received !== undefined)
      && (binding.sourceKind !== 'illustration-image' || binding.imageReview.imageResultPolicy !== 'image-review-tool-final-v1'
        || turn.imageResultPolicy !== 'image-review-tool-final-v1' || !turn.effectiveRequest)))
      blocked('image result policy changed');
    if (state?.turns.some(turn => turn.rejectedAttempt !== undefined && (!turn.rejectedAttempt
      || turn.rejectedAttempt.httpStatus !== 529 || !Number.isSafeInteger(turn.rejectedAttempt.maxOutputTokens)
      || turn.rejectedAttempt.maxOutputTokens <= 0 || turn.rejectedAttempt.maxOutputTokens > binding.maxOutputTokens)))
      blocked('rejected attempt receipt changed');
    if (state && state.turns.reduce((sum, turn) => sum + reservedCalls(turn), 0) > binding.maxTurns)
      blocked('conversation call budget exhausted');
    return state;
  }
  async function authorize() {
    await input.authorize();
    if (now() >= binding.deadlineAt) blocked('original deadline expired');
  }
  function checkHistory(messages: ChatMessage[], state: NativeAgentSessionState | null) {
    if (!state) {
      // A new task starts from its fixed goal. A caller cannot supply invented paid history.
      if (messages.some(m => m.role === 'assistant' || m.role === 'tool')) blocked('initial history is not empty');
      return;
    }
    if (!isDeepStrictEqual(messages.slice(0, state.initialMessages.length), state.initialMessages)) blocked('initial request changed');
    const preceding = cursor > 0 ? state.turns[cursor - 1]?.request.messages : undefined;
    if (preceding?.length && !isDeepStrictEqual(messages.slice(0, preceding.length), preceding)) blocked('earlier request history changed');
    if (cursor === state.turns.length && cursor > 0 && !preceding?.length) blocked('latest request history is missing');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length !== cursor) blocked('response history changed');
    for (let i = 0; i < cursor; i++) {
      const turn = state.turns[i]; const message = assistantMessages[i];
      if (!turn || turn.state !== 'completed' || !message) blocked('response history changed');
      if (message.content !== turn.response.text
        || !isDeepStrictEqual(semanticCalls(message.toolCalls), semanticCalls(turn.response.toolCalls))
        || !isDeepStrictEqual(message.providerContent, turn.response.providerContent)) blocked('private response history changed');
    }
  }
  async function complete(raw: unknown) {
    if (inFlight) blocked('concurrent SDK request');
    inFlight = true;
    try {
      return await completeOnce(raw);
    } finally { inFlight = false; }
  }
  async function completeOnce(raw: unknown) {
      await authorize();
      if (binding.sourceKind === 'illustration-image' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1') {
        const terminal = await read();
        if (terminal?.validatedFinal || terminal?.turns.some(turn => turn.imageResultPolicy === 'image-review-tool-final-v1'
          && (turn.state === 'completed' || turn.state === 'received')))
          blocked('terminal image reply cannot continue');
      }
      const { messages, options } = nativeAgentSdkRequest(raw, binding.model);
      let state = await read();
      checkHistory(messages, state);
      if (binding.sourceKind === 'illustration-image') {
        input.validateImageHistory!(messages);
        if (state?.turns.slice(0, cursor).some(turn => turn.request.messages.some(message => message.images?.length)))
          blocked('saved image already consumed its visual request');
      }
      const names = options.tools?.map(t => t.function.name).sort();
      if (!isDeepStrictEqual(names, [...binding.allowedTools].sort())) blocked('advertised tools changed');
      if (state && !isDeepStrictEqual(options.tools, state.turns[0]?.request.options.tools)) blocked('tool definitions changed');
      if (!Number.isSafeInteger(options.maxTokens) || !options.maxTokens || options.maxTokens > binding.maxOutputTokens)
        blocked('output budget changed');
      // Replays use the allowance at their original cursor, not the cost of later paid turns.
      const spentBefore = state?.turns.slice(0, cursor).reduce((total, turn) => total + reservedOutput(turn), 0) ?? 0;
      const callsBefore = state?.turns.slice(0, cursor).reduce((total, turn) => total + reservedCalls(turn), 0) ?? 0;
      const callDeadlineAt = Math.min(binding.deadlineAt, now() + 600_000);
      if (binding.sourceKind === 'illustration-image' && binding.imageReview.imageResultPolicy === 'image-review-tool-final-v1'
        && messages.some(message => message.images?.length)) {
        const remaining = binding.maxTotalOutputTokens - spentBefore;
        if (remaining <= 0 || callsBefore + 1 > binding.maxTurns) blocked('conversation output budget exhausted');
        const effectiveOptions = { ...options, ...binding.generation, maxTokens: Math.min(options.maxTokens, remaining),
          maxRequestBytes: binding.maxInputBytes, timeoutMs: Math.max(1, callDeadlineAt - now()) };
        const role = { input: input.imageReviewInput!, target: { provider: binding.imageReview.provider, model: binding.imageReview.model } };
        const prepared = input.gateway.prepareNativeImageReviewTurn(messages, effectiveOptions, role);
        const { messages: _messages, ...descriptor } = prepared; void _messages;
        let receivedState: NativeAgentSessionState | undefined;
        await input.gateway.executeNativeImageReviewTurn(prepared, { imageReview: role, beforeProviderAttempt: authorize,
          submitProvider: async (target, submit) => {
            await authorize(); state = await read(); checkHistory(messages, state);
            if (!isDeepStrictEqual(target, prepared.target) || target.model !== binding.model
              || (state?.turns.length ?? 0) !== cursor || state?.turns.at(-1)?.state === 'started'
              || (state?.turns[0] && (state.turns[0].target.provider !== target.provider || state.turns[0].target.model !== target.model)))
              blocked('terminal image submission identity changed');
            const common = { target, request: { messages, options }, effectiveOptions,
              imageResultPolicy: 'image-review-tool-final-v1' as const,
              effectiveRequest: { ...descriptor, messagesFrom: 'request.messages' as const } };
            const started: NativeAgentSessionState = { kind: 'hermes-native-agent', binding,
              initialMessages: state?.initialMessages ?? structuredClone(messages),
              turns: [...(state?.turns ?? []).map(turn => ({ ...turn, request: { ...turn.request, messages: [] } })),
                { ...common, state: 'started' }] };
            await input.store.compareAndSet(state, started);
            const received = await input.store.publish(started, async () => {
              if (now() >= callDeadlineAt) blocked('original request deadline expired');
              return submit();
            });
            receivedState = { ...started, turns: [...started.turns.slice(0, -1), received.decoded
              ? { ...common, state: 'completed', received, response: { ...received.decoded, provider: target.provider, promptHash: target.promptHash } }
              : { ...common, state: 'received', received }] };
            // Preserve definite received bytes even when their content cannot produce a valid decision.
            await input.store.complete(started, receivedState);
            return received;
          } });
        if (!receivedState) blocked('terminal image raw receipt is missing');
        const finalized = await finalizeNativeImageReviewState(input.store, receivedState);
        const last = finalized.turns.at(-1);
        if (last?.state !== 'completed') blocked('terminal image raw receipt cannot be projected');
        cursor++;
        return nativeImageReviewSdkFinalProjection(finalized.validatedFinal!, last.response, `${binding.taskId}:native-turn:${cursor}`);
      }
      let retry: { started: NativeAgentSessionState; receipt: RejectedAttempt } | undefined;
      let result: GatewayCompletion;
      let responseAllowance = 0;
      for (;;) {
        const remaining = binding.maxTotalOutputTokens - spentBefore - (retry?.receipt.maxOutputTokens ?? 0);
        if (remaining <= 0) blocked('conversation output budget exhausted');
        if (now() >= callDeadlineAt) blocked('original request deadline expired');
        const boundedOptions = { ...options, ...binding.generation, maxTokens: Math.min(options.maxTokens, remaining), maxRequestBytes: binding.maxInputBytes,
          timeoutMs: Math.max(1, callDeadlineAt - now()) };
        responseAllowance = boundedOptions.maxTokens;
        const attempt: { rejection?: { started: NativeAgentSessionState; error: TextProviderError } } = {};
        try {
          result = await input.gateway.nativeAgentComplete(messages, boundedOptions, {
            ...(binding.sourceKind === 'illustration-image' ? { imageReview: {
              input: input.imageReviewInput!, target: { provider: binding.imageReview.provider, model: binding.imageReview.model },
            } } : {}),
            beforeProviderAttempt: authorize,
            submitProvider: async (target, submit) => {
              await authorize(); state = await read(); checkHistory(messages, state);
              if (retry && !isDeepStrictEqual(state, retry.started)) blocked('retry checkpoint changed');
              if (now() >= callDeadlineAt) blocked('original request deadline expired');
              if (target.model !== binding.model) blocked('model identity changed');
              const previous = state?.turns[cursor];
              if (previous) {
                // Gateway's existing promptHash binds the complete normalized messages/tools of every old request.
                if (!isDeepStrictEqual(previous.target, target) || !isDeepStrictEqual(previous.request.options, options)
                  || (previous.request.messages.length && !isDeepStrictEqual(previous.request.messages, messages))) blocked('request changed');
                if (previous.state === 'completed') {
                  responseAllowance = previous.effectiveOptions.maxTokens!;
                  return structuredClone(previous.response);
                }
                // Only this invocation's actual HTTP rejection permits one more publication.
                // A restarted SDK/process has no witness and must leave the original started CP alone.
                if (!retry || !isDeepStrictEqual(state, retry.started))
                  blocked('submission outcome unknown; original turn will not be reissued');
              }
              if ((state?.turns.length ?? 0) !== cursor + (retry ? 1 : 0)) blocked('turn order changed');
              if (callsBefore + (retry ? 2 : 1) > binding.maxTurns
                || boundedOptions.maxTokens + (retry?.receipt.maxOutputTokens ?? 0) > binding.maxTotalOutputTokens - spentBefore)
                blocked('conversation output budget exhausted');
              if (state?.turns[0] && (state.turns[0].target.provider !== target.provider || state.turns[0].target.model !== target.model))
                blocked('provider identity changed');
              const started: NativeAgentSessionState = retry?.started ?? { kind: 'hermes-native-agent', binding,
                initialMessages: state?.initialMessages ?? structuredClone(messages),
                // Keep the latest full prefix and every paid response; avoid copying cumulative source/page images N times.
                // This builds a new snapshot and leaves the old object used by the result CAS unchanged.
                turns: [...(state?.turns ?? []).map(turn => ({ ...turn, request: { ...turn.request, messages: [] } })),
                  { state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }] };
              if (!retry) await input.store.compareAndSet(state, started);
              const response = await input.store.publish(started, async () => {
                try {
                  if (now() >= callDeadlineAt) blocked('original request deadline expired');
                  return await submit();
                }
                catch (error) {
                  if (error instanceof TextProviderError && error.code === 'provider_http' && error.httpStatus === 529)
                    attempt.rejection = { started, error };
                  throw error;
                }
              });
              const completed: NativeAgentSessionState = { ...started, turns: [...started.turns.slice(0, -1),
                { state: 'completed', target, request: { messages, options }, effectiveOptions: boundedOptions,
                  ...(retry ? { rejectedAttempt: retry.receipt } : {}),
                  response: { ...response, provider: target.provider, promptHash: target.promptHash } }] };
              // Paid evidence is retained even if authority/deadline changes while HTTP is in flight.
              await input.store.complete(started, completed);
              return response;
            },
          });
          break;
        } catch (error) {
          if (error instanceof AiGatewayError && error.cause instanceof NativeAgentSessionError) throw error.cause;
          if (!(error instanceof AiGatewayError) || !attempt.rejection || error.cause !== attempt.rejection.error) throw error;
          // A 529 has no trustworthy usage. Reserve its entire requested output allowance;
          // do not call it free, extend the task, change provider, or retry any uncertain transport.
          if (retry || callsBefore + 2 > binding.maxTurns || remaining <= boundedOptions.maxTokens
            || now() + 1_000 >= callDeadlineAt)
            blocked('provider returned HTTP 529; original receipts retained, billing unknown');
          retry = { started: attempt.rejection.started, receipt: { httpStatus: 529, maxOutputTokens: boundedOptions.maxTokens } };
          await new Promise<void>(resolve => setTimeout(resolve, 1_000));
        }
      }
      await authorize(); // Receipt persistence does not grant permission to consume it.
      if (now() >= callDeadlineAt) blocked('original request deadline expired');
      if (result.model !== binding.model) blocked('provider reported a different model');
      if (binding.sourceKind === 'illustration-image' && (result.toolCalls?.filter(call => call.function.name === 'paper_image_view').length ?? 0) > 1)
        blocked('only one saved image view is allowed');
      if (binding.sourceKind === 'illustration-image' && messages.some(message => message.images?.length)
        && (result.toolCalls?.length || result.finishReason !== 'stop' || !result.text.trim()))
        blocked('saved image view must finish without more tools');
      if (result.usage.outputTokens > responseAllowance) blocked('provider exceeded reserved output budget');
      if (result.finishReason === 'length') blocked('output truncated; no automatic paid correction');
      // The matching new SDK snapshot retains this reply in its own loop; old immutable runtimes still stop.
      const nativeThinking = /^installed-native-continuation-[a-f0-9]{40}$/u.test(binding.runtimeId)
        && nativeAgentHasThinkingOnlyResponse(result);
      // completed above means the actual paid reply was saved, not that the Agent finished its work.
      if (!result.text.trim() && !result.toolCalls?.length && !nativeThinking)
        blocked('provider returned no visible completion or tool call; original paid response retained');
      if (nativeAgentHasMissingToolCall(result)) {
        // Count the original paid prefix, including on replay. Restarting a process grants no second correction.
        if (state?.turns.slice(0, cursor).some(turn => turn.state === 'completed' && nativeAgentHasMissingToolCall(turn.response)))
          blocked('provider omitted a tool call again; original paid responses retained');
      } else if (!result.toolCalls?.length && result.finishReason !== 'stop' && !nativeThinking)
        blocked('provider response has no valid completion or tool call; original paid response retained');
      cursor++;
      return nativeAgentSdkResponse(result, `${binding.taskId}:native-turn:${cursor}`);
  }
  return {
    async systemPrompt(): Promise<string | undefined> {
      await authorize(); const state = await read();
      return state?.initialMessages.find(m => m.role === 'system')?.content;
    },
    complete,
  };
}
