#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function requestedTaskId() {
  if (args.length === 0) return null;
  if (args.length !== 2 || args[0] !== '--task' || !/^[1-9][0-9]*$/u.test(args[1])) {
    throw new Error('Usage: node scripts/read-current-management-context.mjs [--task <id>]');
  }
  return args[1];
}

function git(...gitArgs) {
  return execFileSync('git', ['-C', projectRoot, ...gitArgs], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024,
  }).trim();
}

function handoffReferences(tasks) {
  const references = new Map();
  for (const task of tasks) {
    const text = typeof task.details === 'string' ? task.details : '';
    for (const match of text.matchAll(/docs\/handoff\/[A-Za-z0-9._/-]+\.md(?:#[A-Za-z0-9._-]+)?/gu)) {
      const [path, anchor] = match[0].split('#', 2);
      references.set(match[0], { path, ...(anchor ? { anchor } : {}) });
    }
  }
  return [...references.values()];
}

async function main() {
  const taskId = requestedTaskId();
  const [stateText, tasksText] = await Promise.all([
    readFile(resolve(projectRoot, '.taskmaster/state.json'), 'utf8'),
    readFile(resolve(projectRoot, '.taskmaster/tasks/tasks.json'), 'utf8'),
  ]);
  const state = JSON.parse(stateText);
  const taskStore = JSON.parse(tasksText);
  if (!state || typeof state.currentTag !== 'string' || !state.currentTag
    || !taskStore || typeof taskStore !== 'object' || !Array.isArray(taskStore[state.currentTag]?.tasks)) {
    throw new Error('Current Taskmaster tag is unavailable in the delivery tree');
  }
  const currentTasks = taskStore[state.currentTag].tasks;
  const selected = taskId
    ? currentTasks.filter(task => String(task.id) === taskId)
    : currentTasks;
  if (taskId && selected.length !== 1) throw new Error(`Task ${taskId} is not in current tag ${state.currentTag}`);
  const handoffs = handoffReferences(selected);
  const warnings = [];
  if (handoffs.length === 0) warnings.push('No CURRENT handoff reference was found in the selected Taskmaster details');
  if (new Set(handoffs.map(handoff => handoff.path)).size > 1) warnings.push('Selected Taskmaster entries reference more than one handoff; read each before deciding scope');
  const status = git('status', '--porcelain', '--untracked-files=normal');
  const summaries = selected.map(task => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    ...(taskId ? {
      description: task.description,
      details: task.details,
      testStrategy: task.testStrategy,
    } : {}),
  }));
  process.stdout.write(`${JSON.stringify({
    projectRoot,
    git: {
      branch: git('branch', '--show-current'),
      head: git('rev-parse', 'HEAD'),
      dirty: status.length > 0,
    },
    taskmaster: {
      currentTag: state.currentTag,
      tasks: summaries,
    },
    currentHandoffs: handoffs,
    warnings,
  }, null, 2)}\n`);
}

main().catch(error => fail(error instanceof Error ? error.message : 'Management context read failed'));
