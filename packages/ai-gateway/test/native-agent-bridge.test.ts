import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nativeAgentSdkRequest, nativeAgentSdkResponse } from '../src/native-agent-bridge';
import { AnthropicCompatProvider } from '../src/provider';

const tools = [{ type: 'function', function: { name: 'skills_list', parameters: { type: 'object', properties: {} } } }];
const continuation = { provider: 'm3', model: 'MiniMax-M3', content: [{ type: 'thinking', thinking: 'opaque', signature: 'unchanged' },
  { type: 'tool_use', id: 'call-1', name: 'skills_list', input: {} }] };
const calls = [{ id: 'call-1', type: 'function', function: { name: 'skills_list', arguments: '{}' } }];

describe('real native SDK messages at the private Gateway bridge', () => {
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
