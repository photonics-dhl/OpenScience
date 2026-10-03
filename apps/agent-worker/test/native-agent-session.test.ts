import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeAgentSession, type NativeAgentSessionState, type NativeAgentSessionBinding } from '../src/native-agent/session';
import { AiGateway, AnthropicCompatProvider, nativeAgentSdkRequest, type GatewayCompletion, type TextProvider } from '@openscience/ai-gateway';
import { nativePaperToolProfile, NATIVE_PAPER_NOTE_DRAFT_TOOL, NATIVE_PAPER_FIELD_TOOL, NATIVE_PAPER_CLAIM_TOOL, NATIVE_PAPER_REVIEW_TOOL, NATIVE_PAPER_COMMITTED_REVIEW_TOOL } from '../src/native-agent/paper-task';
import { createNativeScientificMaterializer } from '../src/extractor';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import type { DocumentSourceMap } from '@openscience/domain';

const binding = { taskId: 'task', artifactId: 'artifact', documentSha256: 'document', sourceMapHash: 'map',
  runtimeId: 'fixed-installed-runtime', skillCatalogueId: 'fixed-catalogue', model: 'MiniMax-M3', allowedTools: ['paper_read'],
  maxTurns: 3, maxOutputTokens: 100, maxTotalOutputTokens: 1000, maxInputBytes: 10_000, deadlineAt: 10_000 };
const request = { model: 'MiniMax-M3', messages: [{ role: 'system', content: 'fixed system' }, { role: 'user', content: 'Read the paper.' }],
  max_tokens: 100, tools: [{ type: 'function', function: { name: 'paper_read', description: 'Read this paper', parameters: { type: 'object' } } }] };
const completion: Omit<GatewayCompletion, 'provider' | 'promptHash'> = { model: 'MiniMax-M3', text: 'source checked', finishReason: 'stop',
  usage: { inputTokens: 20, outputTokens: 10 }, providerContent: { provider: 'minimax', model: 'MiniMax-M3',
    content: [{ type: 'thinking', thinking: 'opaque', signature: 'private' }, { type: 'text', text: 'source checked' }] } };
function fixture(firstTool: boolean | number = false, toolInput: Record<string, unknown> = {}, toolName = 'paper_read') {
  let state: NativeAgentSessionState | null = null;
  let calls = 0; let authorized = true; let loseAnswer = false; let lease = true; let loseLeaseAfterStart = false; let revokeAfterHTTP = false; let reportedModel = completion.model;
  let outputTokens = completion.usage.outputTokens; const requestedAllowances: (number | undefined)[] = [];
  let finishReason = completion.finishReason;
  let providerStopReason: GatewayCompletion['providerStopReason'];
  const preflight = new AnthropicCompatProvider('minimax', { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, async () => { throw new Error('Preflight sent HTTP'); });
  const provider: TextProvider = { name: 'minimax', model: 'MiniMax-M3', preflightNativeTools: opts => preflight.preflightNativeTools(opts), async complete(options) {
    calls++; if (loseAnswer) throw new Error('unknown transport outcome');
    requestedAllowances.push(options?.maxTokens);
    const output = { ...structuredClone(completion), usage: { ...completion.usage, outputTokens } };
    if (revokeAfterHTTP) authorized = false;
    if (calls <= Number(firstTool)) return { ...output, text: '', finishReason: 'tool_calls',
      toolCalls: [{ id: `read-${calls}`, type: 'function', function: { name: toolName, arguments: JSON.stringify(toolInput) } }],
      providerContent: { provider: 'minimax', model: 'MiniMax-M3', content: [
        { type: 'thinking', thinking: 'opaque', signature: 'private' }, { type: 'tool_use', id: `read-${calls}`, name: toolName, input: toolInput }] } };
    return { ...output, model: reportedModel, finishReason, ...(providerStopReason ? { providerStopReason } : {}) };
  } };
  const gateway = new AiGateway({ providers: [provider] });
  const store = { async read() { return structuredClone(state); }, async compareAndSet(expected: NativeAgentSessionState | null, next: NativeAgentSessionState) {
    if (!lease || JSON.stringify(state) !== JSON.stringify(expected)) throw new Error('lease or CAS changed');
    state = structuredClone(next);
    if (loseLeaseAfterStart && next.turns.at(-1)?.state === 'started') lease = false;
  }, async complete(started: NativeAgentSessionState, completed: NativeAgentSessionState) {
    if (JSON.stringify(state) !== JSON.stringify(started)) throw new Error('paid receipt changed');
    state = structuredClone(completed);
  }, async publish<T>(started: NativeAgentSessionState, submit: () => Promise<T>) {
    if (!lease || !authorized || JSON.stringify(state) !== JSON.stringify(started)) throw new Error('publication authority changed');
    return submit();
  } };
  const create = (limits: Partial<NativeAgentSessionBinding> = {}) => createNativeAgentSession({ gateway, binding: { ...binding, ...limits }, store, now: () => 100,
    authorize: async () => { if (!authorized || !lease) throw new Error('authority revoked'); } });
  return { create, get calls() { return calls; }, get state() { return state; }, get requestedAllowances() { return requestedAllowances; },
    reportOutputTokens: (tokens: number) => { outputTokens = tokens; },
    reportFinishReason: (value: GatewayCompletion['finishReason']) => { finishReason = value; },
    reportProviderStopReason: (value: GatewayCompletion['providerStopReason']) => { providerStopReason = value; },
    revoke: () => { authorized = false; }, changeLease: () => { lease = false; },
    loseLeaseAfterStart: () => { loseLeaseAfterStart = true; },
    revokeAfterHTTP: () => { revokeAfterHTTP = true; },
    loseAnswer: () => { loseAnswer = true; }, reportModel: (model: string) => { reportedModel = model; },
    corrupt: (mutate: (s: NativeAgentSessionState) => void) => { mutate(state!); } };
}
function httpSessionFixture(http: (attempt: number, init: RequestInit) => Promise<Response>) {
  let state: NativeAgentSessionState | null = null;
  let authorized = true; let lease = true; let fallbackCalls = 0; let publishAttempts = 0;
  const calls: Array<{ at: number; url: string; body: string }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const published: NativeAgentSessionState[] = [];
  const hooks: { beforePublish?: (attempt: number) => void | Promise<void>;
    authorize?: () => void | Promise<void>; afterComplete?: () => void | Promise<void> } = {};
  const provider = new AnthropicCompatProvider('minimax', {
    baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: binding.model,
  }, async (url, init) => {
    calls.push({ at: Date.now(), url: String(url), body: String(init?.body) });
    return http(calls.length, init!);
  });
  const fallback = new AnthropicCompatProvider('fallback', {
    baseUrl: 'https://fallback.invalid', apiKey: 'fixture', model: binding.model,
  }, async () => { fallbackCalls++; throw new Error('Unexpected fallback HTTP'); });
  const gateway = new AiGateway({ providers: [provider, fallback], audit: {
    async record(event) { audits.push(event.metadata as Record<string, unknown>); },
  } });
  const assertCurrent = (expected: NativeAgentSessionState | null) => {
    if (JSON.stringify(state) !== JSON.stringify(expected)) throw new Error('checkpoint CAS changed');
  };
  const authorize = async () => {
    await hooks.authorize?.();
    if (!authorized || !lease) throw new Error('authority revoked');
  };
  const store = { read: async () => structuredClone(state),
    async compareAndSet(expected: NativeAgentSessionState | null, next: NativeAgentSessionState) {
      await authorize(); assertCurrent(expected);
      if (expected?.turns.at(-1)?.state === 'started') throw new Error('started checkpoint cannot be replaced');
      expect(next.turns).toHaveLength((expected?.turns.length ?? 0) + 1);
      expect(next.turns.at(-1)?.state).toBe('started'); state = structuredClone(next);
    },
    async complete(started: NativeAgentSessionState, completed: NativeAgentSessionState) {
      assertCurrent(started);
      expect(completed.binding).toEqual(started.binding);
      expect(completed.initialMessages).toEqual(started.initialMessages);
      expect(completed.turns).toHaveLength(started.turns.length);
      expect(completed.turns.slice(0, -1)).toEqual(started.turns.slice(0, -1));
      expect(started.turns.at(-1)?.state).toBe('started');
      expect(completed.turns.at(-1)).toMatchObject({ state: 'completed',
        target: started.turns.at(-1)!.target, request: started.turns.at(-1)!.request });
      state = structuredClone(completed); await hooks.afterComplete?.();
    },
    async publish<T>(started: NativeAgentSessionState, submit: () => Promise<T>) {
      await hooks.beforePublish?.(++publishAttempts); await authorize(); assertCurrent(started);
      published.push(structuredClone(started)); return submit();
    } };
  const create = (limits: Partial<NativeAgentSessionBinding> = {}) => createNativeAgentSession({
    gateway, binding: { ...binding, ...limits }, store, now: () => Date.now(), authorize,
  });
  return { create, calls, audits, published, hooks, get state() { return structuredClone(state); },
    get fallbackCalls() { return fallbackCalls; }, revoke: () => { authorized = false; }, loseLease: () => { lease = false; },
    corrupt: (mutate: (current: NativeAgentSessionState) => void) => { mutate(state!); } };
}
function successfulHttpResponse(outputTokens = 10) {
  return new Response(JSON.stringify({ model: binding.model, content: [{ type: 'text', text: 'source checked' }],
    stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: outputTokens } }));
}

