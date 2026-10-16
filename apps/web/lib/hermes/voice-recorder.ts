export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MAX_SECONDS = 60;

/** Decode first: a MediaRecorder container is never relabelled as WAV. */
export function encodeMonoPcmWav(channels: readonly Float32Array[], sampleRate: number, maxSeconds = VOICE_MAX_SECONDS): Blob {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 384_000
    || !Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('Invalid recording');
  const sourceLength = Math.min(...channels.map(channel => channel.length));
  const frames = Math.floor(Math.min(sourceLength / sampleRate, maxSeconds, VOICE_MAX_SECONDS) * VOICE_SAMPLE_RATE);
  if (frames < 1) throw new Error('Empty recording');
  const buffer = new ArrayBuffer(44 + frames * 2); const view = new DataView(buffer);
  const label = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
  label(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); label(8, 'WAVE'); label(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_SAMPLE_RATE, true); view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, frames * 2, true);
  const ratio = sampleRate / VOICE_SAMPLE_RATE;
  const monoAt = (index: number) => channels.reduce((sum, channel) => sum + (Number.isFinite(channel[index]) ? channel[index] : 0), 0) / channels.length;
  for (let index = 0; index < frames; index += 1) {
    const start = index * ratio;
    let sample = 0;
    if (ratio >= 1) {
      // Area averaging low-passes the source before decimation.
      const end = Math.min((index + 1) * ratio, sourceLength);
      for (let cursor = Math.floor(start); cursor < Math.ceil(end); cursor += 1) {
        sample += monoAt(cursor) * (Math.min(cursor + 1, end) - Math.max(cursor, start));
      }
      sample /= end - start;
    } else {
      const left = Math.floor(start), fraction = start - left;
      sample = monoAt(left) * (1 - fraction) + monoAt(Math.min(left + 1, sourceLength - 1)) * fraction;
    }
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function supportsVoiceRecording(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';
}

const cancelledRecording = () => new DOMException('Recording cancelled', 'AbortError');

export class HermesVoiceRecorder {
  private generation = 0;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private encoded: Promise<Blob> | null = null;
  private rejectEncoded: ((reason: unknown) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private context: AudioContext | null = null;
  private finishing: Promise<Blob> | null = null;
  constructor(private readonly onLimit: () => void) {}

  async start(): Promise<void> {
    if (!supportsVoiceRecording() || this.recorder) throw new Error('Recording unavailable');
    const generation = ++this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false });
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw cancelledRecording(); }
    this.stream = stream;
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); this.recorder = recorder;
      const chunks: Blob[] = [];
      this.encoded = new Promise<Blob>((resolve, reject) => {
        this.rejectEncoded = reject;
        recorder.addEventListener('dataavailable', event => { if (generation === this.generation && event.data.size) chunks.push(event.data); });
        recorder.addEventListener('stop', () => {
          this.releaseTracks();
          if (generation !== this.generation) { reject(cancelledRecording()); return; }
          resolve(new Blob(chunks, { type: recorder.mimeType }));
        }, { once: true });
        recorder.addEventListener('error', () => { this.releaseTracks(); reject(new Error('Recording failed')); }, { once: true });
      });
      // Cancellation can happen before a caller requests the encoded result.
      void this.encoded.catch(() => {});
      recorder.start();
      this.timer = setTimeout(() => { this.stopMedia(); this.onLimit(); }, VOICE_MAX_SECONDS * 1000);
    } catch (cause) { this.releaseTracks(); throw cause; }
  }

  finish(): Promise<Blob> {
    if (this.finishing) return this.finishing;
    const generation = this.generation, encoded = this.encoded;
    if (!encoded) return Promise.reject(new Error('Recording has not started'));
    this.stopMedia();
    this.finishing = (async () => {
      const blob = await encoded;
      if (generation !== this.generation) throw cancelledRecording();
      const context = new AudioContext(); this.context = context;
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (generation !== this.generation) throw cancelledRecording();
        return encodeMonoPcmWav(Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)), decoded.sampleRate);
      } finally {
        if (this.context === context) { this.context = null; await context.close().catch(() => {}); }
      }
    })();
    return this.finishing;
  }

  cancel(): void {
    this.generation += 1; this.rejectEncoded?.(cancelledRecording()); this.stopMedia(); this.recorder = null;
    if (this.context) { void this.context.close().catch(() => {}); this.context = null; }
  }

  private releaseTracks(): void {
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined; }
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
  }

  private stopMedia(): void {
    this.releaseTracks();
    if (this.recorder && this.recorder.state !== 'inactive') { try { this.recorder.stop(); } catch { /* Already stopped by the browser. */ } }
  }
}
