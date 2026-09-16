import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMeteringCollector,
  createTurnCompletionLatch,
  parseArgs,
  responseForServerRequest,
} from './metered-run-core.mjs';

const usage = (totalTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens = 0, cacheWriteInputTokens = 0) => ({
  totalTokens,
  inputTokens,
  cachedInputTokens,
  cacheWriteInputTokens,
  outputTokens,
  reasoningOutputTokens,
});

function collector() {
  const value = createMeteringCollector({
    requestedModel: 'requested-model',
    requestedEffort: 'high',
    requestedServiceTier: 'default',
    startedAtMs: 1_000,
    captureFinalAnswer: false,
    expectedChildren: 0,
  });
  value.recordThreadStart({
    thread: {
      id: 'root-thread', sessionId: 'root-session', parentThreadId: null,
      createdAt: 10, updatedAt: 11, source: 'appServer',
    },
    model: 'actual-model-a', modelProvider: 'openai', serviceTier: 'priority',
    reasoningEffort: 'high', approvalPolicy: 'never', sandbox: { type: 'readOnly' },
  });
  value.recordTurnStart({ turn: { id: 'root-turn', status: 'inProgress', startedAt: 12 } });
  return value;
}

test('deduplicates cumulative usage and ignores an older cumulative update', () => {
  const value = collector();
  for (const total of [usage(100, 80, 20, 20), usage(100, 80, 20, 20), usage(150, 115, 25, 35), usage(120, 90, 20, 30)]) {
    value.ingest({ method: 'thread/tokenUsage/updated', params: { threadId: 'root-thread', turnId: 'root-turn', tokenUsage: { total, last: total, modelContextWindow: 200_000 } } });
  }
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  assert.deepEqual(report.threads[0].usage.total, usage(150, 115, 25, 35));
  assert.equal(report.threads[0].usage.duplicateUpdates, 1);
  assert.equal(report.threads[0].usage.outOfOrderUpdates, 1);
  assert.deepEqual(report.threads[0].usage.byObservedModel, [{ model: 'actual-model-a', ...usage(150, 115, 25, 35) }]);
});

test('attributes only cumulative deltas after a model reroute and marks attribution incomplete', () => {
  const value = collector();
  value.ingest({ method: 'thread/tokenUsage/updated', params: { threadId: 'root-thread', turnId: 'root-turn', tokenUsage: { total: usage(100, 70, 20, 30), last: usage(100, 70, 20, 30), modelContextWindow: 200_000 } } });
  value.ingest({ method: 'model/rerouted', params: { threadId: 'root-thread', turnId: 'root-turn', fromModel: 'actual-model-a', toModel: 'actual-model-b', reason: 'highRiskCyberActivity' } });
  value.ingest({ method: 'thread/tokenUsage/updated', params: { threadId: 'root-thread', turnId: 'root-turn', tokenUsage: { total: usage(160, 110, 30, 50), last: usage(60, 40, 10, 20), modelContextWindow: 200_000 } } });
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  assert.equal(report.root.actual.model, 'actual-model-b');
  assert.deepEqual(report.threads[0].usage.byObservedModel, [
    { model: 'actual-model-a', ...usage(100, 70, 20, 30) },
    { model: 'actual-model-b', ...usage(60, 40, 10, 20) },
  ]);
  assert.equal(report.integrity.modelAttributionIncomplete, true);
});

test('tracks child parentage without folding incomplete child usage into the root', () => {
  const value = collector();
  value.ingest({ method: 'thread/started', params: { thread: { id: 'child-thread', sessionId: 'root-session', parentThreadId: 'root-thread', createdAt: 20, updatedAt: 21, model: 'child-model', reasoningEffort: 'low', modelProvider: 'openai', source: { subAgent: { thread_spawn: { parent_thread_id: 'root-thread', depth: 1 } } } } } });
  value.ingest({ method: 'turn/started', params: { threadId: 'child-thread', turn: { id: 'child-turn', status: 'inProgress', startedAt: 22 } } });
  value.ingest({ method: 'thread/tokenUsage/updated', params: { threadId: 'child-thread', turnId: 'child-turn', tokenUsage: { total: usage(20, 15, 0, 5), last: usage(20, 15, 0, 5), modelContextWindow: 100_000 } } });
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'disconnected', processExitCode: null });
  assert.equal(report.children[0].parentThreadId, 'root-thread');
  assert.equal(report.children[0].turnStatus, 'inProgress');
  assert.equal(report.integrity.childrenStatus, 'incomplete');
  assert.equal(report.integrity.streamStatus, 'disconnected');
  assert.equal('combinedUsage' in report, false);
});

