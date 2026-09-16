#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import { createMeteringCollector, createTurnCompletionLatch, parseArgs } from './metered-run-core.mjs';

const CLIENT_VERSION = '1.0.0';
const INITIALIZE_ID = 1;
const THREAD_START_ID = 2;
const TURN_START_ID = 3;

class RunnerError extends Error {
  constructor(stage, code) {
    super(`${stage}:${code}`);
    this.stage = stage;
    this.code = code;
  }
}

function safeCode(error) {
  if (error instanceof RunnerError) return error.code;
  if (error && typeof error === 'object' && ('code' in error) && (typeof error.code === 'string' || typeof error.code === 'number')) return error.code;
  return 'unknown';
}

async function requireFile(file, stage) {
  const info = await stat(file).catch((error) => { throw new RunnerError(stage, safeCode(error)); });
  if (!info.isFile()) throw new RunnerError(stage, 'not_file');
}

async function requireDirectory(directory) {
  const info = await stat(directory).catch((error) => { throw new RunnerError('cwd', safeCode(error)); });
  if (!info.isDirectory()) throw new RunnerError('cwd', 'not_directory');
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function validateDistinctPaths(options) {
  if (samePath(options.promptFile, options.out) || (options.answerOut && samePath(options.promptFile, options.answerOut))) {
    throw new RunnerError('arguments', 'output_overlaps_prompt');
  }
  if (options.answerOut && samePath(options.out, options.answerOut)) throw new RunnerError('arguments', 'outputs_overlap');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.stdin?.end();
  await Promise.race([new Promise((resolve) => child.once('close', resolve)), wait(250)]);
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('close', resolve)), wait(1_000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    validateDistinctPaths(options);
    await Promise.all([requireDirectory(options.cwd), requireFile(options.promptFile, 'prompt_file')]);
  } catch (error) {
    const stage = error instanceof RunnerError ? error.stage : 'arguments';
    process.stderr.write(`metered-run failed stage=${stage} code=${safeCode(error)}\n`);
    process.exitCode = 2;
    return;
  }

  const startedAtMs = Date.now();
  const collector = createMeteringCollector({
    requestedModel: options.model,
    requestedEffort: options.effort,
    requestedServiceTier: options.serviceTier,
    startedAtMs,
    captureFinalAnswer: Boolean(options.answerOut),
    expectedChildren: options.expectChildren,
  });
  let child = null;
  let rootThreadId = null;
  let rootTurnId = null;
  let streamStatus = 'disconnected';
  let processExitCode = null;
  let processSignal = null;
  let stderrObserved = false;
  let terminatedByRunner = false;
  let failure = null;
  const pending = new Map();
  const childResumePromises = new Set();
  let nextRequestId = 1_000;
  const completionLatch = createTurnCompletionLatch();

  const rejectPending = (code) => {
    for (const pendingRequest of pending.values()) {
      if (pendingRequest.timer) clearTimeout(pendingRequest.timer);
      pendingRequest.reject(new RunnerError(pendingRequest.stage, code));
    }
    pending.clear();
    completionLatch.fail(code);
  };

  const send = (message) => {
    if (!child?.stdin?.writable) throw new RunnerError('stdio', 'stdin_closed');
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const request = (id, method, params, stage, timeoutMs = null) => new Promise((resolve, reject) => {
    const timer = timeoutMs === null ? null : setTimeout(() => {
      pending.delete(id);
      reject(new RunnerError(stage, 'timeout'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, stage, timer });
    try {
      send({ method, id, params });
    } catch (error) {
      pending.delete(id);
      if (timer) clearTimeout(timer);
      reject(error);
    }
  });

  const resumeNewChild = (threadId) => {
    collector.recordChildResumeAttempt(threadId);
    const id = nextRequestId++;
    const operation = request(id, 'thread/resume', { threadId, excludeTurns: true }, 'child_resume', 5_000)
      .then((result) => collector.recordChildResume(threadId, result))
      .catch(async (error) => {
        collector.recordChildResumeError(threadId, { code: safeCode(error) });
        collector.recordChildMetadataReadAttempt(threadId);
        const readId = nextRequestId++;
        try {
          const result = await request(readId, 'thread/read', { threadId, includeTurns: false }, 'child_metadata_read', 5_000);
          collector.recordChildMetadataRead(threadId, result);
        } catch (readError) {
          collector.recordChildMetadataReadError(threadId, { code: safeCode(readError) });
        }
      })
      .finally(() => childResumePromises.delete(operation));
    childResumePromises.add(operation);
  };

  const hardTimeout = setTimeout(() => {
    streamStatus = 'timeout';
    rejectPending('timeout');
  }, options.timeoutMs);

  try {
    const prompt = await readFile(options.promptFile, 'utf8');
    if (!prompt.trim()) throw new RunnerError('prompt_file', 'empty');
    child = spawn(options.exe, ['app-server', '--listen', 'stdio://'], {
      cwd: options.cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.once('error', (error) => rejectPending(safeCode(error)));
    child.stdin.on('error', (error) => {
      if (streamStatus !== 'complete') rejectPending(safeCode(error));
    });
    child.once('close', (code, signal) => {
      processExitCode = Number.isInteger(code) ? code : null;
      processSignal = typeof signal === 'string' ? signal : null;
      if (streamStatus !== 'complete' && streamStatus !== 'timeout') rejectPending('stream_closed');
    });
    child.stderr.on('data', () => { stderrObserved = true; });

    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        collector.recordMalformedLine();
        return;
      }
      if (message && typeof message === 'object' && 'id' in message && typeof message.method !== 'string') {
        const pendingRequest = pending.get(message.id);
        if (!pendingRequest) return;
        pending.delete(message.id);
        if (pendingRequest.timer) clearTimeout(pendingRequest.timer);
        if (message.error) pendingRequest.reject(new RunnerError(pendingRequest.stage, message.error.code ?? 'rpc_error'));
        else pendingRequest.resolve(message.result);
        return;
      }
      const response = collector.ingest(message);
      if (response) send(response);
      for (const childThreadId of collector.drainNewChildIds()) resumeNewChild(childThreadId);
      if (message?.method === 'turn/completed') completionLatch.observe(message.params?.threadId, message.params?.turn?.id, message.params?.turn?.status);
    });

    await request(INITIALIZE_ID, 'initialize', {
      clientInfo: { name: 'token_smart_metered_run', title: 'Token Smart Metered Run', version: CLIENT_VERSION },
      capabilities: {
        optOutNotificationMethods: [
          'item/agentMessage/delta',
          'item/plan/delta',
          'item/reasoning/summaryTextDelta',
          'item/reasoning/summaryPartAdded',
          'item/reasoning/textDelta',
          'item/commandExecution/outputDelta',
          'item/fileChange/outputDelta',
          'process/outputDelta',
          'command/exec/outputDelta',
          'turn/diff/updated',
          'turn/plan/updated',
          'rawResponseItem/completed',
          'rawResponse/completed',
        ],
      },
    }, 'initialize');
    send({ method: 'initialized', params: {} });

    const threadResult = await request(THREAD_START_ID, 'thread/start', {
      model: options.model,
      serviceTier: options.serviceTier,
      cwd: options.cwd,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      config: { model_reasoning_effort: options.effort },
      serviceName: 'token-smart-metered-run',
      ephemeral: false,
      threadSource: 'token-smart-metered-run',
    }, 'thread_start');
    collector.recordThreadStart(threadResult);
    rootThreadId = threadResult.thread.id;

    const turnResult = await request(TURN_START_ID, 'turn/start', {
      threadId: rootThreadId,
      input: [{ type: 'text', text: prompt, text_elements: [] }],
      cwd: options.cwd,
      approvalPolicy: 'never',
      model: options.model,
      effort: options.effort,
      serviceTier: options.serviceTier,
      serviceTierForTurn: options.serviceTier,
    }, 'turn_start');
    collector.recordTurnStart(turnResult);
    rootTurnId = turnResult.turn.id;
    const completion = await completionLatch.waitFor(rootThreadId, rootTurnId);
    if (completion.error) throw new RunnerError('turn', completion.error);
    await wait(options.settleMs);
    if (childResumePromises.size > 0) await Promise.allSettled([...childResumePromises]);
    await wait(options.settleMs);
    streamStatus = 'complete';
  } catch (error) {
    failure = error;
    collector.recordProtocolError(error instanceof RunnerError ? error.stage : 'runner', { code: safeCode(error) });
  } finally {
    clearTimeout(hardTimeout);
    if (child && child.exitCode === null && child.signalCode === null) {
      terminatedByRunner = true;
      await terminate(child);
      processExitCode = child.exitCode;
      processSignal = child.signalCode;
    }
    const report = collector.finalize({
      finishedAtMs: Date.now(),
      streamStatus,
      processExitCode,
      processSignal,
    });
    report.integrity.stderrObserved = stderrObserved;
    report.integrity.processTerminatedByRunner = terminatedByRunner;
    if (options.answerOut && !collector.takeFinalAnswer()) report.integrity.flags.push('final_answer_missing');
    await mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    if (options.answerOut && collector.takeFinalAnswer()) {
      await mkdir(path.dirname(path.resolve(options.answerOut)), { recursive: true });
      await writeFile(options.answerOut, collector.takeFinalAnswer(), 'utf8');
    }
  }

  if (failure) {
    const stage = failure instanceof RunnerError ? failure.stage : 'runner';
    process.stderr.write(`metered-run failed stage=${stage} code=${safeCode(failure)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('metered-run completed\n');
  }
}

await main();
