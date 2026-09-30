import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { BlockList, isIP } from 'node:net';

const ORIGIN = 'https://api.minimax.cn';
const MAX_RESPONSE = 16 * 1024 * 1024;
export interface MiniMaxSpeechRequest {
  text: string; voiceId: string; speed?: number; vol?: number; pitch?: number;
}
export interface MiniMaxSpeechResult {
  audio: Buffer; subtitleUrl?: string;
  metadata: { model: 'speech-2.8-hd'; traceId?: string; usageChars?: number; sampleRate: 32000; durationMs?: number };
}
export class MiniMaxSpeechError extends Error {
  constructor(readonly code: string, readonly outcome: 'invalid' | 'rejected' | 'uncertain',
    readonly httpStatus?: number, readonly providerCode?: number) {
    super(code); this.name = 'MiniMaxSpeechError';
  }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = () => new MiniMaxSpeechError('SPEECH_RESPONSE_INVALID', 'uncertain');
export function validateMiniMaxSpeechRequest(value: unknown): MiniMaxSpeechRequest {
  if (!record(value) || Object.keys(value).some(k => !['text', 'voiceId', 'speed', 'vol', 'pitch'].includes(k))
    || typeof value.text !== 'string' || !value.text.trim() || [...value.text].length > 2000
    || [...value.text].some(char => { const code = char.charCodeAt(0); return code === 127 || (code < 32 && ![9,10,13].includes(code)); })
    || typeof value.voiceId !== 'string' || !/^[A-Za-z0-9_() .-]{1,120}$/u.test(value.voiceId)
    || (value.speed !== undefined && (typeof value.speed !== 'number' || !Number.isFinite(value.speed) || value.speed < .5 || value.speed > 2))
    || (value.vol !== undefined && (typeof value.vol !== 'number' || !Number.isFinite(value.vol) || value.vol < .1 || value.vol > 2))
    || (value.pitch !== undefined && (!Number.isInteger(value.pitch) || Number(value.pitch) < -12 || Number(value.pitch) > 12))) {
    throw new MiniMaxSpeechError('SPEECH_REQUEST_INVALID', 'invalid');
  }
  return { text: value.text, voiceId: value.voiceId, speed: value.speed as number ?? 1,
    vol: value.vol as number ?? 1, pitch: value.pitch as number ?? 0 };
}
function subtitleUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 8192 || /\s/u.test(value)) throw invalid();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port
      || isIP(url.hostname.replace(/^\[|\]$/gu, ''))) throw invalid();
    return value;
  } catch { throw invalid(); }
}
async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE)) {
    void response.body?.cancel().catch(() => {});
    throw new MiniMaxSpeechError('SPEECH_RESPONSE_TOO_LARGE', 'uncertain');
  }
  if (!response.body || !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) throw invalid();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.length;
      if (size > MAX_RESPONSE) {
        void reader.cancel().catch(() => {});
        throw new MiniMaxSpeechError('SPEECH_RESPONSE_TOO_LARGE', 'uncertain');
      }
      chunks.push(item.value);
    }
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { reader.releaseLock(); }
}

