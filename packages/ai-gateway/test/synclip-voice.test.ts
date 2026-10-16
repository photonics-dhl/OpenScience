import { describe, expect, it, vi } from 'vitest';
import { createConfiguredSynclipVoiceRuntime } from '../src/synclip-voice';

const env = { AI_ENABLED: 'true', SYNCLIP_API_KEY_FILE: '/run/secrets/synclip_api_key' };
const voice = { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: 'Female', languages: ['zh'],
  is_premium: false, credits_per_1k_chars: 1 };
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } });
describe('configured Synclip voice runtime', () => {
  it('does not read credentials or contact providers when the existing AI configuration is off', async () => {
    const readKey = vi.fn(async () => 'test-key');
    await expect(createConfiguredSynclipVoiceRuntime({ ...env, AI_ENABLED: 'false' }, { readKey })).resolves.toBeUndefined();
    await expect(createConfiguredSynclipVoiceRuntime({ AI_ENABLED: 'true' }, { readKey })).resolves.toBeUndefined();
    expect(readKey).not.toHaveBeenCalled();
  });
  it('reads the one existing server key inside Gateway and exposes only supported standard presets', async () => {
    const readKey = vi.fn(async () => 'test-shared-key\n');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([voice,
      { ...voice, id: 'premium', is_premium: true, credits_per_1k_chars: 4 },
      { ...voice, id: 'french', languages: ['fr'] }]));
    const runtime = await createConfiguredSynclipVoiceRuntime(env, { readKey, fetch: fetcher });
    await expect(runtime!.listPresets()).resolves.toEqual([{ id: voice.id, name: voice.name, languages: ['zh'], creditsPerRequest: 1 }]);
    expect(readKey).toHaveBeenCalledWith('/run/secrets/synclip_api_key');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer test-shared-key' });
    expect(JSON.stringify(runtime)).not.toContain('test-shared-key');
  });
  it('shares concurrent catalog reads and invalidates eligibility after a failed refresh', async () => {
    let now = 0;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([voice])).mockRejectedValueOnce(new Error('provider down'));
    const runtime = await createConfiguredSynclipVoiceRuntime(env, { readKey: async () => 'test-key', fetch: fetcher, now: () => now });
    const [first, second] = await Promise.all([runtime!.listPresets(), runtime!.listPresets()]);
    first[0]!.languages.length = 0;
    expect(second[0]!.languages).toEqual(['zh']); expect(fetcher).toHaveBeenCalledTimes(1);
    now = 60_001;
    await expect(runtime!.listPresets()).rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_NETWORK_FAILED' });
    await expect(runtime!.client.create({ text: 'Hello', voice: voice.id })).rejects.toMatchObject({ outcome: 'invalid' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not include a secret read failure in an application error', async () => {
    await expect(createConfiguredSynclipVoiceRuntime(env, { readKey: async () => { throw new Error('test-private-token'); } }))
      .rejects.toThrow('SYNCLIP_VOICE_SECRET_UNAVAILABLE');
  });
});
