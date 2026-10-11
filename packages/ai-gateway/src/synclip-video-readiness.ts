import { constants, type Stats } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { SynclipAudioError, validateSynclipAudioRequest } from './synclip-audio-api';

const MAX_JSON = 512 * 1024;
const READY_MAX_AGE = 60_000;
const CLOCK_SKEW = 5000;

export interface SynclipVideoNarrationConfig { provider: 'synclip'; voice: string; speed: number }
export interface SynclipVideoReady {
  schemaVersion: 1; provider: 'synclip'; model: 'ltx23'; adapterRevision?: string;
  accepting: boolean; updatedAt: number; narration?: SynclipVideoNarrationConfig;
  audioAccepting?: boolean; audioAuditionBudget?: { maxEstimatedCoins: number };
}
export interface SynclipVideoReadyConfig { resultsDir: string; now?: () => number }
export interface NativeVideoPrerequisites { nativeAgentConfigured: boolean; nativeSceneImageEnabled: boolean }
export type NativeVideoReadinessReader = () => Promise<boolean>;
type NativeAudioAuditionPolicy = { audio: SynclipVideoNarrationConfig; maxEstimatedCoins: number };
type NativeAudioAuditionReadinessReader = () => Promise<NativeAudioAuditionPolicy | null>;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function safeFile(stat: Stats): boolean {
  return stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && stat.gid === 1000
    && (stat.mode & 0o7777) === 0o640 && stat.size > 0 && stat.size <= MAX_JSON;
}
function fresh(time: number, now: number): boolean {
  return Number.isFinite(time) && time >= 0 && time >= now - READY_MAX_AGE && time <= now + CLOCK_SKEW;
}
async function safeDirectory(path: string): Promise<boolean> {
  if (!isAbsolute(path) || resolve(path) !== path) return false;
  let current = path;
  for (;;) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    if (current === path && (stat.uid !== 0 || stat.gid !== 1000 || (stat.mode & 0o7777) !== 0o2750)) return false;
    if (current === parse(current).root) return true;
    current = dirname(current);
  }
}
function narration(value: unknown): SynclipVideoNarrationConfig | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'provider,speed,voice'
    || value.provider !== 'synclip' || typeof value.speed !== 'number' || !Number.isFinite(value.speed) || value.speed <= 0) return null;
  try {
    const checked = validateSynclipAudioRequest({ text: 'catalog validation', voice: value.voice, speed: value.speed });
    return { provider: 'synclip', voice: checked.voice, speed: value.speed };
  } catch (error) { if (error instanceof SynclipAudioError) return null; throw error; }
}
function auditionBudget(value: unknown): { maxEstimatedCoins: number } | null {
  if (!record(value) || typeof value.maxEstimatedCoins !== 'number'
    || !Number.isFinite(value.maxEstimatedCoins) || value.maxEstimatedCoins <= 0) return null;
  return { maxEstimatedCoins: value.maxEstimatedCoins };
}

/** Read a single root-owned heartbeat snapshot. This never reads credentials or submits work. */
export async function readSynclipVideoReady(config: SynclipVideoReadyConfig): Promise<SynclipVideoReady | null> {
  const now = (config.now ?? Date.now)();
  if (!Number.isFinite(now)) return null;
  try {
    if (!await safeDirectory(config.resultsDir)) return null;
    const path = join(config.resultsDir, '.ready'); const before = await lstat(path);
    if (!safeFile(before)) return null;
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!safeFile(stat) || stat.ino !== before.ino || stat.dev !== before.dev || stat.size !== before.size || !fresh(stat.mtimeMs, now)) return null;
      const buffer = Buffer.alloc(MAX_JSON + 1); const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const after = await file.stat();
      if (bytesRead !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) return null;
      const value: unknown = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      if (!record(value) || value.schemaVersion !== 1 || value.provider !== 'synclip' || value.model !== 'ltx23'
        || typeof value.accepting !== 'boolean' || typeof value.updatedAt !== 'number' || !fresh(value.updatedAt, now)
        || (value.adapterRevision !== undefined && (typeof value.adapterRevision !== 'string'
          || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(value.adapterRevision)))) return null;
      const audio = value.narration === undefined ? undefined : narration(value.narration);
      const budget = value.audioAuditionBudget === undefined ? undefined : auditionBudget(value.audioAuditionBudget);
      if (audio === null || budget === null || (value.audioAccepting !== undefined && typeof value.audioAccepting !== 'boolean')
        || (value.audioAccepting === true && (!audio || !budget))) return null;
      return { schemaVersion: 1, provider: 'synclip', model: 'ltx23', accepting: value.accepting, updatedAt: value.updatedAt,
        ...(value.adapterRevision === undefined ? {} : { adapterRevision: value.adapterRevision as string }),
        ...(audio ? { narration: audio } : {}),
        ...(value.audioAccepting === undefined ? {} : { audioAccepting: value.audioAccepting as boolean }),
        ...(budget ? { audioAuditionBudget: budget } : {}) };
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof SyntaxError || ['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException)?.code ?? '')) return null;
    throw error;
  }
}

/** Configuration is server-owned; readiness is sampled afresh on every invocation. */
export function createNativeVideoReadinessReader(env: Readonly<Record<string, string | undefined>>,
  prerequisites: NativeVideoPrerequisites): NativeVideoReadinessReader;
export function createNativeVideoReadinessReader(env: Readonly<Record<string, string | undefined>>,
  prerequisites: NativeVideoPrerequisites, purpose: 'audio-audition'): NativeAudioAuditionReadinessReader;
export function createNativeVideoReadinessReader(env: Readonly<Record<string, string | undefined>>,
  prerequisites: NativeVideoPrerequisites, purpose?: 'audio-audition'): () => Promise<boolean | NativeAudioAuditionPolicy | null> {
  return async () => {
    const inbox = env.SYNCLIP_VIDEO_INBOX_DIR?.trim(); const results = env.SYNCLIP_VIDEO_RESULTS_DIR?.trim();
    if (!prerequisites.nativeAgentConfigured || !prerequisites.nativeSceneImageEnabled
      || env.AI_ENABLED !== 'true' || env.HERMES_NATIVE_AGENT_ENABLED !== 'true' || env.HERMES_VIDEO_ENABLED !== 'true'
      || env.HERMES_VIDEO_PROVIDER?.trim() !== 'synclip' || env.SYNCLIP_VIDEO_ENABLED !== 'true'
      || !inbox || !results || !isAbsolute(inbox) || !isAbsolute(results) || resolve(inbox) === resolve(results)
      || (env.AI_DISABLED_PROVIDERS ?? '').split(',').map(value => value.trim()).includes('synclip')) return purpose === 'audio-audition' ? null : false;
    const ready = await readSynclipVideoReady({ resultsDir: results });
    if (purpose === 'audio-audition') {
      if (!ready || ready.adapterRevision !== 'synclip-video-v2' || ready.audioAccepting !== true || !ready.narration || !ready.audioAuditionBudget) return null;
      return { audio: ready.narration, maxEstimatedCoins: ready.audioAuditionBudget.maxEstimatedCoins };
    }
    return Boolean(ready?.accepting && ready.adapterRevision === 'synclip-video-v2' && ready.narration);
  };
}
