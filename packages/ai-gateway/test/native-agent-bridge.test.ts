import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nativeAgentSdkRequest, nativeAgentSdkResponse, nativeAgentHasThinkingOnlyResponse } from '../src/native-agent-bridge';
import { AnthropicCompatProvider } from '../src/provider';

const tools = [{ type: 'function', function: { name: 'skills_list', parameters: { type: 'object', properties: {} } } }];
const continuation = { provider: 'm3', model: 'MiniMax-M3', content: [{ type: 'thinking', thinking: 'opaque', signature: 'unchanged' },
  { type: 'tool_use', id: 'call-1', name: 'skills_list', input: {} }] };
const calls = [{ id: 'call-1', type: 'function', function: { name: 'skills_list', arguments: '{}' } }];

describe('thinking-only native continuation identity', () => {
  const received = { text: '', provider: 'm3', model: 'MiniMax-M3', promptHash: 'test',
    usage: { inputTokens: 20, outputTokens: 37 }, finishReason: 'other' as const, providerStopReason: 'tool_use' as const,
    providerContent: { provider: 'm3', model: 'MiniMax-M3', content: [{ type: 'thinking', thinking: 'Opaque fixture.', signature: 'exact' }] } };
  it.each([
    { text: '(empty)' }, { text: ' ' }, { toolCalls: [] }, { finishReason: 'length' as const },
    { providerStopReason: 'pause_turn' as const }, { providerStopReason: 'end_turn' as const },
    { providerContent: undefined }, { providerContent: { ...received.providerContent, model: 'another-model' } },
    { model: 'MiniMax-M2', providerContent: { ...received.providerContent, model: 'MiniMax-M2' } },
    { providerContent: { ...received.providerContent, provider: 'another-provider' } },
    ...[[], [{ type: 'thinking', thinking: '' }], [{ type: 'thinking', thinking: ' ' }],
      [{ type: 'redacted_thinking', data: 'redacted' }], [{ type: 'thinking', thinking: 'Opaque' }, { type: 'text', text: '' }]]
      .map(content => ({ providerContent: { ...received.providerContent, content } })),
    ...[-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1].map(outputTokens => ({ usage: { ...received.usage, outputTokens } })),
  ])('does not grant native thinking continuation for incompatible evidence %j', patch => {
    expect(nativeAgentHasThinkingOnlyResponse({ ...received, ...patch })).toBe(false);
  });
  it('counts an explicitly reported zero-token thinking reply as a received turn', () => {
    expect(nativeAgentHasThinkingOnlyResponse({ ...received, usage: { inputTokens: 0, outputTokens: 0 } })).toBe(true);
  });
});

