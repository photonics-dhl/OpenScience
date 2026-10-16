import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@openscience/auth';
import * as voiceDomain from '@openscience/domain';
import { createFakePrisma, createFakeMailer, seedUser } from '@openscience/domain/test-helpers';
import { registerHermesVoiceRoutes } from '../src/routes/voice';
import { httpStatusForError } from '../src/error-map';
import * as sourceVoiceContract from '../../../packages/domain/src/agent/voice-contract';
import { sendPresentationAssetContent } from '../src/routes/presentation-asset-content';

// CI consumes compiled Domain; local source harnesses consume the source contract.
// Change only the actual selector supplier, including its internal Domain callers.
const requireRuntime = createRequire(__filename);
const voiceContract = voiceDomain.isHermesVoiceWriterEnabled === sourceVoiceContract.isHermesVoiceWriterEnabled
  ? sourceVoiceContract
  : requireRuntime(resolve(dirname(requireRuntime.resolve('@openscience/domain')), 'agent/voice-contract.js')) as typeof sourceVoiceContract;
expect(voiceContract.isHermesVoiceWriterEnabled).toBe(voiceDomain.isHermesVoiceWriterEnabled);

beforeEach(() => { vi.spyOn(voiceContract, 'isHermesVoiceWriterEnabled').mockReturnValue(true); });
afterEach(() => { vi.restoreAllMocks(); });

