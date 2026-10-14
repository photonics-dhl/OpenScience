import { describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';
import { AGENT_TASK_OWNED_STOP_REASON } from '@openscience/domain';
import { createTaskScopedGateway, runWithWorkerExecution } from '../src/index';

type LiveTask = { status: string; executionAttempt: number; error: string | null; deletedAt: Date | null };

function gatewayFixture() {
  const completeStructured = vi.fn(async (_guard: unknown, _messages: unknown, options?: {
    beforeEachProviderCall?: () => Promise<void>;
  }) => {
    await options?.beforeEachProviderCall?.();
    return { ok: true };
  });
  const gateway = { completeStructured } as unknown as AiGateway;
  let current: LiveTask = {
    status: 'running', executionAttempt: 1, error: null, deletedAt: null,
  };
  const prisma = { agentTask: { findUnique: vi.fn(async () => ({ ...current })) } };
  return { gateway, completeStructured, prisma, setCurrent: (next: LiveTask) => { current = next; } };
}

describe('R12 Worker execution fence', () => {
  it('checks the claimed attempt before a structured provider call', async () => {
    const f = gatewayFixture();
    const scoped = createTaskScopedGateway(f.gateway, f.prisma as never);
    await runWithWorkerExecution({ taskId: 'task-1', executionAttempt: 1 }, () =>
      scoped.completeStructured(() => true, [], {}));
    expect(f.completeStructured).toHaveBeenCalledOnce();
    const options = f.completeStructured.mock.calls[0]![2] as { beforeEachProviderCall?: () => Promise<void> };
    expect(options.beforeEachProviderCall).toBeTypeOf('function');
  });

  it.each([
    ['owned-stop', { status: 'failed', executionAttempt: 2, error: AGENT_TASK_OWNED_STOP_REASON, deletedAt: null }],
    ['stale-attempt', { status: 'running', executionAttempt: 2, error: null, deletedAt: null }],
    ['deleted', { status: 'running', executionAttempt: 1, error: null, deletedAt: new Date() }],
  ])('rejects %s before provider submission', async (_label, current: LiveTask) => {
    const f = gatewayFixture(); f.setCurrent(current);
    const scoped = createTaskScopedGateway(f.gateway, f.prisma as never);
    await expect(runWithWorkerExecution({ taskId: 'task-1', executionAttempt: 1 }, () =>
      scoped.completeStructured(() => true, [], {}))).rejects.toThrow(/stopped or superseded/);
    expect(f.completeStructured).not.toHaveBeenCalled();
  });

  it('rechecks after a caller hook so a stop winning during authorization cannot start a retry', async () => {
    const f = gatewayFixture();
    let reads = 0;
    f.prisma.agentTask.findUnique.mockImplementation(async () => {
      reads += 1;
      return reads === 1
        ? { status: 'running', executionAttempt: 1, error: null, deletedAt: null }
        : { status: 'failed', executionAttempt: 2, error: AGENT_TASK_OWNED_STOP_REASON, deletedAt: null };
    });
    const scoped = createTaskScopedGateway(f.gateway, f.prisma as never);
    await expect(runWithWorkerExecution({ taskId: 'task-1', executionAttempt: 1 }, () =>
      scoped.completeStructured(() => true, [], { beforeEachProviderCall: async () => undefined }))).rejects.toThrow(/stopped or superseded/);
    expect(f.completeStructured).toHaveBeenCalledOnce();
  });
});
