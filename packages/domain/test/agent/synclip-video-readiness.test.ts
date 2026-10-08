import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { synclipVideoAccepting } from '../../src/agent/synclip-video-readiness';

const directories: string[] = [];
const now = Date.now();
async function fixture(value: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'synclip-ready-test-'));
  directories.push(directory);
  await writeFile(join(directory, '.ready'), JSON.stringify(value));
  return directory;
}
const heartbeat = { schemaVersion: 1, provider: 'synclip', model: 'ltx23', accepting: true, updatedAt: now };
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('pre-charge Synclip video readiness', () => {
  it('accepts only a fresh, accepting host heartbeat', async () => {
    expect(await synclipVideoAccepting(await fixture(heartbeat), now)).toBe(true);
    expect(await synclipVideoAccepting(await fixture({ ...heartbeat, accepting: false }), now)).toBe(false);
    expect(await synclipVideoAccepting(await fixture({ ...heartbeat, updatedAt: now - 60_001 }), now)).toBe(false);
    expect(await synclipVideoAccepting(await fixture({ ...heartbeat, provider: 'other' }), now)).toBe(false);
  });

  it('fails closed for a missing or linked heartbeat', async () => {
    const directory = await fixture(heartbeat);
    await rm(join(directory, '.ready'));
    expect(await synclipVideoAccepting(directory, now)).toBe(false);
    try {
      await symlink(join(tmpdir(), 'outside-ready.json'), join(directory, '.ready'));
      expect(await synclipVideoAccepting(directory, now)).toBe(false);
    } catch (error) {
      if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }
  });
});
