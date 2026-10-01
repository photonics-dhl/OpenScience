// Offline-only fixture transport. Real native SDK messages pass through real Gateway adapters.
const fs = require('node:fs');
const path = require('node:path');
const { AiGateway } = require(path.join(__dirname, 'gateway-dist/gateway.js'));
const { AnthropicCompatProvider } = require(path.join(__dirname, 'gateway-dist/provider.js'));
const { nativeAgentSdkRequest, nativeAgentSdkResponse } = require(path.join(__dirname, 'gateway-dist/native-agent-bridge.js'));

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const request = nativeAgentSdkRequest(input.request, 'MiniMax-M3');
  let calls = 0;
  const provider = new AnthropicCompatProvider('offline', { baseUrl: 'https://offline.invalid', apiKey: 'fixture-only', model: 'MiniMax-M3' },
    async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      // Every prior opaque block survives native SDK and both protocol mappings.
      const prior = input.request.messages.filter(m => m.role === 'assistant');
      const actual = body.messages.filter(m => m.role === 'assistant');
      if (actual.length !== prior.length) throw new Error('Offline assistant history changed');
      for (let i = 0; i < prior.length; i += 1) {
        const expected = prior[i].reasoning_details[0].provider_content.content;
        if (JSON.stringify(actual[i].content) !== JSON.stringify(expected)) throw new Error('Offline provider continuation changed');
      }
      return new Response(JSON.stringify({ model: 'MiniMax-M3', content: input.responseContent,
        stop_reason: input.responseContent.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 } }));
    });
  const completion = await new AiGateway({ providers: [provider] }).nativeAgentComplete(request.messages, request.options, {
    beforeProviderAttempt: async () => undefined,
    submitProvider: async (_target, submit) => submit(),
  });
  if (calls !== 1) throw new Error('Offline Gateway did not submit exactly once');
  process.stdout.write(JSON.stringify(nativeAgentSdkResponse(completion, `offline-${input.ordinal}`)));
}
main().catch(() => { process.stderr.write('Offline native Gateway bridge failed\n'); process.exitCode = 1; });