/** One mainland speech request, no fallback or automatic retry. The operator owns durable submission. */
export class MiniMaxSpeechClient {
  readonly #key: string; readonly #fetch: typeof fetch; readonly #timeout: number;
  constructor(config: { baseUrl: string; apiKey: string; timeoutMs?: number; fetch?: typeof fetch }) {
    if (![ORIGIN, `${ORIGIN}/`].includes(config.baseUrl) || typeof config.apiKey !== 'string'
      || !/^[\x21-\x7e]{1,4096}$/u.test(config.apiKey)) throw new MiniMaxSpeechError('SPEECH_CONFIG_INVALID', 'invalid');
    this.#timeout = config.timeoutMs ?? 120000;
    if (!Number.isInteger(this.#timeout) || this.#timeout < 1 || this.#timeout > 120000) throw new MiniMaxSpeechError('SPEECH_CONFIG_INVALID', 'invalid');
    this.#key = config.apiKey; this.#fetch = config.fetch ?? globalThis.fetch;
  }
  async synthesize(input: MiniMaxSpeechRequest): Promise<MiniMaxSpeechResult> {
    const request = validateMiniMaxSpeechRequest(input);
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = async (): Promise<MiniMaxSpeechResult> => {
      const response = await this.#fetch(`${ORIGIN}/v1/t2a_v2`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.#key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ model: 'speech-2.8-hd', text: request.text, stream: false,
          language_boost: 'Chinese', output_format: 'hex', subtitle_enable: true, subtitle_type: 'word',
          voice_setting: { voice_id: request.voiceId, speed: request.speed, vol: request.vol, pitch: request.pitch },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 } }),
      });
      if (response.redirected || (response.url && new URL(response.url).origin !== ORIGIN)) throw invalid();
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new MiniMaxSpeechError('SPEECH_HTTP_FAILED', response.status >= 400 && response.status < 500 && response.status !== 408 ? 'rejected' : 'uncertain', response.status);
      }
      const result = await boundedJson(response);
      if (!record(result) || !record(result.base_resp) || !Number.isInteger(result.base_resp.status_code)) throw invalid();
      if (result.base_resp.status_code !== 0) throw new MiniMaxSpeechError('SPEECH_PROVIDER_REJECTED', 'rejected', response.status, Number(result.base_resp.status_code));
      if (!record(result.data) || result.data.status !== 2 || typeof result.data.audio !== 'string'
        || result.data.audio.length < 64 || result.data.audio.length % 2 || !/^[a-f0-9]+$/iu.test(result.data.audio)) throw invalid();
      const audio = Buffer.from(result.data.audio, 'hex');
      if (audio.toString('ascii', 0, 3) !== 'ID3' && !(audio[0] === 255 && (audio[1] & 224) === 224)) throw invalid();
      const extra = record(result.extra_info) ? result.extra_info : {};
      if (extra.audio_sample_rate !== undefined && extra.audio_sample_rate !== 32000) throw invalid();
      if (extra.audio_format !== undefined && extra.audio_format !== 'mp3') throw invalid();
      if (extra.audio_size !== undefined && extra.audio_size !== audio.length) throw invalid();
      return { audio, subtitleUrl: subtitleUrl(result.data.subtitle_file), metadata: {
        model: 'speech-2.8-hd', sampleRate: 32000,
        ...(typeof result.trace_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(result.trace_id) ? { traceId: result.trace_id } : {}),
        ...(Number.isSafeInteger(extra.usage_characters) && Number(extra.usage_characters) >= 0 ? { usageChars: Number(extra.usage_characters) } : {}),
        ...(typeof extra.audio_length === 'number' && Number.isFinite(extra.audio_length) && extra.audio_length > 0 ? { durationMs: extra.audio_length } : {}),
      } };
    };
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new MiniMaxSpeechError('SPEECH_TIMEOUT', 'uncertain')); }, this.#timeout);
      })]);
    } catch (error) {
      controller.abort();
      if (error instanceof MiniMaxSpeechError) throw error;
      throw new MiniMaxSpeechError('SPEECH_NETWORK_OR_RESPONSE_FAILED', 'uncertain');
    } finally { if (timer) clearTimeout(timer); }
  }
}

const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],
  ['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const) blocked.addSubnet(ip,prefix,'ipv4');

/** Read the already-generated subtitle file. No key, redirects, retry, or provider POST. */
export async function downloadMiniMaxSpeechSubtitles(value: string): Promise<Buffer> {
  const checked = subtitleUrl(value); if (!checked) throw invalid();
  const url = new URL(checked); const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = async () => {
    const addresses = await lookup(url.hostname, { family: 4, all: true });
    if (controller.signal.aborted) throw new MiniMaxSpeechError('SPEECH_TIMEOUT','uncertain');
    if (!addresses.length || addresses.some(a => a.family !== 4 || !isIP(a.address) || blocked.check(a.address,'ipv4'))) throw invalid();
    return new Promise<Buffer>((accept,reject) => {
      const req = get(url, { family:4, agent:false, signal:controller.signal,
        lookup: (_host,_options,done) => done(null,addresses[0].address,4), headers:{Accept:'application/json,text/plain'} }, response => {
        const fail = () => { reject(invalid()); response.destroy(); };
        const length = response.headers['content-length'];
        if (response.statusCode !== 200 || (length !== undefined && (!/^\d+$/u.test(length) || Number(length)>1024*1024))) { fail(); return; }
        const chunks:Buffer[]=[]; let size=0;
        response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1024*1024)fail();else chunks.push(chunk);});
        response.on('aborted',fail); response.on('error',fail);
        response.on('end',()=>{
          if (!size || (length !== undefined && size !== Number(length))) { fail(); return; }
          try { const bytes=Buffer.concat(chunks); JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes)); accept(bytes); }
          catch { fail(); }
        });
      });
      req.on('error',()=>reject(new MiniMaxSpeechError('SPEECH_SUBTITLE_DOWNLOAD_FAILED','uncertain')));
    });
  };
  try { return await Promise.race([operation(),new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(new MiniMaxSpeechError('SPEECH_TIMEOUT','uncertain'));},30000);
  })]); } catch(error) { controller.abort(); if(error instanceof MiniMaxSpeechError)throw error;throw invalid(); }
  finally {if(timer)clearTimeout(timer);}
}
