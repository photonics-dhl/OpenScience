// Materialize one complete Git commit in an immutable ECS release directory.
// Connection values come from .cloud-sync-env and are never printed.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { buildReleaseMaterializeCommand } from './release-sync-command.mjs';

const sourceRoot = process.env.XGS_SOURCE_ROOT ? path.resolve(process.env.XGS_SOURCE_ROOT) : process.cwd();
const configRoot = process.env.XGS_CONFIG_ROOT ? path.resolve(process.env.XGS_CONFIG_ROOT) : process.cwd();
const releaseSha = process.env.XGS_RELEASE_SHA;
if (!releaseSha || !/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error('XGS_RELEASE_SHA must be a full Git commit SHA');
}
const releaseRoot = `/opt/openscience-releases/${releaseSha}`;
const cfg = JSON.parse(readFileSync(path.join(configRoot, '.cloud-sync-env'), 'utf8'));
const key = cfg.key.replace(/^~/, os.homedir());

const archive = spawn(
  'git',
  ['-c', 'core.autocrlf=false', 'archive', '--format=tar.gz', releaseSha],
  { cwd: sourceRoot },
);
const remote = buildReleaseMaterializeCommand(releaseRoot, releaseSha);
const ssh = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-i', key, '-p', String(cfg.port), `${cfg.user}@${cfg.host}`, remote], { cwd: process.cwd() });

archive.stdout.pipe(ssh.stdin);
let err = '';
ssh.stderr.on('data', (d) => (err += d));
ssh.on('close', (code) => {
  if (err) console.log('REMOTE_STDERR=' + err.trim().slice(0, 500));
  console.log('SYNC_EXIT=' + code);
  process.exit(code || 0);
});
archive.on('error', (e) => { console.log('ARCHIVE_ERR=' + e.message); process.exit(1); });
