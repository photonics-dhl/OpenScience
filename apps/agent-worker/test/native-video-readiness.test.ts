import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerDeps } from '../src/index';

const probe = vi.hoisted(() => ({ available: false, reads: 0,
  calls: [] as Array<{ env: Record<string, string | undefined>; prerequisites: { nativeAgentConfigured: boolean; nativeSceneImageEnabled: boolean } }> }));
vi.mock('@openscience/ai-gateway', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(),
  createNativeVideoReadinessReader: (env: Record<string, string | undefined>, prerequisites: { nativeAgentConfigured: boolean; nativeSceneImageEnabled: boolean }) => {
    probe.calls.push({ env, prerequisites }); return async () => { probe.reads++; return probe.available; };
  },
}));
beforeEach(() => { probe.available = false; probe.reads = 0; probe.calls.length = 0; });
const fullEnv = { AI_ENABLED: 'true', HERMES_NATIVE_AGENT_ENABLED: 'true', HERMES_NATIVE_RUNTIME_ID: 'installed-runtime',
  HERMES_NATIVE_SKILL_CATALOGUE_ID: 'installed-skills', HERMES_NATIVE_AGENT_MODEL: 'MiniMax-M3',
  HERMES_SCENE_IMAGE_PROVIDER: 'synclip', SYNCLIP_IMAGE_ENABLED: 'true', SYNCLIP_IMAGE_INBOX_DIR: '/image/inbox', SYNCLIP_IMAGE_RESULTS_DIR: '/image/results',
  HERMES_VIDEO_ENABLED: 'true', HERMES_VIDEO_PROVIDER: 'synclip', SYNCLIP_VIDEO_ENABLED: 'true',
  SYNCLIP_VIDEO_INBOX_DIR: '/video/inbox', SYNCLIP_VIDEO_RESULTS_DIR: '/video/results' };
const input = { prisma: {}, redis: {} } as Parameters<typeof createWorkerDeps>[0];

describe('Worker native video readiness dependency assembly', () => {
  it('carries a dynamically sampled callback into worker dependencies instead of a startup snapshot', async () => {
    const deps = createWorkerDeps(input, fullEnv);
    expect(typeof deps.readVideoReadiness).toBe('function'); expect(deps.videoEnabled).toBe(true); expect(probe.reads).toBe(0);
    expect(probe.calls).toEqual([{ env: fullEnv, prerequisites: { nativeAgentConfigured: true, nativeSceneImageEnabled: true } }]);
    expect(await deps.readVideoReadiness!()).toBe(false); probe.available = true;
    expect(await deps.readVideoReadiness!()).toBe(true); probe.available = false;
    expect(await deps.readVideoReadiness!()).toBe(false); expect(probe.reads).toBe(3);
  });
  it.each([{ AI_ENABLED: 'false' }, { SYNCLIP_IMAGE_ENABLED: 'false' }, { SYNCLIP_IMAGE_INBOX_DIR: ' ' },
    { SYNCLIP_IMAGE_RESULTS_DIR: '' }, { AI_DISABLED_PROVIDERS: ' synclip ' }, { HERMES_SCENE_IMAGE_PROVIDER: 'minimax' }])(
    'preserves the complete native image prerequisite passed to readiness: %j', patch => {
      const env = { ...fullEnv, ...patch }; createWorkerDeps(input, env);
      expect(probe.calls[0]?.prerequisites).toEqual({ nativeAgentConfigured: true, nativeSceneImageEnabled: false });
    });
  it('passes disabled Native runtime without inventing an installed configuration', () => {
    createWorkerDeps(input, { ...fullEnv, HERMES_NATIVE_AGENT_ENABLED: 'false' });
    expect(probe.calls[0]?.prerequisites).toEqual({ nativeAgentConfigured: false, nativeSceneImageEnabled: true });
  });
});