test('marks missing usage and incomplete root completion explicitly', () => {
  const report = collector().finalize({ finishedAtMs: 2_000, streamStatus: 'timeout', processExitCode: null });
  assert.equal(report.integrity.usageStatus, 'missing');
  assert.equal(report.integrity.rootTurnCompleted, false);
  assert.ok(report.integrity.flags.includes('usage_missing'));
  assert.ok(report.integrity.flags.includes('root_turn_incomplete'));
});

test('rejects fractional and impossible cached-input usage updates', () => {
  const value = collector();
  value.ingest({ method: 'thread/tokenUsage/updated', params: { threadId: 'root-thread', turnId: 'root-turn', tokenUsage: { total: usage(10.5, 8, 2, 2.5), last: usage(10.5, 8, 2, 2.5), modelContextWindow: 100 } } });
  value.ingest({ method: 'thread/tokenUsage/updated', params: { threadId: 'root-thread', turnId: 'root-turn', tokenUsage: { total: usage(10, 4, 5, 6), last: usage(10, 4, 5, 6), modelContextWindow: 100 } } });
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  assert.equal(report.threads[0].usage.invalidUpdates, 2);
  assert.equal(report.threads[0].usage.status, 'missing');
  assert.ok(report.integrity.flags.includes('usage_update_invalid'));
});

test('declines approvals, grants no permissions, and rejects unsupported server requests', () => {
  assert.deepEqual(responseForServerRequest({ id: 7, method: 'item/commandExecution/requestApproval' }), { id: 7, result: { decision: 'decline' } });
  assert.deepEqual(responseForServerRequest({ id: 8, method: 'item/fileChange/requestApproval' }), { id: 8, result: { decision: 'decline' } });
  assert.deepEqual(responseForServerRequest({ id: 9, method: 'item/permissions/requestApproval' }), { id: 9, result: { permissions: {}, scope: 'turn' } });
  assert.deepEqual(responseForServerRequest({ id: 10, method: 'execCommandApproval' }), { id: 10, result: { decision: { denied: { rejection: 'metered runner is read-only' } } } });
  assert.deepEqual(responseForServerRequest({ id: 11, method: 'item/tool/requestUserInput' }), { id: 11, error: { code: -32601, message: 'Unsupported server request' } });
});

test('metadata never persists prompt, tool output, error text, or answer text', () => {
  const value = collector();
  value.ingest({ method: 'item/completed', params: { threadId: 'root-thread', turnId: 'root-turn', item: { type: 'agentMessage', id: 'answer', phase: 'final_answer', text: 'FINAL_SECRET' } } });
  value.ingest({ method: 'item/completed', params: { threadId: 'root-thread', turnId: 'root-turn', item: { type: 'commandExecution', id: 'tool', command: 'TOOL_SECRET', aggregatedOutput: 'OUTPUT_SECRET' } } });
  value.ingest({ method: 'item/started', params: { threadId: 'root-thread', turnId: 'root-turn', item: { type: 'mcpToolCall', id: 'mcp', tool: 'spawn_agent', status: 'inProgress', arguments: { prompt: 'ARGUMENT_SECRET' } } } });
  value.ingest({ method: 'item/completed', params: { threadId: 'root-thread', turnId: 'root-turn', item: { type: 'mcpToolCall', id: 'mcp', tool: 'spawn_agent', status: 'completed', result: 'RESULT_SECRET' } } });
  value.ingest({ method: 'error', params: { threadId: 'root-thread', error: { message: 'ERROR_SECRET' } } });
  value.recordProtocolError('turn', { code: 500, message: 'RPC_SECRET' });
  const serialized = JSON.stringify(value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 }));
  for (const secret of ['FINAL_SECRET', 'TOOL_SECRET', 'OUTPUT_SECRET', 'ARGUMENT_SECRET', 'RESULT_SECRET', 'ERROR_SECRET', 'RPC_SECRET']) assert.equal(serialized.includes(secret), false);
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  assert.deepEqual(report.itemActivity.filter((item) => item.type === 'mcpToolCall'), [
    { type: 'mcpToolCall', tool: 'spawn_agent', status: 'inProgress', started: 1, completed: 0 },
    { type: 'mcpToolCall', tool: 'spawn_agent', status: 'completed', started: 0, completed: 1 },
  ]);
});

