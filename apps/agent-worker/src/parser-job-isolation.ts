import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IngestionAdapters } from './ingestion-parser';

type ParserKind = 'pdf' | 'docx' | 'image';
type ParserResponse = { ok: true; text: string } | { ok: false; error: string };
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
const JOB_SUFFIXES = ['input', 'request.json', 'processing.json', 'response.tmp', 'response.json', 'cancelled'] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jobPath(jobDir: string, id: string, suffix: string): string {
  return join(jobDir, `${id}.${suffix}`);
}

export async function writeCancellationMarker(path: string): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644);
  await handle.close();
}

export async function reapParserJobOrphans(
  jobDir: string,
  now = Date.now(),
  maxAgeMs = 90_000,
  afterSnapshot?: () => Promise<void>,
): Promise<number> {
  const entries = await readdir(jobDir);
  const grouped = new Map<string, string[]>();
  for (const name of entries) {
    const match = /^([0-9a-f-]{36})\.(input|request\.json|processing\.json|response\.tmp|response\.json|cancelled)$/.exec(name);
    if (!match) continue;
    const names = grouped.get(match[1]!) ?? [];
    names.push(name);
    grouped.set(match[1]!, names);
  }
  await afterSnapshot?.();
  let reaped = 0;
  for (const [id, names] of grouped) {
    if (names.some((name) => name.endsWith('.request.json') || name.endsWith('.processing.json'))) continue;
    const timestamps = await Promise.all(names.map(async (name) => {
      try {
        return (await lstat(join(jobDir, name))).mtimeMs;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }));
    if (timestamps.some((timestamp) => timestamp === null)) continue;
    if (Math.max(...(timestamps as number[])) > now - maxAgeMs) continue;
    await Promise.all(JOB_SUFFIXES.map((suffix) => rm(jobPath(jobDir, id, suffix), { force: true }).catch(() => undefined)));
    reaped += 1;
  }
  return reaped;
}

export function createParserJobAdapters(jobDir: string, timeoutMs = 75_000): IngestionAdapters {
  const submit = async (kind: ParserKind, content: Buffer): Promise<string> => {
    await mkdir(jobDir, { recursive: true });
    const id = randomUUID();
    const inputPath = jobPath(jobDir, id, 'input');
    const requestPath = jobPath(jobDir, id, 'request.json');
    const responsePath = jobPath(jobDir, id, 'response.json');
    const cancelledPath = jobPath(jobDir, id, 'cancelled');
    await writeFile(inputPath, content, { mode: 0o644, flag: 'wx' });
    await writeFile(requestPath, JSON.stringify({ kind }), { mode: 0o644, flag: 'wx' });
    const deadline = Date.now() + timeoutMs;
    let timedOut = false;
    try {
      while (Date.now() < deadline) {
        try {
          const handle = await open(responsePath, constants.O_RDONLY | constants.O_NOFOLLOW);
          let serialized: string;
          try {
            const metadata = await handle.stat();
            if (!metadata.isFile() || metadata.size > MAX_RESPONSE_BYTES) throw new Error('document parser response exceeds limit');
            serialized = await handle.readFile('utf8');
          } finally {
            await handle.close();
          }
          const response = JSON.parse(serialized) as ParserResponse;
          if (response.ok && typeof response.text === 'string') return response.text;
          if (!response.ok && typeof response.error === 'string') throw new Error(response.error);
          throw new Error('document parser returned an invalid response');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await sleep(50);
      }
      timedOut = true;
      await writeCancellationMarker(cancelledPath);
      throw new Error('document parser sidecar timeout');
    } finally {
      const cleanupSuffixes = timedOut
        ? ['response.tmp', 'response.json']
        : ['input', 'request.json', 'processing.json', 'response.tmp', 'response.json', 'cancelled'];
      await Promise.all(cleanupSuffixes.map((suffix) => (
        rm(jobPath(jobDir, id, suffix), { force: true }).catch(() => undefined)
      )));
    }
  };
  return {
    pdf: (content) => submit('pdf', content),
    docx: (content) => submit('docx', content),
    image: (content) => submit('image', content),
  };
}

export async function processParserJobsOnce(jobDir: string, adapters: IngestionAdapters): Promise<number> {
  await mkdir(jobDir, { recursive: true });
  const entries = await readdir(jobDir);
  const requests = entries.filter((name) => name.endsWith('.request.json') || name.endsWith('.processing.json')).sort();
  let processed = 0;
  for (const name of requests) {
    const id = name.replace(/\.(?:request|processing)\.json$/, '');
    if (!/^[0-9a-f-]{36}$/.test(id)) continue;
    const processingPath = jobPath(jobDir, id, 'processing.json');
    const cancelledPath = jobPath(jobDir, id, 'cancelled');
    const cleanupCancelled = async () => {
      await Promise.all(JOB_SUFFIXES.map((suffix) => (
        rm(jobPath(jobDir, id, suffix), { force: true }).catch(() => undefined)
      )));
    };
    try {
      await access(cancelledPath);
      await cleanupCancelled();
      processed += 1;
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (name.endsWith('.request.json')) {
      try {
        await rename(jobPath(jobDir, id, 'request.json'), processingPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
    let response: ParserResponse;
    try {
      const request = JSON.parse(await readFile(processingPath, 'utf8')) as { kind?: unknown };
      if (request.kind !== 'pdf' && request.kind !== 'docx' && request.kind !== 'image') throw new Error('invalid parser kind');
      const adapter = adapters[request.kind];
      if (!adapter) throw new Error('parser adapter unavailable');
      const text = await adapter(await readFile(jobPath(jobDir, id, 'input')));
      response = { ok: true, text };
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message.slice(0, 1000) : 'document parser failed' };
    }
    try {
      await access(cancelledPath);
      await cleanupCancelled();
      processed += 1;
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporaryResponse = jobPath(jobDir, id, 'response.tmp');
    let serialized = JSON.stringify(response);
    if (Buffer.byteLength(serialized) > MAX_RESPONSE_BYTES) {
      serialized = JSON.stringify({ ok: false, error: 'document parser response exceeds limit' } satisfies ParserResponse);
    }
    await writeFile(temporaryResponse, serialized, { mode: 0o644 });
    await rename(temporaryResponse, jobPath(jobDir, id, 'response.json'));
    try {
      await access(cancelledPath);
      await cleanupCancelled();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await Promise.all([rm(processingPath, { force: true }), rm(jobPath(jobDir, id, 'input'), { force: true })]);
    }
    processed += 1;
  }
  return processed;
}
