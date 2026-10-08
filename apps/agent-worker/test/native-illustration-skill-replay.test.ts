import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiGateway, AnthropicCompatProvider, type TextProvider } from '@openscience/ai-gateway';
import { createNativeAgentSession, type NativeAgentSessionState, type NativeAgentSessionStore } from '../src/native-agent/session';
import type * as NativeModule from '../src/native-agent/illustration-task';

const resources = vi.hoisted(() => ({ old: false, missingLegacy: false, corruptLegacy: false, root: undefined as '20' | '21' | undefined }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const section = (text: string) => {
    const lines = text.replace(/\r\n/gu, '\n').split('\n'), start = lines.indexOf('## Execution');
    let end = start + 1;
    while (end < lines.length && !/^#{1,2} /u.test(lines[end]!)) end++;
    return lines.slice(start, end).join('\n');
  };
  return { ...actual, readFileSync: (...args: Parameters<typeof readFileSync>) => {
    const path = String(args[0]).replaceAll('\\', '/');
    if (path.endsWith('/references/legacy-execution-v19.md')) {
      if (resources.missingLegacy) throw new Error('Missing historical fixture resource');
      const text = actual.readFileSync(...args);
      return resources.corruptLegacy ? String(text).replace('through Chat', 'through an invented provider') : text;
    }
    if (resources.old && path.endsWith('/openscience-research-illustration/SKILL.md')) {
      const current = String(actual.readFileSync(...args)).replace(/\r\n/gu, '\n');
      const legacy = String(actual.readFileSync(path.replace(/SKILL\.md$/u, 'references/legacy-execution-v19.md'), 'utf8'));
      // These are the actual v19 consumed Execution bytes, not a handwritten prompt.
      // Planning/Visual craft were independently compared equal across v19/v20.
      return current.replace(section(current), section(legacy)).replace(/^ {2}version: "[1-9]\d*"$/mu, '  version: "19"');
    }
    if (resources.root && path.endsWith('/openscience-research-illustration/SKILL.md'))
      return String(actual.readFileSync(...args)).replace(/^ {2}version: "[1-9]\d*"$/mu, `  version: "${resources.root}"`);
    return actual.readFileSync(...args);
  } };
});

type Materializer = ReturnType<typeof NativeModule.createNativeIllustrationMaterializer>;
type MaterializerInput = Parameters<typeof NativeModule.createNativeIllustrationMaterializer>[0];
type SdkResponse = Awaited<ReturnType<ReturnType<typeof createNativeAgentSession>['complete']>>;
type SdkMessage = SdkResponse['choices'][number]['message'];
type SdkHistory = Array<Record<string, unknown> | SdkMessage>;
const initial = [{ role: 'system', content: 'Fixed private illustration task' }, { role: 'user', content: 'Explain the source relation.' }];
const science = { title: 'Two regions', narrative: { mainMessage: 'A supported relation', audience: 'A new reader' },
  scenes: [{ title: 'A relation', narration: 'These regions are connected.', message: 'A conditional relation', domain: 'conceptual',
    subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } }], encoding: 'A link represents the relationship of subject 0.',
    labels: ['Connected regions'], constraints: ['Not to scale'], paperOriginalAssetId: null }] };
