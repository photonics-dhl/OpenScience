// 一次性云同步脚本（tar-over-ssh）：把本地工作树同步到 /opt/openscience。
// 读取 .cloud-sync-env（host/user/port/key），流式 tar 经 ssh 解压。值不打印。
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const sourceRoot = process.env.XGS_SOURCE_ROOT ? path.resolve(process.env.XGS_SOURCE_ROOT) : process.cwd();
const configRoot = process.env.XGS_CONFIG_ROOT ? path.resolve(process.env.XGS_CONFIG_ROOT) : process.cwd();
const remoteRoot = process.env.XGS_REMOTE_ROOT ?? '/opt/openscience';
if (!/^\/opt\/openscience(?:-[A-Za-z0-9._-]+)?$/.test(remoteRoot)) {
  throw new Error('XGS_REMOTE_ROOT must stay under an explicit /opt/openscience release path');
}
const cfg = JSON.parse(readFileSync(path.join(configRoot, '.cloud-sync-env'), 'utf8'));
const key = cfg.key.replace(/^~/, os.homedir());

const EXCLUDES = [
  '.git', 'node_modules', 'dist', '.next', '.env', '.cloud-sync-env', '.memory', '.superpowers',
  '.worktrees', '.taskmaster', '.playwright-mcp', '.cursor', '.vscode', '*.tsbuildinfo',
  'npx_stderr.txt', 'minimax_proxy.py', '.mcp.json',
];

const ENTRIES = [
  'AGENTS.md', 'README.md', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
  'eslint.config.cjs', 'knip.json', '.dependency-cruiser.cjs', '.markdownlint-cli2.jsonc',
  '.gitignore', '.gitattributes',
  'apps', 'packages', 'infra', 'scripts', 'docs', 'project_index.md',
];

const tarArgs = ['czf', '-', ...EXCLUDES.map((e) => `--exclude=${e}`), ...ENTRIES];
const tar = spawn('tar', tarArgs, { cwd: sourceRoot });
const remote = `mkdir -p ${remoteRoot} && cd ${remoteRoot} && tar -xzf - --overwrite`;
const ssh = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-i', key, '-p', String(cfg.port), `${cfg.user}@${cfg.host}`, remote], { cwd: process.cwd() });

tar.stdout.pipe(ssh.stdin);
let err = '';
ssh.stderr.on('data', (d) => (err += d));
ssh.on('close', (code) => {
  if (err) console.log('REMOTE_STDERR=' + err.trim().slice(0, 500));
  console.log('SYNC_EXIT=' + code);
  process.exit(code || 0);
});
tar.on('error', (e) => { console.log('TAR_ERR=' + e.message); process.exit(1); });
