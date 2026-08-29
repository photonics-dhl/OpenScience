// Stream one exact local Git commit into its dedicated ECS evaluation source root.
// Connection values come from .cloud-sync-env and are never printed.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildEvaluationSourceMaterializeCommand } from './evaluation-source-sync-command.mjs';

const sourceRoot = process.env.XGS_SOURCE_ROOT ? path.resolve(process.env.XGS_SOURCE_ROOT) : process.cwd();
const configRoot = process.env.XGS_CONFIG_ROOT ? path.resolve(process.env.XGS_CONFIG_ROOT) : process.cwd();
const sourceSha = process.env.XGS_EVALUATION_SHA;
if (!sourceSha || !/^[0-9a-f]{40}$/u.test(sourceSha)) {
  throw new Error('XGS_EVALUATION_SHA must be a full Git commit SHA');
}

const target = `/opt/openscience-evals/document-parser/${sourceSha}/source`;
const { command: remoteCommand } = buildEvaluationSourceMaterializeCommand(target, sourceSha);
const commitCheck = spawnSync('git', ['cat-file', '-e', `${sourceSha}^{commit}`], { cwd: sourceRoot });
if (commitCheck.status !== 0) throw new Error('evaluation source commit is unavailable locally');

const cfg = JSON.parse(readFileSync(path.join(configRoot, '.cloud-sync-env'), 'utf8'));
const key = cfg.key.replace(/^~/u, os.homedir());
const archive = spawn(
  'git',
  ['-c', 'core.autocrlf=false', 'archive', '--format=tar.gz', sourceSha],
  { cwd: sourceRoot },
);
const ssh = spawn('ssh', [
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=20',
  '-i', key,
  '-p', String(cfg.port),
  `${cfg.user}@${cfg.host}`,
  remoteCommand,
], { cwd: configRoot });

archive.stdout.pipe(ssh.stdin);
let archiveError = '';
let remoteError = '';
archive.stderr.on('data', (chunk) => { if (archiveError.length < 500) archiveError += chunk.toString('utf8', 0, 500 - archiveError.length); });
ssh.stderr.on('data', (chunk) => { if (remoteError.length < 500) remoteError += chunk.toString('utf8', 0, 500 - remoteError.length); });

const waitForExit = (child) => new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => resolve(code));
});

const [archiveCode, sshCode] = await Promise.all([waitForExit(archive), waitForExit(ssh)]);
if (archiveCode !== 0 || sshCode !== 0) {
  if (archiveError) process.stderr.write(`ARCHIVE_ERROR=${archiveError.trim()}\n`);
  if (remoteError) process.stderr.write(`REMOTE_ERROR=${remoteError.trim()}\n`);
  process.exitCode = archiveCode || sshCode || 1;
} else {
  process.stdout.write(`EVALUATION_SOURCE_SYNCED=${sourceSha}\n`);
}
