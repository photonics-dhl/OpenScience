import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { nativeImageReviewPromptHash, type ScienceReviewInput } from '@openscience/ai-gateway';
import { buildGateway } from '../src/index';
import { createNativeAgentSession, type NativeAgentSessionState } from '../src/native-agent/session';

const bytes = readFileSync(resolve(__dirname, '../../../packages/ai-gateway/test/fixtures/minimax-reference.png'));
const hash = createHash('sha256').update(bytes).digest('hex');
const request = (): ScienceReviewInput => ({ requestId: 'image-task', prompt: 'Inspect this saved image against its source.',
  authorizationContext: { taskId: 'image-task', actorId: 'actor', workspaceId: 'ws' },
  illustrationContext: { executionAttempt: 1, claimContent: 'claims', baseIdentity: 'parent', imageReviewMode: 'model-native' },
  source: { kind: 'illustration-image', researchObjectId: 'ro', versionId: 'version', candidateHash: hash, sourceEvidenceIdentity: 'b'.repeat(64) },
  attachments: [{ fileName: 'page-1.png', mediaType: 'image/png', bytes, sha256: hash, pageNumber: 1, width: 1, height: 1 }] });
const guard = (value: unknown): value is { decision: 'accepted' } => Boolean(value && typeof value === 'object'
  && (value as { decision?: unknown }).decision === 'accepted');
const env = { AI_ENABLED: 'true', MINIMAX_MODEL: 'MiniMax-M3', MINIMAX_API_MODE: 'anthropic',
  MINIMAX_API_KEY: 'offline-primary', MINIMAX_API_KEY_2: 'offline-backup',
  MINIMAX_TOKEN_PLAN_BASE_URL: 'https://offline.invalid/anthropic' };

function fixture(patch: NodeJS.ProcessEnv = {}, enabled = true, failVision = false) {
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (failVision && body.model === 'MiniMax-M3.1-Flash-Preview') return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({ model: body.model, content: [{ type: 'text', text: '{"decision":"accepted"}' }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  });
  const owner = vi.fn(async (_input, _target, submit) => submit());
  const gateway = buildGateway({ ...env, ...patch }, fetcher as typeof fetch, undefined, async () => true,
    { isEnabled: async () => ({ enabled }) }, { image: async () => { throw new Error('Unexpected image publication'); },
      review: async () => { throw new Error('Unexpected web review publication'); }, illustration: async (_input, submit) => submit(), nativeImageReview: owner }, async () => true);
  let state: NativeAgentSessionState | null = null;
  const writes = vi.fn();
  const binding = { taskId: 'native-task', artifactId: 'artifact', documentSha256: 'document', sourceMapHash: 'map',
    runtimeId: 'installed-runtime', skillCatalogueId: 'fixed-catalogue', model: 'MiniMax-M3', allowedTools: ['paper_read'],
    maxTurns: 2, maxOutputTokens: 100, maxTotalOutputTokens: 200, maxInputBytes: 10000, deadlineAt: Date.now() + 60000 };
  const session = createNativeAgentSession({ gateway, binding, authorize: async () => undefined,
    store: { read: async () => structuredClone(state),
      compareAndSet: async (previous, next) => { expect(state).toEqual(previous); writes(); state = structuredClone(next); },
      complete: async (previous, next) => { expect(state).toEqual(previous); state = structuredClone(next); },
      publish: async (previous, submit) => { expect(state).toEqual(previous); return submit(); } } });
  const continueNative = () => session.complete({ model: 'MiniMax-M3', max_tokens: 100,
    tools: [{ type: 'function', function: { name: 'paper_read', description: 'Read the selected source.',
      parameters: { type: 'object', properties: { passageId: { type: 'string' } }, required: ['passageId'], additionalProperties: false } } }],
    messages: [{ role: 'system', content: 'Fixed original task' }, { role: 'user', content: 'Continue source understanding.' }] });
  return { gateway, fetcher, owner, writes, continueNative };
}

describe('Worker native pixel model configuration', () => {
  it('consumes the dedicated environment role without moving the original Native M3 binding', async () => {
    const f = fixture({ MINIMAX_IMAGE_REVIEW_MODEL: 'MiniMax-M3.1-Flash-Preview' });
    const input = request();
    expect(await f.gateway.reviewScientific(input, guard)).toMatchObject({ model: 'MiniMax-M3.1-Flash-Preview' });
    expect(f.owner.mock.calls[0]?.[1]).toEqual({ provider: 'minimax-key-1-model-1', model: 'MiniMax-M3.1-Flash-Preview', promptHash: nativeImageReviewPromptHash(input) });
    expect((await f.continueNative()).choices[0]?.message.content).toBe('{"decision":"accepted"}');
    const bodies = f.fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.map(body => body.model)).toEqual(['MiniMax-M3.1-Flash-Preview', 'MiniMax-M3']);
    expect(bodies[0].messages[0].content[1].source.data).toBe(bytes.toString('base64'));
    expect(f.fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://offline.invalid/anthropic/v1/messages', 'https://offline.invalid/anthropic/v1/messages']);
    expect(f.fetcher.mock.calls.map(([, init]) => (init!.headers as Record<string, string>)['x-api-key']))
      .toEqual(['offline-primary', 'offline-primary']);
  });
  it.each([undefined, '', '  '])('preserves the current primary when no explicit pixel model is configured (%s)', async model => {
    const f = fixture({ MINIMAX_IMAGE_REVIEW_MODEL: model });
    expect(await f.gateway.reviewScientific(request(), guard)).toMatchObject({ model: 'MiniMax-M3' });
  });
  it('reproduces the original global M3.1 / bound Native M3 mismatch before any HTTP or CP write', async () => {
    const f = fixture({ MINIMAX_MODEL: 'MiniMax-M3.1-Flash-Preview' });
    await expect(f.continueNative()).rejects.toThrow(/model identity changed/u);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.writes).not.toHaveBeenCalled();
  });
  it('keeps the existing runtime kill switch on the dedicated role', async () => {
    const f = fixture({ MINIMAX_IMAGE_REVIEW_MODEL: 'MiniMax-M3.1-Flash-Preview' }, false);
    await expect(f.gateway.reviewScientific(request(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.owner).not.toHaveBeenCalled();
  });
  it('does not fail over the paid pixel role to another model or key', async () => {
    const f = fixture({ MINIMAX_IMAGE_REVIEW_MODEL: 'MiniMax-M3.1-Flash-Preview', AI_FALLBACK_MODELS: 'MiniMax-M3.1-Flash-Preview' }, true, true);
    await expect(f.gateway.reviewScientific(request(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.owner).toHaveBeenCalledOnce();
    expect((f.fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>)['x-api-key']).toBe('offline-primary');
    await f.continueNative();
    expect(JSON.parse(String(f.fetcher.mock.calls[1]?.[1]?.body)).model).toBe('MiniMax-M3');
  });
});
