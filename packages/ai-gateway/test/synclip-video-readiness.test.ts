import type { Stats } from 'node:fs';
import type * as Filesystem from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeVideoReadinessReader, readSynclipVideoReady } from '../src/synclip-video-readiness';

const osBoundary = vi.hoisted(() => ({ roots: [] as string[], permissions: new Map<string, Partial<Stats>>(), openError: '' }));
// Only POSIX ownership/mode are simulated: Windows cannot represent root:1000.
// Bytes, file identity, timestamps, directory links and atomic rename stay real.
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof Filesystem>();
  const metadata = (stat: Stats, path: string): Stats => {
    if (!osBoundary.roots.some(root => path === root || path.startsWith(root + (path.includes('\\') ? '\\' : '/')))) return stat;
    return Object.assign(Object.create(stat) as Stats, { uid: 0, gid: 1000,
      mode: (stat.mode & ~0o7777) | (stat.isDirectory() ? 0o2750 : 0o640) }, osBoundary.permissions.get(path));
  };
  return { ...actual,
    lstat: vi.fn(async (path: string) => metadata(await actual.lstat(path), path)),
    open: vi.fn(async (path: string, flags: number) => {
      if (osBoundary.openError) throw Object.assign(new Error('filesystem unavailable'), { code: osBoundary.openError });
      const file = await actual.open(path, flags); const stat = file.stat.bind(file);
      file.stat = (async () => metadata(await stat(), path)) as typeof file.stat;
      return file;
    }),
  };
});
const fs = await vi.importActual<typeof Filesystem>('node:fs/promises');
const fixtureRoot = resolve(__dirname, '../../../tmp/synclip-video-readiness');
afterEach(async () => {
  osBoundary.openError = ''; osBoundary.permissions.clear(); vi.restoreAllMocks();
  for (const root of osBoundary.roots.splice(0)) {
    expect((await fs.lstat(root)).isSymbolicLink()).toBe(false);
    const target = await fs.realpath(root);
    expect(dirname(target)).toBe(await fs.realpath(fixtureRoot)); expect(basename(target)).toMatch(/^case-[A-Za-z0-9]{6}$/u);
    await fs.rm(target, { recursive: true, force: true });
  }
});
async function fixture() {
  await fs.mkdir(fixtureRoot, { recursive: true });
  const root = await fs.mkdtemp(join(fixtureRoot, 'case-')); osBoundary.roots.push(root);
  const resultsDir = join(root, 'results'); await fs.mkdir(resultsDir);
  const readyPath = join(resultsDir, '.ready'); const now = Date.now();
  const value = { schemaVersion: 1, provider: 'synclip', model: 'ltx23', adapterRevision: 'synclip-video-v2',
    accepting: true, updatedAt: now, narration: { provider: 'synclip', voice: 'selected-voice', speed: 1 } };
  const write = async (patch: Record<string, unknown> = {}) => {
    await fs.writeFile(readyPath, JSON.stringify({ ...value, ...patch })); await fs.utimes(readyPath, now / 1000, now / 1000);
  };
  await write();
  const env = { AI_ENABLED: 'true', HERMES_NATIVE_AGENT_ENABLED: 'true', HERMES_VIDEO_ENABLED: 'true',
    HERMES_VIDEO_PROVIDER: ' synclip ', SYNCLIP_VIDEO_ENABLED: 'true',
    SYNCLIP_VIDEO_INBOX_DIR: join(root, 'inbox'), SYNCLIP_VIDEO_RESULTS_DIR: resultsDir };
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const prerequisites = { nativeAgentConfigured: true, nativeSceneImageEnabled: true };
  return { root, resultsDir, readyPath, now, value, write, env, prerequisites,
    read: () => readSynclipVideoReady({ resultsDir, now: () => now }),
    capable: () => createNativeVideoReadinessReader(env, prerequisites)() };
}

