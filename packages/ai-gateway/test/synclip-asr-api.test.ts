import { describe, expect, it, vi } from 'vitest';
import { SynclipAudioClient } from '../src/synclip-audio-api';

function wav(seconds = 1): Buffer {
  const audio = Buffer.alloc(44 + seconds * 32_000);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16_000, 24); audio.writeUInt32LE(32_000, 28); audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), {
  headers: { 'content-type': 'application/json' },
});
const taskId = 'voice-asr-123';
const submitted = { task_id: taskId, status: 'processing', poll_url: '/v1/tasks/' + taskId,
  credits_charged: 1, duration_seconds: 1 };

describe('Synclip interactive transcription contract', () => {
  it('submits a WAV as multipart with the existing Synclip credential and no invented model', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(submitted));
    const client = new SynclipAudioClient({ apiKey: 'test-synclip-key', fetch: fetcher });
    await expect(client.createTranscription({ audio: wav(), language: 'zh' })).resolves.toEqual(submitted);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.synclip.ai/v1/asr');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: {
      Authorization: 'Bearer test-synclip-key', Accept: 'application/json',
    } });
    expect(init?.headers).not.toHaveProperty('Content-Type');
    const form = init?.body as FormData;
    expect([...form.keys()]).toEqual(['file', 'language']);
    expect(form.get('language')).toBe('zh');
    const file = form.get('file') as File;
    expect(file.name).toBe('speech.wav'); expect(file.type).toBe('audio/wav');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(wav());
  });
  it('omits the language hint for mixed Chinese and English scientific speech', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(submitted));
    await new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }).createTranscription({ audio: wav() });
    expect([...(fetcher.mock.calls[0]![1]?.body as FormData).keys()]).toEqual(['file']);
  });
  it('accepts exactly sixty seconds and refuses one additional PCM frame before POST', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...submitted, duration_seconds: 60 }));
    const client = new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher });
    await expect(client.createTranscription({ audio: wav(60) })).resolves.toMatchObject({ duration_seconds: 60 });
    const extraFrame = Buffer.concat([wav(60), Buffer.alloc(2)]);
    extraFrame.writeUInt32LE(extraFrame.length - 8, 4); extraFrame.writeUInt32LE(extraFrame.length - 44, 40);
    await expect(client.createTranscription({ audio: extraFrame })).rejects.toMatchObject({ outcome: 'invalid' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([[4, 0], [16, 18], [20, 3], [22, 2], [24, 48_000], [28, 16_000], [32, 4], [34, 8]])(
    'rejects inconsistent WAV metadata at offset %i before publishing', async (offset, value) => {
      const recording = wav();
      if ([20, 22, 32, 34].includes(offset!)) recording.writeUInt16LE(value!, offset!);
      else recording.writeUInt32LE(value!, offset!);
      const fetcher = vi.fn<typeof fetch>();
      await expect(new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }).createTranscription({ audio: recording }))
        .rejects.toMatchObject({ outcome: 'invalid' });
      expect(fetcher).not.toHaveBeenCalled();
    });
  it.each([Buffer.from('not audio'), wav(61), (() => { const value = wav(); value.writeUInt32LE(0, 40); return value; })()])(
    'rejects invalid or over-one-minute recordings without a paid request', async audio => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }).createTranscription({ audio }))
        .rejects.toMatchObject({ outcome: 'invalid' });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('queries the original provider ID and validates the documented text output', async () => {
    const completed = { task_id: taskId, status: 'completed', coins_used: 1,
      output: { type: 'text', text: '把 D2NN 的传播距离改为 40 mm。', duration: 1, language: 'zh' } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(completed));
    await expect(new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }).queryTranscription(taskId)).resolves.toEqual(completed);
    expect(fetcher.mock.calls[0]).toMatchObject(['https://api.synclip.ai/v1/tasks/' + taskId, { method: 'GET' }]);
  });
  it('keeps a lost submission response uncertain and never retries its POST', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection lost after charge'));
    await expect(new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }).createTranscription({ audio: wav() }))
      .rejects.toMatchObject({ outcome: 'uncertain' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a mismatched ID when expecting transcription', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ task_id: 'different', status: 'completed',
      output: { type: 'text', text: 'wrong recording', duration: 1 } }));
    await expect(new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }).queryTranscription(taskId))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_RESPONSE_INVALID' });
  });
  it('rejects audio output for the correct transcription task ID', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ task_id: taskId, status: 'completed',
      output: { type: 'audio', url: 'https://cdn.synclip.ai/audio.mp3', duration: 1 } }));
    await expect(new SynclipAudioClient({ apiKey: 'test-key', fetch: fetcher }).queryTranscription(taskId))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_RESPONSE_INVALID' });
  });
});
