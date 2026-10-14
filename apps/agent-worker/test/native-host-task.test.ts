import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { mkdtemp, access, readFile, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AiGateway, AnthropicCompatProvider } from '@openscience/ai-gateway';
import { createNativeAgentSession, type NativeAgentSessionState } from '../src/native-agent/session';
import { createNativePaperTools, NATIVE_PAPER_TOOLS } from '../src/native-agent/paper-tools';
import { runHostedNativeTask } from '../src/native-agent/host-task';

const taskId = 'af36958a-d6d0-4666-a69c-e3c60170b17f';
const route = vi.hoisted(() => ({ portable: false, listener: undefined as unknown as (request: unknown, response: unknown) => Promise<void> }));
vi.mock('node:http', async importOriginal => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, createServer: (listener: typeof route.listener) => {
    if (!route.portable) return actual.createServer(listener as never);
    route.listener = listener;
    const server = { once: () => server, on: () => server, listen: (_path: string, ready: () => void) => ready(),
      close: () => undefined, closeIdleConnections: () => undefined };
    return server;
  } };
});
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, chmod: (path: string, mode: number) => route.portable && path.endsWith('worker.sock')
    ? Promise.resolve() : actual.chmod(path, mode) };
});
const callers = new Map<string, string>();
function post(socketPath: string, path: string, value: unknown, caller: string | null | undefined = callers.get(socketPath)) {
  const headers = { 'content-type': 'application/json', ...(caller == null ? {} : { 'x-openscience-native-caller': caller }) };
  if (route.portable) {
    const request = Object.assign(Readable.from(value === undefined ? [] : [Buffer.from(JSON.stringify(value))]), {
      method: value === undefined ? 'GET' : 'POST', url: path, headers });
    let status = 0; let body: Record<string, unknown> = {};
    return route.listener(request, { writeHead: (code: number) => { status = code; },
      end: (text: string) => { body = JSON.parse(text); } }).then(() => ({ status, body }));
  }
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const request = httpRequest({ socketPath, path, method: value === undefined ? 'GET' : 'POST', headers }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, body: JSON.parse(text) }));
    });
    request.on('error', reject); request.end(value === undefined ? undefined : JSON.stringify(value));
  });
}
async function fixture(finalText = 'final', stopReason = 'end_turn', maxTurns = 3, thinkingOnly = false,
  options?: { firstTool?: { id: string; name: string; input: Record<string, unknown> };
    renderPages?: Parameters<typeof createNativePaperTools>[1];
    deadlineMs?: number;
    bootstrap?: boolean; savedState?: NativeAgentSessionState;
    authorize?: () => Promise<void>;
    withAuthorizedToolCall?: <T>(run: () => Promise<T>) => Promise<T> }) {
  const root = await mkdtemp(join(tmpdir(), 'hm-'));
  let state: NativeAgentSessionState | null = structuredClone(options?.savedState ?? null); let providerCalls = 0; const bodySizes: number[] = [];
  const provider = new AnthropicCompatProvider('offline', { baseUrl: 'https://offline.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, async (_url, requestOptions) => {
    bodySizes.push(Buffer.byteLength(String(requestOptions!.body)));
    const first = providerCalls++ === 0;
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content: first ? [
      { type: 'thinking', thinking: 'x'.repeat(3000), signature: 'private' }, { type: 'text', text: 'x'.repeat(3000) },
      { type: 'tool_use', ...(options?.firstTool ?? { id: 'read-1', name: 'paper_read', input: { passageIds: ['P00001'] } }) },
    ] : thinkingOnly ? [{ type: 'thinking', thinking: 'Unfinished private reasoning.', signature: 'original' }]
      : [{ type: 'text', text: finalText }], stop_reason: first ? 'tool_use' : stopReason, usage: { input_tokens: 5, output_tokens: 5 } }));
  });
  const binding = options?.savedState?.binding ?? { taskId, artifactId: 'paper', documentSha256: 'a'.repeat(64), sourceMapHash: 'b'.repeat(64),
    runtimeId: thinkingOnly ? `installed-native-continuation-${'a'.repeat(40)}` : 'fixture',
    skillCatalogueId: 'fixture', model: 'MiniMax-M3', allowedTools: NATIVE_PAPER_TOOLS.map(t => t.name),
    maxTurns, maxOutputTokens: 100, maxTotalOutputTokens: 1000, maxInputBytes: 9000, deadlineAt: Date.now() + (options?.deadlineMs ?? 20_000) };
  const store = { async read() { return structuredClone(state); }, async compareAndSet(_expected: unknown, next: NativeAgentSessionState) { state = structuredClone(next); },
    async complete(_started: unknown, next: NativeAgentSessionState) { state = structuredClone(next); },
    async publish<T>(_started: unknown, submit: () => Promise<T>) { return submit(); } };
  const authorize = options?.authorize ?? (async () => undefined);
  const session = createNativeAgentSession({ gateway: new AiGateway({ providers: [provider] }), binding, store, authorize });
  const parser = { name: 'fixture', version: '1' };
  const paper = createNativePaperTools({ artifactId: 'paper', contentHash: 'a'.repeat(64), parser, pages: [{ page: 1, width: 100, height: 100,
    blocks: [{ id: 'one', kind: 'paragraph', text: 'Original evidence.', boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] }, options?.renderPages ?? (async () => []));
  const sourceCalls: Array<{ name: string; sequence?: number; callId?: string }> = [];
  const final = runHostedNativeTask({ inboxRoot: root, executionAttempt: 1, config: { ...binding, goal: 'Read', instructions: 'Read', sourceTools: NATIVE_PAPER_TOOLS },
    deadlineAt: binding.deadlineAt, maxInputBytes: binding.maxInputBytes, session, store, authorize,
    paper: { ...paper, call: async (name, args, sequence, callId) => { sourceCalls.push({ name, sequence, callId }); return paper.call(name, args); },
      ...(options?.withAuthorizedToolCall ? { withAuthorizedToolCall: options.withAuthorizedToolCall } : {}) } });
  void final.catch(() => undefined);
  const socketPath = join(root, `${taskId}-1`, 'worker.sock');
  for (let i = 0; i < 100; i++) { try { await access(join(root, `${taskId}-1`, 'request.json')); break; } catch { await new Promise(r => setTimeout(r, 10)); } }
  try { callers.set(socketPath, await readFile(join(root, `${taskId}-1`, 'caller.credential'), 'utf8')); } catch { /* unfixed producer */ }
  const sdk = { model: binding.model, max_tokens: 100, messages: [{ role: 'system', content: 'fixed' }, { role: 'user', content: 'Read' }],
    tools: NATIVE_PAPER_TOOLS.map(tool => ({ type: 'function', function: tool })) };
  if (options?.bootstrap !== false && callers.has(socketPath)) {
    expect((await post(socketPath, '/task/config', { systemPrompt: 'fixed' })).status).toBe(200);
  }
  return { socketPath, sdk, final, bodySizes, sourceCalls, get state() { return state!; }, get providerCalls() { return providerCalls; },
    cleanup: async () => { callers.delete(socketPath); await rm(root, { recursive: true, force: true }); } };
}
describe('Native caller authentication at the actual router', () => {
  // Exercise the real HTTP handler/body parsing on Windows too. Only the unavailable
  // Unix listen/chmod boundary is simulated; session and provider receipts are real fixtures.
  beforeEach(() => { route.portable = true; });
  afterEach(() => { route.portable = false; });
  it.each(['/task/config', '/v1/chat/completions', '/task/tools/authorize', '/task/tools/call', '/task/tools/images', '/task/finish'])
    ('rejects missing/wrong caller on %s without stopping or consuming the legitimate task', async path => {
      const f = await fixture();
      try {
        for (const caller of [null, 'f'.repeat(64), 'wrong-public-sdk-label']) {
          const denied = await post(f.socketPath, path, path === '/task/config' ? undefined : f.sdk, caller);
          expect(denied.status).toBe(401);
          expect(JSON.stringify(denied.body)).not.toContain(callers.get(f.socketPath));
          expect(f.providerCalls).toBe(0); expect(f.sourceCalls).toEqual([]);
        }
        const config = await post(f.socketPath, '/task/config', undefined);
        expect(config.status).toBe(200);
        expect(JSON.stringify(config.body)).not.toContain(callers.get(f.socketPath));
        expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(200);
        expect(f.providerCalls).toBe(1);
        await post(f.socketPath, '/task/finish', { status: 'stopped' });
        await expect(f.final).rejects.toThrow('stopped');
      } finally { await f.cleanup(); }
    });
  it('keeps the private caller outside paid/model requests throughout the full authorized tool loop', async () => {
    const f = await fixture();
    try {
      const first = await post(f.socketPath, '/v1/chat/completions', f.sdk);
      const args = { passageIds: ['P00001'] };
      expect((await post(f.socketPath, '/task/tools/authorize', { name: 'paper_read', arguments: args })).status).toBe(200);
      const read = await post(f.socketPath, '/task/tools/call', { name: 'paper_read', arguments: args });
      const message = (first.body.choices as Array<{ message: unknown }>)[0]!.message;
      expect((await post(f.socketPath, '/v1/chat/completions', { ...f.sdk, messages: [...f.sdk.messages, message,
        { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(read.body) }] })).status).toBe(200);
      expect((await post(f.socketPath, '/task/finish', { status: 'completed', finalResponse: 'final' })).status).toBe(200);
      expect((await f.final).finalResponse).toBe('final'); expect(f.providerCalls).toBe(2);
      expect(JSON.stringify(f.state)).not.toContain(callers.get(f.socketPath));
    } finally { await f.cleanup(); }
  });
  it('rejects a completion before private first-turn bootstrap', async () => {
    const f = await fixture('final', 'end_turn', 3, false, { bootstrap: false });
    try {
      expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(409);
      await expect(f.final).rejects.toThrow('stopped'); expect(f.providerCalls).toBe(0);
    } finally { await f.cleanup(); }
  });
  it.each(['goal', 'system'])('rejects changed first %s despite a correct caller credential', async kind => {
    const f = await fixture();
    try {
      const changed = structuredClone(f.sdk);
      changed.messages[kind === 'goal' ? 1 : 0]!.content = 'Changed first turn';
      expect((await post(f.socketPath, '/v1/chat/completions', changed)).status).toBe(409);
      await expect(f.final).rejects.toThrow('first request changed'); expect(f.providerCalls).toBe(0);
    } finally { await f.cleanup(); }
  });
  it('does not let a conflicting bootstrap stop or replace the authorized first turn', async () => {
    const f = await fixture();
    try {
      expect((await post(f.socketPath, '/task/config', { systemPrompt: 'fixed' })).status).toBe(200);
      // Caller-provided goal fields have no authority: the host binds its own goal.
      expect((await post(f.socketPath, '/task/config', { systemPrompt: 'fixed', goal: 'Different task' })).status).toBe(200);
      expect((await post(f.socketPath, '/task/config', { systemPrompt: 'changed' })).status).toBe(409);
      expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(200);
      await post(f.socketPath, '/task/finish', { status: 'stopped' });
      await expect(f.final).rejects.toThrow('stopped'); expect(f.providerCalls).toBe(1);
    } finally { await f.cleanup(); }
  });
  it('does not let caller authentication replace live source/lease authority', async () => {
    let allowed = true;
    const f = await fixture('final', 'end_turn', 3, false, {
      authorize: async () => { if (!allowed) throw new Error('[blocked] source authority revoked'); },
    });
    try {
      allowed = false;
      expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(409);
      await expect(f.final).rejects.toThrow('stopped'); expect(f.providerCalls).toBe(0);
    } finally { await f.cleanup(); }
  });
  it('replays a saved paid first turn with a fresh private caller and refuses bootstrap overwrites', async () => {
    const seed = await fixture(); let saved: NativeAgentSessionState;
    try {
      expect((await post(seed.socketPath, '/v1/chat/completions', seed.sdk)).status).toBe(200);
      saved = structuredClone(seed.state);
      await post(seed.socketPath, '/task/finish', { status: 'stopped' }); await expect(seed.final).rejects.toThrow('stopped');
    } finally { await seed.cleanup(); }
    const f = await fixture('final', 'end_turn', 3, false, { savedState: saved!, bootstrap: false });
    try {
      const config = await post(f.socketPath, '/task/config', undefined);
      expect(config.body.systemPrompt).toBe('fixed');
      expect((await post(f.socketPath, '/task/config', { systemPrompt: 'changed' })).status).toBe(409);
      expect((await post(f.socketPath, '/task/config', { systemPrompt: config.body.systemPrompt })).status).toBe(200);
      expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(200);
      expect(f.state).toEqual(saved!); expect(f.providerCalls).toBe(0);
      await post(f.socketPath, '/task/finish', { status: 'stopped' }); await expect(f.final).rejects.toThrow('stopped');
    } finally { await f.cleanup(); }
  });
});
describe.skipIf(process.platform === 'win32')('private native Unix socket router', () => {
  it('rechecks journal authority after page rasterization before sending pixels', async () => {
    let begin!: () => void; let resume!: () => void; let allowed = true; let checks = 0;
    const rendering = new Promise<void>(resolve => { begin = resolve; });
    const release = new Promise<void>(resolve => { resume = resolve; });
    const f = await fixture('final', 'end_turn', 3, false, {
      firstTool: { id: 'view-1', name: 'paper_view', input: { pages: [1] } },
      renderPages: async () => { begin(); await release; return [{ pageNumber: 1, mediaType: 'image/png', bytesBase64: 'private-pixels' }]; },
      withAuthorizedToolCall: async run => { checks++; if (!allowed) throw new Error('[blocked] rights revoked'); return run(); },
    });
    try {
      const first = await post(f.socketPath, '/v1/chat/completions', f.sdk); expect(first.status).toBe(200);
      const args = { pages: [1] };
      expect((await post(f.socketPath, '/task/tools/authorize', { name: 'paper_view', arguments: args })).status).toBe(200);
      const view = await post(f.socketPath, '/task/tools/call', { name: 'paper_view', arguments: args });
      expect(view.status).toBe(200);
      const pending = post(f.socketPath, '/task/tools/images', { callId: 'view-1', arguments: args, result: view.body });
      await rendering; allowed = false; resume();
      const denied = await pending;
      expect(denied.status).toBe(409);
      expect(JSON.stringify(denied.body)).not.toContain('private-pixels');
      expect(checks).toBe(2);
      await expect(f.final).rejects.toThrow('stopped');
    } finally { await f.cleanup(); }
  });
  it('never delivers rendered page pixels after the native task deadline', async () => {
    let begin!: () => void; let resume!: () => void;
    const rendering = new Promise<void>(resolve => { begin = resolve; });
    const release = new Promise<void>(resolve => { resume = resolve; });
    const f = await fixture('final', 'end_turn', 3, false, {
      firstTool: { id: 'view-1', name: 'paper_view', input: { pages: [1] } }, deadlineMs: 1000,
      renderPages: async () => { begin(); await release; return [{ pageNumber: 1, mediaType: 'image/png', bytesBase64: 'private-pixels' }]; },
      withAuthorizedToolCall: async run => run(),
    });
    try {
      expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(200);
      const args = { pages: [1] };
      expect((await post(f.socketPath, '/task/tools/authorize', { name: 'paper_view', arguments: args })).status).toBe(200);
      const view = await post(f.socketPath, '/task/tools/call', { name: 'paper_view', arguments: args });
      const pending = post(f.socketPath, '/task/tools/images', { callId: 'view-1', arguments: args, result: view.body });
      await rendering;
      await expect(f.final).rejects.toThrow('deadline');
      resume();
      const denied = await pending;
      expect(denied.status).toBe(409);
      expect(JSON.stringify(denied.body)).not.toContain('private-pixels');
    } finally { await f.cleanup(); }
  });
  it('never completes from an empty thinking-only reply even when its saved provider stop is end_turn', async () => {
    const f = await fixture('', 'end_turn', 3, true);
    try {
      const first = await post(f.socketPath, '/v1/chat/completions', f.sdk);
      const args = { passageIds: ['P00001'] };
      await post(f.socketPath, '/task/tools/authorize', { name: 'paper_read', arguments: args });
      const read = await post(f.socketPath, '/task/tools/call', { name: 'paper_read', arguments: args });
      const message = (first.body.choices as Array<{ message: unknown }>)[0]!.message;
      const thinking = await post(f.socketPath, '/v1/chat/completions', { ...f.sdk, messages: [...f.sdk.messages, message,
        { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(read.body) }] });
      expect(thinking.status).toBe(200);
      expect(f.state.turns.at(-1)).toMatchObject({ state: 'completed', response: {
        text: '', finishReason: 'stop', providerStopReason: 'end_turn', providerContent: {
          content: [{ type: 'thinking', thinking: 'Unfinished private reasoning.', signature: 'original' }] } } });
      const saved = structuredClone(f.state);
      expect((await post(f.socketPath, '/task/finish', { status: 'completed', finalResponse: '' })).status).toBe(409);
      await expect(f.final).rejects.toThrow('stopped');
      expect(f.state).toEqual(saved); expect(f.providerCalls).toBe(2);
    } finally { await f.cleanup(); }
  });

  it.each(['exhausted', 'remaining', 'started', 'changed_binding', 'unknown_status', 'completed_without_response'] as const)('classifies stopped using its trusted completed turn budget: %s', async condition => {
    const f = await fixture('final', 'end_turn', condition === 'remaining' ? 3 : 1);
    try {
      expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(200);
      if (condition === 'started') {
        const turn = f.state.turns[0]!;
        f.state.turns[0] = { state: 'started', target: turn.target, request: turn.request, effectiveOptions: turn.effectiveOptions };
      }
      if (condition === 'changed_binding') f.state.binding.maxTurns = 2;
      const saved = structuredClone(f.state);
      const status = condition === 'unknown_status' ? 'unknown' : condition === 'completed_without_response' ? 'completed' : 'stopped';
      expect((await post(f.socketPath, '/task/finish', { status })).status).toBe(200);
      await expect(f.final).rejects.toThrow(condition === 'exhausted'
        ? 'Native Agent stopped at its 1-turn limit; original receipts retained'
        : 'Native Agent stopped; original receipts retained');
      expect(f.state).toEqual(saved);
      expect(f.providerCalls).toBe(1);
      expect(f.sourceCalls).toEqual([]);
    } finally { await f.cleanup(); }
  });
  it('never accepts the missing-call interim text as a completed task', async () => {
    const f = await fixture('Preparing the saved draft.', 'tool_use');
    try {
      const first = await post(f.socketPath, '/v1/chat/completions', f.sdk);
      const args = { passageIds: ['P00001'] };
      await post(f.socketPath, '/task/tools/authorize', { name: 'paper_read', arguments: args });
      const read = await post(f.socketPath, '/task/tools/call', { name: 'paper_read', arguments: args });
      const message = (first.body.choices as Array<{ message: unknown }>)[0]!.message;
      const interim = await post(f.socketPath, '/v1/chat/completions', { ...f.sdk, messages: [...f.sdk.messages, message,
        { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(read.body) }] });
      expect(interim.status).toBe(200);
      expect((interim.body.choices as Array<{ finish_reason: string }>)[0]?.finish_reason).toBe('tool_calls');
      expect((await post(f.socketPath, '/task/finish', { status: 'completed', finalResponse: 'Preparing the saved draft.' })).status).toBe(409);
      await expect(f.final).rejects.toThrow('stopped');
      expect(f.providerCalls).toBe(2);
    } finally { await f.cleanup(); }
  });
  it('reports an unsupported paid response without flattening it into a transport error or submitting again', async () => {
    const f = await fixture('Incomplete review {', 'pause_turn');
    try {
      const first = await post(f.socketPath, '/v1/chat/completions', f.sdk);
      const args = { passageIds: ['P00001'] };
      await post(f.socketPath, '/task/tools/authorize', { name: 'paper_read', arguments: args });
      const read = await post(f.socketPath, '/task/tools/call', { name: 'paper_read', arguments: args });
      const message = (first.body.choices as Array<{ message: unknown }>)[0]!.message;
      const rejected = await post(f.socketPath, '/v1/chat/completions', { ...f.sdk, messages: [...f.sdk.messages, message,
        { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(read.body) }] });
      expect(rejected.status).toBe(409);
      await expect(f.final).rejects.toThrow('provider response has no valid completion or tool call');
      expect(f.state.turns.at(-1)).toMatchObject({ state: 'completed', response: {
        text: 'Incomplete review {', providerStopReason: 'pause_turn' } });
      expect(f.providerCalls).toBe(2);
    } finally { await f.cleanup(); }
  });
  it.each([
    { raw: ' \nfinal \n', normalized: 'final', accepted: true },
    { raw: 'final', normalized: 'changed', accepted: false },
    { raw: '<think>removed by upstream</think>final', normalized: 'final', accepted: false },
  ])('retains exact paid bytes and only permits native outer whitespace normalization: $accepted', async ({ raw, normalized, accepted }) => {
    const f = await fixture(raw);
    try {
      const first = await post(f.socketPath, '/v1/chat/completions', f.sdk);
      const args = { passageIds: ['P00001'] };
      await post(f.socketPath, '/task/tools/authorize', { name: 'paper_read', arguments: args });
      const read = await post(f.socketPath, '/task/tools/call', { name: 'paper_read', arguments: args });
      expect(f.sourceCalls).toEqual([{ name: 'paper_read', sequence: 0, callId: 'read-1' }]);
      const message = (first.body.choices as Array<{ message: unknown }>)[0]!.message;
      await post(f.socketPath, '/v1/chat/completions', { ...f.sdk, messages: [...f.sdk.messages, message,
        { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(read.body) }] });
      const finish = await post(f.socketPath, '/task/finish', { status: 'completed', finalResponse: normalized });
      expect(finish.status).toBe(accepted ? 200 : 409);
      if (accepted) expect((await f.final).finalResponse).toBe(raw);
      else await expect(f.final).rejects.toThrow('stopped');
      const saved = f.state.turns.at(-1)!;
      expect(saved.state === 'completed' && saved.response.text).toBe(raw);
      expect(f.providerCalls).toBe(2);
    } finally { await f.cleanup(); }
  });
  it('accepts a larger SDK envelope when the actual Anthropic request fits the task byte budget', async () => {
    const f = await fixture();
    try {
      const first = await post(f.socketPath, '/v1/chat/completions', f.sdk); expect(first.status).toBe(200);
      const args = { passageIds: ['P00001'] };
      expect((await post(f.socketPath, '/task/tools/authorize', { name: 'paper_read', arguments: args })).status).toBe(200);
      const read = await post(f.socketPath, '/task/tools/call', { name: 'paper_read', arguments: args });
      const message = (first.body.choices as Array<{ message: unknown }>)[0]!.message;
      const second = { ...f.sdk, messages: [...f.sdk.messages, message, { role: 'tool', tool_call_id: 'read-1', content: JSON.stringify(read.body) }] };
      expect(Buffer.byteLength(JSON.stringify(second))).toBeGreaterThan(9000);
      expect((await post(f.socketPath, '/v1/chat/completions', second)).status).toBe(200);
      expect(Math.max(...f.bodySizes)).toBeLessThanOrEqual(9000); expect(f.providerCalls).toBe(2);
      expect((await post(f.socketPath, '/task/finish', { status: 'completed', finalResponse: 'final' })).status).toBe(200);
      expect((await f.final).finalResponse).toBe('final');
    } finally { await f.cleanup(); }
  });
  it.each(['toolCalls', 'pendingSlot'])('rejects matching stop text with remaining %s', async kind => {
    const f = await fixture();
    try {
      expect((await post(f.socketPath, '/v1/chat/completions', f.sdk)).status).toBe(200);
      const last = f.state.turns.at(-1)!;
      if (last.state !== 'completed') throw new Error('Fixture response missing');
      last.response.finishReason = 'stop';
      if (kind === 'pendingSlot') delete last.response.toolCalls;
      expect((await post(f.socketPath, '/task/finish', { status: 'completed', finalResponse: last.response.text })).status).toBe(409);
      await expect(f.final).rejects.toThrow('stopped'); expect(f.providerCalls).toBe(1);
    } finally { await f.cleanup(); }
  });
});
