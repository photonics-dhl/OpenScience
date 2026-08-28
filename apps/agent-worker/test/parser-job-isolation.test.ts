import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, mkdir, readFile, readdir, rm, symlink, truncate, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { IngestionAdapters, LegacyIngestionAdapters } from '../src/ingestion-parser';

import {
  createParserStageJobClient,
  createSidecarParserStageProcessor,
  createTransitionParserStageProcessor,
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
  it('separates native PDF sidecar adapters from the legacy string ingestion seam', () => {
    expectTypeOf<Awaited<ReturnType<NonNullable<IngestionAdapters['pdf']>>>>()
      .toEqualTypeOf<ParserStageResult>();
    expectTypeOf<Awaited<ReturnType<NonNullable<LegacyIngestionAdapters['pdf']>>>>()
      .toEqualTypeOf<string | ParserStageResult>();
  });

  it('keeps PDF inventory, selected rendering, and Tesseract word boxes inside the V2 sidecar processor', async () => {
    const content = Buffer.from('%PDF image-only');
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(13, 8);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(100, 16);
    png.writeUInt32BE(100, 20);
    const inventory = v2Stage();
    inventory.parser = { name: 'pdfjs-page-inventory', version: '2.4.5' };
    inventory.pages = [{ page: 1, width: 612, height: 792, blocks: [] }];
    const processor = createSidecarParserStageProcessor({}, {
      inventoryPages: async () => inventory,
      localOcr: {
        metadata: { name: 'tesseract', version: '5.3.0' },
        renderPdfPages: async () => [{
          pageNumber: 1, mediaType: 'image/png', bytes: png, width: 100, height: 100,
          contentHash: createHash('sha256').update(png).digest('hex'),
        }],
        recognizePage: async () => [
          'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
          '5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t96\tEvidence',
        ].join('\n'),
      },
    });

    await expect(processor(v2Request(content, { operation: 'inventory_pages', options: {} }), content))
      .resolves.toEqual(inventory);
    await expect(processor(v2Request(content, {
      operation: 'render_page', options: { pageNumbers: [1] },
    }), content)).resolves.toMatchObject({
      parser: { name: 'tesseract', version: '5.3.0' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [] }],
    });
    await expect(processor(v2Request(content, {
      operation: 'ocr_page', options: { pageNumbers: [1] },
    }), content)).resolves.toMatchObject({
      parser: { name: 'tesseract', version: '5.3.0' },
      pages: [{ page: 1, width: 612, height: 792, blocks: [{
        text: 'Evidence', confidence: 0.96,
        boundingBox: { x: 61.2, y: 554.4, width: 183.6, height: 79.2 },
      }] }],
      warnings: ['ocr_applied'],
    });
  });
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
  it.each([
    { kind: 'pdf' },
    { schemaVersion: 1, kind: 'docx' },
  ])('fails closed and removes schema-less/V1 jobs without invoking a parser', async (request) => {
    const jobDir = await mkdtemp(join(tmpdir(), 'openscience-parser-'));
    try {
      const id = '12345678-1234-1234-1234-123456789abc';
      await writeFile(join(jobDir, `${id}.input`), 'untrusted');
      await writeFile(join(jobDir, `${id}.request.json`), JSON.stringify(request));
      let invoked = false;
      await expect(processParserJobsOnce(jobDir, async () => {
        invoked = true;
        return v2Stage();
      })).resolves.toBe(1);
      expect(invoked).toBe(false);
      expect(await readdir(jobDir)).toEqual([]);
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

  it('serves legacy DOCX extract_text through the provider-neutral transition processor', async () => {
    const content = Buffer.from('PK\\x03\\x04 transition fixture');
    const processor = createTransitionParserStageProcessor({
      docx: async (actualContent) => {
        expect(actualContent).toEqual(content);
        return 'Transition text with no provider payload.';
      },
    });

    await expect(processor(v2Request(content, {
      operation: 'extract_text',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

  it('rejects an untyped legacy string PDF adapter instead of emitting mismatched metadata', async () => {
    const content = Buffer.from('%PDF legacy fixture');
    const processor = createTransitionParserStageProcessor({
      pdf: (async () => 'synthetic PDF text') as unknown as NonNullable<IngestionAdapters['pdf']>,
    });

    await expect(processor(v2Request(content, {
      operation: 'extract_text',
      options: {},
    }), content)).rejects.toThrow(SafeParserErrorCode.PARSER_FAILED);
  });

  it('fails unsupported V2 transition operations without invoking a legacy adapter', async () => {
    let invoked = false;
    const processor = createTransitionParserStageProcessor({
      pdf: async () => {
        invoked = true;
        return v2Stage();
      },
    });
    const content = Buffer.from('%PDF layout fixture');

    await expect(processor(v2Request(content, { operation: 'detect_layout' }), content)).rejects.toThrow(
      SafeParserErrorCode.UNSUPPORTED_OPERATION,
    );
    expect(invoked).toBe(false);
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

      let failure: unknown;
      try {
        await badPending;
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain(SafeParserErrorCode.INVALID_RESPONSE);
      expect((failure as Error).message).not.toMatch(/secret|manuscript/i);
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

      await expect(processParserJobsOnce(jobDir, async () => {
        invoked = true;
        return v2Stage('downgraded');
      })).resolves.toBe(1);
      expect(invoked).toBe(false);
      expect(await readdir(jobDir)).toEqual([]);
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
      const content = Buffer.from('%PDF delayed');
      const submit = createParserStageJobClient(jobDir, parserMetadata, 30);
      await expect(submit(v2Request(content), content)).rejects.toThrow(/timeout/);
      expect(await readdir(jobDir)).toEqual(expect.arrayContaining([expect.stringMatching(/\.cancelled$/)]));
      let invoked = false;
      await processParserJobsOnce(jobDir, async () => { invoked = true; return v2Stage('late'); });
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
      const content = Buffer.from('%PDF racing');
      const submit = createParserStageJobClient(jobDir, parserMetadata, 40);
      const pending = submit(v2Request(content), content);
      await expect.poll(async () => (
        (await readdir(jobDir)).some((name) => name.endsWith('.request.json'))
      ), { interval: 5, timeout: 1_000 }).toBe(true);
      const processing = processParserJobsOnce(jobDir, async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return v2Stage('late response');
      });
      await expect(pending).rejects.toThrow(/timeout/);
      await processing;
      expect((await readdir(jobDir)).filter((name) => name !== '.ready')).toEqual([]);
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });
});
