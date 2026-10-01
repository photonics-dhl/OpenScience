import { describe, expect, it, vi } from 'vitest';
import { AiGateway } from '../src/gateway';
import { AnthropicCompatProvider, OpenAiCompatProvider, type ChatMessage } from '../src/provider';

const tool = { type: 'function' as const, function: { name: 'paper_read', description: 'Read exact source passages.',
  parameters: { type: 'object', properties: { passageId: { type: 'string' } }, required: ['passageId'], additionalProperties: false } } };
const call = { id: 'call-1', type: 'function' as const, function: { name: 'paper_read', arguments: '{"passageId":"P00021"}' } };
const blocks = [{ type: 'thinking', thinking: 'private provider continuation', signature: 'opaque-signature' },
  { type: 'tool_use', id: call.id, name: call.function.name, input: { passageId: 'P00021' } }];
const config = { baseUrl: 'https://provider.invalid', apiKey: 'test-only', model: 'MiniMax-M3' };
const response = (content: unknown = blocks, stop_reason = 'tool_use') => new Response(JSON.stringify({
  model: config.model, content, stop_reason, usage: { input_tokens: 31, output_tokens: 8 },
}));
const controls = () => ({ beforeProviderAttempt: vi.fn(async () => undefined),
  submitProvider: vi.fn(async (_target: unknown, submit: () => Promise<unknown>) => submit()) });

