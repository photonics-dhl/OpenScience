import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SynclipAudioClient } from '@openscience/ai-gateway';
import { createHermesVoiceHandlers } from '../src/voice';

const authority = vi.hoisted(() => ({ load: vi.fn(), withSubmission: vi.fn(), save: vi.fn(), finalize: vi.fn(), discarded: vi.fn() }));
vi.mock('@openscience/domain', async original => ({ ...await original<typeof import('@openscience/domain')>(),
  loadHermesVoiceExecution: authority.load, withHermesVoiceSubmission: authority.withSubmission,
  saveHermesVoiceCheckpoint: authority.save, finalizeHermesVoiceTask: authority.finalize,
  rememberDiscardedTaskResult: authority.discarded,
}));
const identity = { taskId: '10000000-0000-4000-8000-000000000001', sessionId: '20000000-0000-4000-8000-000000000001',
  userId: '30000000-0000-4000-8000-000000000001', researchObjectId: null, kind: 'voice.transcribe', executionAttempt: 1 };
const task = { id: identity.taskId, executionAttempt: 1, payload: {} };
const audio = Buffer.alloc(32_044);
audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16_000, 24); audio.writeUInt32LE(32_000, 28);
audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(32_000, 40);
const payload = { operation: 'transcription', objectKey: 'derived/hermes-voice/recording.wav',
  sha256: createHash('sha256').update(audio).digest('hex'), bytes: audio.length, durationSeconds: 1 };
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } });
const completed = { task_id: 'original-asr-id', status: 'completed', coins_used: 1,
  output: { type: 'text', text: 'Explain the D2NN result.', duration: 1, language: 'en' } };
const deps = { storage: { getObject: vi.fn(async () => ({ body: Readable.from([audio]), size: audio.length, contentType: 'audio/wav' })),
  putObject: vi.fn(async () => ({})) } };
