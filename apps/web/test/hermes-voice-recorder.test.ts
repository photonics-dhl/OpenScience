import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeMonoPcmWav, HermesVoiceRecorder, supportsVoiceRecording } from '../lib/hermes/voice-recorder';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Hermes speech recording format', () => {
  it('writes canonical mono 16 kHz PCM16 WAV, averaging stereo and retaining duration', async () => {
    const blob = encodeMonoPcmWav([new Float32Array(48_000).fill(0.75), new Float32Array(48_000).fill(-0.25)], 48_000);
    const bytes = await blob.arrayBuffer(); const header = new DataView(bytes);
    expect(blob.type).toBe('audio/wav');
    expect(bytes.byteLength).toBe(32_044);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 16))).toBe('WAVEfmt ');
    expect(header.getUint16(20, true)).toBe(1);
    expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint32(24, true)).toBe(16_000);
    expect(header.getUint32(28, true)).toBe(32_000);
    expect(header.getUint16(32, true)).toBe(2);
    expect(header.getUint16(34, true)).toBe(16);
    expect(header.getUint32(40, true)).toBe(32_000);
    expect(header.getInt16(44, true)).toBe(8192);
    expect(header.getInt16(bytes.byteLength - 2, true)).toBe(8192);
  });

  it('caps output at 60 seconds and clips PCM endpoints', async () => {
    const samples = new Float32Array(16_000 * 61).fill(2); samples[0] = -2;
    const bytes = await encodeMonoPcmWav([samples], 16_000).arrayBuffer();
    expect(bytes.byteLength).toBe(1_920_044);
    expect(new DataView(bytes).getInt16(44, true)).toBe(-32768);
    expect(new DataView(bytes).getInt16(46, true)).toBe(32767);
  });

  it('rejects an empty or invalid recording instead of uploading a relabelled container', () => {
    expect(() => encodeMonoPcmWav([], 48_000)).toThrow();
    expect(() => encodeMonoPcmWav([new Float32Array(0)], 48_000)).toThrow();
    expect(() => encodeMonoPcmWav([new Float32Array([0])], 0)).toThrow();
  });
});

function mediaEnvironment(getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })) {
  const close = vi.fn().mockResolvedValue(undefined);
  class AudioContextFixture {
    close = close;
    decodeAudioData = vi.fn().mockResolvedValue({ sampleRate: 48_000, numberOfChannels: 1, getChannelData: () => new Float32Array(4800) });
  }
  class RecorderFixture extends EventTarget {
    state = 'inactive'; mimeType = 'audio/webm';
    static isTypeSupported() { return true; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      const data = new Event('dataavailable'); Object.assign(data, { data: new Blob(['encoded-browser-fixture']) });
      this.dispatchEvent(data); this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', AudioContextFixture);
  vi.stubGlobal('MediaRecorder', RecorderFixture);
  return { getUserMedia, close };
}
const stop = vi.fn();

describe('Hermes microphone lifetime', () => {
  it('does not ask for microphone access until explicit start, then releases media and decoder on finish', async () => {
    stop.mockClear(); const env = mediaEnvironment();
    expect(supportsVoiceRecording()).toBe(true);
    const recorder = new HermesVoiceRecorder(vi.fn());
    expect(env.getUserMedia).not.toHaveBeenCalled();
    await recorder.start();
    expect(env.getUserMedia).toHaveBeenCalledOnce();
    const wav = await recorder.finish();
    expect(wav.type).toBe('audio/wav');
    expect(stop).toHaveBeenCalled();
    expect(env.close).toHaveBeenCalledOnce();
  });

  it('propagates denied permission without starting a recorder', async () => {
    const denied = new DOMException('denied', 'NotAllowedError');
    mediaEnvironment(vi.fn().mockRejectedValue(denied));
    await expect(new HermesVoiceRecorder(vi.fn()).start()).rejects.toBe(denied);
  });

  it('stops a late microphone grant after close, account change, or hidden-tab cancellation', async () => {
    stop.mockClear();
    let grant!: (value: unknown) => void;
    mediaEnvironment(vi.fn().mockImplementation(() => new Promise(resolve => { grant = resolve; })));
    const recorder = new HermesVoiceRecorder(vi.fn()); const starting = recorder.start();
    recorder.cancel(); grant({ getTracks: () => [{ stop }] });
    await expect(starting).rejects.toMatchObject({ name: 'AbortError' });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('stops microphone tracks at the 60-second limit even if the UI is delayed', async () => {
    vi.useFakeTimers(); stop.mockClear(); mediaEnvironment(); const limit = vi.fn();
    const recorder = new HermesVoiceRecorder(limit); await recorder.start();
    vi.advanceTimersByTime(60_000);
    expect(stop).toHaveBeenCalled(); expect(limit).toHaveBeenCalledOnce();
    recorder.cancel();
  });
});
