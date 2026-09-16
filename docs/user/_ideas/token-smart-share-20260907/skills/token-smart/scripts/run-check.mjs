// Execute an existing check without injecting its full log into model context.
import { spawn } from 'node:child_process';
import { openSync, writeSync, closeSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node run-check.mjs EXECUTABLE [ARG ...]; no shell interpretation.');
  process.exit(2);
}
const dir = resolve(process.env.TOKEN_SMART_LOG_DIR || join(tmpdir(), 'token-smart-checks'));
mkdirSync(dir, { recursive: true });
const log = join(dir, `${Date.now()}-${randomUUID()}.log`);
const fd = openSync(log, 'wx');
let bytes = 0;
let tail = Buffer.alloc(0);
let spawnError;
const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
function collect(chunk) {
  writeSync(fd, chunk);
  bytes += chunk.length;
  tail = Buffer.concat([tail, chunk]).subarray(-2400);
}
child.stdout.on('data', collect);
child.stderr.on('data', collect);
child.on('error', error => { spawnError = error.message; });
child.on('close', (code, signal) => {
  closeSync(fd);
  const ok = code === 0 && !spawnError && !signal;
  const result = { ok, exitCode: code, signal, bytes, log };
  if (spawnError) result.error = spawnError;
  if (!ok) result.tail = tail.toString('utf8');
  console.log(JSON.stringify(result));
  process.exitCode = ok ? 0 : (Number.isInteger(code) && code > 0 ? code : 1);
});
