import { PassThrough, Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as voiceDomain from '@openscience/domain';
import * as voiceGateway from '@openscience/ai-gateway';
import { SynclipAudioClient, type SynclipAudioDownloadOptions } from '@openscience/ai-gateway';
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
const mp3Frame = Buffer.concat([Buffer.from([255, 251, 144, 0]), Buffer.alloc(413)]);
const replyMp3 = Buffer.concat([mp3Frame, mp3Frame]);
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } });
const completed = { task_id: 'original-asr-id', status: 'completed', coins_used: 1,
  output: { type: 'text', text: 'Explain the D2NN result.', duration: 1, language: 'en' } };
const deps = { storage: { getObject: vi.fn(async () => ({ body: Readable.from([audio]), size: audio.length, contentType: 'audio/wav' })),
  putObject: vi.fn(async () => ({})) } };
function replyWav(): Buffer {
  const bytes = Buffer.alloc(48_044); audio.copy(bytes, 0, 0, 44);
  bytes.writeUInt32LE(bytes.length - 8, 4); bytes.writeUInt32LE(24_000, 24);
  bytes.writeUInt32LE(48_000, 28); bytes.writeUInt32LE(48_000, 40);
  return bytes;
}
/** Keep both real downloaders/validators; replace only DNS and HTTP transport. */
function localDownload(body: Buffer, contentType: string, declaredBytes = body.length) {
  const outgoing = new EventEmitter() as ClientRequest;
  let incoming: IncomingMessage;
  outgoing.destroy = vi.fn(() => { incoming?.destroy(); return outgoing; });
  const request: NonNullable<SynclipAudioDownloadOptions['request']> = (_url, _options, callback) => {
    incoming = new PassThrough() as unknown as IncomingMessage;
    incoming.statusCode = 200;
    incoming.headers = { 'content-type': contentType, 'content-length': String(declaredBytes) };
    queueMicrotask(() => { callback(incoming); if (!incoming.destroyed) (incoming as unknown as PassThrough).end(body); });
    return outgoing;
  };
  const options = { resolve: async () => [{ address: '93.184.215.14', family: 4 }], request };
  const hermes = voiceGateway.downloadHermesVoiceAudio, legacy = voiceGateway.downloadSynclipAudio;
  vi.spyOn(voiceGateway, 'downloadHermesVoiceAudio').mockImplementation(value => hermes(value, options));
  vi.spyOn(voiceGateway, 'downloadSynclipAudio').mockImplementation(value => legacy(value, options));
}
beforeEach(() => {
  vi.spyOn(voiceDomain, 'isHermesVoiceWriterEnabled').mockReturnValue(false);
  vi.clearAllMocks(); authority.finalize.mockResolvedValue({ result: { operation: 'transcription', transcript: completed.output.text } });
  authority.save.mockImplementation(async (_deps, originalIdentity, update) => ({ identity: originalIdentity, request: payload, ...update }));
});
afterEach(() => { vi.restoreAllMocks(); });
describe('Hermes voice paid submission boundary', () => {
  it('reader refuses queued work without a receipt before reading recording or consulting the provider', async () => {
    authority.load.mockResolvedValue({ identity, payload });
    const fetcher = vi.fn<typeof fetch>(); const listPresets = vi.fn(async () => []);
    const handlers = createHermesVoiceHandlers({ client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets });
    await expect(handlers['voice.transcribe'](deps as never, task)).rejects.toThrow('Voice reader stage');
    expect(deps.storage.getObject).not.toHaveBeenCalled(); expect(deps.storage.putObject).not.toHaveBeenCalled();
    expect(listPresets).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    expect(authority.withSubmission).not.toHaveBeenCalled(); expect(authority.save).not.toHaveBeenCalled();
  });
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
    vi.spyOn(voiceDomain, 'isHermesVoiceWriterEnabled').mockReturnValue(true);
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
    vi.spyOn(voiceDomain, 'isHermesVoiceWriterEnabled').mockReturnValue(true);
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
  it.each([['fresh', 'wav'], ['submitted', 'wav'], ['fresh', 'mp3'], ['submitted', 'mp3']] as const)(
    'persists validated %s %s TTS without recreating a saved paid task', async (mode, format) => {
    const replyIdentity = { ...identity, kind: 'voice.reply' };
    const request = { operation: 'reply', sourceTaskId: 'saved-guide', sourceExecutionAttempt: 1,
      spokenText: 'A saved answer.', voiceId: 'en-US-JennyNeural' };
    const currentIdentity = { ...replyIdentity, executionAttempt: mode === 'submitted' ? 2 : 1 };
    const execution = { identity: currentIdentity, payload: request, ...(mode === 'submitted' ? {
      checkpoint: { identity: replyIdentity, request, phase: 'submitted', providerId: 'original-tts-id' },
    } : {}) };
    authority.load.mockResolvedValue(execution);
    vi.spyOn(voiceDomain, 'isHermesVoiceWriterEnabled').mockReturnValue(mode === 'fresh');
    authority.withSubmission.mockImplementation(async (_deps, received, operation) => {
      expect(received).toBe(execution);
      return { identity: replyIdentity, request, phase: 'submitted', ...await operation() };
    });
    const preset = { id: request.voiceId, name: 'Jenny', languages: ['en'], creditsPerRequest: 1 };
    const fetcher = vi.fn<typeof fetch>();
    if (mode === 'fresh') fetcher.mockResolvedValueOnce(response([{ id: preset.id, name: preset.name, gender: 'Female',
      languages: ['en'], is_premium: false, credits_per_1k_chars: 1 }]))
      .mockResolvedValueOnce(response({ task_id: 'original-tts-id', status: 'processing' }));
    fetcher.mockResolvedValueOnce(response({ task_id: 'original-tts-id', status: 'completed', coins_used: 1,
      output: { type: 'audio', url: 'https://cdn.synclip.ai/result' }, url_expires_at: '2099-01-01T00:00:00Z' }));
    const client = new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher });
    const runtime = { client, listPresets: vi.fn(async () => { await client.listVoices(); return [preset]; }) };
    const bytes = format === 'wav' ? replyWav() : replyMp3;
    const contentType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    localDownload(bytes, contentType);
    await createHermesVoiceHandlers(runtime as never)['voice.reply'](deps as never, { ...task, executionAttempt: currentIdentity.executionAttempt });
    expect(fetcher.mock.calls.map(call => call[1]?.method)).toEqual(mode === 'fresh' ? ['GET', 'POST', 'GET'] : ['GET']);
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe('https://api.synclip.ai/v1/tasks/original-tts-id');
    expect(authority.withSubmission).toHaveBeenCalledTimes(mode === 'fresh' ? 1 : 0);
    expect(runtime.listPresets).toHaveBeenCalledTimes(mode === 'fresh' ? 1 : 0);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const objectKey = `derived/hermes-voice/${identity.userId}/${identity.taskId}/${sha256}.${format}`;
    expect(deps.storage.putObject).toHaveBeenCalledOnce();
    expect(deps.storage.putObject).toHaveBeenCalledWith(objectKey, bytes, { contentType, sha256 });
    expect(authority.save).toHaveBeenCalledOnce();
    expect(authority.save).toHaveBeenCalledWith(expect.anything(), replyIdentity,
      { phase: 'completed', credits: 1, audio: { objectKey, sha256, bytes: bytes.length, contentType } });
    expect(deps.storage.putObject.mock.invocationCallOrder[0]).toBeLessThan(authority.save.mock.invocationCallOrder[0]!);
    expect(authority.finalize).toHaveBeenCalledOnce();
  });
  it('does not persist a malformed saved WAV even when its declared MIME is audio/wav', async () => {
    const replyIdentity = { ...identity, kind: 'voice.reply' };
    const request = { operation: 'reply', sourceTaskId: 'saved-guide', sourceExecutionAttempt: 1,
      spokenText: 'A saved answer.', voiceId: 'voice' };
    authority.load.mockResolvedValue({ identity: replyIdentity, payload: request,
      checkpoint: { identity: replyIdentity, request, phase: 'submitted', providerId: 'original-tts-id' } });
    const bytes = replyWav(); bytes.writeUInt32LE(2, 40); // Full body disagrees with the data chunk length.
    localDownload(bytes, 'audio/wav');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ task_id: 'original-tts-id', status: 'completed',
      output: { type: 'audio', url: 'https://cdn.synclip.ai/result' }, url_expires_at: '2099-01-01T00:00:00Z' }));
    const runtime = { client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: vi.fn() };
    await expect(createHermesVoiceHandlers(runtime)['voice.reply'](deps as never, task)).rejects.toThrow('SYNCLIP_AUDIO_RESPONSE_INVALID');
    expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(authority.withSubmission).not.toHaveBeenCalled(); expect(deps.storage.putObject).not.toHaveBeenCalled();
    expect(authority.save).not.toHaveBeenCalled(); expect(authority.finalize).not.toHaveBeenCalled();
  });
  it('retains a completed legacy 18 MiB MP3 without downloading or charging again', async () => {
    const replyIdentity = { ...identity, kind: 'voice.reply' };
    const request = { operation: 'reply', sourceTaskId: 'saved-guide', sourceExecutionAttempt: 1,
      spokenText: 'A saved answer.', voiceId: 'voice' };
    const sha256 = 'a'.repeat(64);
    const checkpoint = voiceDomain.readHermesVoiceCheckpoint({ hermesVoice: {
      identity: replyIdentity, request, phase: 'completed', providerId: 'original-tts-id', credits: 1,
      audio: { objectKey: `derived/hermes-voice/${identity.userId}/${identity.taskId}/${sha256}.mp3`,
        sha256, bytes: 18 * 1024 * 1024, contentType: 'audio/mpeg' },
    } });
    expect(checkpoint?.audio?.bytes).toBe(18 * 1024 * 1024);
    authority.load.mockResolvedValue({ identity: replyIdentity, payload: request, checkpoint });
    const fetcher = vi.fn<typeof fetch>();
    const runtime = { client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: vi.fn() };
    await createHermesVoiceHandlers(runtime)['voice.reply'](deps as never, task);
    expect(authority.finalize).toHaveBeenCalledOnce(); expect(fetcher).not.toHaveBeenCalled();
    expect(authority.withSubmission).not.toHaveBeenCalled(); expect(authority.save).not.toHaveBeenCalled();
    expect(deps.storage.getObject).not.toHaveBeenCalled(); expect(deps.storage.putObject).not.toHaveBeenCalled();
    expect(voiceDomain.projectHermesVoiceResult('voice.reply', 'succeeded', checkpoint)).toEqual({
      operation: 'reply', audioReady: true, spokenText: request.spokenText,
    });
  });
  it('keeps an oversized undownloaded MP3 paid ID recoverable without replacing its checkpoint', async () => {
    const replyIdentity = { ...identity, kind: 'voice.reply' };
    const request = { operation: 'reply', sourceTaskId: 'saved-guide', sourceExecutionAttempt: 1,
      spokenText: 'A saved answer.', voiceId: 'voice' };
    const checkpoint = voiceDomain.readHermesVoiceCheckpoint({ hermesVoice: {
      identity: replyIdentity, request, phase: 'submitted', providerId: 'original-tts-id', credits: 1,
    } });
    authority.load.mockResolvedValue({ identity: replyIdentity, payload: request, checkpoint });
    localDownload(replyMp3, 'audio/mpeg', 18 * 1024 * 1024);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ task_id: 'original-tts-id', status: 'completed', coins_used: 1,
      output: { type: 'audio', url: 'https://cdn.synclip.ai/result' }, url_expires_at: '2099-01-01T00:00:00Z' }));
    const runtime = { client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: vi.fn() };
    await expect(createHermesVoiceHandlers(runtime)['voice.reply'](deps as never, task)).rejects.toThrow('SYNCLIP_AUDIO_RESPONSE_TOO_LARGE');
    expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.synclip.ai/v1/tasks/original-tts-id');
    expect(authority.withSubmission).not.toHaveBeenCalled(); expect(authority.save).not.toHaveBeenCalled();
    expect(deps.storage.putObject).not.toHaveBeenCalled(); expect(authority.finalize).not.toHaveBeenCalled();
    expect(voiceDomain.projectHermesVoiceResult('voice.reply', 'failed', checkpoint)).toEqual({ operation: 'reply', canResume: true });
  });
  it.each(['mp3', 'wav'] as const)('remembers newly downloaded %s bytes when physical purge wins checkpoint persistence', async format => {
    const replyIdentity = { ...identity, kind: 'voice.reply' };
    const request = { operation: 'reply', sourceTaskId: 'saved-guide', sourceExecutionAttempt: 1,
      spokenText: 'A saved answer.', voiceId: 'voice' };
    authority.load.mockResolvedValue({ identity: replyIdentity, payload: request,
      checkpoint: { identity: replyIdentity, request, phase: 'submitted', providerId: 'tts-id' } });
    authority.save.mockRejectedValueOnce(new Error('original task physically purged'));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ task_id: 'tts-id', status: 'completed',
      output: { type: 'audio', url: 'https://cdn.synclip.ai/result.mp3' }, url_expires_at: '2099-01-01T00:00:00Z' }));
    const runtime = { client: new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }), listPresets: vi.fn() };
    const result = format === 'wav'
      ? { bytes: replyWav(), format: 'wav' as const, contentType: 'audio/wav' as const }
      : { bytes: replyMp3, format: 'mp3' as const, contentType: 'audio/mpeg' as const };
    const handlers = createHermesVoiceHandlers(runtime, { downloadAudio: async () => result });
    await expect(handlers['voice.reply'](deps as never, task)).rejects.toThrow('physically purged');
    const sha256 = createHash('sha256').update(result.bytes).digest('hex');
    expect(authority.discarded).toHaveBeenCalledWith(undefined, identity.taskId, { hermesVoice: { audio: {
      objectKey: `derived/hermes-voice/${identity.userId}/${identity.taskId}/${sha256}.${format}`,
      sha256, bytes: result.bytes.length, contentType: result.contentType,
    } } });
    expect(runtime.listPresets).not.toHaveBeenCalled(); expect(authority.finalize).not.toHaveBeenCalled();
  });
});
