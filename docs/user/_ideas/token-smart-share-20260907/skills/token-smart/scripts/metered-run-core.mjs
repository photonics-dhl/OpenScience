const USAGE_FIELDS = [
  'totalTokens',
  'inputTokens',
  'cachedInputTokens',
  'cacheWriteInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
];

const ITEM_TYPES = new Set([
  'userMessage', 'hookPrompt', 'agentMessage', 'functionCallOutput', 'plan', 'reasoning',
  'commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'collabAgentToolCall',
  'subAgentActivity', 'webSearch', 'imageView', 'sleep', 'imageGeneration',
  'enteredReviewMode', 'exitedReviewMode', 'contextCompaction',
]);
const ITEM_STATUSES = new Set(['started', 'interacted', 'inProgress', 'pending', 'running', 'completed', 'failed', 'declined', 'interrupted']);
const SERVER_REQUEST_METHODS = new Set([
  'item/commandExecution/requestApproval', 'item/fileChange/requestApproval',
  'item/permissions/requestApproval', 'item/tool/requestUserInput',
  'mcpServer/elicitation/request', 'item/tool/call',
  'account/chatgptAuthTokens/refresh', 'attestation/generate',
  'execCommandApproval', 'applyPatchApproval',
]);

const zeroUsage = () => Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));

function cleanScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
}

function cleanIdentifier(value, fallback = null) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,128}$/.test(value) ? value : fallback;
}

function cleanErrorCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return cleanIdentifier(value, 'unknown');
}

function cleanUsage(value) {
  if (!value || typeof value !== 'object') return null;
  const result = {};
  for (const field of USAGE_FIELDS) {
    const number = value[field];
    if (!Number.isSafeInteger(number) || number < 0) return null;
    result[field] = number;
  }
  if (result.cachedInputTokens > result.inputTokens || result.cacheWriteInputTokens > result.inputTokens) return null;
  return result;
}

function addUsage(target, delta) {
  for (const field of USAGE_FIELDS) target[field] += delta[field];
}

function usageDelta(previous, next) {
  if (!previous) return { kind: 'advance', delta: next };
  const comparisons = USAGE_FIELDS.map((field) => Math.sign(next[field] - previous[field]));
  if (comparisons.every((value) => value === 0)) return { kind: 'duplicate' };
  if (comparisons.every((value) => value <= 0)) return { kind: 'out_of_order' };
  const delta = zeroUsage();
  for (const field of USAGE_FIELDS) delta[field] = Math.max(0, next[field] - previous[field]);
  return { kind: comparisons.some((value) => value < 0) ? 'inconsistent' : 'advance', delta };
}

function sourceKind(source) {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && source.subAgent) return 'subAgent';
  return 'unknown';
}

function sandboxKind(sandbox) {
  if (typeof sandbox === 'string') return sandbox;
  if (sandbox && typeof sandbox.type === 'string') return sandbox.type;
  return null;
}

function createThread(id) {
  return {
    id,
    sessionId: null,
    parentThreadId: null,
    source: 'unknown',
    createdAt: null,
    updatedAt: null,
    observedThreadStarted: false,
    expectedFromCollaboration: false,
    actual: {
      model: null,
      effort: null,
      serviceTier: null,
      modelProvider: null,
      approvalPolicy: null,
      sandbox: null,
    },
    requestedByParent: { model: null, effort: null },
    subscription: {
      status: 'not_attempted', errorCode: null,
      resumeStatus: 'not_attempted', resumeErrorCode: null,
      readFallbackStatus: 'not_attempted', readFallbackErrorCode: null,
    },
    verifiedMetadata: null,
    currentModel: null,
    turnModels: new Map(),
    turns: new Map(),
    usage: {
      highWater: null,
      total: zeroUsage(),
      updates: 0,
      duplicateUpdates: 0,
      outOfOrderUpdates: 0,
      inconsistentUpdates: 0,
      invalidUpdates: 0,
      modelContextWindow: null,
      byModel: new Map(),
    },
  };
}

