import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const MAX_READY_BYTES = 4096;
const MAX_READY_AGE_MS = 60_000;

/** A fresh, host-owned heartbeat is required before scheduling new paid video work. */
export async function synclipVideoAccepting(resultsDir: string, now = Date.now()): Promise<boolean> {
  if (!isAbsolute(resultsDir) || !Number.isFinite(now)) return false;
  try {
    const path = join(resultsDir, '.ready');
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_READY_BYTES) return false;
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const current = await file.stat();
      if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size) return false;
      bytes = await file.readFile();
    } finally {
      await file.close();
    }
    const after = await lstat(path);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeMs !== before.mtimeMs) return false;
    const ready = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    return ready.schemaVersion === 1 && ready.provider === 'synclip' && ready.model === 'ltx23'
      && ready.accepting === true && typeof ready.updatedAt === 'number'
      && Number.isFinite(ready.updatedAt) && ready.updatedAt <= now + 5_000
      && now - ready.updatedAt <= MAX_READY_AGE_MS && after.mtimeMs <= now + 5_000
      && now - after.mtimeMs <= MAX_READY_AGE_MS;
  } catch {
    return false;
  }
}