const art = { scienceToolCallId: 'science', scenes: [{ layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.' }] };
const calls = [
  ['context', 'paper_illustration_context', {}], ['science', 'paper_illustration_science', science],
  ['art', 'paper_illustration_art', art], ['review', 'paper_illustration_review',
    { planToolCallId: 'art', decision: 'accepted', summary: 'The source and image plan agree.', corrections: [], issues: [] }],
] as const;
const finalResponse = '{"reviewToolCallId":"review"}';

async function load(old: boolean, root?: '20' | '21') {
  resources.old = old;
  resources.root = root;
  vi.resetModules();
  return import('../src/native-agent/illustration-task');
}
function gateway(recordCalls: boolean, selectedCalls: ReadonlyArray<readonly [string, string, unknown]> = calls) {
  let count = 0;
  const preflight = new AnthropicCompatProvider('minimax', { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'MiniMax-M3' },
    async () => { throw new Error('Unexpected real HTTP'); });
  const complete = vi.fn(async () => {
    if (!recordCalls) throw new Error('A replay must not call the model');
    const call = selectedCalls[count++];
    return { model: 'MiniMax-M3', text: call ? '' : finalResponse, finishReason: call ? 'tool_calls' as const : 'stop' as const,
      usage: { inputTokens: 10, outputTokens: 10 },
      ...(call ? { toolCalls: [{ id: call[0], type: 'function' as const,
        function: { name: call[1], arguments: JSON.stringify(call[2]) } }] } : {}) };
  });
  const provider: TextProvider = { name: 'minimax', model: 'MiniMax-M3',
    preflightNativeTools: options => preflight.preflightNativeTools(options), complete };
  return { gateway: new AiGateway({ providers: [provider] }), complete };
}
async function runSdk(session: ReturnType<typeof createNativeAgentSession>, materializer: Materializer,
  tools: NonNullable<NativeAgentSessionState['turns'][number]['request']['options']['tools']>) {
  const messages: SdkHistory = structuredClone(initial);
  for (let sequence = 0; sequence < 8; sequence++) {
    const result = await session.complete({ model: 'MiniMax-M3', max_tokens: 100, messages, tools });
    const assistant = result.choices[0]!.message;
    const tool = assistant.tool_calls?.[0];
    if (!tool) return { messages, finalResponse: assistant.content };
    const reply = materializer.call(tool.function.name, JSON.parse(tool.function.arguments), sequence, tool.id);
    messages.push(assistant, { role: 'tool', tool_call_id: tool.id, content: JSON.stringify(reply) });
  }
  throw new Error('Fixture did not stop');
}
async function capture(style = 'aged-academia', withRepair = false, original: '19' | '20' = '19') {
  const old = await load(original === '19', original === '20' ? '20' : undefined), fresh = old.nativeIllustrationToolProfile(null);
  const tools = fresh.sourceTools.map(tool => ({ type: 'function' as const, function: structuredClone(tool) }));
  const definition = tools.find(tool => tool.function.name === 'paper_illustration_science')!.function;
  definition.description = definition.description.slice(0, definition.description.indexOf(' Complete numbered Fig'));
  const profile = old.nativeIllustrationToolProfile({ turns: [{ request: { options: { tools } } }] } as never);
  const input = { settings: { locale: 'en', style, instruction: 'Explain the relation.', output: 'image', narrative: true },
    claims: [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding', statement: 'A qualitative relation', assessment: 'supported',
      conditions: [], limitations: [], sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001',
        relation: 'supports', text: 'Two regions are connected under the stated condition.' }] }], paperOriginals: new Map(), ...profile } as MaterializerInput;
  const binding = { taskId: 'task', artifactId: 'artifact', documentSha256: 'document', sourceMapHash: 'map',
    runtimeId: 'old-installed-runtime', skillCatalogueId: 'old-immutable-catalogue', model: 'MiniMax-M3', allowedTools: tools.map(tool => tool.function.name),
    maxTurns: 8, maxOutputTokens: 100, maxTotalOutputTokens: 1000, maxInputBytes: 2_000_000, deadlineAt: Date.now() + 600_000 };
  let state: NativeAgentSessionState | null = null;
  const store: NativeAgentSessionStore = { read: async () => structuredClone(state),
    compareAndSet: async (expected, next) => { expect(state).toEqual(expected); state = structuredClone(next); },
    complete: async (started, completed) => { expect(state).toEqual(started); state = structuredClone(completed); },
    publish: async (started, submit) => { expect(state).toEqual(started); return submit(); } };
  const repairedScience = structuredClone(science); repairedScience.scenes[0]!.labels = ['7 fs'];
  const captureCalls: ReadonlyArray<readonly [string, string, unknown]> = withRepair ? [calls[0],
    ['science', 'paper_illustration_science', repairedScience],
    ['repair', 'paper_illustration_science_repair', { scienceToolCallId: 'science', sceneIndex: 0, scene: science.scenes[0] }],
    ['art', 'paper_illustration_art', { ...art, scienceToolCallId: 'repair' }], calls[3]] : calls;
  const selectedCalls = captureCalls.map(call => style === 'auto' && call[0] === 'art'
    ? ['art', 'paper_illustration_art', { scienceToolCallId: 'science', scenes: [{ ...art.scenes[0], styleId: 'article:editorial' }] }] as const : call);
  const producer = gateway(true, selectedCalls), materializer = old.createNativeIllustrationMaterializer(input);
  const session = createNativeAgentSession({ gateway: producer.gateway, binding, store, authorize: async () => undefined });
  expect(await runSdk(session, materializer, tools)).toMatchObject({ finalResponse });
  const saved = await store.read();
  expect(saved).not.toBeNull();
  const completed = materializer.finish(saved!.turns.at(-1)!.request.messages, finalResponse);
  expect(completed.prompts[0]!.prompt).toContain(original === '19' ? 'authorized Chat reference-image path' : 'selected Synclip model contract');
  expect(producer.complete).toHaveBeenCalledTimes(selectedCalls.length + 1);
  return { input, state: saved!, prompts: completed.prompts };
}
async function replay(captured: Awaited<ReturnType<typeof capture>>, root?: '20' | '21') {
  const current = await load(false, root), state = structuredClone(captured.state);
  const readOnlyStore = { read: async () => structuredClone(state), compareAndSet: vi.fn(async () => { throw new Error('Unexpected replay write'); }),
    complete: vi.fn(async () => { throw new Error('Unexpected replay completion'); }),
    publish: vi.fn(async () => { throw new Error('Unexpected replay publication'); }) };
  const provider = gateway(false);
  const input = { ...captured.input, ...current.nativeIllustrationToolProfile(state), savedState: state };
  const materializer = current.createNativeIllustrationMaterializer(input);
  const session = createNativeAgentSession({ gateway: provider.gateway, binding: state.binding, store: readOnlyStore, authorize: async () => undefined });
  return { state, materializer, session, readOnlyStore, provider, input, current };
}
function artReceipt(state: NativeAgentSessionState) {
  return state.turns.at(-1)!.request.messages.find(message => message.role === 'tool' && message.toolCallId === 'art')!;
}
function replayBeforeArt(materializer: Materializer) {
  materializer.call('paper_illustration_context', {}, 0, 'context');
  return materializer.call('paper_illustration_science', science, 1, 'science');
}
afterEach(() => { resources.old = false; resources.missingLegacy = false; resources.corruptLegacy = false; resources.root = undefined; vi.resetModules(); });

