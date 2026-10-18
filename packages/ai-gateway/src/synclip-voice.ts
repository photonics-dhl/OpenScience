import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { SynclipAudioClient } from './synclip-audio-api';

export interface SynclipVoicePreset { id: string; name: string; languages: Array<'zh' | 'en'>; creditsPerRequest: 1 }
export interface SynclipVoiceRuntime {
  client: SynclipAudioClient;
  listPresets(): Promise<SynclipVoicePreset[]>;
}

/** Reads the existing Synclip secret inside Gateway; never returns the key to application code. */
export async function createConfiguredSynclipVoiceRuntime(env: NodeJS.ProcessEnv, options: {
  readKey?: (path: string) => Promise<string>; fetch?: typeof fetch; now?: () => number;
} = {}): Promise<SynclipVoiceRuntime | undefined> {
  const path = env.SYNCLIP_API_KEY_FILE?.trim();
  if (env.AI_ENABLED !== 'true' || !path) return undefined;
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('SYNCLIP_VOICE_CONFIG_INVALID');
  let key: string;
  try { key = (await (options.readKey ?? (async value => readFile(value, 'utf8')))(path)).trim(); }
  catch { throw new Error('SYNCLIP_VOICE_SECRET_UNAVAILABLE'); }
  const client = new SynclipAudioClient({ apiKey: key, fetch: options.fetch, timeoutMs: 12_000 });
  const now = options.now ?? Date.now;
  let cached: { until: number; presets: SynclipVoicePreset[] } | undefined;
  let loading: Promise<SynclipVoicePreset[]> | undefined;
  return { client, async listPresets() {
    if (cached && now() < cached.until) return cached.presets.map(value => ({ ...value, languages: [...value.languages] }));
    loading ??= (async () => {
      cached = undefined;
      const voices = await client.listVoices();
      const presets = voices.filter(voice => !voice.is_premium && voice.credits_per_1k_chars === 1)
        .map(voice => ({ id: voice.id, name: voice.name,
          languages: voice.languages.filter((language): language is 'zh' | 'en' => language === 'zh' || language === 'en'),
          creditsPerRequest: 1 as const })).filter(voice => voice.languages.length > 0);
      cached = { until: now() + 60_000, presets };
      return presets;
    })();
    try { return (await loading).map(value => ({ ...value, languages: [...value.languages] })); }
    finally { loading = undefined; }
  } };
}
