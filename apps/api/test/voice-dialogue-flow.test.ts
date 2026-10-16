import { isDeepStrictEqual } from 'node:util';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@openscience/auth';
import * as voiceDomain from '@openscience/domain';
import { createConfiguredSynclipVoiceRuntime } from '@openscience/ai-gateway';
import { sha256HexBuffer, type StorageAdapter } from '@openscience/storage';
import { createFakePrisma, createFakeMailer, seedUser } from '@openscience/domain/test-helpers';
import { createPollOnce, createHermesVoiceHandlers } from '@openscience/agent-worker';
import { registerHermesVoiceRoutes } from '../src/routes/voice';
import { httpStatusForError } from '../src/error-map';
import * as sourceVoiceContract from '../../../packages/domain/src/agent/voice-contract';

// CI consumes compiled Domain; local source harnesses consume the source contract.
// Change only the actual selector supplier, including its internal Domain callers.
const requireRuntime = createRequire(__filename);
const voiceContract = voiceDomain.isHermesVoiceWriterEnabled === sourceVoiceContract.isHermesVoiceWriterEnabled
  ? sourceVoiceContract
  : requireRuntime(resolve(dirname(requireRuntime.resolve('@openscience/domain')), 'agent/voice-contract.js')) as typeof sourceVoiceContract;
expect(voiceContract.isHermesVoiceWriterEnabled).toBe(voiceDomain.isHermesVoiceWriterEnabled);

afterEach(() => { vi.restoreAllMocks(); });