function applyThread(thread, input, observed = true) {
  if (!input || typeof input !== 'object') return;
  thread.sessionId = cleanScalar(input.sessionId) ?? thread.sessionId;
  thread.parentThreadId = cleanScalar(input.parentThreadId) ?? thread.parentThreadId;
  thread.source = sourceKind(input.source);
  thread.createdAt = Number.isFinite(input.createdAt) ? input.createdAt : thread.createdAt;
  thread.updatedAt = Number.isFinite(input.updatedAt) ? input.updatedAt : thread.updatedAt;
  thread.observedThreadStarted ||= observed;
  if (typeof input.model === 'string') {
    thread.actual.model = input.model;
    thread.currentModel = input.model;
  }
  if (typeof input.reasoningEffort === 'string') thread.actual.effort = input.reasoningEffort;
  if (typeof input.modelProvider === 'string') thread.actual.modelProvider = input.modelProvider;
}

function applySettings(thread, settings) {
  if (!settings || typeof settings !== 'object') return;
  if (typeof settings.model === 'string') {
    const previousModel = thread.currentModel;
    thread.actual.model = settings.model;
    thread.currentModel = settings.model;
    if (!previousModel && thread.usage.byModel.has('unknown')) {
      const unattributed = thread.usage.byModel.get('unknown');
      thread.usage.byModel.delete('unknown');
      if (!thread.usage.byModel.has(settings.model)) thread.usage.byModel.set(settings.model, zeroUsage());
      addUsage(thread.usage.byModel.get(settings.model), unattributed);
    }
  }
  if (typeof settings.effort === 'string' || settings.effort === null) thread.actual.effort = settings.effort;
  if (typeof settings.modelProvider === 'string') thread.actual.modelProvider = settings.modelProvider;
  if (typeof settings.serviceTier === 'string' || settings.serviceTier === null) thread.actual.serviceTier = settings.serviceTier;
  if (typeof settings.approvalPolicy === 'string') thread.actual.approvalPolicy = settings.approvalPolicy;
  thread.actual.sandbox = sandboxKind(settings.sandboxPolicy ?? settings.sandbox);
}

function cleanTurn(turn) {
  return {
    turnId: typeof turn?.id === 'string' ? turn.id : null,
    status: typeof turn?.status === 'string' ? turn.status : 'unknown',
    startedAt: Number.isFinite(turn?.startedAt) ? turn.startedAt : null,
    completedAt: Number.isFinite(turn?.completedAt) ? turn.completedAt : null,
    durationMs: Number.isFinite(turn?.durationMs) ? turn.durationMs : null,
  };
}