describe('review-only v21 resource attribution', () => {
  it.each([
    ['19', 'aged-academia', false], ['19', 'auto', false], ['19', 'handdraw:#002', false],
    ['20', 'aged-academia', false], ['20', 'auto', false], ['20', 'handdraw:#002', false],
    ['19', 'handdraw:#002', true], ['20', 'handdraw:#002', true],
  ] as const)('preserves the full paid v%s finish across v20/v21 (%s, repair=%s)', async (original, style, repair) => {
    const captured = await capture(style, repair, original), before = structuredClone(captured.state);
    const complete = async (root: '20' | '21') => {
      const restored = await replay(captured, root);
      expect(await runSdk(restored.session, restored.materializer, captured.state.turns[0]!.request.options.tools!))
        .toMatchObject({ finalResponse });
      const result = restored.materializer.finish(captured.state.turns.at(-1)!.request.messages, finalResponse);
      expect(restored.provider.complete).not.toHaveBeenCalled();
      expect(restored.readOnlyStore.compareAndSet).not.toHaveBeenCalled();
      expect(restored.readOnlyStore.complete).not.toHaveBeenCalled();
      expect(restored.readOnlyStore.publish).not.toHaveBeenCalled();
      return result;
    };
    const previous = await complete('20'), current = await complete('21');
    expect(current).toEqual(previous);
    expect(current.designSkills.some(item => item.id === 'openscience-research-illustration' && item.version === '21')).toBe(false);
    expect(captured.state).toEqual(before);
  });
  it.each(['19', '20'] as const)('does not resubmit an original started v%s turn under v21', async original => {
    const captured = await capture('handdraw:#002', false, original), last = captured.state.turns.at(-1)!;
    captured.state.turns[captured.state.turns.length - 1] = { state: 'started', target: last.target, request: last.request, effectiveOptions: last.effectiveOptions };
    const before = structuredClone(captured.state), restored = await replay(captured, '21');
    await expect(runSdk(restored.session, restored.materializer, captured.state.turns[0]!.request.options.tools!))
      .rejects.toThrow(/outcome unknown/u);
    expect(captured.state).toEqual(before);
    expect(restored.provider.complete).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.compareAndSet).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.complete).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.publish).not.toHaveBeenCalled();
  });
});

