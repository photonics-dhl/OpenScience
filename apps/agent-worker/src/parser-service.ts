import { writeFile } from 'node:fs/promises';

import { createDefaultIngestionAdapters } from './ingestion-parser';
import {
  createSidecarParserStageProcessor,
  processParserJobsOnce,
  reapParserJobOrphans,
} from './parser-job-isolation';
import { SafeParserErrorCode } from './parsers/job-protocol';

const jobDir = process.env.PARSER_JOB_DIR ?? '/parser-jobs';

async function main(): Promise<void> {
  const adapters = createDefaultIngestionAdapters();
  const stageProcessor = createSidecarParserStageProcessor(adapters);
  let nextHeartbeat = 0;
  while (true) {
    if (Date.now() >= nextHeartbeat) {
      await writeFile(`${jobDir}/.ready`, `${process.pid} ${Date.now()}\n`, { mode: 0o644 });
      await reapParserJobOrphans(jobDir);
      nextHeartbeat = Date.now() + 5_000;
    }
    const processed = await processParserJobsOnce(jobDir, stageProcessor);
    await new Promise((resolve) => setTimeout(resolve, processed ? 10 : 100));
  }
}

void main().catch(() => {
  console.error('document parser service failed', SafeParserErrorCode.SERVICE_FAILED);
  process.exitCode = 1;
});
