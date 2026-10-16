import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@openscience/auth';
import { createFakePrisma, createFakeMailer, seedUser } from '@openscience/domain/test-helpers';
import { registerHermesVoiceRoutes } from '../src/routes/voice';
import { httpStatusForError } from '../src/error-map';
import * as voiceContract from '../../../packages/domain/src/agent/voice-contract';

beforeEach(() => { vi.spyOn(voiceContract, 'isHermesVoiceWriterEnabled').mockReturnValue(true); });

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
