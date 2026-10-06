import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { chmod, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { nativeAgentSdkRequest } from '@openscience/ai-gateway';
import { NativeAgentSessionError, type createNativeAgentSession, type NativeAgentSessionStore } from './session';

type Config = { taskId: string; runtimeId: string; skillCatalogueId: string; model: string;
  goal: string; instructions: string; maxTurns: number; maxOutputTokens: number;
  sourceTools: readonly { name: string; description: string; parameters: Record<string, unknown> }[] };
type ImageContent = Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
type Slot = { id: string; name: string; args: unknown; sequence: number; authorized: boolean; called: boolean; result?: unknown;
  images?: ImageContent };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function blocked(): never { throw new Error('[blocked] Native task transport scope changed'); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
// SDK envelopes retain private continuation fields. Gateway independently bounds the actual supplier body.
const SDK_TRANSPORT_BYTES = 64_000_000;
async function body(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) blocked();
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function respond(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value));
}

/** A single private Unix socket. No public route, host command, credentials or caller-selected source. */
export async function runHostedNativeTask(input: {
  inboxRoot: string; executionAttempt: number; config: Config; deadlineAt: number; maxInputBytes: number;
  session: ReturnType<typeof createNativeAgentSession>; store: NativeAgentSessionStore;
  authorize: () => Promise<void>; paper: { readonly observedPassageIds: string[];
    call(name: string, args: unknown, sequence?: number, callId?: string): Promise<unknown>;
    images(args: unknown, result: unknown): Promise<{ content: ImageContent }>;
    withAuthorizedToolCall?<T>(run: () => Promise<T>): Promise<T> };
  onStopped?: (error: unknown) => void;
}): Promise<{ finalResponse: string; observedPassageIds: string[] }> {
  if (!uuid.test(input.config.taskId) || !Number.isSafeInteger(input.executionAttempt) || input.executionAttempt < 1) blocked();
  const instance = `${input.config.taskId}-${input.executionAttempt}`;
  const directory = join(input.inboxRoot, instance);
  if (Buffer.byteLength(join(directory, 'worker.sock'), 'utf8') > 107) throw new Error('[blocked] Native Unix socket path exceeds the kernel limit');
  // A claimed execution gets a fresh producer directory. No automatic rebind to an old socket.
  await mkdir(directory, { mode: 0o755 });
  let slots: Slot[] = [];
  let toolSequence = 0;
  let settled = false;
  let resolve!: (result: { finalResponse: string; observedPassageIds: string[] }) => void;
  let reject!: (error: Error) => void;
  const final = new Promise<{ finalResponse: string; observedPassageIds: string[] }>((yes, no) => { resolve = yes; reject = no; });
  void final.catch(() => undefined);
  const stop = (message: string) => { if (!settled) { settled = true; reject(new Error(message)); } };
  async function validateSourceHistory(value: unknown) {
    const { messages } = nativeAgentSdkRequest(value, input.config.model);
    for (const slot of slots) {
      const result = [...messages].reverse().find(m => m.role === 'tool' && m.toolCallId === slot.id);
      if (!slot.authorized || !result) blocked();
      if (slot.name.startsWith('paper_') && (!slot.called || !isDeepStrictEqual(JSON.parse(result.content), slot.result))) blocked();
    }
    const expected = slots.flatMap(s => s.images ?? []);
    if (expected.length) {
      if (!record(value) || !Array.isArray(value.messages)) blocked();
      const latest = value.messages.at(-1);
      if (!record(latest) || latest.role !== 'user' || !isDeepStrictEqual(latest.content, expected)) blocked();
    }
  }
  const server = createServer(async (req, res) => {
    try {
      if (settled || Date.now() >= input.deadlineAt) blocked();
      await input.authorize();
      if (req.method === 'GET' && req.url === '/task/config') {
        return respond(res, 200, { ...input.config, executionAttempt: input.executionAttempt, systemPrompt: await input.session.systemPrompt() });
      }
      if (req.method !== 'POST' || req.headers['content-type']?.split(';')[0] !== 'application/json') blocked();
      const value = await body(req, req.url === '/v1/chat/completions' ? SDK_TRANSPORT_BYTES : Math.min(input.maxInputBytes, 1_048_576));
      if (req.url === '/v1/chat/completions') {
        await validateSourceHistory(value);
        const response = await input.session.complete(value);
        slots = (response.choices[0]!.message.tool_calls ?? []).map(call => ({ id: call.id, name: call.function.name, sequence: toolSequence++,
          args: JSON.parse(call.function.arguments), authorized: false, called: false }));
        return respond(res, 200, response);
      }
      if (!record(value)) blocked();
      if (req.url === '/task/tools/authorize') {
        const slot = slots.find(s => !s.authorized && s.name === value.name && isDeepStrictEqual(s.args, value.arguments));
        if (!slot) blocked(); slot.authorized = true;
        return respond(res, 200, { authorized: true });
      }
      if (req.url === '/task/tools/call') {
        const slot = slots.find(s => s.authorized && !s.called && s.name.startsWith('paper_') && s.name === value.name && isDeepStrictEqual(s.args, value.arguments));
        if (!slot) blocked();
        const execute = async () => {
          slot.called = true;
          slot.result = await input.paper.call(slot.name, value.arguments, slot.sequence, slot.id);
          respond(res, 200, slot.result);
        };
        return await (input.paper.withAuthorizedToolCall ? input.paper.withAuthorizedToolCall(execute) : execute());
      }
      if (req.url === '/task/tools/images') {
        const slot = slots.find(s => s.id === value.callId && s.name === 'paper_view' && s.authorized && s.called);
        if (!slot || !isDeepStrictEqual(slot.args, value.arguments) || !isDeepStrictEqual(slot.result, value.result)) blocked();
        // Rasterization may take seconds. Do not hold the journal lock while it runs;
        // recheck live rights/lease immediately before any page pixels leave this socket.
        const images = await input.paper.images(value.arguments, value.result);
        const deliver = async () => {
          if (settled || Date.now() >= input.deadlineAt) blocked();
          slot.images = images.content; respond(res, 200, images);
        };
        return await (input.paper.withAuthorizedToolCall ? input.paper.withAuthorizedToolCall(deliver) : deliver());
      }
      if (req.url === '/task/finish') {
        if (value.status === 'completed' && typeof value.finalResponse === 'string') {
          const state = await input.store.read(); const last = state?.turns.at(-1);
          // Native run_conversation trims its returned presentation text. Retain the original paid bytes.
          if (!last || last.state !== 'completed' || last.response.finishReason !== 'stop' || !last.response.text.trim()
            || last.response.text.trim() !== value.finalResponse
            || last.response.model !== input.config.model || last.target.model !== input.config.model
            || last.response.toolCalls?.length || slots.length) blocked();
          settled = true; respond(res, 200, { received: true });
          return resolve({ finalResponse: last.response.text, observedPassageIds: input.paper.observedPassageIds });
        }
        const state = await input.store.read();
        const reachedTurnLimit = value.status === 'stopped' && state?.binding.taskId === input.config.taskId
          && state.binding.maxTurns === input.config.maxTurns && state.turns.length === input.config.maxTurns
          && state.turns.every(turn => turn.state === 'completed');
        respond(res, 200, { received: true });
        return stop(reachedTurnLimit
          ? `[blocked] Native Agent stopped at its ${input.config.maxTurns}-turn limit; original receipts retained`
          : '[blocked] Native Agent stopped; original receipts retained');
      }
      blocked();
    } catch (error) {
      input.onStopped?.(error);
      respond(res, 409, { error: { code: 'NATIVE_TASK_STOPPED', message: 'Native task cannot continue in this scope.' } });
      stop(error instanceof NativeAgentSessionError ? error.message : '[blocked] Native task transport stopped; original receipts retained');
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.on('error', () => stop('[blocked] Native task socket is unavailable'));
  const timeout = setTimeout(() => stop('[blocked] Native task original deadline expired'), Math.max(1, input.deadlineAt - Date.now()));
  try {
    await new Promise<void>((yes, no) => { server.once('error', no); server.listen(join(directory, 'worker.sock'), yes); });
    await chmod(join(directory, 'worker.sock'), 0o666);
    const file = await open(join(directory, 'request.json'), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ taskId: input.config.taskId, executionAttempt: input.executionAttempt })); await file.sync(); }
    finally { await file.close(); }
    return await final;
  } finally {
    clearTimeout(timeout); server.close(); server.closeIdleConnections();
    // Broker owns the pinned inode/unit and cleanup. Keep producer evidence until the process is confirmed ended.
  }
}
