import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '@openscience/config';

/** Execute the actual CommonJS entrypoint; replace only external services and the HTTP listener. */
async function start(runtime: unknown, runtimeEnv: Record<string, string | undefined> = {}) {
  const errors: unknown[][] = []; const options: Record<string, unknown>[] = []; let listening = 0;
  const prisma = { $disconnect: async () => undefined };
  const redis = { quit: async () => undefined, disconnect: () => undefined };
  const process = { env: runtimeEnv, exitCode: 0, on: () => undefined };
  const readiness = { available: false, reads: 0, prerequisites: undefined as unknown };
  const log = { warn: () => undefined, info: () => undefined };
  class Mailer {}
  class SpoolImage {}
  const modules: Record<string, unknown> = {
    '@openscience/auth': { DevOutboxMailer: Mailer, SmtpMailer: Mailer },
    '@openscience/config': { loadApiEnv: () => loadApiEnv(runtimeEnv) },
    '@openscience/database': { createPrismaClient: () => prisma, createRedisClient: () => redis, createPrismaAuditSink: () => ({}) },
    '@openscience/domain': { nativeAgentRuntimeFromEnv: () => runtime },
    '@openscience/storage': { createStorageAdapter: () => ({}), createClamAvScanner: () => ({}) },
    '@openscience/observability': { createLogger: () => log },
    '@openscience/ai-gateway': { SynclipSpoolImageProvider: SpoolImage, createNativeVideoReadinessReader: (env: unknown, prerequisites: unknown) => {
      expect(env).toBe(runtimeEnv); readiness.prerequisites = prerequisites;
      return async () => { readiness.reads++; return readiness.available; };
    } },
    '@openscience/search': {},
    './search-runtime': { buildHybridSearchFromEnv: () => undefined },
    './app': { buildApp: async (value: Record<string, unknown>) => { options.push(value); return {
      log, listen: async () => { listening++; }, close: async () => undefined,
    }; } },
  };
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { exports: {}, process, console: { error: (...value: unknown[]) => errors.push(value) },
    require: (name: string) => {
      if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected entrypoint dependency ${name}`);
      return modules[name];
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { errors, options, listening, exitCode: process.exitCode, readiness };
}

const nativeRuntime = { runtimeId: 'fixture-runtime', skillCatalogueId: 'fixture-catalogue', model: 'MiniMax-M3' };
const videoEnv = { AI_ENABLED: 'true', HERMES_SCENE_IMAGE_PROVIDER: 'synclip', SYNCLIP_IMAGE_ENABLED: 'true',
  SYNCLIP_IMAGE_INBOX_DIR: '/fixture/image/inbox', SYNCLIP_IMAGE_RESULTS_DIR: '/fixture/image/results', HERMES_VIDEO_ENABLED: 'true' };

describe('actual API CommonJS entrypoint', () => {
  it('injects a dynamically sampled video callback into the actual API app bootstrap', async () => {
    const result = await start(nativeRuntime, videoEnv);
    expect(result.errors).toEqual([]); expect(result.readiness.reads).toBe(0);
    expect(result.readiness.prerequisites).toEqual({ nativeAgentConfigured: true, nativeSceneImageEnabled: true });
    const reader = result.options[0]?.readVideoReadiness as (() => Promise<boolean>) | undefined;
    expect(typeof reader).toBe('function'); expect(await reader!()).toBe(false);
    result.readiness.available = true; expect(await reader!()).toBe(true); expect(result.readiness.reads).toBe(2);
  });
  it.each([{ AI_ENABLED: 'false' }, { SYNCLIP_IMAGE_ENABLED: 'false' }, { SYNCLIP_IMAGE_INBOX_DIR: ' ' },
    { SYNCLIP_IMAGE_RESULTS_DIR: '' }, { AI_DISABLED_PROVIDERS: ' synclip ' }, { HERMES_SCENE_IMAGE_PROVIDER: 'disabled' }])(
    'uses the complete existing API image configuration prerequisite: %j', async patch => {
      const result = await start(nativeRuntime, { ...videoEnv, ...patch });
      expect(result.errors).toEqual([]);
      expect(result.readiness.prerequisites).toEqual({ nativeAgentConfigured: true, nativeSceneImageEnabled: false });
    });
  it.each([undefined, { runtimeId: 'fixture-runtime', skillCatalogueId: 'fixture-catalogue', model: 'MiniMax-M3' }])(
    'initializes the native runtime helper before starting with config %j', async runtime => {
      const result = await start(runtime);
      expect(result.errors).toEqual([]);
      expect(result.exitCode).toBe(0); expect(result.listening).toBe(1);
      expect(result.options[0]?.nativeAgentRuntime).toEqual(runtime);
    },
  );
});
