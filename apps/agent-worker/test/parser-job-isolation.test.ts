import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createParserJobAdapters,
  processParserJobsOnce,
  reapParserJobOrphans,
  writeCancellationMarker,
} from '../src/parser-job-isolation';

describe('document parser sidecar IPC', () => {
  it('never overwrites an attacker-created cancellation target', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const target = join(jobDir, 'existing.cancelled');
    try {
      await writeFile(target, 'do-not-truncate');
      await expect(writeCancellationMarker(target)).rejects.toThrow();
      await expect(readFile(target, 'utf8')).resolves.toBe('do-not-truncate');
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });
  it('moves binary parsing through the bounded shared-volume request contract', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    try {
      const adapters = createParserJobAdapters(jobDir, 2_000);
      const pending = adapters.pdf!(Buffer.from('%PDF fixture'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await expect(processParserJobsOnce(jobDir, { pdf: async (content) => `parsed:${content.length}` })).resolves.toBe(1);
      await expect(pending).resolves.toBe('parsed:12');
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('returns parser failures without leaking sidecar exception details into a success', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    try {
      const adapters = createParserJobAdapters(jobDir, 2_000);
      const pending = adapters.docx!(Buffer.from('bad'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await processParserJobsOnce(jobDir, { docx: async () => { throw new Error('malformed container'); } });
      await expect(pending).rejects.toThrow('malformed container');
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('marks timed-out work cancelled so a late sidecar cannot publish an orphan response', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    try {
      const adapters = createParserJobAdapters(jobDir, 30);
      await expect(adapters.pdf!(Buffer.from('%PDF delayed'))).rejects.toThrow(/timeout/);
      expect(await readdir(jobDir)).toEqual(expect.arrayContaining([expect.stringMatching(/\.cancelled$/)]));
      let invoked = false;
      await processParserJobsOnce(jobDir, { pdf: async () => { invoked = true; return 'late'; } });
      expect(invoked).toBe(false);
      expect((await readdir(jobDir)).filter((name) => name !== '.ready')).toEqual([]);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('reaps completed jobs abandoned by a crashed trusted worker', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const id = '12345678-1234-1234-1234-123456789abc';
    try {
      for (const file of [`${id}.input`, `${id}.response.json`]) {
        const path = join(jobDir, file);
        await writeFile(path, 'orphan');
        await utimes(path, new Date(0), new Date(0));
      }
      await expect(reapParserJobOrphans(jobDir, Date.now(), 90_000)).resolves.toBe(1);
      expect(await readdir(jobDir)).toEqual([]);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('tolerates a client deleting an orphan after the reaper snapshot', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const id = '12345678-1234-1234-1234-123456789abd';
    const input = join(jobDir, `${id}.input`);
    try {
      await writeFile(input, 'already consumed');
      await utimes(input, new Date(0), new Date(0));
      await expect(reapParserJobOrphans(jobDir, Date.now(), 90_000, async () => {
        await rm(input, { force: true });
      })).resolves.toBe(0);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('removes a response published during the cancellation race', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    try {
      const adapters = createParserJobAdapters(jobDir, 40);
      const pending = adapters.pdf!(Buffer.from('%PDF racing'));
      await expect.poll(async () => (
        (await readdir(jobDir)).some((name) => name.endsWith('.request.json'))
      ), { interval: 5, timeout: 1_000 }).toBe(true);
      const processing = processParserJobsOnce(jobDir, {
        pdf: async () => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return 'late response';
        },
      });
      await expect(pending).rejects.toThrow(/timeout/);
      await processing;
      expect((await readdir(jobDir)).filter((name) => name !== '.ready')).toEqual([]);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });
});