test('requires an explicit executable, model, effort, tier, cwd, prompt file, and output', () => {
  assert.throws(() => parseArgs(['--exe', 'codex']), /Missing required/);
  const parsed = parseArgs([
    '--exe', 'codex', '--model', 'gpt-test', '--effort', 'high', '--service-tier', 'default',
    '--cwd', 'C:/work', '--prompt-file', 'C:/prompt.txt', '--out', 'C:/metrics.json',
  ]);
  assert.equal(parsed.sandbox, 'read-only');
  assert.equal(parsed.timeoutMs, 1_800_000);
  assert.equal(parsed.serviceTier, 'default');
  assert.equal(parsed.expectChildren, 0);
});

test('does not lose a completion notification that arrives before turn/start continuation', async () => {
  const latch = createTurnCompletionLatch();
  latch.observe('thread-fast', 'turn-fast', 'completed');
  assert.deepEqual(await latch.waitFor('thread-fast', 'turn-fast'), { status: 'completed' });
});

test('marks an expected but unobserved child as incomplete', () => {
  const value = createMeteringCollector({
    requestedModel: 'model', requestedEffort: 'low', requestedServiceTier: 'default',
    startedAtMs: 1_000, captureFinalAnswer: false, expectedChildren: 1,
  });
  value.recordThreadStart({ thread: { id: 'root', sessionId: 'root', parentThreadId: null, createdAt: 1, updatedAt: 1 }, model: 'model' });
  value.recordTurnStart({ turn: { id: 'turn', status: 'inProgress' } });
  value.ingest({ method: 'turn/completed', params: { threadId: 'root', turn: { id: 'turn', status: 'completed' } } });
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  assert.equal(report.integrity.expectedChildren, 1);
  assert.equal(report.integrity.observedChildren, 0);
  assert.equal(report.integrity.childrenStatus, 'incomplete');
  assert.ok(report.integrity.flags.includes('children_incomplete'));
});

test('recognizes the current collabAgentToolCall schema without treating requested model as actual', () => {
  const value = collector();
  value.ingest({ method: 'item/completed', params: {
    threadId: 'root-thread', turnId: 'root-turn',
    item: {
      type: 'collabAgentToolCall', id: 'collab', tool: 'spawnAgent', status: 'completed',
      senderThreadId: 'root-thread', receiverThreadIds: ['child-modern'],
      prompt: 'CHILD_PROMPT_SECRET', model: 'requested-child-model', reasoningEffort: 'low',
      agentsStates: { 'child-modern': { status: 'completed', message: 'CHILD_MESSAGE_SECRET' } },
    },
  } });
  assert.deepEqual(value.drainNewChildIds(), ['child-modern']);
  const beforeResume = value.finalize({ finishedAtMs: 1_500, streamStatus: 'complete', processExitCode: 0 });
  assert.equal(beforeResume.children[0].actual.model, null);
  value.recordChildResumeAttempt('child-modern');
  value.recordChildResume('child-modern', {
    thread: { id: 'child-modern', sessionId: 'root-session', parentThreadId: null, createdAt: 2, updatedAt: 3, source: { subAgent: 'unknown' } },
    model: 'actual-child-model', reasoningEffort: 'medium', modelProvider: 'openai', serviceTier: 'default', approvalPolicy: 'never', sandbox: { type: 'readOnly' },
  });
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  assert.equal(report.children[0].threadId, 'child-modern');
  assert.equal(report.children[0].parentThreadId, 'root-thread');
  assert.deepEqual(report.children[0].requestedByParent, { model: 'requested-child-model', effort: 'low' });
  assert.equal(report.children[0].actual.model, 'actual-child-model');
  assert.equal(report.children[0].actual.effort, 'medium');
  assert.equal(report.children[0].subscription.status, 'subscribed');
  assert.equal(report.children[0].usage.status, 'missing');
  assert.equal(report.integrity.childrenStatus, 'incomplete');
  assert.equal(report.integrity.childSubscriptionMode, 'new_children_resume_with_metadata_read_fallback');
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('CHILD_PROMPT_SECRET'), false);
  assert.equal(serialized.includes('CHILD_MESSAGE_SECRET'), false);
});

