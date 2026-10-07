import { realpathSync } from 'node:fs';

/** Resolve the executed path so operators can invoke a bundle through a symlink. */
export function isMainModule(entryPath, modulePath) {
  if (typeof entryPath !== 'string' || !entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(modulePath);
  } catch {
    return false;
  }
}
