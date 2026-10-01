import { describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AiGateway, AnthropicCompatProvider } from '@openscience/ai-gateway';
import { createNativeAgentSession, type NativeAgentSessionState } from '../src/native-agent/session';
import { createNativePaperTools, NATIVE_PAPER_TOOLS } from '../src/native-agent/paper-tools';
import { runHostedNativeTask } from '../src/native-agent/host-task';

const taskId = 'af36958a-d6d0-4666-a69c-e3c60170b17f';
function post(socketPath: string, path: string, value: unknown) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const request = httpRequest({ socketPath, path, method: 'POST', headers: { 'content-type': 'application/json' } }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, body: JSON.parse(text) }));
    });
    request.on('error', reject); request.end(JSON.stringify(value));
  });
}
async function fixture(finalText = 'final') {
  const root = await mkdtemp(join(tmpdir(), 'hm-'));
  let state: NativeAgentSessionState | null = null; let providerCalls = 0; const bodySizes: number[] = [];
  const provider = new AnthropicCompatProvider('offline', { baseUrl: 'https://offline.invalid', apiKey: 'fixture', model: 'MiniMax-M3' }, async (_url, options) => {
    bodySizes.push(Buffer.byteLength(String(options!.body)));
    const first = providerCalls++ === 0;
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content: first ? [
      { type: 'thinking', thinking: 'x'.repeat(3000), signature: 'private' }, { type: 'text', text: 'x'.repeat(3000) },
      { type: 'tool_use', id: 'read-1', name: 'paper_read', input: { passageIds: ['P00001'] } },
    ] : [{ type: 'text', text: finalText }], stop_reason: first ? 'tool_use' : 'end_turn', usage: { input_tokens: 5, output_tokens: 5 } }));
  });
  const binding = { taskId, artifactId: 'paper', documentSha256: 'a'.repeat(64), sourceMapHash: 'b'.repeat(64),
    runtimeId: 'fixture', skillCatalogueId: 'fixture', model: 'MiniMax-M3', allowedTools: NATIVE_PAPER_TOOLS.map(t => t.name),
    maxTurns: 3, maxOutputTokens: 100, maxTotalOutputTokens: 1000, maxInputBytes: 9000, deadlineAt: Date.now() + 20_000 };
  const store = { async read() { return structuredClone(state); }, async compareAndSet(_expected: unknown, next: NativeAgentSessionState) { state = structuredClone(next); },
    async complete(_started: unknown, next: NativeAgentSessionState) { state = structuredClone(next); },
    async publish<T>(_started: unknown, submit: () => Promise<T>) { return submit(); } };
  const session = createNativeAgentSession({ gateway: new AiGateway({ providers: [provider] }), binding, store, authorize: async () => undefined });
  const parser = { name: 'fixture', version: '1' };
  const paper = createNativePaperTools({ artifactId: 'paper', contentHash: 'a'.repeat(64), parser, pages: [{ page: 1, width: 100, height: 100,
    blocks: [{ id: 'one', kind: 'paragraph', text: 'Original evidence.', boundingBox: { x: 0, y: 0, width: 100, height: 100 }, parser, transformations: [] }] }] }, async () => []);
  const final = runHostedNativeTask({ inboxRoot: root, executionAttempt: 1, config: { ...binding, goal: 'Read', instructions: 'Read', sourceTools: NATIVE_PAPER_TOOLS },
    deadlineAt: binding.deadlineAt, maxInputBytes: binding.maxInputBytes, session, store, authorize: async () => undefined, paper });
  void final.catch(() => undefined);
  const socketPath = join(root, `${taskId}-1`, 'worker.sock');
  for (let i = 0; i < 100; i++) { try { await access(join(root, `${taskId}-1`, 'request.json')); break; } catch { await new Promise(r => setTimeout(r, 10)); } }
  const sdk = { model: binding.model, max_tokens: 100, messages: [{ role: 'system', content: 'fixed' }, { role: 'user', content: 'Read' }],
    tools: NATIVE_PAPER_TOOLS.map(tool => ({ type: 'function', function: tool })) };
  return { socketPath, sdk, final, bodySizes, get state() { return state!; }, get providerCalls() { return providerCalls; },
    cleanup: async () => { await rm(root, { recursive: true, force: true }); } };
}
describe.skipIf(process.platform === 'win32')('private native Unix socket router', () => {
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
