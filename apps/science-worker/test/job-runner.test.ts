import { describe, expect, it, jest } from '@jest/globals';
import type { SandboxJob } from '@openscience/domain';
import { mapSandboxResult, pollOnce, type ScienceWorkerDeps } from '../src/index';

function makeJob(overrides: Partial<SandboxJob> = {}): SandboxJob {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    workspaceId: '22222222-2222-2222-2222-222222222222',
    userId: '33333333-3333-3333-3333-333333333333',
    script: 'print(1)',
    status: 'running',
    result: null,
    context: null,
    createdAt: new Date('2026-08-06T00:00:00Z'),
    completedAt: null,
    ...overrides,
  };
}

type MockedDeps = { [K in keyof ScienceWorkerDeps]: jest.MockedFunction<ScienceWorkerDeps[K]> };

function makeDeps(overrides: Partial<ScienceWorkerDeps> = {}): MockedDeps {
  return {
    claimNextJob: jest.fn<ScienceWorkerDeps['claimNextJob']>().mockResolvedValue(makeJob()),
    executeScript: jest.fn<ScienceWorkerDeps['executeScript']>().mockResolvedValue({ success: true, output: '1\n', exitCode: 0 }),
    finalizeJob: jest.fn<ScienceWorkerDeps['finalizeJob']>().mockResolvedValue(undefined),
    markJobFailed: jest.fn<ScienceWorkerDeps['markJobFailed']>().mockResolvedValue(undefined),
    ...overrides,
  } as MockedDeps;
}

describe('science-worker 执行链 pollOnce（mock 接缝，不依赖 Docker/DB）', () => {
  it('无 pending 作业 → 返回 false，不执行', async () => {
    const deps = makeDeps({ claimNextJob: jest.fn<ScienceWorkerDeps['claimNextJob']>().mockResolvedValue(null) });
    const didWork = await pollOnce(deps);
    expect(didWork).toBe(false);
    expect(deps.executeScript).not.toHaveBeenCalled();
    expect(deps.finalizeJob).not.toHaveBeenCalled();
  });

  it('执行成功 → finalizeJob 收到 completed + stdout/exitCode', async () => {
    const deps = makeDeps();
    const didWork = await pollOnce(deps);
    expect(didWork).toBe(true);
    expect(deps.executeScript).toHaveBeenCalledWith('print(1)');
    expect(deps.finalizeJob).toHaveBeenCalledTimes(1);
    const [job, execution] = deps.finalizeJob.mock.calls[0];
    expect(job.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(execution.status).toBe('completed');
    expect(execution.result.stdout).toBe('1\n');
    expect(execution.result.exitCode).toBe(0);
    expect(execution.result.runtimeSeconds).toBeGreaterThanOrEqual(0);
    expect(deps.markJobFailed).not.toHaveBeenCalled();
  });

  it('超时 → status=timeout（优先于 success/failed）', async () => {
    const deps = makeDeps({
      executeScript: jest.fn<ScienceWorkerDeps['executeScript']>().mockResolvedValue({
        success: false,
        error: 'Script execution timed out (30s limit)',
        timeout: true,
      }),
    });
    await pollOnce(deps);
    const [, execution] = deps.finalizeJob.mock.calls[0];
    expect(execution.status).toBe('timeout');
    expect(execution.result.stderr).toContain('timed out');
    expect(execution.result.exitCode).toBe(1);
  });

  it('脚本非零退出 → status=failed', async () => {
    const deps = makeDeps({
      executeScript: jest.fn<ScienceWorkerDeps['executeScript']>().mockResolvedValue({
        success: false,
        error: 'Traceback ...',
        exitCode: 2,
      }),
    });
    await pollOnce(deps);
    const [, execution] = deps.finalizeJob.mock.calls[0];
    expect(execution.status).toBe('failed');
    expect(execution.result.exitCode).toBe(2);
  });

  it('执行产物透传给 finalizeJob', async () => {
    const artifact = { filename: 'plot.png', mimeType: 'image/png', size: 3, data: Buffer.from([1, 2, 3]) };
    const deps = makeDeps({
      executeScript: jest.fn<ScienceWorkerDeps['executeScript']>().mockResolvedValue({
        success: true,
        output: 'ok',
        exitCode: 0,
        artifacts: [artifact],
      }),
    });
    await pollOnce(deps);
    const [, execution] = deps.finalizeJob.mock.calls[0];
    expect(execution.artifacts).toHaveLength(1);
    expect(execution.artifacts[0].filename).toBe('plot.png');
  });

  it('执行器抛异常 → markJobFailed 兜底，返回 true 不抛出', async () => {
    const deps = makeDeps({
      executeScript: jest.fn<ScienceWorkerDeps['executeScript']>().mockRejectedValue(new Error('docker daemon down')),
    });
    const didWork = await pollOnce(deps);
    expect(didWork).toBe(true);
    expect(deps.finalizeJob).not.toHaveBeenCalled();
    expect(deps.markJobFailed).toHaveBeenCalledTimes(1);
    const [job, message] = deps.markJobFailed.mock.calls[0];
    expect(job.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(message).toBe('docker daemon down');
  });
});

describe('mapSandboxResult', () => {
  it('输出含截断标记 → truncated=true', () => {
    const execution = mapSandboxResult(
      { success: true, output: 'x'.repeat(10) + '\n... (output truncated at 1MB limit)', exitCode: 0 },
      5,
    );
    expect(execution.result.truncated).toBe(true);
    expect(execution.result.runtimeSeconds).toBe(5);
  });

  it('exitCode 缺失时按 success 推导 0/1', () => {
    expect(mapSandboxResult({ success: true }, 0).result.exitCode).toBe(0);
    expect(mapSandboxResult({ success: false }, 0).result.exitCode).toBe(1);
  });
});
