import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, mkdir, readFile, readdir, rm, symlink, truncate, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createParserStageJobClient,
  createTransitionParserStageProcessor,
  createParserJobAdapters,
  processParserJobsOnce,
  readVerifiedParserInput,
  reapParserJobOrphans,
  writeCancellationMarker,
} from '../src/parser-job-isolation';
import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  SafeParserErrorCode,
  SafeParserWarningCode,
  serializeParserJobRequestV2,
  type ParserJobRequestV2,
  type ParserStageResult,
} from '../src/parsers/job-protocol';

const parserMetadata = { name: 'sidecar-layout', version: '2.0.0' };

function v2Request(content: Buffer, overrides: Partial<ParserJobRequestV2> = {}): ParserJobRequestV2 {
  return {
    schemaVersion: 2,
    operation: 'detect_layout',
    artifactId: 'artifact-1',
    contentHash: createHash('sha256').update(content).digest('hex'),
    mediaType: 'application/pdf',
    options: {},
    ...overrides,
  };
}

function v2Stage(text = 'safe text'): ParserStageResult {
  return {
    schemaVersion: 2,
    parser: parserMetadata,
    pages: [{
      page: 1,
      width: 612,
      height: 792,
      blocks: [{
        kind: 'paragraph',
        text,
        boundingBox: { x: 72, y: 600, width: 300, height: 20 },
        confidence: 0.99,
      }],
    }],
    warnings: [],
  };
}

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

  it('returns only a closed safe code for a V1 parser failure', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    try {
      const adapters = createParserJobAdapters(jobDir, 2_000);
      const pending = adapters.docx!(Buffer.from('bad'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await processParserJobsOnce(jobDir, { docx: async () => { throw new Error('/secret/path: manuscript fragment'); } });
      await expect(pending).rejects.toThrow(SafeParserErrorCode.PARSER_FAILED);
      await expect(pending).rejects.not.toThrow(/secret|manuscript/i);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('round-trips V2 structured stages with exact request identity and parser metadata', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const content = Buffer.from('%PDF structured fixture');
    try {
      const submit = createParserStageJobClient(jobDir, parserMetadata, 2_000);
      const expectedRequest = v2Request(content);
      const pending = submit(expectedRequest, content);
      await expect.poll(async () => (
        (await readdir(jobDir)).some((name) => name.endsWith('.request.json'))
      ), { interval: 5, timeout: 1_000 }).toBe(true);

      await expect(processParserJobsOnce(jobDir, {}, async (actualRequest, actualContent) => {
        expect(actualRequest).toEqual(expectedRequest);
        expect(actualContent).toEqual(content);
        return v2Stage();
      })).resolves.toBe(1);
      await expect(pending).resolves.toEqual(v2Stage());
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('serves V2 extract_text through the provider-neutral transition processor', async () => {
    const content = Buffer.from('%PDF transition fixture');
    const processor = createTransitionParserStageProcessor({
      pdf: async (actualContent) => {
        expect(actualContent).toEqual(content);
        return 'Transition text with no provider payload.';
      },
    });

    await expect(processor(v2Request(content, {
      operation: 'extract_text',
      options: {},
    }), content)).resolves.toEqual({
      schemaVersion: 2,
      parser: { name: 'v1-text-transition', version: '2.0.0' },
      pages: [{
        page: 1,
        width: 1000,
        height: 24,
        blocks: [{
          kind: 'paragraph',
          text: 'Transition text with no provider payload.',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 },
        }],
      }],
      warnings: [SafeParserWarningCode.PARTIAL_RESULT],
    });
  });

  it('fails unsupported V2 transition operations without invoking a legacy adapter', async () => {
    let invoked = false;
    const processor = createTransitionParserStageProcessor({
      pdf: async () => {
        invoked = true;
        return 'not allowed';
      },
    });
    const content = Buffer.from('%PDF layout fixture');

    await expect(processor(v2Request(content, { operation: 'detect_layout' }), content)).rejects.toThrow(
      SafeParserErrorCode.UNSUPPORTED_OPERATION,
    );
    expect(invoked).toBe(false);
  });

  it('maps malformed V1 sidecar output to a closed invalid-response code', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    try {
      const adapters = createParserJobAdapters(jobDir, 2_000);
      const pending = adapters.pdf!(Buffer.from('%PDF malformed response'));
      let requestName = '';
      await expect.poll(async () => {
        requestName = (await readdir(jobDir)).find((name) => name.endsWith('.request.json')) ?? '';
        return requestName.length > 0;
      }, { interval: 5, timeout: 1_000 }).toBe(true);
      const id = requestName.replace(/\.request\.json$/, '');
      await writeFile(join(jobDir, `${id}.response.json`), 'null');

      await expect(pending).rejects.toThrow(SafeParserErrorCode.INVALID_RESPONSE);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('reopens V2 input with no-follow and rejects non-regular, oversized or hash-mismatched files', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const content = Buffer.from('verified input');
    const request = v2Request(content);
    try {
      const validPath = join(jobDir, 'valid.input');
      await writeFile(validPath, content);
      await expect(readVerifiedParserInput(validPath, request)).resolves.toEqual(content);

      await expect(readVerifiedParserInput(validPath, { ...request, contentHash: 'b'.repeat(64) })).rejects.toThrow(SafeParserErrorCode.CONTENT_HASH_MISMATCH);

      const directoryPath = join(jobDir, 'directory.input');
      await mkdir(directoryPath);
      await expect(readVerifiedParserInput(directoryPath, request)).rejects.toThrow(SafeParserErrorCode.INVALID_INPUT);

      const oversizedPath = join(jobDir, 'oversized.input');
      await writeFile(oversizedPath, 'x');
      await truncate(oversizedPath, 50 * 1024 * 1024 + 1);
      await expect(readVerifiedParserInput(oversizedPath, request)).rejects.toThrow(SafeParserErrorCode.INPUT_TOO_LARGE);

      const linkedPath = join(jobDir, 'linked.input');
      await symlink(validPath, linkedPath, 'file');
      await expect(readVerifiedParserInput(linkedPath, request)).rejects.toThrow(SafeParserErrorCode.INVALID_INPUT);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('bounds V2 input reads even when the opened file grows after its size check', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const growingPath = join(jobDir, 'growing.input');
    try {
      await writeFile(growingPath, 'x');
      await truncate(growingPath, 49 * 1024 * 1024);
      const pending = readVerifiedParserInput(growingPath, v2Request(Buffer.from('placeholder')));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await appendFile(growingPath, Buffer.alloc(2 * 1024 * 1024));

      await expect(pending).rejects.toThrow(SafeParserErrorCode.INPUT_TOO_LARGE);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('rejects malformed V2 output with a bounded code and continues processing later jobs', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const badContent = Buffer.from('%PDF bad structured fixture');
    const goodContent = Buffer.from('%PDF good structured fixture');
    try {
      const submit = createParserStageJobClient(jobDir, parserMetadata, 2_000);
      const badPending = submit(v2Request(badContent, { artifactId: 'artifact-bad' }), badContent);
      const goodPending = submit(v2Request(goodContent, { artifactId: 'artifact-good' }), goodContent);
      await expect.poll(async () => (
        (await readdir(jobDir)).filter((name) => name.endsWith('.request.json')).length
      ), { interval: 5, timeout: 1_000 }).toBe(2);

      await expect(processParserJobsOnce(jobDir, {}, async (request) => {
        if (request.artifactId === 'artifact-bad') {
          return { ...v2Stage(), parser: { ...parserMetadata, providerStderr: '/secret/path: manuscript fragment' } } as never;
        }
        return v2Stage('later job succeeds');
      })).resolves.toBe(2);

      await expect(badPending).rejects.toThrow(SafeParserErrorCode.INVALID_RESPONSE);
      await expect(badPending).rejects.not.toThrow(/secret|manuscript/i);
      await expect(goodPending).resolves.toEqual(v2Stage('later job succeeds'));
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('maps oversized processor output to a bounded failure and continues later jobs', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const oversizedContent = Buffer.from('%PDF oversized processor fixture');
    const goodContent = Buffer.from('%PDF later processor fixture');
    try {
      const submit = createParserStageJobClient(jobDir, parserMetadata, 3_000);
      const oversizedPending = submit(v2Request(oversizedContent, { artifactId: 'artifact-oversized' }), oversizedContent);
      const goodPending = submit(v2Request(goodContent, { artifactId: 'artifact-later' }), goodContent);
      await expect.poll(async () => (
        (await readdir(jobDir)).filter((name) => name.endsWith('.request.json')).length
      ), { interval: 5, timeout: 1_000 }).toBe(2);

      await expect(processParserJobsOnce(jobDir, {}, async (request) => {
        if (request.artifactId !== 'artifact-oversized') return v2Stage('later job succeeds');
        const page = v2Stage().pages[0]!;
        return {
          ...v2Stage(),
          pages: [{
            ...page,
            blocks: Array.from({ length: 85 }, () => ({ ...page.blocks[0]!, text: '\0'.repeat(50_000) })),
          }],
        };
      })).resolves.toBe(2);

      await expect(oversizedPending).rejects.toThrow(SafeParserErrorCode.RESPONSE_TOO_LARGE);
      await expect(goodPending).resolves.toEqual(v2Stage('later job succeeds'));
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('rejects an oversized V2 response without parsing it or crashing the client', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const content = Buffer.from('%PDF oversized response fixture');
    try {
      const submit = createParserStageJobClient(jobDir, parserMetadata, 2_000);
      const pending = submit(v2Request(content), content);
      let requestName = '';
      await expect.poll(async () => {
        requestName = (await readdir(jobDir)).find((name) => name.endsWith('.request.json')) ?? '';
        return requestName.length > 0;
      }, { interval: 5, timeout: 1_000 }).toBe(true);
      const id = requestName.replace(/\.request\.json$/, '');
      await writeFile(join(jobDir, `${id}.response.json`), Buffer.alloc(PARSER_JOB_RESPONSE_MAX_BYTES + 1, 0x20));

      await expect(pending).rejects.toThrow(SafeParserErrorCode.RESPONSE_TOO_LARGE);
      expect((await readdir(jobDir)).filter((name) => name !== '.ready')).toEqual([]);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('fails V2 hash mismatches before invoking the parser adapter', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const content = Buffer.from('%PDF hash mismatch');
    let invoked = false;
    try {
      const id = '12345678-1234-1234-1234-123456789abc';
      const request = v2Request(content, { contentHash: 'b'.repeat(64) });
      await writeFile(join(jobDir, `${id}.input`), content);
      await writeFile(join(jobDir, `${id}.request.json`), serializeParserJobRequestV2(request));

      await expect(processParserJobsOnce(jobDir, {}, async () => {
        invoked = true;
        return v2Stage();
      })).resolves.toBe(1);
      expect(invoked).toBe(false);
      const response = JSON.parse(await readFile(join(jobDir, `${id}.response.json`), 'utf8')) as Record<string, unknown>;
      expect(response).toEqual({
        schemaVersion: 2,
        ok: false,
        artifactId: 'artifact-1',
        contentHash: 'b'.repeat(64),
        errorCode: SafeParserErrorCode.CONTENT_HASH_MISMATCH,
      });
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('rejects unknown protocol versions instead of downgrading them to V1', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    let invoked = false;
    try {
      const id = '12345678-1234-1234-1234-123456789abe';
      await writeFile(join(jobDir, `${id}.input`), '%PDF version mismatch');
      await writeFile(join(jobDir, `${id}.request.json`), JSON.stringify({ schemaVersion: 3, kind: 'pdf' }));

      await expect(processParserJobsOnce(jobDir, { pdf: async () => {
        invoked = true;
        return 'downgraded';
      } })).resolves.toBe(1);
      expect(invoked).toBe(false);
      await expect(readFile(join(jobDir, `${id}.response.json`), 'utf8')).resolves.toBe(JSON.stringify({
        ok: false,
        errorCode: SafeParserErrorCode.INVALID_REQUEST,
      }));
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });

  it('maps client-side write failures to a closed code without exposing the job path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const notDirectory = join(root, 'not-a-directory');
    try {
      await writeFile(notDirectory, 'occupied');
      const content = Buffer.from('%PDF write failure');
      const submit = createParserStageJobClient(notDirectory, parserMetadata, 2_000);
      let failure: unknown;
      try {
        await submit(v2Request(content), content);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe('io_failed');
      expect((failure as Error).message).not.toContain(notDirectory);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps an existing cancellation marker to a closed code without exposing its path', async () => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    const content = Buffer.from('%PDF cancellation collision');
    try {
      const submit = createParserStageJobClient(jobDir, parserMetadata, 30);
      const pending = submit(v2Request(content), content);
      let requestName = '';
      await expect.poll(async () => {
        requestName = (await readdir(jobDir)).find((name) => name.endsWith('.request.json')) ?? '';
        return requestName.length > 0;
      }, { interval: 5, timeout: 1_000 }).toBe(true);
      const id = requestName.replace(/\.request\.json$/, '');
      const cancellationPath = join(jobDir, `${id}.cancelled`);
      await writeFile(cancellationPath, 'already cancelled');

      let failure: unknown;
      try {
        await pending;
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(SafeParserErrorCode.CANCELLED);
      expect((failure as Error).message).not.toContain(cancellationPath);
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
