import { TextProviderError, snapshotChatMessages, type ChatMessage, type TextGenerationOptions } from './provider';
import { snapshotAssistantContent, snapshotToolCalls, snapshotToolDefinitions, validateToolHistory, type ProviderAssistantContent,
  type ChatToolDefinition } from './native-tool-protocol';
import type { GatewayCompletion } from './gateway';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never { throw new TextProviderError('provider_response_shape', 'Unsupported native agent SDK request'); }

/** Internal, non-streaming SDK transport only. Supplier routing and task authority remain in Gateway/Worker. */
export function nativeAgentSdkRequest(value: unknown, expectedModel: string): { messages: ChatMessage[]; options: TextGenerationOptions } {
  if (!object(value) || value.model !== expectedModel || value.stream === true || !Array.isArray(value.messages) || !value.messages.length) return invalid();
  if (Object.keys(value).some(key => !['model', 'messages', 'tools', 'stream', 'max_tokens', 'temperature', 'top_p'].includes(key))) return invalid();
  const tools = snapshotToolDefinitions(value.tools as readonly ChatToolDefinition[] | undefined);
  const messages = value.messages.map(raw => {
    if (!object(raw) || !['system', 'user', 'assistant', 'tool'].includes(String(raw.role))) return invalid();
    const message: ChatMessage = { role: raw.role as ChatMessage['role'], content: '' };
    if (typeof raw.content === 'string') message.content = raw.content;
    else if (raw.content == null && raw.role === 'assistant') message.content = '';
    else if (Array.isArray(raw.content) && raw.role === 'user') {
      const text: string[] = [];
      const images: NonNullable<ChatMessage['images']>[number][] = [];
      const parts: NonNullable<ChatMessage['contentParts']>[number][] = [];
      for (const part of raw.content) {
        if (!object(part)) return invalid();
        if (part.type === 'text' && typeof part.text === 'string') { text.push(part.text); parts.push({ type: 'text', text: part.text }); }
        else if (part.type === 'image_url' && object(part.image_url) && typeof part.image_url.url === 'string') {
          const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/u.exec(part.image_url.url);
          if (!match) return invalid();
          images.push({ mediaType: match[1] as 'image/png' | 'image/jpeg' | 'image/webp', data: match[2] });
          parts.push({ type: 'image', imageIndex: images.length - 1 });
        } else return invalid();
      }
      message.content = text.join('\n');
      if (images.length) message.images = images;
      message.contentParts = parts;
    } else return invalid();
    if (raw.tool_calls !== undefined) message.toolCalls = snapshotToolCalls(raw.tool_calls, tools);
    if (raw.tool_call_id !== undefined) {
      if (typeof raw.tool_call_id !== 'string') return invalid();
      message.toolCallId = raw.tool_call_id;
    }
    if (raw.name !== undefined) {
      if (typeof raw.name !== 'string') return invalid();
      message.name = raw.name;
    }
    if (raw.reasoning_details !== undefined) {
      if (!Array.isArray(raw.reasoning_details) || raw.reasoning_details.length !== 1 || !object(raw.reasoning_details[0])
        || raw.reasoning_details[0].type !== 'openscience-provider-content' || !object(raw.reasoning_details[0].provider_content)) return invalid();
      message.providerContent = snapshotAssistantContent(raw.reasoning_details[0].provider_content as unknown as ProviderAssistantContent);
    }
    return message;
  });
  const options: TextGenerationOptions = { ...(tools ? { tools } : {}) };
  if (value.max_tokens !== undefined) {
    if (!Number.isSafeInteger(value.max_tokens) || Number(value.max_tokens) < 1) return invalid();
    options.maxTokens = Number(value.max_tokens);
  }
  if (value.temperature !== undefined) {
    if (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature)) return invalid();
    options.temperature = value.temperature;
  }
  if (value.top_p !== undefined) {
    if (typeof value.top_p !== 'number' || !Number.isFinite(value.top_p) || value.top_p < 0 || value.top_p > 1) return invalid();
    options.topP = value.top_p;
  }
  const snapshot = snapshotChatMessages(messages);
  validateToolHistory(snapshot, tools);
  return { messages: snapshot, options };
}

/** SDK extra field is preserved by the installed native _build_assistant_message; no extracted thinking text is needed. */
export function nativeAgentSdkResponse(completion: GatewayCompletion, requestId: string) {
  if (!completion.toolCalls && completion.finishReason !== 'stop' && completion.finishReason !== 'length') return invalid();
  return {
    id: requestId, object: 'chat.completion', created: 0, model: completion.model,
    choices: [{ index: 0, finish_reason: completion.finishReason === 'length' ? 'length' : completion.toolCalls ? 'tool_calls' : 'stop',
      message: { role: 'assistant', content: completion.text,
        ...(completion.toolCalls ? { tool_calls: completion.toolCalls } : {}),
        ...(completion.providerContent ? { reasoning_details: [{ type: 'openscience-provider-content', provider_content: completion.providerContent }] } : {}),
      } }],
    usage: { prompt_tokens: completion.usage.inputTokens, completion_tokens: completion.usage.outputTokens,
      total_tokens: completion.usage.inputTokens + completion.usage.outputTokens },
  };
}
