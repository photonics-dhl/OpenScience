import { isDeepStrictEqual } from 'node:util';
import { AiGatewayError, nativeAgentSdkRequest, nativeAgentSdkResponse, type AiGateway, type GatewayCompletion,
  type ChatMessage, type TextGenerationOptions } from '@openscience/ai-gateway';

export interface NativeAgentSessionBinding {
  taskId: string; artifactId: string; documentSha256: string; sourceMapHash: string;
  runtimeId: string; skillCatalogueId: string; model: string; allowedTools: string[];
  maxTurns: number; maxOutputTokens: number; maxTotalOutputTokens: number; maxInputBytes: number; deadlineAt: number;
  contextWindowTokens?: number;
  /** Trusted profile settings, not SDK/model-controlled supplier arguments. */
  generation?: Pick<TextGenerationOptions, 'thinking' | 'temperature' | 'topP'>;
}
type Target = { provider: string; model: string; promptHash: string };
type Request = { messages: ChatMessage[]; options: TextGenerationOptions };
type Turn = { target: Target; request: Request; effectiveOptions: TextGenerationOptions; state: 'started' }
  | { target: Target; request: Request; effectiveOptions: TextGenerationOptions; state: 'completed'; response: GatewayCompletion };
export interface NativeAgentSessionState {
  kind: 'hermes-native-agent'; binding: NativeAgentSessionBinding;
  initialMessages: ChatMessage[]; turns: Turn[];
}
export interface NativeAgentSessionStore {
  read(): Promise<NativeAgentSessionState | null>;
  /** The existing task lease and source authority must be fenced with this CAS. */
  compareAndSet(expected: NativeAgentSessionState | null, next: NativeAgentSessionState): Promise<void>;
  /** CP-only CAS against the exact committed started receipt. No authorization to consume or continue. */
  complete(started: NativeAgentSessionState, completed: NativeAgentSessionState): Promise<void>;
  /** Revalidate the committed started receipt and live lease immediately around actual publication. */
  publish<T>(started: NativeAgentSessionState, submit: () => Promise<T>): Promise<T>;
}
class NativeAgentSessionError extends Error {}
function blocked(reason: string): never { throw new NativeAgentSessionError(`[blocked] Native Agent ${reason}`); }
const semanticCalls = (calls: GatewayCompletion['toolCalls']) => (calls ?? []).map(call => ({ id: call.id,
  type: call.type, name: call.function.name, input: JSON.parse(call.function.arguments) }));

/** Owns SDK transport checkpoints; the installed AIAgent still owns every conversation/tool iteration. */
export function createNativeAgentSession(input: { gateway: AiGateway; binding: NativeAgentSessionBinding;
  store: NativeAgentSessionStore; authorize: () => Promise<void>; now?: () => number }) {
  const binding = structuredClone(input.binding);
  const now = input.now ?? Date.now;
  let cursor = 0;
  let inFlight = false;
  async function read() {
    const state = await input.store.read();
    if (state && (state.kind !== 'hermes-native-agent' || !isDeepStrictEqual(state.binding, binding)
      || !Array.isArray(state.turns) || state.turns.length > binding.maxTurns)) blocked('identity changed');
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
      const { messages, options } = nativeAgentSdkRequest(raw, binding.model);
      let state = await read();
      checkHistory(messages, state);
      const names = options.tools?.map(t => t.function.name).sort();
      if (!isDeepStrictEqual(names, [...binding.allowedTools].sort())) blocked('advertised tools changed');
      if (state && !isDeepStrictEqual(options.tools, state.turns[0]?.request.options.tools)) blocked('tool definitions changed');
      if (!Number.isSafeInteger(options.maxTokens) || !options.maxTokens || options.maxTokens > binding.maxOutputTokens)
        blocked('output budget changed');
      // Replays use the allowance at their original cursor, not the cost of later paid turns.
      const spentBefore = state?.turns.slice(0, cursor).reduce((total, turn) => total + (turn.state === 'completed' ? turn.response.usage.outputTokens : 0), 0) ?? 0;
      const remaining = binding.maxTotalOutputTokens - spentBefore;
      if (remaining <= 0) blocked('conversation output budget exhausted');
      const boundedOptions = { ...options, ...binding.generation, maxTokens: Math.min(options.maxTokens, remaining), maxRequestBytes: binding.maxInputBytes,
        timeoutMs: Math.max(1, Math.min(600_000, binding.deadlineAt - now())) };
      const result = await input.gateway.nativeAgentComplete(messages, boundedOptions, {
        beforeProviderAttempt: authorize,
        submitProvider: async (target, submit) => {
          await authorize(); state = await read(); checkHistory(messages, state);
          if (target.model !== binding.model) blocked('model identity changed');
          const previous = state?.turns[cursor];
          if (previous) {
            // Gateway's existing promptHash binds the complete normalized messages/tools of every old request.
            if (!isDeepStrictEqual(previous.target, target) || !isDeepStrictEqual(previous.request.options, options)
              || (previous.request.messages.length && !isDeepStrictEqual(previous.request.messages, messages))) blocked('request changed');
            if (previous.state !== 'completed') blocked('submission outcome unknown; original turn will not be reissued');
            return structuredClone(previous.response);
          }
          if ((state?.turns.length ?? 0) !== cursor) blocked('turn order changed');
          const spent = state?.turns.reduce((total, turn) => total + (turn.state === 'completed' ? turn.response.usage.outputTokens : 0), 0) ?? 0;
          if (cursor >= binding.maxTurns || boundedOptions.maxTokens > binding.maxTotalOutputTokens - spent)
            blocked('conversation output budget exhausted');
          if (state?.turns[0] && (state.turns[0].target.provider !== target.provider || state.turns[0].target.model !== target.model))
            blocked('provider identity changed');
          const started: NativeAgentSessionState = { kind: 'hermes-native-agent', binding,
            initialMessages: state?.initialMessages ?? structuredClone(messages),
            // Keep the latest full prefix and every paid response; avoid copying cumulative source/page images N times.
            // This builds a new snapshot and leaves the old object used by the result CAS unchanged.
            turns: [...(state?.turns ?? []).map(turn => ({ ...turn, request: { ...turn.request, messages: [] } })),
              { state: 'started', target, request: { messages, options }, effectiveOptions: boundedOptions }] };
          await input.store.compareAndSet(state, started);
          const response = await input.store.publish(started, submit);
          const completed: NativeAgentSessionState = { ...started, turns: [...started.turns.slice(0, -1),
            { state: 'completed', target, request: { messages, options }, effectiveOptions: boundedOptions,
              response: { ...response, provider: target.provider, promptHash: target.promptHash } }] };
          // Paid evidence is retained even if authority/deadline changes while HTTP is in flight.
          await input.store.complete(started, completed);
          return response;
        },
      }).catch(error => {
        if (error instanceof AiGatewayError && error.cause instanceof NativeAgentSessionError) throw error.cause;
        throw error;
      });
      await authorize(); // Receipt persistence does not grant permission to consume it.
      if (result.model !== binding.model) blocked('provider reported a different model');
      if (result.usage.outputTokens > boundedOptions.maxTokens) blocked('provider exceeded reserved output budget');
      if (result.finishReason === 'length') blocked('output truncated; no automatic paid correction');
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
