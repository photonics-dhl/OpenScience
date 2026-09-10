import { writeFile } from 'node:fs/promises';

import { createDefaultIngestionAdapters } from './ingestion-parser';
import {
  createSidecarParserStageProcessor,
  processParserJobsOnce,
  recoverInterruptedParserJobs,
  reapParserJobOrphans,
} from './parser-job-isolation';
import { SafeParserErrorCode } from './parsers/job-protocol';

const jobDir = process.env.PARSER_JOB_DIR ?? '/parser-jobs';

async function main(): Promise<void> {
  const adapters = createDefaultIngestionAdapters();
  const stageProcessor = createSidecarParserStageProcessor(adapters);
  const configuredConcurrency = Number.parseInt(process.env.PARSER_WORKER_CONCURRENCY ?? '2', 10);
  const concurrency = Number.isFinite(configuredConcurrency)
    ? Math.min(4, Math.max(1, configuredConcurrency)) : 2;
  await recoverInterruptedParserJobs(jobDir);
  let nextHeartbeat = 0;
  const processJobs = async () => {
    while (true) {
      const processed = await processParserJobsOnce(jobDir, stageProcessor, undefined, { maxJobs: 1 });
      await new Promise((resolve) => setTimeout(resolve, processed ? 10 : 100));
    }
  };
  const heartbeat = async () => {
    while (true) {
    if (Date.now() >= nextHeartbeat) {
      await writeFile(`${jobDir}/.ready`, `${process.pid} ${Date.now()}\n`, { mode: 0o644 });
      await reapParserJobOrphans(jobDir);
      nextHeartbeat = Date.now() + 5_000;
    }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  };
  await Promise.all([heartbeat(), ...Array.from({ length: concurrency }, () => processJobs())]);
}

void main().catch(() => {
  console.error('document parser service failed', SafeParserErrorCode.SERVICE_FAILED);
  // Do not leave a deceptively healthy process with one or more dead worker
  // loops. Compose restarts the service and startup recovery requeues claims.
  process.exit(1);
});
