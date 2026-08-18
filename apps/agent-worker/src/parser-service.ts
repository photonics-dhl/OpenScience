import { writeFile } from 'node:fs/promises';

import { createDefaultIngestionAdapters } from './ingestion-parser';
import { processParserJobsOnce, reapParserJobOrphans } from './parser-job-isolation';

const jobDir = process.env.PARSER_JOB_DIR ?? '/parser-jobs';

async function main(): Promise<void> {
  const adapters = createDefaultIngestionAdapters();
  let nextHeartbeat = 0;
  while (true) {
    if (Date.now() >= nextHeartbeat) {
      await writeFile(`${jobDir}/.ready`, `${process.pid} ${Date.now()}\n`, { mode: 0o644 });
      await reapParserJobOrphans(jobDir);
      nextHeartbeat = Date.now() + 5_000;
    }
    const processed = await processParserJobsOnce(jobDir, adapters);
    await new Promise((resolve) => setTimeout(resolve, processed ? 10 : 100));
  }
}

void main().catch((error) => {
  console.error('document parser service failed', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