test('discovers a native child from a root subAgentActivity started item without persisting its path', () => {
  const value = collector();
  value.ingest({ method: 'item/started', params: {
    threadId: 'root-thread', turnId: 'root-turn',
    item: {
      type: 'subAgentActivity', id: 'activity', kind: 'started',
      agentThreadId: 'child-native', agentPath: '/root/SECRET_AGENT_PATH',
    },
  } });
  assert.deepEqual(value.drainNewChildIds(), ['child-native']);
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  assert.equal(report.children[0].threadId, 'child-native');
  assert.equal(report.children[0].parentThreadId, 'root-thread');
  assert.equal(report.children[0].actual.model, null);
  assert.equal(report.integrity.childrenStatus, 'incomplete');
  assert.deepEqual(report.itemActivity.filter((item) => item.type === 'subAgentActivity'), [
    { type: 'subAgentActivity', tool: null, status: 'started', started: 1, completed: 0 },
  ]);
  assert.equal(JSON.stringify(report).includes('SECRET_AGENT_PATH'), false);
});

test('preserves resume failure and records metadata-only read separately from actual usage attribution', () => {
  const value = collector();
  value.ingest({ method: 'item/started', params: {
    threadId: 'root-thread', turnId: 'root-turn',
    item: { type: 'subAgentActivity', id: 'activity', kind: 'started', agentThreadId: 'child-fallback', agentPath: '/safe/path' },
  } });
  value.drainNewChildIds();
  value.ingest({ method: 'turn/started', params: { threadId: 'child-fallback', turn: { id: 'child-turn', status: 'inProgress', startedAt: 21 } } });
  value.ingest({ method: 'thread/tokenUsage/updated', params: { threadId: 'child-fallback', turnId: 'child-turn', tokenUsage: { total: usage(30, 20, 5, 10), last: usage(30, 20, 5, 10), modelContextWindow: 100_000 } } });
  value.ingest({ method: 'turn/completed', params: { threadId: 'child-fallback', turn: { id: 'child-turn', status: 'completed', startedAt: 21, completedAt: 22 } } });
  value.recordChildResumeAttempt('child-fallback');
  value.recordChildResumeError('child-fallback', { code: -32603 });
  value.recordChildMetadataReadAttempt('child-fallback');
  value.recordChildMetadataRead('child-fallback', {
    thread: {
      id: 'child-fallback', sessionId: 'root-session', parentThreadId: null,
      model: 'metadata-model', reasoningEffort: 'high', modelProvider: 'openai',
      createdAt: 20, updatedAt: 30, status: { type: 'idle' }, source: { subAgent: 'unknown' },
      turns: [], preview: 'PREVIEW_SECRET', cwd: 'C:/SECRET_CWD',
    },
  });
  const report = value.finalize({ finishedAtMs: 2_000, streamStatus: 'complete', processExitCode: 0 });
  const child = report.children[0];
  assert.equal(child.parentThreadId, 'root-thread');
  assert.equal(child.actual.model, null);
  assert.deepEqual(child.verifiedMetadata, {
    model: 'metadata-model', effort: 'high', modelProvider: 'openai',
    status: 'idle', createdAt: 20, updatedAt: 30, turnsReturned: 0,
  });
  assert.deepEqual(child.subscription, {
    status: 'metadata_verified', errorCode: -32603,
    resumeStatus: 'failed', resumeErrorCode: -32603,
    readFallbackStatus: 'verified', readFallbackErrorCode: null,
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('PREVIEW_SECRET'), false);
  assert.equal(serialized.includes('SECRET_CWD'), false);
  assert.equal(child.usage.byObservedModel.some((entry) => entry.model === 'metadata-model'), false);
  assert.deepEqual(child.usage.byObservedModel, [{ model: 'unknown', ...usage(30, 20, 5, 10) }]);
  assert.equal(report.integrity.modelAttributionIncomplete, true);
  assert.ok(report.integrity.flags.includes('usage_model_unknown'));
});
