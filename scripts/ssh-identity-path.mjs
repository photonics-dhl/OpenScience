import os from 'node:os';

/** Native Windows OpenSSH does not understand Git Bash's /c/... identity paths. */
export function resolveSshIdentityPath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('SSH identity path is missing');
  const expanded = value.replace(/^~(?=$|[\\/])/u, os.homedir());
  return process.platform === 'win32' ? expanded.replace(/^\/([A-Za-z])(?=\/)/u, '$1:') : expanded;
}