const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const requestKey = '30000000-0000-4000-8000-000000000001';
async function fixture(available = true) {
  const { prisma, db } = createFakePrisma(); seedUser(db, { id: userId });
  const values = new Map<string, string>();
  const redis = { get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => void values.set(key, value), expire: async () => 1 };
  const token = await createSession(redis as never, { userId, status: 'email_verified' });
  const listPresets = vi.fn(async () => [{ id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', languages: ['zh' as const], creditsPerRequest: 1 as const }]);
  const storage = { putObject: vi.fn(), getObject: vi.fn(), headObject: vi.fn(), deleteObject: vi.fn() };
  const app = Fastify(); await app.register(cookie);
  app.setErrorHandler((error, _req, reply) => { const mapped = httpStatusForError(error, 'fixture'); void reply.status(mapped.status).send(mapped.body); });
  await app.register(async instance => registerHermesVoiceRoutes(instance, {
    prisma, redis: redis as never, mailer: createFakeMailer(),
    storage,
    ...(available ? { voiceRuntime: { client: {} as never, listPresets } } : {}),
  }));
  return { app, token, listPresets, db, storage };
}

describe('Hermes voice reader HTTP admission', () => {
  beforeEach(() => { vi.mocked(voiceContract.isHermesVoiceWriterEnabled).mockReturnValue(false); });
  it('reports unavailable without consulting an otherwise configured provider', async () => {
    const f = await fixture();
    try {
      const result = await f.app.inject({ url: '/agent/voice/capabilities', cookies: { openscience_session: f.token } });
      expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ available: false, voices: [] });
      expect(f.listPresets).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });
  it.each(['transcriptions', 'replies'])('rejects manual %s before provider lookup, storage or accounting', async operation => {
    const f = await fixture();
    try {
      const result = await f.app.inject({ method: 'POST', url: `/agent/voice/${operation}`,
        cookies: { openscience_session: f.token }, headers: { 'idempotency-key': requestKey },
        ...(operation === 'replies' ? { payload: { sourceTaskId: sessionId, voiceId: 'zh-CN-XiaoxiaoNeural' } } : {}) });
      expect(result.statusCode).toBe(409);
      expect(f.listPresets).not.toHaveBeenCalled(); expect(f.storage.putObject).not.toHaveBeenCalled();
      expect(f.db.agentTasks).toHaveLength(0); expect(f.db.usageLedger).toHaveLength(0);
    } finally { await f.app.close(); }
  });
});
describe('Hermes voice HTTP boundary', () => {
  it('WAV reader serves only the dedicated private voice route with truthful MIME, hash and Range', async () => {
    const f = await fixture();
    const taskId = '40000000-0000-4000-8000-000000000001', sourceTaskId = '50000000-0000-4000-8000-000000000001';
    const bytes = Buffer.alloc(48); bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36); bytes.writeUInt32LE(4, 40);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const audio = { objectKey: `derived/hermes-voice/${userId}/${taskId}/${sha256}.wav`, sha256, bytes: bytes.length, contentType: 'audio/wav' };
    const payload = { operation: 'reply', sourceTaskId, sourceExecutionAttempt: 1, spokenText: 'Saved answer', voiceId: 'standard' };
    f.db.agentSessions.push({ id: sessionId, userId, kind: 'workspace.guide', status: 'active', researchObjectId: null, deletedAt: null });
    f.db.agentTasks.push({ id: sourceTaskId, sessionId, kind: 'workspace.guide', status: 'succeeded', executionAttempt: 1, result: { summary: payload.spokenText } });
    f.db.agentTasks.push({ id: taskId, sessionId, kind: 'voice.reply', status: 'succeeded', executionAttempt: 1, payload,
      result: { hermesVoice: { identity: { taskId, sessionId, userId, researchObjectId: null, kind: 'voice.reply', executionAttempt: 1 }, request: payload, phase: 'completed', providerId: 'paid-original', credits: 1, audio } } });
    f.storage.headObject.mockResolvedValue({ size: bytes.length, contentType: 'audio/wav', sha256 });
    f.storage.getObject.mockImplementation(async () => ({ body: Readable.from([bytes]), size: bytes.length, contentType: 'audio/wav' }));
    const url = `/agent/voice/tasks/${taskId}/audio`, cookies = { openscience_session: f.token };
    try {
      const result = await f.app.inject({ url, cookies });
      expect(result.statusCode).toBe(200); expect(result.rawPayload).toEqual(bytes);
      expect(result.headers).toMatchObject({ 'content-type': 'audio/wav', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' });
      expect(result.headers['content-disposition']).toContain('.wav"');
      const range = await f.app.inject({ url, cookies, headers: { range: 'bytes=4-11' } });
      expect(range.statusCode).toBe(206); expect(range.rawPayload).toEqual(bytes.subarray(4, 12));
      expect((await f.app.inject({ url })).statusCode).toBe(401);
      f.db.agentSessions[0].userId = sourceTaskId;
      expect((await f.app.inject({ url, cookies })).statusCode).toBe(404);
    } finally { await f.app.close(); }
  });
  it('WAV reader does not let ordinary presentation metadata claim the dedicated voice policy', async () => {
    const f = await fixture();
    f.app.get('/legacy-audio', (_req, reply) => sendPresentationAssetContent(f.storage as never, {
      id: sessionId, objectKey: 'derived/hermes-voice/fake.wav', contentHash: 'a'.repeat(64), size: 48,
      kind: 'audio', contentType: 'audio/wav', generator: 'synclip', generatorVersion: 'hermes-voice',
    }, reply, 'private'));
    try {
      expect((await f.app.inject({ url: '/legacy-audio' })).statusCode).toBe(404);
      expect(f.storage.headObject).not.toHaveBeenCalled(); expect(f.storage.getObject).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });
  it('requires authentication before reading provider capabilities', async () => {
    const f = await fixture();
    const result = await f.app.inject({ url: '/agent/voice/capabilities' });
    expect(result.statusCode).toBe(401); expect(f.listPresets).not.toHaveBeenCalled(); await f.app.close();
  });
  it('projects standard public voice metadata without returning credentials', async () => {
    const f = await fixture();
    const result = await f.app.inject({ url: '/agent/voice/capabilities', cookies: { openscience_session: f.token } });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ available: true, maxRecordingSeconds: 60, transcriptionCredits: 1, replyMaxUtf8Bytes: 1000,
      voices: [{ id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', languages: ['zh'], creditsPerRequest: 1 }] });
    expect(result.body).not.toContain('apiKey'); await f.app.close();
  });
  it('keeps unconfigured voice unavailable while authenticated text dialogue remains independent', async () => {
    const f = await fixture(false);
    const result = await f.app.inject({ url: '/agent/voice/capabilities', cookies: { openscience_session: f.token } });
    expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ available: false, voices: [] });
    expect(f.listPresets).not.toHaveBeenCalled(); await f.app.close();
  });
  it('rejects arbitrary client TTS text or pricing instead of forwarding it', async () => {
    const f = await fixture();
    const result = await f.app.inject({ method: 'POST', url: '/agent/voice/replies', cookies: { openscience_session: f.token },
      headers: { 'idempotency-key': requestKey }, payload: { sourceTaskId: sessionId, voiceId: 'voice', text: 'forged', credits: 0 } });
    expect(result.statusCode).toBe(400); expect(f.db.agentTasks).toHaveLength(0); await f.app.close();
  });
  it('requires a stable request key before buffering or creating a paid transcription task', async () => {
    const f = await fixture();
    const result = await f.app.inject({ method: 'POST', url: '/agent/voice/transcriptions', cookies: { openscience_session: f.token } });
    expect(result.statusCode).toBe(400); expect(f.db.agentTasks).toHaveLength(0); await f.app.close();
  });
});