describe('native Hermes tool round trips through Gateway', () => {
  it.each(['anthropic', 'openai'] as const)('enforces native task bytes on the actual %s HTTP body before checkpoint', async family => {
    const bodies: string[] = [];
    const fetcher = vi.fn(async (_url, options) => {
      bodies.push(String(options.body));
      return new Response(JSON.stringify({ model: config.model, content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn',
        choices: [{ message: { content: 'Done.' }, finish_reason: 'stop' }],
        usage: { input_tokens: 1, output_tokens: 1, prompt_tokens: 1, completion_tokens: 1 } }));
    });
    const provider = family === 'anthropic' ? new AnthropicCompatProvider('m3', config, fetcher) : new OpenAiCompatProvider('m3', config, fetcher);
    const gateway = new AiGateway({ providers: [provider] });
    const messages: ChatMessage[] = [{ role: 'system', content: '论文范围和必要条件。' }, { role: 'user', content: 'Read the actual source.' }];
    await gateway.nativeAgentComplete(messages, { tools: [tool] }, controls());
    const exactBytes = Buffer.byteLength(bodies[0]!, 'utf8');
    const blocked = controls();
    await expect(gateway.nativeAgentComplete(messages, { tools: [tool], maxRequestBytes: exactBytes - 1 }, blocked)).rejects.toThrow('byte budget');
    expect(blocked.submitProvider).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
    await gateway.nativeAgentComplete(messages, { tools: [tool], maxRequestBytes: exactBytes }, controls());
    expect(fetcher).toHaveBeenCalledTimes(2); expect(bodies[1]).toBe(bodies[0]);
  });
  it('accepts a tool-only response and replays all provider blocks unchanged before the exact tool result', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response([{ type: 'text', text: 'Source-grounded answer.' }], 'end_turn'));
    const provider = new AnthropicCompatProvider('m3', config, fetcher);
    const gateway = new AiGateway({ providers: [provider] });
    const messages: ChatMessage[] = [{ role: 'user', content: 'Verify the material-edge threshold.' }];
    const first = await gateway.nativeAgentComplete(messages, { tools: [tool] }, controls());
    expect(first.text).toBe('');
    expect(first.toolCalls).toEqual([call]);
    expect(first.providerContent).toEqual({ provider: 'm3', model: 'MiniMax-M3', content: blocks });
    messages.push({ role: 'assistant', content: first.text, toolCalls: first.toolCalls, providerContent: first.providerContent },
      { role: 'tool', content: 'P00021: material inner edge is evaluated at y=a.', toolCallId: call.id });
    await gateway.nativeAgentComplete(messages, { tools: [tool] }, controls());
    const body = JSON.parse(String(fetcher.mock.calls[1][1].body));
    expect(body.tools).toEqual([{ name: 'paper_read', description: tool.function.description, input_schema: tool.function.parameters }]);
    expect(body.messages[1]).toEqual({ role: 'assistant', content: blocks });
    expect(body.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: messages[2].content }] });
  });

  it('groups concurrent tool results in one Anthropic user turn', async () => {
    const second = { ...call, id: 'call-2' };
    const fetcher = vi.fn(async () => response([{ type: 'text', text: 'Done.' }], 'end_turn'));
    const provider = new AnthropicCompatProvider('m3', config, fetcher);
    await provider.complete({ model: config.model, tools: [tool], messages: [
      { role: 'user', content: 'Read two passages.' }, { role: 'assistant', content: '', toolCalls: [call, second] },
      { role: 'tool', content: 'first', toolCallId: call.id }, { role: 'tool', content: 'second', toolCallId: second.id },
    ] });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]!.body));
    expect(body.messages[2].content).toHaveLength(2);
    expect(body.messages).toHaveLength(3);
  });

  it('round trips OpenAI function calls without converting them into prose', async () => {
    const newCall = { ...call, id: 'call-new' };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model: 'test-model', choices: [{
      message: { role: 'assistant', content: null, tool_calls: [newCall] }, finish_reason: 'tool_calls',
    }], usage: { prompt_tokens: 12, completion_tokens: 3 } })));
    const provider = new OpenAiCompatProvider('openai-compatible', { ...config, model: 'test-model' }, fetcher);
    const result = await provider.complete({ model: 'test-model', tools: [tool], messages: [
      { role: 'user', content: 'Read.' }, { role: 'assistant', content: '', toolCalls: [call] },
      { role: 'tool', toolCallId: call.id, content: 'Evidence.' },
    ] });
    expect(result.toolCalls).toEqual([newCall]);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]!.body));
    expect(body.messages[1].tool_calls).toEqual([call]);
    expect(body.messages[2]).toEqual({ role: 'tool', tool_call_id: call.id, content: 'Evidence.' });
    expect(body.tools).toEqual([tool]);
  });

  it('keeps ordinary text calls strict about empty tool-only responses', async () => {
    const fetcher = vi.fn(async () => response());
    const provider = new AnthropicCompatProvider('m3', config, fetcher);
    await expect(provider.complete({ model: config.model, messages: [{ role: 'user', content: 'Return text.' }] })).rejects.toThrow('empty content');
  });

  it.each([
    { id: 'call-1', type: 'function', function: { name: 'not_allowed', arguments: '{}' } },
    { ...call, function: { ...call.function, arguments: 'not-json' } },
    { ...call, function: { ...call.function, arguments: '[]' } },
  ])('rejects unauthorized or malformed provider tool calls', async bad => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [bad] }, finish_reason: 'tool_calls' }] })));
    const provider = new OpenAiCompatProvider('test', config, fetcher);
    await expect(provider.complete({ model: config.model, tools: [tool], messages: [{ role: 'user', content: 'Read.' }] })).rejects.toThrow();
  });

  it.each(['foreign', 'duplicate', 'unresolved', 'wrong-provider'])('denies %s history before HTTP', async kind => {
    const fetcher = vi.fn(async () => response());
    const provider = new AnthropicCompatProvider('m3', config, fetcher);
    const messages: ChatMessage[] = [{ role: 'user', content: 'Read.' }, { role: 'assistant', content: '', toolCalls: [call] },
      { role: 'tool', content: 'Evidence.', toolCallId: kind === 'foreign' ? 'foreign-id' : call.id }];
    if (kind === 'duplicate') messages.push({ ...messages[2] });
    if (kind === 'unresolved') messages.splice(2, 1);
    if (kind === 'wrong-provider') messages[1].providerContent = { provider: 'other', model: config.model, content: blocks };
    await expect(provider.complete({ model: config.model, tools: [tool], messages })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks authority immediately before publishing and never falls back on uncertainty', async () => {
    const firstFetch = vi.fn(async () => { throw new Error('connection lost after request'); });
    const fallbackFetch = vi.fn(async () => response());
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('m3', config, firstFetch),
      new AnthropicCompatProvider('fallback', config, fallbackFetch)] });
    const c = controls();
    await expect(gateway.nativeAgentComplete([{ role: 'user', content: 'Read.' }], { tools: [tool] }, c)).rejects.toThrow();
    expect(c.beforeProviderAttempt).toHaveBeenCalledOnce();
    expect(c.submitProvider).toHaveBeenCalledOnce();
    expect(firstFetch).toHaveBeenCalledOnce();
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it('fails closed when the task authority changes or durable submission ownership is missing', async () => {
    const fetcher = vi.fn(async () => response());
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('m3', config, fetcher)] });
    await expect(gateway.nativeAgentComplete([{ role: 'user', content: 'Read.' }], { tools: [tool] }, {
      ...controls(), beforeProviderAttempt: async () => { throw new Error('task revoked'); },
    })).rejects.toThrow('task revoked');
    await expect(gateway.nativeAgentComplete([{ role: 'user', content: 'Read.' }], { tools: [tool] }, {} as never)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not expose tools through ordinary unbound Gateway entry points', async () => {
    const fetcher = vi.fn(async () => response([{ type: 'text', text: 'Done.' }], 'end_turn'));
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('m3', config, fetcher)] });
    const messages: ChatMessage[] = [{ role: 'user', content: 'Read.' }];
    await expect(gateway.complete(messages, { tools: [tool] })).rejects.toThrow();
    await expect(gateway.completeStructured((value): value is object => typeof value === 'object', messages, { tools: [tool] })).rejects.toThrow('Tool turns require');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('preflights deterministic continuation errors before starting a durable provider submission', async () => {
    const fetcher = vi.fn(async () => response());
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('m3', config, fetcher)] });
    const c = controls();
    await expect(gateway.nativeAgentComplete([{ role: 'user', content: 'Read.' }, {
      role: 'assistant', content: '', toolCalls: [call], providerContent: { provider: 'foreign', model: config.model, content: blocks },
    }, { role: 'tool', toolCallId: call.id, content: 'Evidence.' }], { tools: [tool] }, c)).rejects.toThrow();
    expect(c.submitProvider).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['anthropic', 'openai'])('rejects a reused call ID from %s before it can be executed again', async transport => {
    const fetcher = vi.fn(async () => transport === 'anthropic' ? response() : new Response(JSON.stringify({ model: config.model,
      choices: [{ message: { content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }] })));
    const provider = transport === 'anthropic' ? new AnthropicCompatProvider('m3', config, fetcher) : new OpenAiCompatProvider('m3', config, fetcher);
    await expect(provider.complete({ model: config.model, tools: [tool], messages: [
      { role: 'user', content: 'Read.' }, { role: 'assistant', content: '', toolCalls: [call] },
      { role: 'tool', content: 'Evidence.', toolCallId: call.id },
    ] })).rejects.toThrow('Invalid native tool');
  });

  it.each(['different-model', undefined])('rejects an OpenAI tool response with model=%s', async model => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model, choices: [{ message: { content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }] })));
    const provider = new OpenAiCompatProvider('m3', config, fetcher);
    await expect(provider.complete({ model: config.model, tools: [tool], messages: [{ role: 'user', content: 'Read.' }] })).rejects.toThrow();
  });

  it('snapshots nested tool definitions and private provider continuation before an async authority check', async () => {
    let release!: () => void;
    let checking!: () => void;
    const entered = new Promise<void>(resolve => { checking = resolve; });
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn(async () => response([{ type: 'text', text: 'Done.' }], 'end_turn'));
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('m3', config, fetcher)] });
    const definition = structuredClone(tool);
    const privateBlocks = structuredClone(blocks);
    const messages: ChatMessage[] = [{ role: 'user', content: 'Read.' }, { role: 'assistant', content: '', toolCalls: [call],
      providerContent: { provider: 'm3', model: config.model, content: privateBlocks } }, { role: 'tool', content: 'Original evidence.', toolCallId: call.id }];
    const operation = gateway.nativeAgentComplete(messages, { tools: [definition] }, { ...controls(),
      beforeProviderAttempt: async () => { checking(); await waiting; } });
    await entered;
    definition.function.parameters.properties.passageId.type = 'number';
    privateBlocks[0].signature = 'changed';
    messages[2].content = 'Changed evidence.';
    release();
    await operation;
    const body = JSON.parse(String(fetcher.mock.calls[0][1]!.body));
    expect(body.tools[0].input_schema.properties.passageId.type).toBe('string');
    expect(body.messages[1].content[0].signature).toBe('opaque-signature');
    expect(body.messages[2].content[0].content).toBe('Original evidence.');
  });

  it('audits one actual submission and keeps private continuation and tool data out of logs', async () => {
    const audit = { record: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async () => response());
    const gateway = new AiGateway({ providers: [new AnthropicCompatProvider('m3', config, fetcher)], audit });
    await gateway.nativeAgentComplete([{ role: 'user', content: 'private-paper-data' }], { tools: [tool] }, controls());
    expect(audit.record).toHaveBeenCalledOnce();
    const recorded = JSON.stringify(audit.record.mock.calls);
    expect(recorded).not.toContain('private-paper-data');
    expect(recorded).not.toContain('opaque-signature');
    expect(recorded).not.toContain('private provider continuation');
  });
});
