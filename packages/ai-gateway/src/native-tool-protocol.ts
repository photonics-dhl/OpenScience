import { TextProviderError, type ChatMessage } from './provider';
import { isDeepStrictEqual } from 'node:util';

export interface ChatToolDefinition {
  type: 'function';
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
/** Private provider continuity, including opaque signatures. Never projected into user output or audit logs. */
export interface ProviderAssistantContent {
  provider: string;
  model: string;
  content: readonly Record<string, unknown>[];
}
const namePattern = /^[A-Za-z0-9_-]{1,64}$/u;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never { throw new TextProviderError('provider_response_shape', 'Invalid native tool protocol'); }

function frozenJson<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (node: unknown): void => {
    if (node && typeof node === 'object') { Object.values(node).forEach(freeze); Object.freeze(node); }
  };
  freeze(copy);
  return copy;
}

export function snapshotToolDefinitions(value: readonly ChatToolDefinition[] | undefined): readonly ChatToolDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length) return invalid();
  const seen = new Set<string>();
  for (const tool of value) {
    if (!object(tool) || tool.type !== 'function' || !object(tool.function) || typeof tool.function.name !== 'string'
      || !namePattern.test(tool.function.name) || seen.has(tool.function.name)
      || (tool.function.description !== undefined && typeof tool.function.description !== 'string')
      || !object(tool.function.parameters) || tool.function.parameters.type !== 'object') return invalid();
    seen.add(tool.function.name);
  }
  return frozenJson(value);
}

export function snapshotToolCalls(value: unknown, tools?: readonly ChatToolDefinition[]): readonly ChatToolCall[] {
  if (!Array.isArray(value) || !value.length) return invalid();
  const seen = new Set<string>();
  for (const call of value) {
    if (!object(call) || typeof call.id !== 'string' || !call.id.trim() || call.id.length > 256 || seen.has(call.id)
      || call.type !== 'function' || !object(call.function) || typeof call.function.name !== 'string'
      || !namePattern.test(call.function.name) || typeof call.function.arguments !== 'string') return invalid();
    const functionName = call.function.name;
    if (tools && !tools.some(tool => tool.function.name === functionName)) return invalid();
    try { if (!object(JSON.parse(call.function.arguments))) return invalid(); } catch { return invalid(); }
    seen.add(call.id);
  }
  return frozenJson(value as ChatToolCall[]);
}

export function snapshotAssistantContent(value: ProviderAssistantContent): ProviderAssistantContent {
  if (!object(value) || typeof value.provider !== 'string' || !value.provider || typeof value.model !== 'string' || !value.model
    || !Array.isArray(value.content) || !value.content.length) return invalid();
  for (const block of value.content) {
    if (!object(block)) return invalid();
    if (block.type === 'text' && typeof block.text === 'string') continue;
    if (block.type === 'thinking' && typeof block.thinking === 'string'
      && (block.signature === undefined || typeof block.signature === 'string')) continue;
    if (block.type === 'redacted_thinking' && typeof block.data === 'string') continue;
    if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string' && object(block.input)) continue;
    return invalid();
  }
  return frozenJson(value);
}

/** No orphan, duplicate or unreturned calls may cross the external boundary. */
export function validateToolHistory(messages: readonly ChatMessage[], tools: readonly ChatToolDefinition[] | undefined): void {
  const pending = new Map<string, string>(); const seen = new Set<string>();
  for (const message of messages) {
    if (message.role === 'tool') {
      if (!tools || !message.toolCallId || !pending.has(message.toolCallId) || message.toolCalls || message.providerContent
        || (message.name !== undefined && message.name !== pending.get(message.toolCallId))) return invalid();
      pending.delete(message.toolCallId);
    } else {
      if (pending.size || message.toolCallId !== undefined) return invalid();
      if (message.toolCalls !== undefined) {
        if (!tools || message.role !== 'assistant') return invalid();
        for (const call of snapshotToolCalls(message.toolCalls, tools)) {
          if (seen.has(call.id)) return invalid();
          seen.add(call.id); pending.set(call.id, call.function.name);
        }
      }
      if (message.providerContent !== undefined && (!tools || message.role !== 'assistant')) return invalid();
    }
  }
  if (pending.size) return invalid();
}

export function callsFromAnthropic(blocks: readonly Record<string, unknown>[], tools: readonly ChatToolDefinition[]): readonly ChatToolCall[] | undefined {
  const calls = blocks.filter(block => block.type === 'tool_use').map(block => ({
    id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) },
  }));
  return calls.length ? snapshotToolCalls(calls, tools) : undefined;
}

export function validateResponseCallIds(calls: readonly ChatToolCall[] | undefined, messages: readonly ChatMessage[]): void {
  const used = new Set(messages.flatMap(message => message.toolCalls?.map(call => call.id) ?? []));
  if (calls?.some(call => used.has(call.id))) return invalid();
}

export function anthropicMessages(messages: readonly ChatMessage[], tools: readonly ChatToolDefinition[] | undefined, provider: string, model: string) {
  validateToolHistory(messages, tools);
  const result: Array<{ role: 'user' | 'assistant'; content: string | Record<string, unknown>[] }> = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content };
      const previous = result.at(-1);
      if (previous?.role === 'user' && Array.isArray(previous.content) && previous.content.every(b => b.type === 'tool_result')) previous.content.push(block);
      else result.push({ role: 'user', content: [block] });
      continue;
    }
    if (message.providerContent) {
      const saved = snapshotAssistantContent(message.providerContent);
      if (saved.provider !== provider || saved.model !== model) return invalid();
      const text = saved.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const actual = callsFromAnthropic(saved.content, tools!);
      // Parsed JSON input is semantic; the original provider blocks themselves stay byte-equivalent JSON.
      const normalized = (calls: readonly ChatToolCall[] | undefined) => (calls ?? []).map(c => ({ id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments) }));
      if (text !== message.content || !isDeepStrictEqual(normalized(actual), normalized(message.toolCalls))) return invalid();
      result.push({ role: 'assistant', content: structuredClone(saved.content) as Record<string, unknown>[] });
      continue;
    }
    const ordered: Record<string, unknown>[] | undefined = message.contentParts?.map(part => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      const image = message.images![part.imageIndex];
      return { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } };
    });
    const content: Record<string, unknown>[] = ordered ?? [
      ...(message.content ? [{ type: 'text', text: message.content }] : []),
      ...(message.images?.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })) ?? []),
      ...(message.toolCalls?.map(call => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) })) ?? []),
    ];
    result.push({ role: message.role, content: message.images || message.toolCalls || message.contentParts ? content : message.content });
  }
  return result;
}