function cleanRequestId(id) {
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

export function responseForServerRequest(message) {
  const id = cleanRequestId(message?.id);
  switch (message?.method) {
    case 'item/commandExecution/requestApproval':
    case 'item/fileChange/requestApproval':
      return { id, result: { decision: 'decline' } };
    case 'item/permissions/requestApproval':
      return { id, result: { permissions: {}, scope: 'turn' } };
    case 'execCommandApproval':
    case 'applyPatchApproval':
      return { id, result: { decision: { denied: { rejection: 'metered runner is read-only' } } } };
    default:
      return { id, error: { code: -32601, message: 'Unsupported server request' } };
  }
}

export function createTurnCompletionLatch() {
  const completed = new Map();
  let target = null;
  let resolveTarget = null;
  let failed = null;
  const key = (threadId, turnId) => `${threadId}\u0000${turnId}`;
  return {
    observe(threadId, turnId, status) {
      if (typeof threadId !== 'string' || typeof turnId !== 'string') return;
      const result = { status: typeof status === 'string' ? status : 'unknown' };
      const completionKey = key(threadId, turnId);
      completed.set(completionKey, result);
      if (target === completionKey && resolveTarget) resolveTarget(result);
    },
    fail(code) {
      failed = { error: code };
      if (resolveTarget) resolveTarget(failed);
    },
    waitFor(threadId, turnId) {
      target = key(threadId, turnId);
      if (failed) return Promise.resolve(failed);
      if (completed.has(target)) return Promise.resolve(completed.get(target));
      return new Promise((resolve) => { resolveTarget = resolve; });
    },
  };
}

export function createMeteringCollector(options) {
  const threads = new Map();
  const reroutes = [];
  const rejectedServerRequests = [];
  const protocolErrors = [];
  const itemActivity = new Map();
  const newChildIds = [];
  let rootThreadId = null;
  let rootTurnId = null;
  let finalAnswer = null;
  let malformedLineCount = 0;

  const ensureThread = (id) => {
    if (!threads.has(id)) threads.set(id, createThread(id));
    return threads.get(id);
  };

  const belongsToRun = (threadId) => {
    const visited = new Set();
    let currentId = threadId;
    while (typeof currentId === 'string' && !visited.has(currentId)) {
      if (currentId === rootThreadId) return true;
      visited.add(currentId);
      currentId = threads.get(currentId)?.parentThreadId ?? null;
    }
    return false;
  };

  const registerChild = (threadId, parentThreadId, requested = {}) => {
    if (typeof threadId !== 'string' || !belongsToRun(parentThreadId)) return;
    const child = ensureThread(threadId);
    child.expectedFromCollaboration = true;
    child.parentThreadId ??= parentThreadId;
    child.requestedByParent = {
      model: cleanIdentifier(requested.model),
      effort: cleanIdentifier(requested.effort),
    };
    if (child.subscription.status === 'not_attempted') newChildIds.push(threadId);
  };

  function recordThreadStart(result) {
    const id = result?.thread?.id;
    if (typeof id !== 'string') throw new Error('thread/start response did not include a thread id');
    rootThreadId = id;
    const thread = ensureThread(id);
    applyThread(thread, result.thread);
    applySettings(thread, {
      model: result.model,
      effort: result.reasoningEffort,
      modelProvider: result.modelProvider,
      serviceTier: result.serviceTier,
      approvalPolicy: result.approvalPolicy,
      sandbox: result.sandbox,
    });
  }

  function recordTurnStart(result) {
    if (!rootThreadId) throw new Error('thread must start before turn');
    const turn = cleanTurn(result?.turn);
    if (!turn.turnId) throw new Error('turn/start response did not include a turn id');
    rootTurnId = turn.turnId;
    ensureThread(rootThreadId).turns.set(turn.turnId, turn);
  }

  function recordProtocolError(stage, error) {
    protocolErrors.push({
      stage: typeof stage === 'string' ? stage : 'unknown',
      code: cleanErrorCode(error?.code),
    });
  }

  function recordMalformedLine() {
    malformedLineCount += 1;
  }

  function ingest(message) {
    if (!message || typeof message !== 'object') return null;
    if ('id' in message && typeof message.method === 'string') {
      rejectedServerRequests.push({ method: SERVER_REQUEST_METHODS.has(message.method) ? message.method : 'unsupported', requestId: cleanRequestId(message.id) });
      return responseForServerRequest(message);
    }
    const params = message.params ?? {};
    if (message.method === 'item/started' || message.method === 'item/completed') {
      const item = params.item;
      if (item && ITEM_TYPES.has(item.type)) {
        const tool = cleanIdentifier(typeof item.tool === 'string' ? item.tool : item.name);
        const status = ITEM_STATUSES.has(item.status) ? item.status : ITEM_STATUSES.has(item.kind) ? item.kind : null;
        const activityKey = JSON.stringify([item.type, tool, status]);
        if (!itemActivity.has(activityKey)) itemActivity.set(activityKey, { type: item.type, tool, status, started: 0, completed: 0 });
        const activity = itemActivity.get(activityKey);
        if (message.method === 'item/started') activity.started += 1;
        else activity.completed += 1;
      }
      if (item?.type === 'subAgentActivity' && item.kind === 'started') {
        registerChild(item.agentThreadId, params.threadId);
      }
    }
    switch (message.method) {
      case 'thread/started': {
        const id = params.thread?.id;
        if (typeof id !== 'string') break;
        const thread = ensureThread(id);
        applyThread(thread, params.thread);
        if (thread.parentThreadId && thread.subscription.status === 'not_attempted') {
          thread.subscription = { status: 'stream_observed', errorCode: null };
        }
        break;
      }
      case 'thread/settings/updated': {
        if (typeof params.threadId !== 'string') break;
        applySettings(ensureThread(params.threadId), params.threadSettings);
        break;
      }
      case 'turn/started': {
        if (typeof params.threadId !== 'string') break;
        const turn = cleanTurn(params.turn);
        if (turn.turnId) ensureThread(params.threadId).turns.set(turn.turnId, turn);
        break;
      }
      case 'turn/completed': {
        if (typeof params.threadId !== 'string') break;
        const turn = cleanTurn(params.turn);
        if (turn.turnId) ensureThread(params.threadId).turns.set(turn.turnId, turn);
        break;
      }
      case 'thread/tokenUsage/updated': {
        if (typeof params.threadId !== 'string') break;
        const thread = ensureThread(params.threadId);
        const next = cleanUsage(params.tokenUsage?.total);
        if (!next) {
          thread.usage.invalidUpdates += 1;
          break;
        }
        const change = usageDelta(thread.usage.highWater, next);
        if (change.kind === 'duplicate') {
          thread.usage.duplicateUpdates += 1;
          break;
        }
        if (change.kind === 'out_of_order') {
          thread.usage.outOfOrderUpdates += 1;
          break;
        }
        if (change.kind === 'inconsistent') thread.usage.inconsistentUpdates += 1;
        thread.usage.updates += 1;
        for (const field of USAGE_FIELDS) thread.usage.highWater ??= zeroUsage();
        for (const field of USAGE_FIELDS) thread.usage.highWater[field] = Math.max(thread.usage.highWater[field], next[field]);
        thread.usage.total = { ...thread.usage.highWater };
        if (Number.isFinite(params.tokenUsage?.modelContextWindow)) thread.usage.modelContextWindow = params.tokenUsage.modelContextWindow;
        const model = thread.turnModels.get(params.turnId) ?? thread.currentModel ?? 'unknown';
        if (!thread.usage.byModel.has(model)) thread.usage.byModel.set(model, zeroUsage());
        addUsage(thread.usage.byModel.get(model), change.delta);
        break;
      }
      case 'model/rerouted': {
        if (typeof params.threadId !== 'string') break;
        const thread = ensureThread(params.threadId);
        if (typeof params.toModel === 'string') {
          thread.currentModel = params.toModel;
          thread.actual.model = params.toModel;
          if (typeof params.turnId === 'string') thread.turnModels.set(params.turnId, params.toModel);
        }
        reroutes.push({
          threadId: params.threadId,
          turnId: cleanScalar(params.turnId),
          fromModel: cleanScalar(params.fromModel),
          toModel: cleanScalar(params.toModel),
          reason: cleanScalar(params.reason) ?? 'unknown',
        });
        break;
      }
      case 'item/completed': {
        const item = params.item;
        if (item?.type === 'collabAgentToolCall' && item.tool === 'spawnAgent' && Array.isArray(item.receiverThreadIds)) {
          for (const receiverThreadId of item.receiverThreadIds) {
            registerChild(receiverThreadId, typeof item.senderThreadId === 'string' ? item.senderThreadId : params.threadId, {
              model: item.model,
              effort: item.reasoningEffort,
            });
          }
        }
        if (options.captureFinalAnswer && params.threadId === rootThreadId && item?.type === 'agentMessage' && typeof item.text === 'string') {
          if (item.phase === 'final_answer' || (item.phase == null && finalAnswer == null)) finalAnswer = item.text;
        }
        break;
      }
      case 'error':
        recordProtocolError('notification', params.error);
        break;
      default:
        break;
    }
    return null;
  }

  function publicThread(thread, isRoot) {
    const turns = [...thread.turns.values()];
    const latestTurn = turns.at(-1) ?? null;
    const usagePresent = thread.usage.updates > 0;
    return {
      threadId: thread.id,
      parentThreadId: thread.parentThreadId,
      sessionId: thread.sessionId,
      isRoot,
      source: thread.source,
      observedThreadStarted: thread.observedThreadStarted,
      expectedFromCollaboration: thread.expectedFromCollaboration,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      actual: { ...thread.actual },
      requestedByParent: { ...thread.requestedByParent },
      subscription: { ...thread.subscription },
      verifiedMetadata: thread.verifiedMetadata ? { ...thread.verifiedMetadata } : null,
      turnId: latestTurn?.turnId ?? null,
      turnStatus: latestTurn?.status ?? 'unknown',
      turnStartedAt: latestTurn?.startedAt ?? null,
      turnCompletedAt: latestTurn?.completedAt ?? null,
      turnDurationMs: latestTurn?.durationMs ?? null,
      usage: {
        status: usagePresent ? 'present' : 'missing',
        total: usagePresent ? { ...thread.usage.total } : null,
        modelContextWindow: thread.usage.modelContextWindow,
        updates: thread.usage.updates,
        duplicateUpdates: thread.usage.duplicateUpdates,
        outOfOrderUpdates: thread.usage.outOfOrderUpdates,
        inconsistentUpdates: thread.usage.inconsistentUpdates,
        invalidUpdates: thread.usage.invalidUpdates,
        byObservedModel: [...thread.usage.byModel.entries()].map(([model, totals]) => ({ model, ...totals })),
      },
    };
  }

  function finalize({ finishedAtMs, streamStatus, processExitCode, processSignal = null }) {
    const publicThreads = [...threads.values()].map((thread) => publicThread(thread, thread.id === rootThreadId));
    const root = publicThreads.find((thread) => thread.isRoot) ?? null;
    const children = publicThreads.filter((thread) => !thread.isRoot && (thread.parentThreadId || thread.expectedFromCollaboration));
    const rootComplete = root?.turnStatus === 'completed' || root?.turnStatus === 'failed' || root?.turnStatus === 'interrupted';
    const expectedChildren = Number.isInteger(options.expectedChildren) ? options.expectedChildren : 0;
    const childrenIncomplete = children.length < expectedChildren
      || children.some((child) => !['subscribed', 'stream_observed', 'metadata_verified'].includes(child.subscription.status)
        || !['completed', 'failed', 'interrupted'].includes(child.turnStatus)
        || child.usage.status === 'missing');
    const usageStatus = root?.usage.status ?? 'missing';
    const flags = [];
    if (!rootComplete) flags.push('root_turn_incomplete');
    if (usageStatus === 'missing') flags.push('usage_missing');
    if (childrenIncomplete) flags.push('children_incomplete');
    if (streamStatus !== 'complete') flags.push('stream_incomplete');
    if (!root?.actual.model) flags.push('actual_model_unknown');
    if (!root?.actual.effort) flags.push('actual_effort_unknown');
    if (!root?.actual.serviceTier) flags.push('actual_service_tier_unknown');
    const usageModelUnknown = publicThreads.some((thread) => thread.usage.byObservedModel.some((entry) => entry.model === 'unknown'));
    if (usageModelUnknown) flags.push('usage_model_unknown');
    if (publicThreads.some((thread) => thread.usage.inconsistentUpdates > 0)) flags.push('usage_counter_inconsistent');
    if (publicThreads.some((thread) => thread.usage.invalidUpdates > 0)) flags.push('usage_update_invalid');
    return {
      schemaVersion: 1,
      run: {
        requestedModel: options.requestedModel,
        requestedEffort: options.requestedEffort,
        requestedServiceTier: options.requestedServiceTier,
        sandbox: 'read-only',
        startedAtMs: options.startedAtMs,
        finishedAtMs,
        durationMs: finishedAtMs - options.startedAtMs,
      },
      root,
      threads: publicThreads,
      children,
      reroutes,
      itemActivity: [...itemActivity.values()],
      rejectedServerRequests,
      integrity: {
        streamStatus,
        processExitCode: Number.isInteger(processExitCode) ? processExitCode : null,
        processSignal: cleanScalar(processSignal),
        rootTurnCompleted: rootComplete,
        usageStatus,
        childrenStatus: childrenIncomplete ? 'incomplete' : children.length === 0 ? 'none_observed' : 'complete',
        expectedChildren,
        observedChildren: children.length,
        childSubscriptionMode: 'new_children_resume_with_metadata_read_fallback',
        modelAttributionIncomplete: reroutes.length > 0 || usageModelUnknown,
        malformedLineCount,
        errors: protocolErrors,
        flags,
      },
    };
  }

  return {
    drainNewChildIds() {
      return newChildIds.splice(0, newChildIds.length);
    },
    finalize,
    ingest,
    recordMalformedLine,
    recordProtocolError,
    recordChildResumeAttempt(threadId) {
      const thread = ensureThread(threadId);
      thread.subscription = {
        ...thread.subscription,
        status: 'pending', errorCode: null,
        resumeStatus: 'pending', resumeErrorCode: null,
      };
    },
    recordChildResume(threadId, result) {
      const thread = ensureThread(threadId);
      applyThread(thread, result?.thread, false);
      applySettings(thread, {
        model: result?.model,
        effort: result?.reasoningEffort,
        modelProvider: result?.modelProvider,
        serviceTier: result?.serviceTier,
        approvalPolicy: result?.approvalPolicy,
        sandbox: result?.sandbox,
      });
      thread.subscription = {
        ...thread.subscription,
        status: 'subscribed', errorCode: null,
        resumeStatus: 'subscribed', resumeErrorCode: null,
      };
    },
    recordChildResumeError(threadId, error) {
      const thread = ensureThread(threadId);
      const errorCode = cleanErrorCode(error?.code);
      thread.subscription = {
        ...thread.subscription,
        status: 'failed', errorCode,
        resumeStatus: 'failed', resumeErrorCode: errorCode,
      };
    },
    recordChildMetadataReadAttempt(threadId) {
      const thread = ensureThread(threadId);
      thread.subscription = {
        ...thread.subscription,
        status: 'metadata_pending',
        readFallbackStatus: 'pending', readFallbackErrorCode: null,
      };
    },
    recordChildMetadataRead(threadId, result) {
      const thread = ensureThread(threadId);
      const metadata = result?.thread;
      if (!metadata || metadata.id !== threadId) {
        const errorCode = 'thread_mismatch';
        thread.subscription = {
          ...thread.subscription,
          status: 'failed',
          readFallbackStatus: 'failed', readFallbackErrorCode: errorCode,
        };
        return;
      }
      thread.sessionId = cleanScalar(metadata.sessionId) ?? thread.sessionId;
      thread.parentThreadId = cleanScalar(metadata.parentThreadId) ?? thread.parentThreadId;
      thread.source = sourceKind(metadata.source);
      thread.createdAt = Number.isFinite(metadata.createdAt) ? metadata.createdAt : thread.createdAt;
      thread.updatedAt = Number.isFinite(metadata.updatedAt) ? metadata.updatedAt : thread.updatedAt;
      thread.verifiedMetadata = {
        model: cleanIdentifier(metadata.model),
        effort: cleanIdentifier(metadata.reasoningEffort),
        modelProvider: cleanIdentifier(metadata.modelProvider),
        status: cleanIdentifier(metadata.status?.type, 'unknown'),
        createdAt: Number.isFinite(metadata.createdAt) ? metadata.createdAt : null,
        updatedAt: Number.isFinite(metadata.updatedAt) ? metadata.updatedAt : null,
        turnsReturned: Array.isArray(metadata.turns) ? metadata.turns.length : null,
      };
      thread.subscription = {
        ...thread.subscription,
        status: 'metadata_verified',
        readFallbackStatus: 'verified', readFallbackErrorCode: null,
      };
    },
    recordChildMetadataReadError(threadId, error) {
      const thread = ensureThread(threadId);
      const errorCode = cleanErrorCode(error?.code);
      thread.subscription = {
        ...thread.subscription,
        status: 'failed',
        readFallbackStatus: 'failed', readFallbackErrorCode: errorCode,
      };
    },
    recordThreadStart,
    recordTurnStart,
    takeFinalAnswer: () => finalAnswer,
  };
}

export function parseArgs(argv) {
  const values = {};
  const allowed = new Set(['exe', 'model', 'effort', 'service-tier', 'cwd', 'prompt-file', 'out', 'answer-out', 'timeout-ms', 'settle-ms', 'expect-children']);
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    if (!token?.startsWith('--')) throw new Error(`Unexpected argument: ${token ?? ''}`);
    const name = token.slice(2);
    if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    if (values[name] !== undefined) throw new Error(`Duplicate option: --${name}`);
    values[name] = value;
  }
  const required = ['exe', 'model', 'effort', 'service-tier', 'cwd', 'prompt-file', 'out'];
  const missing = required.filter((name) => !values[name]);
  if (missing.length) throw new Error(`Missing required options: ${missing.map((name) => `--${name}`).join(', ')}`);
  const timeoutMs = values['timeout-ms'] === undefined ? 1_800_000 : Number(values['timeout-ms']);
  const settleMs = values['settle-ms'] === undefined ? 750 : Number(values['settle-ms']);
  const expectChildren = values['expect-children'] === undefined ? 0 : Number(values['expect-children']);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 7_200_000) throw new Error('--timeout-ms must be an integer from 1000 to 7200000');
  if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 30_000) throw new Error('--settle-ms must be an integer from 0 to 30000');
  if (!Number.isInteger(expectChildren) || expectChildren < 0 || expectChildren > 64) throw new Error('--expect-children must be an integer from 0 to 64');
  return {
    exe: values.exe,
    model: values.model,
    effort: values.effort,
    serviceTier: values['service-tier'],
    cwd: values.cwd,
    promptFile: values['prompt-file'],
    out: values.out,
    answerOut: values['answer-out'] ?? null,
    timeoutMs,
    settleMs,
    expectChildren,
    sandbox: 'read-only',
  };
}
