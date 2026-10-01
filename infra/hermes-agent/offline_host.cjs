// Zero-provider fixture for the actual isolated AIAgent -> private socket -> Worker -> Gateway path.
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const { AiGateway, AnthropicCompatProvider, nativeAgentSdkRequest } = require('@openscience/ai-gateway');
const { createNativeAgentSession } = require('./worker-dist/session.js');
const { runHostedNativeTask } = require('./worker-dist/host-task.js');

async function main() {
  const directory = process.env.OFFLINE_NATIVE_ROOT;
  if (!directory || !path.isAbsolute(directory)) throw new Error('Missing owned offline fixture directory');
  const taskId = 'af36958a-d6d0-4666-a69c-e3c60170b17f';
  const png = fs.readFileSync(path.join(directory, 'fixture.png')).toString('base64');
  const source = { artifactId: 'offline-paper', documentSha256: 'a'.repeat(64) };
  const stateFile = path.join(directory, 'private-state.json');
  const sequence = [['skills_list', {}], ['skill_view', { name: 'paper-method' }],
    ['skill_view', { name: 'paper-method', file_path: 'references/geometry.md' }],
    ['paper_read', { passageIds: ['P00021'] }], ['paper_view', { pages: [2] }]];
  let calls = 0; let pagePixelsSeen = false; let SDKRequests = 0;
  const read = () => fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
  const write = (expected, next) => {
    if (!util.isDeepStrictEqual(read(), expected)) throw new Error('Offline checkpoint CAS lost');
    fs.writeFileSync(`${stateFile}.next`, JSON.stringify(next), { mode: 0o600 }); fs.renameSync(`${stateFile}.next`, stateFile);
  };
  const store = { read: async () => read(), compareAndSet: async (a, b) => write(a, b), complete: async (a, b) => write(a, b),
    publish: async (started, submit) => { if (!util.isDeepStrictEqual(read(), started)) throw new Error('Offline publication changed'); return submit(); } };
  const provider = new AnthropicCompatProvider('offline', { baseUrl: 'https://offline.invalid', apiKey: 'fixture-only', model: 'MiniMax-M3' }, async (_url, options) => {
    const body = JSON.parse(options.body);
    const ordinal = calls++;
    const previous = body.messages.filter(m => m.role === 'assistant');
    if (previous.length !== ordinal) throw new Error('Offline private continuation was lost');
    for (let i = 0; i < previous.length; i++) {
      if (!util.isDeepStrictEqual(previous[i].content, read().turns[i].response.providerContent.content)) throw new Error('Opaque continuation changed');
    }
    if (ordinal === sequence.length) {
      const images = body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(p => p.type === 'image');
      if (images.length !== 1 || images[0].source.data !== png) throw new Error('Actual paper pixels did not reach Anthropic HTTP');
      pagePixelsSeen = true;
    }
    const content = [{ type: 'thinking', thinking: 'opaque fixture continuation', signature: `signature-${ordinal}` }];
    if (ordinal < sequence.length) content.push({ type: 'tool_use', id: `native-${ordinal}`, name: sequence[ordinal][0], input: sequence[ordinal][1] });
    else content.push({ type: 'text', text: 'Offline native source and actual page pixels received.' });
    return new Response(JSON.stringify({ model: 'MiniMax-M3', content, stop_reason: ordinal < sequence.length ? 'tool_use' : 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  });
  const gateway = new AiGateway({ providers: [provider] });
  const sourceTools = [
    { name: 'paper_read', description: 'Read source passages.', parameters: { type: 'object', properties: { passageIds: { type: 'array', items: { type: 'string' } } }, required: ['passageIds'] } },
    { name: 'paper_view', description: 'Inspect actual source page pixels.', parameters: { type: 'object', properties: { pages: { type: 'array', items: { type: 'integer' } } }, required: ['pages'] } },
  ];
  const deadlineAt = Date.now() + 180_000;
  const binding = { taskId, ...source, sourceMapHash: 'b'.repeat(64), runtimeId: 'offline-installed-native-0.10', skillCatalogueId: 'offline-full-science-skill',
    model: 'MiniMax-M3', allowedTools: ['skills_list', 'skill_view', 'paper_read', 'paper_view'], maxTurns: 8,
    maxOutputTokens: 512, maxTotalOutputTokens: 4096, maxInputBytes: 1_000_000, deadlineAt };
  for (const attempt of [1, 2]) {
    const session = createNativeAgentSession({ gateway, binding, store, authorize: async () => undefined });
    const original = session.complete;
    let thisRunRequests = 0;
    session.complete = async request => {
      // Crash between completed turns, not after starting a new paid request.
      if (attempt === 1 && thisRunRequests === 3) throw new Error('Offline interrupted native process');
      thisRunRequests++; SDKRequests++;
      try { return await original(request); }
      catch (error) {
        const actual = nativeAgentSdkRequest(request, binding.model).messages.filter(m => m.role === 'assistant');
        fs.writeFileSync(path.join(directory, 'response-diff.json'), JSON.stringify(actual.map((message, i) => {
          const expected = read().turns[i].response;
          return { textEqual: message.content === expected.text, toolCallsEqual: util.isDeepStrictEqual(message.toolCalls, expected.toolCalls),
            providerContentEqual: util.isDeepStrictEqual(message.providerContent, expected.providerContent),
            expectedCalls: expected.toolCalls, actualCalls: message.toolCalls,
            actualPrivateKeys: Object.keys(message.providerContent ?? {}), expectedPrivateKeys: Object.keys(expected.providerContent ?? {}) };
        })), { mode: 0o600 });
        throw error;
      }
    };
    const paper = { observedPassageIds: ['P00021'], call: async (name, args) => {
      if (name === 'paper_read' && util.isDeepStrictEqual(args, { passageIds: ['P00021'] }))
        return { source, passages: [{ id: 'P00021', page: 2, text: 'Fixture paper evidence has different material-edge and centre locations.' }] };
      if (name === 'paper_view' && util.isDeepStrictEqual(args, { pages: [2] })) return { status: 'page_view_ready', source, pages: [2] };
      throw new Error('Foreign offline source selection');
    }, images: async (args, result) => {
      if (!util.isDeepStrictEqual(args, { pages: [2] }) || !util.isDeepStrictEqual(result, { status: 'page_view_ready', source, pages: [2] })) throw new Error('Offline page source changed');
      return { content: [{ type: 'text', text: `Original paper ${source.documentSha256}; page 2.` }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }] };
    } };
    try {
      const result = await runHostedNativeTask({ inboxRoot: path.join(directory, 'inbox'), executionAttempt: attempt, deadlineAt, maxInputBytes: 1_000_000,
        config: { taskId, runtimeId: binding.runtimeId, skillCatalogueId: binding.skillCatalogueId, model: binding.model,
          goal: 'Use native Skills including the full geometry reference, read the bound paper, inspect actual page 2, then report completion.',
          instructions: 'Use only the supplied native Skills and bound paper tools.', maxTurns: 8, maxOutputTokens: 512, sourceTools }, session, store, authorize: async () => undefined, paper,
        onStopped: error => process.stderr.write(`Fixture transport stopped: ${error.name}: ${error.message}\n`) });
      if (attempt !== 2 || result.finalResponse !== 'Offline native source and actual page pixels received.') throw new Error('Unexpected offline final response');
    } catch (error) {
      if (attempt !== 1 || calls !== 3 || read().turns.length !== 3 || read().turns.some(t => t.state !== 'completed')) throw error;
    }
  }
  if (calls !== 6 || SDKRequests !== 9 || !pagePixelsSeen) throw new Error('Offline replay submitted duplicate model calls');
  process.stdout.write(JSON.stringify({ actualNativeProcess: true, isolatedTaskAttempts: 2, completedResponsesReplayed: 3,
    mockGatewaySubmissions: calls, nativeSDKRequests: SDKRequests, actualPagePixelsInAnthropicHTTP: pagePixelsSeen,
    completeProviderContinuation: true, externalProviderCalls: 0, scientificQualityValidated: false }));
}
main().catch(error => { process.stderr.write(`Offline native host fixture failed: ${error.message}\n`); process.exitCode = 1; });
