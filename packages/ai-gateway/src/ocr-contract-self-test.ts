import { strict as assert } from 'node:assert';

import { AiGateway } from './gateway';
import { MutableProviderKillSwitch, type OcrProvider } from './ocr';
import type { Provider } from './provider';

async function main(): Promise<void> {
  let calls = 0;
  const auditEvents: unknown[] = [];
  const textProvider: Provider = {
    name: 'selftest-text',
    model: 'selftest-text',
    complete: async () => ({ text: 'ok', model: 'selftest-text', usage: { inputTokens: 1, outputTokens: 1 } }),
  };
  const ocrProvider: OcrProvider = {
    name: 'selftest-vision',
    model: 'selftest-vision-v1',
    estimate: () => ({
      inputTokens: null,
      outputTokens: null,
      costUsdMicros: 7,
      currency: 'USD',
      pricingVersion: 'selftest-v1',
      effectiveDate: '2026-08-27',
      serviceTier: 'selftest',
    }),
    recognize: async () => {
      calls += 1;
      return { text: 'candidate text' };
    },
  };
  const killSwitch = new MutableProviderKillSwitch();
  const gateway = new AiGateway({
    providers: [textProvider],
    ocrProviders: [ocrProvider],
    killSwitch,
    externalProcessingPolicy: async () => true,
    audit: { record: async (event) => { auditEvents.push(event); } },
  });
  const request = {
    authorizationContext: { taskId: 'selftest-task', workspaceId: 'selftest-workspace', actorId: 'selftest-actor' },
    source: { artifactId: 'selftest-artifact', documentSha256: 'a'.repeat(64) },
    pages: [{
      pageNumber: 1,
      mediaType: 'image/png' as const,
      bytes: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')),
      width: 1,
      height: 1,
      selectionReason: 'low_confidence' as const,
    }],
  };

  const accepted = await gateway.ocr(request);
  assert.equal(accepted.status, 'succeeded');
  assert.equal(accepted.pages[0]?.status, 'succeeded');
  assert.equal(calls, 1);
  assert.match(accepted.inputContentHash, /^[a-f0-9]{64}$/);
  assert.equal(auditEvents.length, 1);
  const serialized = JSON.stringify(auditEvents);
  assert.equal(serialized.includes('candidate text'), false);
  assert.equal(serialized.includes('data:image'), false);

  killSwitch.disable('selftest-vision', 'operator_disabled');
  const disabled = await gateway.ocr(request);
  assert.equal(disabled.status, 'failed');
  assert.equal(calls, 1);
  process.stdout.write('AI_GATEWAY_OCR_CONTRACT_OK\n');
}

void main().catch(() => {
  process.exitCode = 1;
});