beforeEach(() => {
  vi.clearAllMocks(); authority.finalize.mockResolvedValue({ result: { operation: 'transcription', transcript: completed.output.text } });
  authority.save.mockImplementation(async (_deps, originalIdentity, update) => ({ identity: originalIdentity, request: payload, ...update }));
});
describe('Hermes voice paid submission boundary', () => {
  it('recovers a saved supplier ID using GET only and saves the actual transcript', async () => {
    authority.load.mockResolvedValue({ identity: { ...identity, executionAttempt: 2 }, payload,
      checkpoint: { identity, request: payload, phase: 'submitted', providerId: 'original-asr-id', credits: 1 } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(completed));
    const runtime = { client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: vi.fn(async () => []) };
    await createHermesVoiceHandlers(runtime)['voice.transcribe'](deps as never, task);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(authority.withSubmission).not.toHaveBeenCalled();
    expect(authority.save).toHaveBeenCalledWith(expect.anything(), identity,
      expect.objectContaining({ phase: 'completed', transcript: completed.output.text }));
    expect(authority.finalize).toHaveBeenCalledOnce();
  });
  it('holds an unknown charged submission without POST or GET', async () => {
    authority.load.mockResolvedValue({ identity, payload, checkpoint: { identity, request: payload, phase: 'submitting' } });
    const fetcher = vi.fn<typeof fetch>();
    const handler = createHermesVoiceHandlers({ client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: async () => [] });
    await expect(handler['voice.transcribe'](deps as never, task)).rejects.toThrow('VOICE_SUBMISSION_UNCERTAIN');
    expect(fetcher).not.toHaveBeenCalled(); expect(authority.withSubmission).not.toHaveBeenCalled();
  });
  it('delivers a durable completed result without reading or recreating remote audio', async () => {
    authority.load.mockResolvedValue({ identity, payload, checkpoint: { identity, request: payload, phase: 'completed',
      providerId: 'original-asr-id', credits: 1, transcript: completed.output.text } });
    const fetcher = vi.fn<typeof fetch>();
    const handlers = createHermesVoiceHandlers({ client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: async () => [] });
    await handlers['voice.transcribe'](deps as never, task);
    expect(fetcher).not.toHaveBeenCalled(); expect(deps.storage.getObject).not.toHaveBeenCalled();
    expect(authority.finalize).toHaveBeenCalledOnce();
  });
  it('validates the original stored WAV before publishing one fresh provider request', async () => {
    const execution = { identity, payload }; authority.load.mockResolvedValue(execution);
    authority.withSubmission.mockImplementation(async (_deps, _execution, operation) => {
      const receipt = await operation(new AbortController().signal);
      return { identity, request: payload, phase: 'submitted', ...receipt };
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ task_id: 'original-asr-id', status: 'processing',
      credits_charged: 1, duration_seconds: 1 })).mockResolvedValueOnce(response(completed));
    const handlers = createHermesVoiceHandlers({ client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: async () => [] });
    await handlers['voice.transcribe'](deps as never, task);
    expect(fetcher.mock.calls.map(call => call[1]?.method)).toEqual(['POST', 'GET']);
    expect(authority.withSubmission).toHaveBeenCalledOnce(); expect(authority.finalize).toHaveBeenCalledOnce();
  });
  it('passes the current standard catalog into final TTS authority and saves private audio', async () => {
    const replyIdentity = { ...identity, kind: 'voice.reply' };
    const request = { operation: 'reply', sourceTaskId: 'saved-guide', sourceExecutionAttempt: 1,
      spokenText: 'A saved answer.', voiceId: 'en-US-JennyNeural' };
    authority.load.mockResolvedValue({ identity: replyIdentity, payload: request });
    const preset = { id: request.voiceId, name: 'Jenny', languages: ['en'], creditsPerRequest: 1 };
    authority.withSubmission.mockImplementation(async (actualDeps, _execution, operation) => {
      expect(actualDeps.voicePresets).toEqual([preset]);
      return { identity: replyIdentity, request, phase: 'submitted', ...await operation(new AbortController().signal) };
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([{ id: preset.id, name: preset.name, gender: 'Female',
      languages: ['en'], is_premium: false, credits_per_1k_chars: 1 }]))
      .mockResolvedValueOnce(response({ task_id: 'tts-id', status: 'processing' }))
      .mockResolvedValueOnce(response({ task_id: 'tts-id', status: 'completed', coins_used: 1,
        output: { type: 'audio', url: 'https://cdn.synclip.ai/result.mp3' }, url_expires_at: '2099-01-01T00:00:00Z' }));
    const client = new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher });
    const runtime = { client, listPresets: async () => { await client.listVoices(); return [preset]; } };
    const bytes = Buffer.from('external-download-fixture');
    const handlers = createHermesVoiceHandlers(runtime as never, { downloadAudio: async () => ({ bytes, format: 'mp3', contentType: 'audio/mpeg' }) });
    await handlers['voice.reply'](deps as never, task);
    expect(fetcher.mock.calls.map(call => call[1]?.method)).toEqual(['GET', 'POST', 'GET']);
    expect(deps.storage.putObject).toHaveBeenCalledWith(expect.stringContaining(`derived/hermes-voice/${identity.userId}/${identity.taskId}/`),
      bytes, expect.objectContaining({ contentType: 'audio/mpeg' }));
    expect(authority.finalize).toHaveBeenCalledOnce();
  });
  it('remembers newly downloaded private bytes when physical purge wins checkpoint persistence', async () => {
    const replyIdentity = { ...identity, kind: 'voice.reply' };
    const request = { operation: 'reply', sourceTaskId: 'saved-guide', sourceExecutionAttempt: 1,
      spokenText: 'A saved answer.', voiceId: 'voice' };
    authority.load.mockResolvedValue({ identity: replyIdentity, payload: request,
      checkpoint: { identity: replyIdentity, request, phase: 'submitted', providerId: 'tts-id' } });
    authority.save.mockRejectedValueOnce(new Error('original task physically purged'));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ task_id: 'tts-id', status: 'completed',
      output: { type: 'audio', url: 'https://cdn.synclip.ai/result.mp3' }, url_expires_at: '2099-01-01T00:00:00Z' }));
    const runtime = { client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: vi.fn() };
    const handlers = createHermesVoiceHandlers(runtime, { downloadAudio: async () => ({ bytes: Buffer.from('fixture'), format: 'mp3', contentType: 'audio/mpeg' }) });
    await expect(handlers['voice.reply'](deps as never, task)).rejects.toThrow('physically purged');
    expect(authority.discarded).toHaveBeenCalledWith(undefined, identity.taskId, { hermesVoice: { audio: expect.objectContaining({ contentType: 'audio/mpeg' }) } });
    expect(runtime.listPresets).not.toHaveBeenCalled(); expect(authority.finalize).not.toHaveBeenCalled();
  });
});
