// Materialize one complete Git commit in an immutable ECS release directory.
// Connection values come from .cloud-sync-env and are never printed.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { buildReleaseMaterializeCommand } from './release-sync-command.mjs';
import { resolveSshIdentityPath } from './ssh-identity-path.mjs';

const sourceRoot = process.env.XGS_SOURCE_ROOT ? path.resolve(process.env.XGS_SOURCE_ROOT) : process.cwd();
const configRoot = process.env.XGS_CONFIG_ROOT ? path.resolve(process.env.XGS_CONFIG_ROOT) : process.cwd();
const releaseSha = process.env.XGS_RELEASE_SHA;
if (!releaseSha || !/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error('XGS_RELEASE_SHA must be a full Git commit SHA');
}
const releaseRoot = `/opt/openscience-releases/${releaseSha}`;
const cfg = JSON.parse(readFileSync(path.join(configRoot, '.cloud-sync-env'), 'utf8'));
const key = resolveSshIdentityPath(cfg.key);
// Git's SSH may reinterpret apostrophes in Windows profile paths. Keep the
// Windows identity path with the native OpenSSH executable.
const sshExecutable = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')
  : 'ssh';

const archive = spawn(
  'git',
  ['-c', 'core.autocrlf=false', 'archive', '--format=tar.gz', releaseSha],
  { cwd: sourceRoot },
);
const remote = buildReleaseMaterializeCommand(releaseRoot, releaseSha);
const ssh = spawn(sshExecutable, ['-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=20', '-i', key, '-p', String(cfg.port), `${cfg.user}@${cfg.host}`, remote], { cwd: process.cwd() });

archive.stdout.pipe(ssh.stdin);
// If SSH rejects the connection, preserve its diagnostic instead of allowing
// a broken archive pipe to terminate Node before SSH closes.
ssh.stdin.on('error', (error) => {
  if (error.code !== 'EPIPE') {
    console.error('UPLOAD_ERR=' + error.message);
    process.exitCode = 1;
  }
});
ssh.on('error', (error) => { console.error('SSH_ERR=' + error.message); process.exit(1); });
let err = '';
ssh.stderr.on('data', (d) => (err += d));
ssh.on('close', (code) => {
  if (err) console.log('REMOTE_STDERR=' + err.trim().slice(0, 500));
  console.log('SYNC_EXIT=' + code);
  process.exit(code || 0);
});
archive.on('error', (e) => { console.log('ARCHIVE_ERR=' + e.message); process.exit(1); });