describe('native HTTP 529 process-local retry', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('retries typed HTTP 529 once after 1s and replays its success without HTTP', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
      const f = httpSessionFixture(async attempt => attempt === 1
        ? new Response('overloaded', { status: 529 }) : successfulHttpResponse());
      const pending = f.create().complete(request);
      const settled = Promise.allSettled([pending]);
      await vi.advanceTimersByTimeAsync(0);
      expect(f.calls).toHaveLength(1);
      expect(f.audits[0]).toMatchObject({ outcome: 'failed', error: 'provider_http_529', outputTokens: null });
      await vi.advanceTimersByTimeAsync(999);
      expect(f.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await settled;
      expect(f.calls).toHaveLength(2);
      const result = await pending;
      expect(f.calls.map(call => call.at)).toEqual([100, 1100]);
      expect(f.calls[1]!.url).toBe(f.calls[0]!.url);
      expect(f.calls[1]!.body).toBe(f.calls[0]!.body);
      expect(f.published).toHaveLength(2);
      expect(f.published[1]).toEqual(f.published[0]);
      expect(f.state?.turns[0]).toMatchObject({ state: 'completed',
        rejectedAttempt: { httpStatus: 529, maxOutputTokens: 100 }, effectiveOptions: { timeoutMs: 8900 } });
      expect(f.audits).toHaveLength(2);
      expect(f.audits[1]).toMatchObject({ outcome: 'succeeded', promptHash: f.audits[0]!.promptHash });
      expect(await f.create().complete(request)).toEqual(result);
      expect(f.calls).toHaveLength(2); expect(f.audits).toHaveLength(2); expect(f.fallbackCalls).toBe(0);
  });

  it('stops after two HTTP 529 responses and cannot unlock the original started CP using existing audits', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async () => new Response('overloaded', { status: 529 }));
    const session = f.create(); const pending = session.complete(request);
    const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await settled)[0]?.status).toBe('rejected');
    expect(f.calls).toHaveLength(2); expect(f.audits).toHaveLength(2);
    expect(f.audits.map(audit => audit.error)).toEqual(['provider_http_529', 'provider_http_529']);
    expect(f.published[1]).toEqual(f.published[0]);
    expect(f.state).toEqual(f.published[0]);
    await expect(session.complete(request)).rejects.toThrow('submission outcome unknown');
    await expect(f.create().complete(request)).rejects.toThrow('submission outcome unknown');
    expect(f.calls).toHaveLength(2); expect(f.audits).toHaveLength(2); expect(f.fallbackCalls).toBe(0);
  });

  it.each([400, 429, 503])('does not retry HTTP %s or use a fallback provider', async status => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async () => new Response('rejected', { status }));
    await expect(f.create().complete(request)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.calls).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.audits[0]).toMatchObject({ error: `provider_http_${status}`, outputTokens: null });
    expect(f.state).toEqual(f.published[0]); expect(f.fallbackCalls).toBe(0);
  });

  it.each(['connection-reset', '529-lookalike'])('does not retry uncertain %s transport', async failure => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async () => {
      if (failure === 'connection-reset') throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      throw new Error('Provider minimax HTTP 529');
    });
    await expect(f.create().complete(request)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.calls).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.audits[0]!.error).not.toBe('provider_http_529');
    expect(f.state).toEqual(f.published[0]); expect(f.fallbackCalls).toBe(0);
  });

  it('does not retry a real provider timeout after the HTTP transport waits for abort', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async (_attempt, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    const pending = f.create({ deadlineAt: 2100 }).complete(request);
    const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(4000);
    expect((await settled)[0]?.status).toBe('rejected');
    expect(f.calls).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.audits[0]).toMatchObject({ error: 'provider_timeout', outputTokens: null });
    expect(f.state).toEqual(f.published[0]); expect(f.fallbackCalls).toBe(0);
  });

  it.each([
    ['backoff', 'authority'], ['backoff', 'lease'], ['backoff', 'checkpoint'],
    ['publication', 'authority'], ['publication', 'lease'], ['publication', 'checkpoint'],
  ] as const)('sends no second HTTP if %s loses %s', async (phase, change) => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async attempt => attempt === 1
      ? new Response('overloaded', { status: 529 }) : successfulHttpResponse());
    let changed = false;
    const mutate = () => {
      changed = true;
      if (change === 'authority') f.revoke();
      else if (change === 'lease') f.loseLease();
      else f.corrupt(current => { current.turns[0]!.effectiveOptions.timeoutMs = 8888; });
    };
    if (phase === 'publication') f.hooks.beforePublish = attempt => { if (attempt === 2) mutate(); };
    const pending = f.create().complete(request); const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls).toHaveLength(1);
    if (phase === 'backoff') mutate();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await settled)[0]?.status).toBe('rejected'); expect(changed).toBe(true);
    expect(f.calls).toHaveLength(1); expect(f.audits).toHaveLength(1); expect(f.fallbackCalls).toBe(0);
    expect(f.state?.turns[0]?.state).toBe('started');
  });

  it.each([
    ['physical calls', { maxTurns: 1 }], ['reserved output', { maxTotalOutputTokens: 100 }],
    ['original deadline', { deadlineAt: 1100 }],
  ] as const)('cannot buy a retry when the original %s allowance is exhausted', async (_reason, limits) => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async attempt => attempt === 1
      ? new Response('overloaded', { status: 529 }) : successfulHttpResponse());
    const pending = f.create(limits).complete(request); const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await settled)[0]?.status).toBe('rejected');
    expect(f.calls).toHaveLength(1); expect(f.state).toEqual(f.published[0]); expect(f.fallbackCalls).toBe(0);
  });

  it('refuses a restarted session during backoff while only the original invocation may republish', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async attempt => attempt === 1
      ? new Response('overloaded', { status: 529 }) : successfulHttpResponse());
    const pending = f.create().complete(request); const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.audits[0]!.error).toBe('provider_http_529');
    expect(f.state).toEqual(f.published[0]);
    await expect(f.create().complete(request)).rejects.toThrow('submission outcome unknown');
    expect(f.calls).toHaveLength(1); expect(f.audits).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await settled)[0]?.status).toBe('fulfilled');
    expect(f.calls).toHaveLength(2); expect(f.fallbackCalls).toBe(0);
  });

  it('counts a recovered logical turn as two physical calls while retaining zero-call replay at the limit', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async attempt => attempt === 1
      ? new Response('overloaded', { status: 529 }) : successfulHttpResponse());
    const limits = { maxTurns: 2 }; const session = f.create(limits);
    const pending = session.complete(request); const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(1000); await settled; const result = await pending;
    await expect(session.complete({ ...request, messages: [...request.messages, result.choices[0]!.message,
      { role: 'user', content: 'Continue the original task.' }] })).rejects.toThrow('budget');
    expect(await f.create(limits).complete(request)).toEqual(result);
    expect(f.calls).toHaveLength(2); expect(f.state?.turns).toHaveLength(1);
  });

  it('charges the full 529 reservation plus successful usage against later turns and preserves their replay', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async attempt => attempt === 1 ? new Response('overloaded', { status: 529 })
      : successfulHttpResponse(attempt === 3 ? 100 : 10));
    const limits = { maxTurns: 4, maxTotalOutputTokens: 250 }; const session = f.create(limits);
    const pending = session.complete(request); const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(1000); await settled; const first = await pending;
    const secondRequest = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'user', content: 'Continue the original task.' }] };
    const second = await session.complete(secondRequest);
    const thirdRequest = { ...request, messages: [...secondRequest.messages, second.choices[0]!.message,
      { role: 'user', content: 'Finish the original task.' }] };
    const third = await session.complete(thirdRequest);
    expect(f.calls.map(call => JSON.parse(call.body).max_tokens)).toEqual([100, 100, 100, 40]);
    const replay = f.create(limits);
    expect(await replay.complete(request)).toEqual(first);
    expect(await replay.complete(secondRequest)).toEqual(second);
    expect(await replay.complete(thirdRequest)).toEqual(third);
    expect(f.calls).toHaveLength(4); expect(f.audits).toHaveLength(4); expect(f.fallbackCalls).toBe(0);
  });

  it('retains a retry overrun but never replays it using the larger original allowance', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    const f = httpSessionFixture(async attempt => attempt === 1
      ? new Response('overloaded', { status: 529 }) : successfulHttpResponse(16));
    const limits = { maxTotalOutputTokens: 115 };
    const pending = f.create(limits).complete(request); const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(1000); await settled;
    await expect(pending).rejects.toThrow('exceeded reserved');
    expect(f.calls.map(call => JSON.parse(call.body).max_tokens)).toEqual([100, 15]);
    expect(f.state?.turns[0]).toMatchObject({ state: 'completed', effectiveOptions: { maxTokens: 15 },
      rejectedAttempt: { httpStatus: 529, maxOutputTokens: 100 }, response: { usage: { outputTokens: 16 } } });
    await expect(f.create(limits).complete(request)).rejects.toThrow('exceeded reserved');
    expect(f.calls).toHaveLength(2); expect(f.audits).toHaveLength(2);
  });

  it.each([
    ['binding deadline', 6100, 6100], ['single-call timeout', 900100, 600100],
  ] as const)('retains the original %s across slow rejection, backoff and the second HTTP', async (_reason, deadlineAt, expiresAt) => {
    vi.useFakeTimers(); vi.setSystemTime(100);
    let abortedAt = 0;
    const f = httpSessionFixture(async (attempt, init) => {
      if (attempt === 1) {
        await new Promise(resolve => setTimeout(resolve, 400));
        return new Response('overloaded', { status: 529 });
      }
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          abortedAt = Date.now(); reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    });
    const pending = f.create({ deadlineAt }).complete(request); const settled = Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(expiresAt - 100);
    expect((await settled)[0]?.status).toBe('rejected');
    expect(abortedAt).toBe(expiresAt); expect(f.calls.map(call => call.at)).toEqual([100, 1500]);
    expect(f.audits.map(audit => audit.error)).toEqual(['provider_http_529', 'provider_timeout']);
    expect(f.state).toEqual(f.published[0]); expect(f.fallbackCalls).toBe(0);
  });

  it.each(['publication lock', 'publication authorization'] as const)(
    'sends no second HTTP when %s waits past the independent 600s call deadline', async phase => {
      vi.useFakeTimers(); vi.setSystemTime(100);
      const callDeadlineAt = 600100; const limits = { deadlineAt: 900100 };
      const f = httpSessionFixture(async attempt => attempt === 1
        ? new Response('overloaded', { status: 529 }) : successfulHttpResponse());
      let publicationAuthorization = false; let waited = false;
      const waitPastDeadline = async () => {
        waited = true;
        await new Promise(resolve => setTimeout(resolve, callDeadlineAt - Date.now()));
      };
      f.hooks.beforePublish = async attempt => {
        if (attempt !== 2) return;
        if (phase === 'publication lock') await waitPastDeadline();
        else publicationAuthorization = true;
      };
      f.hooks.authorize = async () => {
        if (!publicationAuthorization) return;
        publicationAuthorization = false; await waitPastDeadline();
      };
      const pending = f.create(limits).complete(request); const settled = Promise.allSettled([pending]);
      await vi.advanceTimersByTimeAsync(callDeadlineAt - 100); await settled;
      await expect(pending).rejects.toThrow('original request deadline expired');
      expect(waited).toBe(true); expect(Date.now()).toBeLessThan(limits.deadlineAt);
      expect(f.calls).toHaveLength(1); expect(f.audits).toHaveLength(1);
      expect(f.published).toHaveLength(2); expect(f.published[1]).toEqual(f.published[0]);
      expect(f.state).toEqual(f.published[0]); expect(f.fallbackCalls).toBe(0);
    });

  it.each(['late HTTP answer', 'checkpoint persistence', 'final authorization'] as const)(
    'retains completed paid evidence but refuses consumption after %s crosses the call deadline', async phase => {
      vi.useFakeTimers(); vi.setSystemTime(100);
      const callDeadlineAt = 600100; const limits = { deadlineAt: 900100 };
      let crossed = false; let lateResponseSawAbort = false;
      const waitPastDeadline = async () => {
        crossed = true;
        await new Promise(resolve => setTimeout(resolve, callDeadlineAt + 1 - Date.now()));
      };
      const f = httpSessionFixture(async (attempt, init) => {
        if (attempt === 1) return new Response('overloaded', { status: 529 });
        if (phase === 'late HTTP answer') {
          // A late upstream success is still paid evidence even when cancellation has raced it.
          await waitPastDeadline(); lateResponseSawAbort = init.signal!.aborted;
        }
        return successfulHttpResponse();
      });
      if (phase === 'checkpoint persistence') f.hooks.afterComplete = waitPastDeadline;
      if (phase === 'final authorization') f.hooks.authorize = async () => {
        if (!crossed && f.state?.turns.at(-1)?.state === 'completed') await waitPastDeadline();
      };
      const pending = f.create(limits).complete(request); const settled = Promise.allSettled([pending]);
      await vi.advanceTimersByTimeAsync(callDeadlineAt + 1 - 100); await settled;
      await expect(pending).rejects.toThrow('original request deadline expired');
      expect(crossed).toBe(true); expect(Date.now()).toBeLessThan(limits.deadlineAt);
      if (phase === 'late HTTP answer') expect(lateResponseSawAbort).toBe(true);
      expect(f.calls.map(call => call.at)).toEqual([100, 1100]);
      expect(f.published[1]).toEqual(f.published[0]);
      expect(f.state?.turns[0]).toMatchObject({ state: 'completed',
        rejectedAttempt: { httpStatus: 529, maxOutputTokens: 100 }, effectiveOptions: { timeoutMs: 599000 },
        response: { text: 'source checked', usage: { inputTokens: 20, outputTokens: 10 } } });
      expect(f.audits.map(audit => audit.outcome)).toEqual(['failed', 'succeeded']);
      expect(f.fallbackCalls).toBe(0);
    });
});