const id = (value: number) => `80000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } });
function wav(): Buffer {
  const value = Buffer.alloc(32_044);
  value.write('RIFF'); value.writeUInt32LE(value.length - 8, 4); value.write('WAVEfmt ', 8); value.writeUInt32LE(16, 16);
  value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22); value.writeUInt32LE(16_000, 24); value.writeUInt32LE(32_000, 28);
  value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34); value.write('data', 36); value.writeUInt32LE(32_000, 40);
  return value;
}
function upload(recording: Buffer) {
  return Buffer.concat([Buffer.from(`--voice-fixture\r\nContent-Disposition: form-data; name="sessionId"\r\n\r\n${id(6)}\r\n`
    + '--voice-fixture\r\nContent-Disposition: form-data; name="file"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n'),
  recording, Buffer.from('\r\n--voice-fixture--\r\n')]);
}

describe('Hermes voice HTTP, durable producer, Worker and private result integration', () => {
  it.each(['reader', 'writer'] as const)('%s preserves the real HTTP, queue and private result boundary', async stage => {
    vi.spyOn(voiceContract, 'isHermesVoiceWriterEnabled').mockReturnValue(stage === 'writer');
    const { prisma, db } = createFakePrisma();
    Object.assign(prisma, { trashEntry: { findFirst: async () => null, findUnique: async () => null } });
    seedUser(db, { id: id(1) }); seedUser(db, { id: id(9) });
    db.usageLedger.push({ id: id(2), userId: id(1), resource: 'ai_credit', kind: 'grant', delta: 8 });
    db.workspaces.push({ id: id(3), status: 'active' });
    db.memberships.push({ id: id(4), workspaceId: id(3), userId: id(1), role: 'author' });
    db.researchObjects.push({ id: id(5), workspaceId: id(3), deletedAt: null });
    db.agentSessions.push({ id: id(6), userId: id(1), kind: 'workspace.guide', status: 'active', researchObjectId: id(5), deletedAt: null });
    db.agentTasks.push({ id: id(7), sessionId: id(6), kind: 'workspace.guide', status: 'succeeded', executionAttempt: 1,
      result: { summary: 'The saved Hermes answer explains ten output classes.' }, deletedAt: null, error: null });
    const update = prisma.agentTask.updateMany.bind(prisma.agentTask);
    vi.spyOn(prisma.agentTask, 'updateMany').mockImplementation(async args => {
      const row = db.agentTasks.find(task => task.id === args.where?.id);
      const equals = (args.where?.result as { equals?: unknown } | undefined)?.equals;
      if (equals !== undefined && !(equals === Prisma.AnyNull ? row?.result == null : isDeepStrictEqual(row?.result, equals))) return { count: 0 };
      if (args.where?.deletedAt === null && row?.deletedAt) return { count: 0 };
      return update(args);
    });
    const objects = new Map<string, { bytes: Buffer; contentType: string }>();
    const storage: StorageAdapter = {
      headObject: async key => { const object = objects.get(key); return object ? { size: object.bytes.length,
        contentType: object.contentType, sha256: sha256HexBuffer(object.bytes), etag: 'stored' } : null; },
      putObject: async (key, bytes, options) => {
        if (!Buffer.isBuffer(bytes)) throw Error('buffer expected');
        objects.set(key, { bytes: Buffer.from(bytes), contentType: options?.contentType ?? '' });
        return { key, size: bytes.length, etag: 'stored' };
      },
      getObject: async key => { const object = objects.get(key)!; return { body: Readable.from(object.bytes), size: object.bytes.length, contentType: object.contentType }; },
      deleteObject: async key => { objects.delete(key); },
    };
    const sessionValues = new Map<string, string>(); const queue: string[] = [];
    const redis = { get: async (key: string) => sessionValues.get(key) ?? null,
      set: async (key: string, value: string) => void sessionValues.set(key, value), expire: async () => 1,
      lpush: async (_key: string, value: string) => { queue.unshift(value); return queue.length; },
      brpoplpush: async () => queue.pop() ?? null, lrem: async () => 1 };
    const token = await createSession(redis as never, { userId: id(1), status: 'email_verified' });
    const outsider = await createSession(redis as never, { userId: id(9), status: 'email_verified' });
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      const target = String(url);
      if (target.endsWith('/voices')) return response([{ id: 'en-US-JennyNeural', name: 'Jenny', languages: ['en'],
        gender: 'Female', is_premium: false, credits_per_1k_chars: 1 }]);
      if (target.endsWith('/asr')) {
        expect(init?.body).toBeInstanceOf(FormData);
        return response({ task_id: 'supplier-asr', status: 'processing', credits_charged: 1, duration_seconds: 1 });
      }
      if (target.endsWith('/audio')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ text: db.agentTasks[0]!.result.summary, voice: 'en-US-JennyNeural' });
        return response({ task_id: 'supplier-tts', status: 'processing' });
      }
      if (target.endsWith('/supplier-asr')) return response({ task_id: 'supplier-asr', status: 'completed', coins_used: 1,
        output: { type: 'text', text: 'Please explain the optical result.', duration: 1, language: 'en' } });
      if (target.endsWith('/supplier-tts')) return response({ task_id: 'supplier-tts', status: 'completed', coins_used: 1,
        output: { type: 'audio', url: 'https://cdn.synclip.ai/synthetic.mp3', duration: 1 }, url_expires_at: '2099-01-01T00:00:00Z' });
      throw Error('Unexpected fixture provider request');
    });
    const runtime = (await createConfiguredSynclipVoiceRuntime({ AI_ENABLED: 'true', SYNCLIP_API_KEY_FILE: '/run/secrets/synclip_api_key' },
      { readKey: async () => 'synthetic-test-key', fetch: fetcher }))!;
    const deps = { prisma, redis: redis as never, storage, mailer: createFakeMailer(), voiceRuntime: runtime };
    const app = Fastify(); await app.register(cookie);
    app.setErrorHandler((error, _req, reply) => { const mapped = httpStatusForError(error, 'fixture'); void reply.status(mapped.status).send(mapped.body); });
    await app.register(async instance => registerHermesVoiceRoutes(instance, deps));
    // The download is the external boundary. These structural MP3 bytes do not prove codec playback or naturalness.
    const frame = Buffer.concat([Buffer.from([255, 251, 144, 0]), Buffer.alloc(413)]); const mp3 = Buffer.concat([frame, frame]);
    const handlers = createHermesVoiceHandlers(runtime, { wait: async () => {}, downloadAudio: async () => ({ bytes: mp3, format: 'mp3', contentType: 'audio/mpeg' }) });
    const poll = await createPollOnce(handlers, { runMaintenance: false });
    const cookies = { openscience_session: token };
    try {
      const request = { method: 'POST' as const, url: '/agent/voice/transcriptions', cookies,
        headers: { 'idempotency-key': id(20), 'content-type': 'multipart/form-data; boundary=voice-fixture' }, payload: upload(wav()) };
      if (stage === 'reader') {
        const capability = await app.inject({ url: '/agent/voice/capabilities', cookies });
        expect(capability.json()).toMatchObject({ available: false, voices: [] });
        expect((await app.inject(request)).statusCode).toBe(409);
        expect((await app.inject({ method: 'POST', url: '/agent/voice/replies', cookies,
          headers: { 'idempotency-key': id(21) }, payload: { sourceTaskId: id(7), voiceId: 'en-US-JennyNeural' } })).statusCode).toBe(409);
        expect(db.agentTasks).toHaveLength(1); expect(objects.size).toBe(0);
        const bytes = wav(), sha256 = sha256HexBuffer(bytes);
        // Fixture persistence simulates already queued fresh work; no producer or provider creates it.
        db.agentTasks.push({ id: id(40), sessionId: id(6), kind: 'voice.transcribe', status: 'pending',
          progress: 0, retryCount: 0, executionAttempt: 0, deletedAt: null, error: null, result: null,
          idempotencyKey: id(20), payload: { operation: 'transcription', sha256, bytes: bytes.length,
            durationSeconds: 1, objectKey: `derived/hermes-voice/${id(1)}/${id(20)}/${sha256}.wav` } });
        queue.unshift(id(40)); await poll(deps as never);
        expect(db.agentTasks).toHaveLength(2); expect(db.agentTasks[1].status).toBe('failed');
        expect(db.agentTasks[1].result).toBeNull(); expect(objects.size).toBe(0);
        expect(fetcher).not.toHaveBeenCalled();
        expect(db.usageLedger.filter(entry => entry.kind === 'consume')).toHaveLength(0);
        return;
      }
      const submitted = await app.inject(request); expect(submitted.statusCode).toBe(202);
      const taskId = submitted.json().task.id as string;
      const replay = await app.inject(request); expect(replay.statusCode).toBe(202); expect(replay.json().task.id).toBe(taskId);
      expect(db.agentTasks.filter(task => task.kind === 'voice.transcribe')).toHaveLength(1);
      await poll(deps as never);
      const recognized = await app.inject({ url: `/agent/voice/tasks/${taskId}`, cookies });
      expect(recognized.statusCode).toBe(200); expect(recognized.json().task).toMatchObject({ status: 'succeeded',
        result: { operation: 'transcription', transcript: 'Please explain the optical result.' } });
      expect(recognized.body).not.toContain('supplier-asr'); expect(recognized.body).not.toContain('objectKey');
      const spoken = await app.inject({ method: 'POST', url: '/agent/voice/replies', cookies,
        headers: { 'idempotency-key': id(21) }, payload: { sourceTaskId: id(7), voiceId: 'en-US-JennyNeural' } });
      expect(spoken.statusCode).toBe(202); const replyId = spoken.json().task.id as string;
      await poll(deps as never);
      const delivered = await app.inject({ url: `/agent/voice/tasks/${replyId}/audio`, cookies, headers: { range: 'bytes=0-3' } });
      expect(delivered.statusCode).toBe(206); expect(delivered.headers['content-type']).toBe('audio/mpeg');
      expect(delivered.headers['cache-control']).toBe('private, no-store'); expect(delivered.rawPayload).toEqual(mp3.subarray(0, 4));
      expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(2);
      expect(db.usageLedger.filter(entry => entry.kind === 'consume')).toHaveLength(2);
      const deniedOwner = await app.inject({ url: `/agent/voice/tasks/${taskId}`, cookies: { openscience_session: outsider } });
      expect([403, 404]).toContain(deniedOwner.statusCode); expect(deniedOwner.body).not.toContain('Please explain');
      db.memberships.length = 0;
      for (const suffix of ['', '/audio']) {
        const denied = await app.inject({ url: `/agent/voice/tasks/${replyId}${suffix}`, cookies });
        expect([403, 404]).toContain(denied.statusCode); expect(denied.body).not.toContain('supplier-tts');
      }
    } finally { await app.close(); }
  });
});
