import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Execute the actual CommonJS entrypoint; replace only external services and the HTTP listener. */
async function start(runtime: unknown) {
  const errors: unknown[][] = []; const options: Record<string, unknown>[] = []; let listening = 0;
  const prisma = { $disconnect: async () => undefined };
  const redis = { quit: async () => undefined, disconnect: () => undefined };
  const process = { env: {}, exitCode: 0, on: () => undefined };
  const log = { warn: () => undefined, info: () => undefined };
  class Mailer {}
  const modules: Record<string, unknown> = {
    '@openscience/auth': { DevOutboxMailer: Mailer, SmtpMailer: Mailer },
    '@openscience/config': { loadApiEnv: () => ({ ai: { sceneImageEnabled: false }, mailerDriver: 'dev', storage: {}, allowedOrigins: [], nodeEnv: 'test', port: 0 }) },
    '@openscience/database': { createPrismaClient: () => prisma, createRedisClient: () => redis, createPrismaAuditSink: () => ({}) },
    '@openscience/domain': { nativeAgentRuntimeFromEnv: () => runtime },
    '@openscience/storage': { createStorageAdapter: () => ({}), createClamAvScanner: () => ({}) },
    '@openscience/observability': { createLogger: () => log },
    '@openscience/ai-gateway': {},
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
  return { errors, options, listening, exitCode: process.exitCode };
}

describe('actual API CommonJS entrypoint', () => {
  it.each([undefined, { runtimeId: 'fixture-runtime', skillCatalogueId: 'fixture-catalogue', model: 'MiniMax-M3' }])(
    'initializes the native runtime helper before starting with config %j', async runtime => {
      const result = await start(runtime);
      expect(result.errors).toEqual([]);
      expect(result.exitCode).toBe(0); expect(result.listening).toBe(1);
      expect(result.options[0]?.nativeAgentRuntime).toEqual(runtime);
    },
  );
});