describe('Synclip video readiness from the existing heartbeat', () => {
  it('reads a fresh native heartbeat from a real file and enables the fully configured callback', async () => {
    const f = await fixture(); expect(await f.read()).toEqual(f.value); expect(await f.capable()).toBe(true);
  });
  it('reads closed metadata but never advertises native generation, and missing readiness remains unavailable', async () => {
    const f = await fixture(); await f.write({ accepting: false });
    expect(await f.read()).toMatchObject({ accepting: false }); expect(await f.capable()).toBe(false);
    await fs.unlink(f.readyPath); expect(await f.read()).toBeNull(); expect(await f.capable()).toBe(false);
  });
  it.each(['json-stale', 'mtime-stale', 'json-future', 'mtime-future', 'nonfinite', 'wrong-model', 'wrong-provider', 'wrong-schema', 'bad-json', 'empty', 'oversized'])(
    'rejects unavailable or untrusted heartbeat data: %s', async change => {
      const f = await fixture();
      if (change === 'json-stale') await f.write({ updatedAt: f.now - 60_001 });
      if (change === 'mtime-stale') await fs.utimes(f.readyPath, (f.now - 60_001) / 1000, (f.now - 60_001) / 1000);
      if (change === 'json-future') await f.write({ updatedAt: f.now + 5001 });
      if (change === 'mtime-future') await fs.utimes(f.readyPath, (f.now + 5001) / 1000, (f.now + 5001) / 1000);
      if (change === 'nonfinite') await fs.writeFile(f.readyPath, JSON.stringify(f.value).replace(String(f.now), '1e309'));
      if (change === 'wrong-model') await f.write({ model: 'ltx23fast' });
      if (change === 'wrong-provider') await f.write({ provider: 'other' });
      if (change === 'wrong-schema') await f.write({ schemaVersion: 2 });
      if (change === 'bad-json') await fs.writeFile(f.readyPath, '{"private":"do-not-print",bad}');
      if (change === 'empty') await fs.writeFile(f.readyPath, '');
      if (change === 'oversized') await fs.writeFile(f.readyPath, ' '.repeat(512 * 1024 + 1));
      expect(await f.read()).toBeNull(); expect(await f.capable()).toBe(false);
    });
  it.each(['synclip-video-v1', 'future-adapter', undefined])('keeps historical metadata readable without granting native v2: %s', async adapterRevision => {
    const f = await fixture(); await f.write({ adapterRevision, narration: undefined });
    expect(await f.read()).toMatchObject({ accepting: true, model: 'ltx23' }); expect(await f.capable()).toBe(false);
  });
  it.each([undefined, { provider: 'other', voice: 'selected-voice', speed: 1 }, { provider: 'synclip', voice: 'bad voice', speed: 1 },
    { provider: 'synclip', voice: 'selected-voice', speed: 0 }, { provider: 'synclip', voice: 'selected-voice', speed: '1' },
    { provider: 'synclip', voice: 'selected-voice', speed: 1, apiKey: 'do-not-print' }])(
    'requires a legal explicit Synclip narration before new native work: case %#', async narration => {
      const f = await fixture(); await f.write({ narration }); expect(await f.capable()).toBe(false);
    });
  it.each(['file-owner', 'file-group', 'file-mode', 'directory-owner', 'directory-group', 'directory-mode'])('refuses unsafe POSIX metadata: %s', async change => {
    const f = await fixture(); const path = change.startsWith('file') ? f.readyPath : f.resultsDir;
    osBoundary.permissions.set(path, change.endsWith('owner') ? { uid: 1000 } : change.endsWith('group') ? { gid: 0 }
      : { mode: change.startsWith('file') ? 0o100666 : 0o40777 });
    expect(await f.read()).toBeNull(); expect(await f.capable()).toBe(false);
  });
  it('refuses a real symlinked directory without following it to a valid heartbeat', async () => {
    const f = await fixture(); const alias = join(f.root, 'alias');
    await fs.symlink(f.resultsDir, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await readSynclipVideoReady({ resultsDir: alias })).toBeNull();
  });
  it('observes an atomic heartbeat replacement instead of retaining an old inode or startup boolean', async () => {
    const f = await fixture(); await f.write({ accepting: false });
    const callback = createNativeVideoReadinessReader(f.env, f.prerequisites); expect(await callback()).toBe(false);
    const old = await fs.lstat(f.readyPath);
    const temporary = join(f.resultsDir, '.ready.tmp'); await fs.writeFile(temporary, JSON.stringify(f.value));
    await fs.utimes(temporary, f.now / 1000, f.now / 1000); await fs.rename(temporary, f.readyPath);
    expect((await fs.lstat(f.readyPath)).ino).not.toBe(old.ino); expect(await callback()).toBe(true);
    await f.write({ accepting: false }); expect(await callback()).toBe(false);
  });
  it('rejects a nonfinite narration speed and never returns unrecognized private fields', async () => {
    const f = await fixture(); await fs.writeFile(f.readyPath, JSON.stringify(f.value).replace('"speed":1', '"speed":1e309'));
    expect(await f.read()).toBeNull(); expect(await f.capable()).toBe(false);
    await f.write({ apiKey: 'never-echo-this-field' }); expect(await f.read()).toEqual(f.value);
  });
  it.each(['EACCES', 'EMFILE'])('fails closed for expected permissions but preserves unexpected filesystem errors: %s', async code => {
    const f = await fixture(); osBoundary.openError = code;
    if (code === 'EACCES') expect(await f.read()).toBeNull(); else await expect(f.read()).rejects.toMatchObject({ code });
  });
  it.each([{ AI_ENABLED: 'false' }, { HERMES_NATIVE_AGENT_ENABLED: 'false' }, { HERMES_VIDEO_ENABLED: 'false' },
    { HERMES_VIDEO_PROVIDER: 'local' }, { SYNCLIP_VIDEO_ENABLED: 'false' }, { SYNCLIP_VIDEO_INBOX_DIR: ' ' },
    { SYNCLIP_VIDEO_INBOX_DIR: 'relative/inbox' }, { SYNCLIP_VIDEO_RESULTS_DIR: ' ' },
    { SYNCLIP_VIDEO_RESULTS_DIR: 'relative/results' }, { AI_DISABLED_PROVIDERS: ' other, synclip ' }])(
    'requires every non-secret native video configuration condition: %j', async patch => {
      const f = await fixture(); expect(await createNativeVideoReadinessReader({ ...f.env, ...patch }, f.prerequisites)()).toBe(false);
    });
  it.each(['nativeAgentConfigured', 'nativeSceneImageEnabled'] as const)('does not bypass the existing native prerequisite %s', async prerequisite => {
    const f = await fixture(); expect(await createNativeVideoReadinessReader(f.env, { ...f.prerequisites, [prerequisite]: false })()).toBe(false);
  });
  it('does not allow an inbox configuration to alias the read-only results directory', async () => {
    const f = await fixture(); expect(await createNativeVideoReadinessReader({ ...f.env, SYNCLIP_VIDEO_INBOX_DIR: f.resultsDir }, f.prerequisites)()).toBe(false);
  });
});