describe('real native SDK messages at the private Gateway bridge', () => {
  it.each(['tool_use', 'end_turn'] as const)('passes the actual thinking-only %s response to the native loop without inventing a call', reason => {
    const providerContent = { ...continuation, content: [{ type: 'thinking', thinking: 'Unfinished opaque reasoning.', signature: 'exact' }] };
    const result = nativeAgentSdkResponse({ text: '', provider: 'm3', model: 'MiniMax-M3', promptHash: 'thinking-only',
      usage: { inputTokens: 334, outputTokens: 353 }, finishReason: reason === 'tool_use' ? 'other' : 'stop',
      providerStopReason: reason, providerContent }, 'received-turn');
    expect(result.choices[0].finish_reason).toBe(reason === 'tool_use' ? 'tool_calls' : 'stop');
    expect(result.choices[0].message.content).toBe('');
    expect(result.choices[0].message.tool_calls).toBeUndefined();
    expect(result.choices[0].message.reasoning_details?.[0]?.provider_content).toEqual(providerContent);
    expect(result.usage.completion_tokens).toBe(353);
  });

  it('preserves a confirmed missing tool-call response as incomplete tool use, never a final stop or fabricated call', () => {
    const providerContent = { ...continuation, content: [{ type: 'thinking', thinking: 'opaque', signature: 'unchanged' },
      { type: 'text', text: 'Preparing the saved draft.' }] };
    const response = nativeAgentSdkResponse({ text: 'Preparing the saved draft.', provider: 'm3', model: 'MiniMax-M3', promptHash: 'test',
      usage: { inputTokens: 20, outputTokens: 8 }, finishReason: 'other', providerStopReason: 'tool_use', providerContent }, 'incomplete-turn');
    expect(response.choices[0].finish_reason).toBe('tool_calls');
    expect(response.choices[0].message.tool_calls).toBeUndefined();
    expect(response.choices[0].message.content).toBe('Preparing the saved draft.');
    expect(response.choices[0].message.reasoning_details?.[0]?.provider_content).toEqual(providerContent);
  });
  it.each(['unrecognized', 'missing', 'pause_turn', 'refusal'] as const)('does not reinterpret %s as a correctable missing call', reason => {
    expect(() => nativeAgentSdkResponse({ text: 'Partial answer', provider: 'm3', model: 'MiniMax-M3', promptHash: 'test',
      usage: { inputTokens: 20, outputTokens: 8 }, finishReason: 'other', providerStopReason: reason,
      providerContent: { ...continuation, content: [{ type: 'text', text: 'Partial answer' }] } }, 'invalid')).toThrow('Unsupported native agent SDK response');
  });
  it('refuses a tool-use stop without the original complete thinking/text-only provider blocks', () => {
    const response = { text: 'Partial', provider: 'm3', model: 'MiniMax-M3', promptHash: 'test',
      usage: { inputTokens: 20, outputTokens: 8 }, finishReason: 'other' as const, providerStopReason: 'tool_use' as const };
    expect(() => nativeAgentSdkResponse(response, 'missing-blocks')).toThrow();
    expect(() => nativeAgentSdkResponse({ ...response, providerContent: continuation }, 'unparsed-tool-block')).toThrow();
  });
  it('maps native history without turning tool calls or complete provider content into text', () => {
    const input = nativeAgentSdkRequest({ model: 'MiniMax-M3', stream: false, max_tokens: 4096, tools, messages: [
      { role: 'system', content: 'Bound task.' }, { role: 'user', content: 'Read.' },
      { role: 'assistant', content: '', tool_calls: calls, reasoning: null,
        reasoning_details: [{ type: 'openscience-provider-content', provider_content: continuation }] },
      { role: 'tool', content: 'Native skill catalogue.', tool_call_id: 'call-1' },
    ] }, 'MiniMax-M3');
    expect(input.messages[2]).toEqual({ role: 'assistant', content: '', toolCalls: calls, providerContent: continuation });
    expect(input.messages[3]).toEqual({ role: 'tool', content: 'Native skill catalogue.', toolCallId: 'call-1' });
    expect(input.options.tools).toEqual(tools);
    expect(input.options.maxTokens).toBe(4096);
  });

  it('returns an SDK tool response with opaque continuation under the actual native-preserved detail field', () => {
    const response = nativeAgentSdkResponse({ text: '', provider: 'm3', model: 'MiniMax-M3', promptHash: 'test',
      usage: { inputTokens: 20, outputTokens: 8 }, finishReason: 'other', toolCalls: calls, providerContent: continuation }, 'turn-1');
    expect(response.choices[0].finish_reason).toBe('tool_calls');
    expect(response.choices[0].message.tool_calls).toEqual(calls);
    expect(response.choices[0].message.reasoning_details).toEqual([{ type: 'openscience-provider-content', provider_content: continuation }]);
    expect(response.usage).toEqual({ prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 });
  });

  it.each([
    { model: 'foreign-model' }, { stream: true }, { tools: [] },
    { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://foreign/image.png' } }] }] },
    { messages: [{ role: 'assistant', content: '', reasoning_details: [{ type: 'unknown', content: 'untrusted' }] }] },
  ])('refuses unsupported transport or ambiguous provider continuation', patch => {
    expect(() => nativeAgentSdkRequest({ model: 'MiniMax-M3', stream: false, tools, messages: [{ role: 'user', content: 'Read.' }], ...patch }, 'MiniMax-M3')).toThrow();
  });

  it('keeps length stop status even when a truncated response contains tool calls', () => {
    const response = nativeAgentSdkResponse({ text: '', provider: 'm3', model: 'MiniMax-M3', promptHash: 'test',
      usage: { inputTokens: 20, outputTokens: 8 }, finishReason: 'length', toolCalls: calls }, 'truncated');
    expect(response.choices[0].finish_reason).toBe('length');
  });

  it('maps top_p and explicitly refuses execution options this bridge cannot represent', () => {
    const raw = { model: 'MiniMax-M3', tools, messages: [{ role: 'user', content: 'Read.' }], top_p: 0.95 };
    expect(nativeAgentSdkRequest(raw, 'MiniMax-M3').options.topP).toBe(0.95);
    for (const patch of [{ tool_choice: 'required' }, { reasoning_effort: 'high' }, { parallel_tool_calls: false }]) {
      expect(() => nativeAgentSdkRequest({ ...raw, ...patch }, 'MiniMax-M3')).toThrow('Unsupported native agent SDK');
    }
  });

  it('preserves native interleaved image and caption order', () => {
    const data = readFileSync(resolve(__dirname, 'fixtures/minimax-reference.png')).toString('base64');
    const input = nativeAgentSdkRequest({ model: 'MiniMax-M3', tools, messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }, { type: 'text', text: 'Caption of first figure.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }, { type: 'text', text: 'Caption of second figure.' },
    ] }] }, 'MiniMax-M3');
    expect(input.messages[0].contentParts).toEqual([{ type: 'image', imageIndex: 0 }, { type: 'text', text: 'Caption of first figure.' },
      { type: 'image', imageIndex: 1 }, { type: 'text', text: 'Caption of second figure.' }]);
  });

  it('preserves interleaved pixels and captions in the actual Anthropic HTTP body', async () => {
    const data = readFileSync(resolve(__dirname, 'fixtures/minimax-reference.png')).toString('base64');
    const request = nativeAgentSdkRequest({ model: 'MiniMax-M3', tools, messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }, { type: 'text', text: 'First caption.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }, { type: 'text', text: 'Second caption.' },
    ] }] }, 'MiniMax-M3');
    let body!: { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
    const provider = new AnthropicCompatProvider('m3', { model: 'MiniMax-M3', baseUrl: 'https://offline.invalid', apiKey: 'fixture-only' },
      async (_url, options) => { body = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ model: 'MiniMax-M3', content: [{ type: 'text', text: 'Observed.' }], stop_reason: 'end_turn' })); });
    await provider.complete({ model: 'MiniMax-M3', messages: request.messages, ...request.options });
    expect(body.messages[0].content.map(block => block.type)).toEqual(['image', 'text', 'image', 'text']);
    expect(body.messages[0].content[1].text).toBe('First caption.');
    expect(body.messages[0].content[3].text).toBe('Second caption.');
  });
});