describe('native Agent durable SDK turns', () => {
  it.each(['author', 'checkpoint', 'field', 'claim'])('does not rebase an independent reviewer after restart when its %s changes', async changed => {
    const f = fixture();
    const sourceReview = { sourceAgentTaskId: 'author-task', authorCheckpointSha256: 'a'.repeat(64),
      boundDraft: { fields: { method: { summary: 'Actual author mechanism', sourcePassageIds: ['P00001'] } },
        draftClaims: [{ statement: 'Actual author Claim' }] } };
    const first = await f.create({ sourceReview }).complete(request);
    expect(await f.create({ sourceReview }).complete(request)).toEqual(first);
    const different = structuredClone(sourceReview);
    if (changed === 'author') different.sourceAgentTaskId = 'other-task';
    if (changed === 'checkpoint') different.authorCheckpointSha256 = 'b'.repeat(64);
    if (changed === 'field') different.boundDraft.fields.method.summary = 'Changed mechanism';
    if (changed === 'claim') different.boundDraft.draftClaims[0]!.statement = 'Changed Claim';
    await expect(f.create({ sourceReview: different }).complete(request)).rejects.toThrow('identity changed');
    expect(f.calls).toBe(1);
  });

  it.each(['historical-json', 'tool-submitted'] as const)('replays the %s review receipt through actual Session without another provider submission', async mode => {
    const text = 'The source describes a simulation, its comparison and the conditions under which its result holds.';
    const parser = { name: 'fixture', version: '1' };
    const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'b'.repeat(64), parser,
      pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'p1', kind: 'paragraph', text,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] };
    const submitted = { draftToolCallId: 'draft-a', fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { verdict: 'accepted' }])),
      needsMoreEvidence: [], claimSuggestions: 'unchanged' };
    const materializer = (reviewToolCompletion: boolean) => {
      const worker = createNativeScientificMaterializer(map, () => ['P00001'], { reviewToolCompletion });
      worker.draft({ fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { summary: text, sourcePassageIds: ['P00001'] }])),
        needsMoreEvidence: [], draftClaims: [{ clientKey: 'core', kind: 'core', sourceField: 'insight', statement: text,
          conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] }, 0, 'draft-a');
      return worker;
    };
    const original = { ...request, tools: [{ type: 'function', function: structuredClone(mode === 'tool-submitted'
      ? NATIVE_PAPER_COMMITTED_REVIEW_TOOL : NATIVE_PAPER_REVIEW_TOOL) }] };
    const limits = { allowedTools: ['paper_review'], maxInputBytes: 40_000 };
    const f = fixture(1, submitted, 'paper_review'); const session = f.create(limits);
    const first = await session.complete(original);
    const feedback = materializer(mode === 'tool-submitted').review(submitted, 'read-1');
    expect(feedback).toMatchObject({ status: 'review_ready', reviewToolCallId: 'read-1' });
    const next = { ...original, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(feedback) }] };
    const last = await session.complete(next);
    const profile = nativePaperToolProfile(f.state);
    expect(profile.reviewToolCompletion).toBe(mode === 'tool-submitted');
    if (mode === 'historical-json') {
      expect(profile.goal).toBe('向未读过论文的人准确解释核心贡献、科学机制、代表结果及必要条件，并为后续配图保存简洁、有原文依据的六维和核心主张。');
      expect(profile.instructions).toContain('完成科学复核后直接返回完整JSON终稿');
      expect(feedback.guidance).toBe('Structure checked, not scientific approval. Correct any scientific problem through the bound source tools and another explicit review. When ready, copy the returned reviewToolCallId into the final {"reviewToolCallId":"..."}; draftToolCallId identifies the draft, not this review. Do not regenerate the full review.');
    } else {
      expect(profile.instructions).not.toContain('完成科学复核后直接返回完整JSON终稿');
      expect(profile.instructions).toContain('用paper_review提交完整终审对象');
    }
    const replayed = materializer(profile.reviewToolCompletion).review(submitted, 'read-1');
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(feedback));
    const restored = f.create({ ...limits, allowedTools: profile.allowedTools });
    const tools = profile.sourceTools.map(tool => ({ type: 'function', function: tool }));
    expect(await restored.complete({ ...original, tools })).toEqual(first);
    expect(await restored.complete({ ...next, tools, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(replayed) }] })).toEqual(last);
    expect(f.calls).toBe(2);
  });
  it.each(['paid-source-only', 'candidate-and-source'])('replays the %s draft comparison receipt through actual Session identity without another model submission', async format => {
    const text = 'The source describes a simulation, its comparison and the conditions under which its result holds.';
    const parser = { name: 'fixture', version: '1' };
    const map: DocumentSourceMap = { artifactId: 'paper', contentHash: 'b'.repeat(64), parser,
      pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'p1', kind: 'paragraph', text,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] };
    const selection = { fieldToolCallIds: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, `field-${field}`])), claimToolCallIds: ['claim-core'], needsMoreEvidence: [] };
    const materializer = (profile: { reviewContext?: boolean; reviewCandidate?: boolean }) => {
      const worker = createNativeScientificMaterializer(map, () => ['P00001'], profile);
      SDF_CORE_FIELDS.forEach((field, order) => worker.field({ field, summary: text, sourcePassageIds: ['P00001'] }, order, `field-${field}`));
      worker.claim({ clientKey: 'core', kind: 'core', sourceField: 'insight', statement: text, conditions: [], limitations: [],
        sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }, 6, 'claim-core');
      return worker;
    };
    const paidDescription = 'Select exact successful paper_field and paper_claim calls to compose the private draft. No text regeneration: fieldToolCallIds maps each of the six fields to its own returned ID; claimToolCallIds selects required Claims. Use [] when no evidence request is needed. The existing complete science/source/Claim checks apply; this is not scientific approval. The returned reviewContext pairs this call with its complete selected source passages. Compare your saved statements, quantities, cases and conditions against them before deciding paper_review; use source tools for missing definitions, restrictions and counterexamples.';
    const original = { ...request, tools: [
      { type: 'function', function: structuredClone(NATIVE_PAPER_FIELD_TOOL) },
      { type: 'function', function: structuredClone(NATIVE_PAPER_CLAIM_TOOL) },
      { type: 'function', function: { ...structuredClone(NATIVE_PAPER_NOTE_DRAFT_TOOL),
        description: format === 'paid-source-only' ? paidDescription : NATIVE_PAPER_NOTE_DRAFT_TOOL.description } },
    ] };
    const limits = { allowedTools: ['paper_field', 'paper_claim', 'paper_draft'] };
    const f = fixture(1, selection, 'paper_draft'); const session = f.create(limits);
    const first = await session.complete(original);
    const feedback = materializer({ reviewContext: true, reviewCandidate: format === 'candidate-and-source' }).draft(selection, 7, 'read-1');
    expect(feedback.status).toBe('draft_ready');
    const next = { ...original, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(feedback) }] };
    const last = await session.complete(next);
    const profile = nativePaperToolProfile(f.state);
    const replayedFeedback = materializer(profile).draft(selection, 7, 'read-1');
    expect(JSON.stringify(replayedFeedback)).toBe(JSON.stringify(feedback));
    const restored = f.create({ allowedTools: profile.allowedTools });
    const tools = profile.sourceTools.map(tool => ({ type: 'function', function: tool }));
    expect(await restored.complete({ ...original, tools })).toEqual(first);
    expect(await restored.complete({ ...next, tools, messages: [...original.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(replayedFeedback) }] })).toEqual(last);
    expect(f.calls).toBe(2);
  });
  it('replays a known missing call unchanged and continues the same paid history without repeating the original submission', async () => {
    const f = fixture(); f.reportFinishReason('other'); f.reportProviderStopReason('tool_use');
    const first = await f.create().complete(request);
    expect(first.choices[0].finish_reason).toBe('tool_calls');
    expect(first.choices[0].message.tool_calls).toBeUndefined();
    expect(f.state?.turns[0]).toMatchObject({ state: 'completed', response: { finishReason: 'other', providerStopReason: 'tool_use' } });
    const restored = f.create(); expect(await restored.complete(request)).toEqual(first); expect(f.calls).toBe(1);
    f.reportFinishReason('stop'); f.reportProviderStopReason('end_turn');
    const next = { ...request, messages: [...request.messages, first.choices[0].message,
      { role: 'user', content: 'Issue the intended tool call without repeating saved work.' }] };
    expect((await restored.complete(next)).choices[0].finish_reason).toBe('stop');
    expect(f.calls).toBe(2);
    expect(f.state?.turns[1]?.request.messages[2]?.providerContent).toEqual(completion.providerContent);
  });
  it('retains a second paid missing call but refuses another correction, including after process restart', async () => {
    const f = fixture(); f.reportFinishReason('other'); f.reportProviderStopReason('tool_use');
    const session = f.create(); const first = await session.complete(request);
    const next = { ...request, messages: [...request.messages, first.choices[0].message,
      { role: 'user', content: 'Issue the intended tool call.' }] };
    await expect(session.complete(next)).rejects.toThrow('omitted a tool call again');
    expect(f.state?.turns.at(-1)?.state).toBe('completed');
    const restored = f.create(); await restored.complete(request);
    await expect(restored.complete(next)).rejects.toThrow('omitted a tool call again');
    expect(f.calls).toBe(2);
  });
  it.each(['authority', 'turn-budget'] as const)('does not grant a missing-call continuation past the original %s', async boundary => {
    const f = fixture(); f.reportFinishReason('other'); f.reportProviderStopReason('tool_use');
    const session = f.create(boundary === 'turn-budget' ? { maxTurns: 1 } : {});
    const first = await session.complete(request);
    if (boundary === 'authority') f.revoke();
    await expect(session.complete({ ...request, messages: [...request.messages, first.choices[0].message,
      { role: 'user', content: 'Issue the intended tool call.' }] })).rejects.toThrow();
    expect(f.calls).toBe(1);
  });
  it.each(['other', 'unknown', undefined] as const)('preserves a paid unsupported stop (%s), gives an accurate response error and never resubmits it', async reason => {
    const f = fixture(); f.reportFinishReason(reason);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(f.create().complete(request)).rejects.toThrow('provider response has no valid completion or tool call');
      expect(f.state?.turns.at(-1)).toMatchObject({ state: 'completed', response: { text: completion.text } });
      expect(f.calls).toBe(1);
    }
  });
  it('replays an original paid session when its permission order differs from SDK tool order without another submission', async () => {
    const f = fixture();
    const originalPermissions = ['skills_list', 'skill_view', 'paper_read', 'paper_review'];
    const reordered = { ...request, tools: [...originalPermissions].reverse().map(name => ({ type: 'function',
      function: { name, description: `Original ${name}`, parameters: { type: 'object' } } })) };
    const original = await f.create({ allowedTools: originalPermissions }).complete(reordered);
    const profile = nativePaperToolProfile(f.state);
    const restored = f.create({ allowedTools: profile.allowedTools });
    expect(await restored.complete(reordered)).toEqual(original);
    expect(profile.allowedTools).toEqual(originalPermissions);
    profile.allowedTools.reverse();
    expect(f.state!.binding.allowedTools).toEqual(originalPermissions);
    expect(f.calls).toBe(1);
  });
  it('uses the real remaining 32139-token allowance and replays exact receipts without a new call', async () => {
    const f = fixture(3); f.reportOutputTokens(22_055);
    const limits = { maxTurns: 4, maxOutputTokens: 32_768, maxTotalOutputTokens: 98_304 };
    const session = f.create(limits);
    const calls: Array<Omit<typeof request, 'messages'> & { messages: unknown[] }> = []; const responses = [];
    let next: (typeof calls)[number] = { ...request, max_tokens: 32_768 };
    for (let index = 0; index < 3; index++) {
      calls.push(structuredClone(next));
      const response = await session.complete(next); responses.push(response);
      next = { ...next, messages: [...next.messages, response.choices[0]!.message,
        { role: 'tool', tool_call_id: `read-${index + 1}`, content: 'Original bound source' }] };
    }
    f.reportOutputTokens(10); calls.push(structuredClone(next)); responses.push(await session.complete(next));
    expect(f.requestedAllowances).toEqual([32_768, 32_768, 32_768, 32_139]);
    expect(f.state?.turns.at(-1)?.request.options.maxTokens).toBe(32_768);
    expect(f.state?.turns.at(-1)?.effectiveOptions.maxTokens).toBe(32_139);
    const restored = f.create(limits);
    for (let index = 0; index < calls.length; index++) expect(await restored.complete(calls[index])).toEqual(responses[index]);
    expect(f.calls).toBe(4);
  });
  it('retains earlier request identity without copying the same long source into every private turn', async () => {
    const f = fixture(2); const session = f.create({ maxInputBytes: 64_000_000 });
    const first = await session.complete(request);
    const unique = 'ORIGINAL_SOURCE_EVIDENCE_' + 'x'.repeat(100_000);
    const second = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: unique }] };
    const response = await session.complete(second);
    const third = { ...request, messages: [...second.messages, response.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-2', content: 'Next source.' }] };
    await session.complete(third);
    expect(JSON.stringify(f.state).split(unique)).toHaveLength(2);
    const restored = f.create({ maxInputBytes: 64_000_000 }); await restored.complete(request);
    const changed = structuredClone(second); changed.messages.at(-1)!.content = 'Altered original source';
    await expect(restored.complete(changed)).rejects.toThrow('changed'); expect(f.calls).toBe(3);
    const exact = f.create({ maxInputBytes: 64_000_000 }); await exact.complete(request);
    await exact.complete(second); await exact.complete(third); expect(f.calls).toBe(3);
  });
  it('uses trusted adaptive scientific settings and refuses a different replay profile before spending', async () => {
    const f = fixture(); const generation = { thinking: 'adaptive' as const, temperature: 1, topP: 0.95 };
    await f.create({ generation }).complete(request);
    expect(f.state?.turns[0]?.effectiveOptions).toMatchObject(generation);
    await expect(f.create({ generation: { ...generation, thinking: 'off' } }).complete(request)).rejects.toThrow('identity');
    expect(f.calls).toBe(1);
  });
  it('preserves a paid wrong-model response but refuses consumption and replay without resubmitting', async () => {
    const f = fixture(); f.reportModel('wrong-model');
    await expect(f.create().complete(request)).rejects.toThrow('model');
    expect(f.state?.turns.at(-1)).toMatchObject({ state: 'completed', response: { model: 'wrong-model' } });
    await expect(f.create().complete(request)).rejects.toThrow('model'); expect(f.calls).toBe(1);
  });
  it('replays a completed exact request across a fresh session without provider usage', async () => {
    const f = fixture(); const first = await f.create().complete(request);
    expect(f.calls).toBe(1); expect(f.state?.turns[0]?.state).toBe('completed');
    const restored = f.create(); expect(await restored.systemPrompt()).toBe('fixed system');
    expect(await restored.complete(request)).toEqual(first); expect(f.calls).toBe(1);
  });
  it('never reissues a started turn after a transport failure and process restart', async () => {
    const f = fixture(); f.loseAnswer(); await expect(f.create().complete(request)).rejects.toThrow();
    expect(f.state?.turns[0]?.state).toBe('started');
    await expect(f.create().complete(request)).rejects.toThrow('unknown'); expect(f.calls).toBe(1);
  });
  it('checks fresh authority before replaying a completed answer', async () => {
    const f = fixture(); await f.create().complete(request); f.revoke();
    await expect(f.create().complete(request)).rejects.toThrow('revoked'); expect(f.calls).toBe(1);
  });
  it.each(['messages', 'tools', 'max_tokens'] as const)('does not replay or spend for changed %s', async key => {
    const f = fixture(); await f.create().complete(request); const changed = structuredClone(request);
    if (key === 'messages') changed.messages[1]!.content = 'Different goal';
    else if (key === 'tools') changed.tools[0]!.function.description = 'Different tool';
    else changed.max_tokens++;
    await expect(f.create().complete(changed)).rejects.toThrow('changed'); expect(f.calls).toBe(1);
  });
  it('rejects changed source/runtime/budget identity before provider or replay', async () => {
    const f = fixture(); await f.create().complete(request); f.corrupt(s => { s.binding.sourceMapHash = 'different'; });
    await expect(f.create().complete(request)).rejects.toThrow('identity'); expect(f.calls).toBe(1);
  });
  it('fences simultaneous runners before the one paid submission', async () => {
    const f = fixture(); const results = await Promise.allSettled([f.create().complete(request), f.create().complete(request)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(f.calls).toBe(1);
  });
  it('does not publish after the owning execution lease changes', async () => {
    const f = fixture(); f.changeLease(); await expect(f.create().complete(request)).rejects.toThrow(); expect(f.calls).toBe(0);
  });
  it('does not publish if lease changed after the started receipt committed', async () => {
    const f = fixture(); f.loseLeaseAfterStart(); await expect(f.create().complete(request)).rejects.toThrow(); expect(f.calls).toBe(0);
    expect(f.state?.turns[0]?.state).toBe('started');
  });
  it('replays actual tool history across restart and then continues only the next turn', async () => {
    const f = fixture(true); const first = await f.create().complete(request);
    const second = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'bound source' }] };
    const restored = f.create(); expect(await restored.complete(request)).toEqual(first);
    await restored.complete(second); expect(f.calls).toBe(2);
  });
  it('rejects changed private provider blocks before a new paid turn', async () => {
    const f = fixture(true); const session = f.create(); const first = await session.complete(request);
    first.choices[0]!.message.reasoning_details![0]!.provider_content.content = [{ type: 'thinking', thinking: 'different', signature: 'forged' }];
    await expect(session.complete({ ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'bound source' }] })).rejects.toThrow('private response');
    expect(f.calls).toBe(1);
  });
  it('rejects advertising an unavailable tool before provider submission', async () => {
    const f = fixture(); const changed = structuredClone(request); changed.tools[0]!.function.name = 'terminal';
    await expect(f.create().complete(changed)).rejects.toThrow('advertised'); expect(f.calls).toBe(0);
  });
  it('refuses simultaneous replays on the same native instance without advancing twice', async () => {
    const f = fixture(); await f.create().complete(request); const restored = f.create();
    const results = await Promise.allSettled([restored.complete(request), restored.complete(request)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('retains a paid response when authority is revoked during its HTTP request', async () => {
    const f = fixture(); f.revokeAfterHTTP(); await expect(f.create().complete(request)).rejects.toThrow();
    expect(f.calls).toBe(1); expect(f.state?.turns[0]?.state).toBe('completed');
  });
  it.each(['tool', 'user'])('rejects rewritten earlier %s evidence before a third paid turn', async role => {
    const f = fixture(2); const session = f.create(); const first = await session.complete(request);
    const secondRequest = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'original source' }, { role: 'user', content: 'original page caption' }] };
    const second = await session.complete(secondRequest);
    const changed = structuredClone(secondRequest);
    const entry = changed.messages.find((m, index) => index > 1 && m.role === role)!;
    entry.content = 'rewritten evidence';
    await expect(session.complete({ ...changed, messages: [...changed.messages, second.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-2', content: 'second read' }] })).rejects.toThrow('history');
    expect(f.calls).toBe(2);
  });
  it('reserves the next output allowance against remaining cumulative output', async () => {
    const f = fixture(true); const session = f.create({ maxOutputTokens: 10, maxTotalOutputTokens: 10 });
    const small = { ...request, max_tokens: 10 }; const first = await session.complete(small);
    await expect(session.complete({ ...small, messages: [...small.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'source' }] })).rejects.toThrow('output budget'); expect(f.calls).toBe(1);
    const replay = f.create({ maxOutputTokens: 10, maxTotalOutputTokens: 10 });
    expect(await replay.complete(small)).toEqual(first); expect(f.calls).toBe(1);
  });
  it('retains a paid overrun but refuses consumption beyond the actual remaining allowance', async () => {
    const f = fixture(true); const session = f.create({ maxOutputTokens: 10, maxTotalOutputTokens: 15 });
    const small = { ...request, max_tokens: 10 }; const first = await session.complete(small);
    await expect(session.complete({ ...small, messages: [...small.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'source' }] })).rejects.toThrow('exceeded reserved');
    expect(f.requestedAllowances).toEqual([10, 5]);
    expect(f.state?.turns.at(-1)?.state).toBe('completed'); expect(f.calls).toBe(2);
  });
  it('rejects oversized input before persisting started or submitting', async () => {
    const f = fixture(); await expect(f.create({ maxInputBytes: 20 }).complete(request)).rejects.toThrow('byte budget');
    expect(f.state).toBeNull(); expect(f.calls).toBe(0);
  });
  it('retains but does not consume an output that exceeded its reserved limit', async () => {
    const f = fixture(); await expect(f.create().complete({ ...request, max_tokens: 5 })).rejects.toThrow('exceeded reserved');
    expect(f.state?.turns[0]?.state).toBe('completed'); expect(f.calls).toBe(1);
    await expect(f.create().complete({ ...request, max_tokens: 5 })).rejects.toThrow('exceeded reserved'); expect(f.calls).toBe(1);
  });
  it('budgets actual provider body rather than duplicated private normalized fields', async () => {
    const seed = fixture(true); const first = await seed.create().complete(request);
    const second = { ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'bound source' }] };
    const normalized = nativeAgentSdkRequest(second, binding.model);
    let actualBody = '';
    const baseline = new AnthropicCompatProvider('minimax', { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: binding.model }, async (_url, opts) => {
      actualBody = String(opts?.body); return new Response(JSON.stringify({ model: binding.model, content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
    });
    await baseline.complete({ model: binding.model, ...normalized.options, messages: normalized.messages });
    const limit = Buffer.byteLength(actualBody, 'utf8');
    expect(Buffer.byteLength(JSON.stringify(normalized), 'utf8')).toBeGreaterThan(limit);
    const f = fixture(true); const session = f.create({ maxInputBytes: limit }); await session.complete(request);
    await session.complete(second); expect(f.calls).toBe(2);
  });
  it('accepts native JSON argument key sorting while keeping complete provider blocks exact', async () => {
    const f = fixture(true, { name: 'paper-method', file_path: 'references/geometry.md' });
    const session = f.create(); const first = await session.complete(request);
    first.choices[0]!.message.tool_calls![0]!.function.arguments = '{"file_path":"references/geometry.md","name":"paper-method"}';
    await session.complete({ ...request, messages: [...request.messages, first.choices[0]!.message,
      { role: 'tool', tool_call_id: 'read-1', content: 'full source reference' }] });
    expect(f.calls).toBe(2);
  });
});