describe('v19 Execution resource compatibility', () => {
  it.each(['aged-academia', 'auto', 'handdraw:#002'])('replays paid SDK tools and final validation without a new model call (%s)', async style => {
    const captured = await capture(style), before = structuredClone(captured.state), restored = await replay(captured);
    const tools = captured.state.turns[0]!.request.options.tools!;
    expect(await runSdk(restored.session, restored.materializer, tools)).toMatchObject({ finalResponse });
    const result = restored.materializer.finish(captured.state.turns.at(-1)!.request.messages, finalResponse);
    expect(result.prompts).toEqual(captured.prompts);
    expect(result.designSkills).toContainEqual(expect.objectContaining({ id: 'openscience-research-illustration', version: '19',
      resources: expect.arrayContaining(['references/legacy-execution-v19.md#Execution']) }));
    expect(result.designSkills.filter(item => item.id === 'openscience-research-illustration' && item.version === '20')
      .flatMap(item => item.resources)).not.toContain('SKILL.md#Execution');
    expect(captured.state).toEqual(before);
    expect(restored.provider.complete).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.compareAndSet).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.complete).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.publish).not.toHaveBeenCalled();
  });
  it('uses v20 for a new art call even while old calls are being replayed', async () => {
    const restored = await replay(await capture('handdraw:#002'));
    replayBeforeArt(restored.materializer);
    const result = restored.materializer.call('paper_illustration_art', art, 2, 'fresh-art') as { prompts: Array<{ prompt: string }> };
    expect(result.prompts[0]!.prompt).toContain('selected Synclip model contract');
    expect(result.prompts[0]!.prompt).not.toContain('authorized Chat reference-image path');
  });
  it('replays a successful handdraw science repair from the same rejected-science state', async () => {
    const captured = await capture('handdraw:#002', true), restored = await replay(captured);
    expect(await runSdk(restored.session, restored.materializer, captured.state.turns[0]!.request.options.tools!))
      .toMatchObject({ finalResponse });
    expect(restored.materializer.finish(captured.state.turns.at(-1)!.request.messages, finalResponse).prompts).toEqual(captured.prompts);
    expect(restored.provider.complete).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.compareAndSet).not.toHaveBeenCalled();
  });
  it('uses v20 when no recorded art receipt exists', async () => {
    const captured = await capture(), current = await load(false);
    const materializer = current.createNativeIllustrationMaterializer({ ...captured.input });
    replayBeforeArt(materializer);
    const result = materializer.call('paper_illustration_art', art, 2, 'art') as { prompts: Array<{ prompt: string }> };
    expect(result.prompts[0]!.prompt).toContain('selected Synclip model contract');
  });
  it('cannot replay the old SDK history without its bound saved receipts', async () => {
    const captured = await capture(), restored = await replay(captured);
    const unbound = restored.current.createNativeIllustrationMaterializer({ ...restored.input, savedState: null });
    await expect(runSdk(restored.session, unbound, captured.state.turns[0]!.request.options.tools!))
      .rejects.toThrow(/request changed/u);
    expect(restored.provider.complete).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.publish).not.toHaveBeenCalled();
  });
  it.each(['prompt', 'document', 'args', 'science', 'duplicate'])('rejects a changed %s instead of trusting the saved prompt', async mode => {
    const captured = await capture(), messages = captured.state.turns.at(-1)!.request.messages;
    if (mode === 'args') {
      const tool = messages.find(message => message.role === 'assistant' && message.toolCalls?.some(item => item.id === 'art'))!.toolCalls![0]!;
      const args = JSON.parse(tool.function.arguments); args.scenes[0].layout += ' changed'; tool.function.arguments = JSON.stringify(args);
    } else if (mode === 'duplicate') messages.push(structuredClone(artReceipt(captured.state)));
    else if (mode === 'science') captured.input.claims[0]!.sourcePassages![0]!.text = 'A different source relation with different conditions.';
    else {
      const receipt = artReceipt(captured.state), result = JSON.parse(receipt.content);
      if (mode === 'prompt') result.prompts[0].prompt += '\nInvented visual instruction.';
      else result.document.scenes[0].title += ' changed';
      receipt.content = JSON.stringify(result);
    }
    await expect((async () => {
      const restored = await replay(captured);
      replayBeforeArt(restored.materializer);
      restored.materializer.call('paper_illustration_art', art, 2, 'art');
    })()).rejects.toThrow(/history changed/u);
  });
  it.each(['missing', 'changed'])('rejects %s historical bytes', async mode => {
    const captured = await capture(), restored = await replay(captured);
    resources.missingLegacy = mode === 'missing'; resources.corruptLegacy = mode === 'changed';
    replayBeforeArt(restored.materializer);
    expect(() => restored.materializer.call('paper_illustration_art', art, 2, 'art')).toThrow(/history changed/u);
  });
  it('keeps the original started turn blocked after replaying earlier paid tools', async () => {
    const captured = await capture(), last = captured.state.turns.at(-1)!;
    captured.state.turns[captured.state.turns.length - 1] = { state: 'started', target: last.target, request: last.request, effectiveOptions: last.effectiveOptions };
    const before = structuredClone(captured.state), restored = await replay(captured);
    await expect(runSdk(restored.session, restored.materializer, captured.state.turns[0]!.request.options.tools!))
      .rejects.toThrow(/outcome unknown/u);
    expect(captured.state).toEqual(before);
    expect(restored.provider.complete).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.publish).not.toHaveBeenCalled();
    expect(restored.readOnlyStore.compareAndSet).not.toHaveBeenCalled();
  });
});
