// Resume the project's Pro collaborator through the installed Codex CLI and normal approvals.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, createWriteStream, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finished } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const [promptPath, codexExecutable] = process.argv.slice(2);
if (!promptPath || !codexExecutable) throw new Error('Usage: node collaborate.mjs <UTF-8 task file> <installed codex executable>');
const task = readFileSync(resolve(promptPath), 'utf8').replace(/^\uFEFF/, '').trim();
if (!task) throw new Error('Task file is empty');
const threadId = '01a0be9a-a7c0-7003-9b08-ee12e130ef19';
const outputDir = resolve(root, 'tmp/pro-collaboration');
mkdirSync(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const log = resolve(outputDir, `${stamp}.jsonl`);
const stderrLog = resolve(outputDir, `${stamp}.stderr.log`);
const lock = resolve(outputDir, `${threadId}.active.json`);
try {
  writeFileSync(lock, JSON.stringify({ threadId, pid: process.pid, startedAt: stamp, log }), { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error.code === 'EEXIST') throw new Error(`This Pro task already has an active or interrupted invocation. Inspect ${lock} and its process before recovery; do not resubmit concurrently.`);
  throw error;
}
const prompt = `Continue this XGS collaborator task. Project root: ${root}\nYou are not alone in the codebase. Own only the files explicitly assigned below and preserve others' work. Use real tools and report their actual results. Use the task's existing automatic review for specific commands when needed and honor its decision. Never disable or change sandbox, approval, proxy, ACL, credentials, bridge configuration or safety checks. No OpenScience tests, preflight or CI; production operations remain with the main agent. Temporary outputs belong in the project tmp directory. Do not read or print secrets.\n\nCurrent assignment:\n${task}\n`;
let completed = false;
try {
  const output = createWriteStream(log, { flags: 'wx', mode: 0o600 });
  const errors = createWriteStream(stderrLog, { flags: 'wx', mode: 0o600 });
  let failure;
  let child;
  const writes = [output, errors].map(stream => finished(stream).catch(error => {
    failure ??= error;
    child?.kill();
  }));
  child = spawn(codexExecutable, ['exec', '--approve-for-me', 'resume', threadId,
    '--model', 'chatgpt-web/pro', '-c', 'model_reasoning_effort=ultra', '--json', '-'],
  { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.on('error', error => { failure ??= error; });
  child.stdout.pipe(output);
  child.stderr.pipe(errors);
  child.stdin.on('error', error => { failure ??= error; });
  child.stdin.end(prompt, 'utf8');
  console.log(JSON.stringify({ threadId, log, stderrLog }));
  const code = await new Promise(resolve => child.once('close', resolve));
  await Promise.all(writes);
  if (failure) throw failure;
  console.log(JSON.stringify({ exitCode: code, log, stderrLog, verifyActualToolResults: true }));
  process.exitCode = code ?? 1;
  completed = code === 0;
  if (!completed) console.error(`Invocation failed; inspect ${lock} and its receipts before resuming.`);
} finally {
  // Failed/interrupted invocations retain their receipt until their outcome is reviewed.
  if (completed) unlinkSync(lock);
}
