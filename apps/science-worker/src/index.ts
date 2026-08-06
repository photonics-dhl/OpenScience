import { pathToFileURL } from 'node:url';
import { createPrismaClient } from '@openscience/database';
import {
  claimNextPendingSandboxJob,
  updateSandboxJobStatus,
  onSandboxJobCompleted,
  createSandboxArtifacts,
  type NewSandboxArtifact,
  type SandboxJob,
  type SandboxJobResult,
  type SandboxJobStatus,
} from '@openscience/domain';
import { SandboxController, type SandboxResult } from './sandbox-controller.js';
import { checkPythonAST, type ASTCheckResult } from './ast-checker.js';

/** 一次执行的终态结果（状态 + 写回 result JSONB 的内容 + 收集到的产物）。 */
export interface JobExecution {
  status: SandboxJobStatus;
  result: SandboxJobResult;
  artifacts: NewSandboxArtifact[];
}

/**
 * 执行链依赖接缝（参照 agent-worker createPollOnce 的注入式写法）：
 * 真实实现见 main()；单测注入 mock，不依赖 Docker/DB。
 */
export interface ScienceWorkerDeps {
  claimNextJob: () => Promise<SandboxJob | null>;
  /** P1E-2 静态策略检查（AST 白/黑名单）；违规脚本不执行。 */
  checkScript: (script: string) => Promise<ASTCheckResult>;
  executeScript: (script: string) => Promise<SandboxResult>;
  finalizeJob: (job: SandboxJob, execution: JobExecution) => Promise<void>;
  markJobFailed: (job: SandboxJob, message: string) => Promise<void>;
}

/** SandboxResult → 作业终态映射（timeout 优先于 success/failed；产物透传）。 */
export function mapSandboxResult(raw: SandboxResult, runtimeSeconds: number): JobExecution {
  const status: SandboxJobStatus = raw.timeout ? 'timeout' : raw.success ? 'completed' : 'failed';
  return {
    status,
    result: {
      stdout: raw.output ?? '',
      stderr: raw.error ?? '',
      exitCode: raw.exitCode ?? (raw.success ? 0 : 1),
      runtimeSeconds,
      truncated: (raw.output ?? '').includes('(output truncated'),
    },
    artifacts: raw.artifacts ?? [],
  };
}

/**
 * P1E-4/5 执行链单步：认领 → AST 策略检查（P1E-2）→ 沙箱执行 → 写回状态/结果 + 完成事件。
 * 返回 false 表示无待执行作业（调用方退避）。策略违规与执行异常均兜底为 failed，不抛出。
 */
export async function pollOnce(deps: ScienceWorkerDeps): Promise<boolean> {
  const job = await deps.claimNextJob();
  if (!job) return false;

  const startedAt = Date.now();
  try {
    // P1E-2 静态策略检查：违规脚本不进沙箱，直接置 failed（纵深：运行时另有 RUNTIME_POLICY_PREAMBLE）
    const policy = await deps.checkScript(job.script);
    if (!policy.valid) {
      const detail = policy.violations.map((v) => `L${v.line}: ${v.message}`).join('; ');
      await deps.markJobFailed(job, `策略违规（未执行）: ${detail}`.slice(0, 1000));
      return true;
    }

    const raw = await deps.executeScript(job.script);
    const execution = mapSandboxResult(raw, Math.round((Date.now() - startedAt) / 1000));
    await deps.finalizeJob(job, execution);
  } catch (error) {
    await deps.markJobFailed(job, error instanceof Error ? error.message : String(error));
  }
  return true;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 主循环（独立进程入口，云上常驻；串行执行，一次一个作业）。 */
async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const controller = new SandboxController();

  const deps: ScienceWorkerDeps = {
    claimNextJob: () => claimNextPendingSandboxJob({ prisma }),
    checkScript: (script) => checkPythonAST(script),
    executeScript: (script) => controller.execute(script),
    finalizeJob: async (job, { status, result, artifacts }) => {
      // 产物先于状态写回：GET 作业详情时 artifacts 与终态一致可见
      if (artifacts.length > 0) {
        await createSandboxArtifacts({ prisma }, job.id, artifacts);
      }
      await updateSandboxJobStatus({ prisma }, { jobId: job.id, status, result });
      await onSandboxJobCompleted({ prisma }, { job: { ...job, status }, result, actorId: job.userId });
    },
    markJobFailed: async (job, message) => {
      await updateSandboxJobStatus({ prisma }, {
        jobId: job.id,
        status: 'failed',
        result: { stdout: '', stderr: message.slice(0, 1000), exitCode: 1, runtimeSeconds: 0 },
      });
    },
  };

  console.log('science-worker 启动（P1E-4/5 沙箱执行链：轮询 pending → SandboxController → 写回）');
  for (;;) {
    try {
      const didWork = await pollOnce(deps);
      if (!didWork) await sleep(2000);
    } catch (error) {
      console.error('poll error', error);
      await sleep(2000);
    }
  }
}

// 主进程入口；被测试 import 时不启动（ESM 无 require.main，用 import.meta.url 比对）
const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  void main();
}
