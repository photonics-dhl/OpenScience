import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';
import { createWorkerParserCascade } from '../src/index';
import { sourceMapToManuscriptText } from '../src/extractor';
import { createDefaultIngestionAdapters, parseIngestion, parseIngestionWithAdapters } from '../src/ingestion-parser';
import { runParserCascadeSelfTest, runParserSelfTest } from '../src/parser-self-test';
import { TRANSITION_PARSER_METADATA } from '../src/parser-job-isolation';

describe('parseIngestion', () => {
  it.each([
    ['paper.pdf', 'application/pdf', '%PDF-1.7', 'Native PDF evidence'],
    ['paper.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'PK fixture', 'Native DOCX evidence'],
    ['scan.png', 'image/png', '\x89PNG fixture', 'Scanned OCR evidence'],
  ])('production cascade uses one V2 parser stage for %s and keeps candidate fallback disabled', async (
    filename, mediaType, raw, extractedText,
  ) => {
    const content = Buffer.from(raw, 'utf8');
    const stageAdapter = vi.fn().mockImplementation(async () => ({
      schemaVersion: 2,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: [{
          kind: 'paragraph', text: extractedText,
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
    }));
    const ocr = vi.fn();
    const cascade = createWorkerParserCascade(
      { ocr } as unknown as AiGateway,
      stageAdapter,
    );

    const result = await cascade({
      artifactId: filename,
      contentHash: createHash('sha256').update(content).digest('hex'),
      content,
      mediaType,
    }, {
      trustedAuthorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'actor-1' },
      externalProcessingEligible: true,
    });

    expect(result.status).toBe('succeeded');
    expect(result.status === 'succeeded' && sourceMapToManuscriptText(result.sourceMap)).toContain(extractedText);
    expect(stageAdapter).toHaveBeenCalledTimes(1);
    expect(stageAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: 2, operation: 'extract_text', mediaType }),
      expect.any(Buffer),
    );
    expect(ocr).not.toHaveBeenCalled();
  });

  it('解码 markdown 与 tex', () => {
    expect(parseIngestion('paper.md', Buffer.from('# Title\n正文'))).toMatchObject({ status: 'ready', format: 'md' });
    expect(parseIngestion('paper.tex', Buffer.from('\\section{Title}'))).toMatchObject({ status: 'ready', format: 'tex' });
  });
  it('二进制格式不伪造正文，进入人工复核', () => {
    expect(parseIngestion('paper.pdf', Buffer.from('%PDF-1.7'))).toMatchObject({ status: 'needs_review', format: 'pdf' });
    expect(parseIngestion('figure.png', Buffer.from('\x89PNG\r\n\x1a\n'))).toMatchObject({ status: 'needs_review', format: 'png' });
  });

  it('未配置二进制解析器时保留 needs_review 合同', () => {
    expect(parseIngestion('paper.docx', Buffer.from('PK\\x03\\x04'))).toMatchObject({
      status: 'needs_review', format: 'docx', reason: 'binary-parser-not-mounted',
    });
  });

  it('使用受控 PDF adapter 接受真实论文大小，并拒绝超过 50 MB 的输入', async () => {
    const adapters = { pdf: async (content: Buffer) => `PDF:${content.length}` };
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.from('%PDF-1.7'), adapters)).resolves.toMatchObject({ status: 'ready', format: 'pdf', text: 'PDF:8' });
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.alloc(24_671_920), adapters)).resolves.toMatchObject({ status: 'ready', format: 'pdf', text: 'PDF:24671920' });
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.alloc(50 * 1024 * 1024 + 1), adapters)).resolves.toMatchObject({ status: 'needs_review', reason: 'parser-input-too-large' });
  });

  it('图片优先使用本地 OCR adapter', async () => {
    const adapters = { image: async () => 'Measured signal and fitted curve' };
    await expect(parseIngestionWithAdapters('figure.png', Buffer.from('\x89PNG\r\n\x1a\n'), adapters)).resolves.toMatchObject({ status: 'ready', format: 'png', text: 'Measured signal and fitted curve' });
  });

  it('将仅含页面标记和控制字符的解析输出送入人工复核', async () => {
    const adapters = { pdf: async () => '\f\n-- 1 of 1 --\n' };
    await expect(parseIngestionWithAdapters('scan.pdf', Buffer.from('%PDF-1.7'), adapters)).resolves.toMatchObject({
      status: 'needs_review', format: 'pdf', reason: 'empty-parsed-text',
    });
  });

  it('将不含 Unicode 字母或数字的解析输出送入人工复核', async () => {
    const adapters = { pdf: async () => '★—' };
    await expect(parseIngestionWithAdapters('scan.pdf', Buffer.from('%PDF-1.7'), adapters)).resolves.toMatchObject({
      status: 'needs_review', format: 'pdf', reason: 'empty-parsed-text',
    });
  });

  it('默认 PDF adapter 对损坏文件返回 needs_review 而不是把 worker 打崩', async () => {
    const result = await parseIngestionWithAdapters('paper.pdf', Buffer.from('%PDF-1.7'), createDefaultIngestionAdapters());
    expect(result).toMatchObject({ status: 'needs_review', format: 'pdf', reason: 'parser-failed' });
  });

  it('默认 DOCX adapter 对损坏容器返回 needs_review', async () => {
    const result = await parseIngestionWithAdapters('paper.docx', Buffer.from('PK\\x03\\x04'), createDefaultIngestionAdapters());
    expect(result).toMatchObject({ status: 'needs_review', format: 'docx', reason: 'parser-failed' });
  });
});

describe('production parser self-test', () => {
  it('requires V2 native text plus deterministic scan OCR text/locator through the real cascade seam', async () => {
    const parserJobAdapter = vi.fn(async (request, content: Buffer) => {
      if (request.mediaType === 'image/png') {
        expect(content.readUInt32BE(16)).toBe(305);
        expect(content.readUInt32BE(20)).toBe(55);
        expect(content[25]).toBe(0); // grayscale: no alpha channel may hide the glyphs
        expect(createHash('sha256').update(content).digest('hex'))
          .toBe('d96594ae3c33e18c43e0162d8def9055dc32c88ba1788e6154b1dbce0bbb0b9d');
      }
      return ({
      schemaVersion: 2 as const,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: [{
          kind: 'paragraph' as const,
          text: request.mediaType === 'image/png' ? 'OCR 42 FS' : 'OpenScience evidence document',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
      });
    });
    const ocr = vi.fn();
    const cascade = createWorkerParserCascade({ ocr } as never, parserJobAdapter);

    await expect(runParserCascadeSelfTest(cascade)).resolves.toEqual({
      schemaVersion: 2,
      pdf: { format: 'pdf', status: 'ready', textMatched: true },
      docx: { format: 'docx', status: 'ready', textMatched: true },
      scan: { format: 'png', status: 'ready', textMatched: true, locatorMatched: true },
      candidateFallbackDisabled: true,
    });
    expect(parserJobAdapter).toHaveBeenCalledTimes(3);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('fails closed when the composed OCR stage returns no scan text', async () => {
    const parserJobAdapter = vi.fn(async (request) => ({
      schemaVersion: 2 as const,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: request.mediaType === 'image/png' ? [] : [{
          kind: 'paragraph' as const, text: 'OpenScience evidence document',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
    }));
    const cascade = createWorkerParserCascade({ ocr: vi.fn() } as never, parserJobAdapter);

    await expect(runParserCascadeSelfTest(cascade)).rejects.toThrow(/scan OCR text\/locator/);
  });

  it('fails closed when the observable production composition enables candidate fallback', async () => {
    const parserJobAdapter = vi.fn(async (request) => ({
      schemaVersion: 2 as const,
      parser: TRANSITION_PARSER_METADATA,
      pages: [{
        page: 1, width: 1000, height: 24,
        blocks: [{
          kind: 'paragraph' as const,
          text: request.mediaType === 'image/png' ? 'OCR 42 FS' : 'OpenScience evidence document',
          boundingBox: { x: 0, y: 0, width: 1000, height: 24 }, confidence: 1,
        }],
      }],
      warnings: [],
    }));
    const productionCascade = createWorkerParserCascade({ ocr: vi.fn() } as never, parserJobAdapter);
    const candidateEnabledCascade = Object.assign(
      async (...args: Parameters<typeof productionCascade>) => productionCascade(...args),
      { featureFlags: { ...productionCascade.featureFlags, llmOcr: true } },
    );

    await expect(runParserCascadeSelfTest(candidateEnabledCascade)).rejects.toThrow(/candidate fallback enabled/);
    expect(parserJobAdapter).not.toHaveBeenCalled();
  });

  it('extracts deterministic text from realistic PDF and DOCX fixtures', async () => {
    await expect(runParserSelfTest()).resolves.toEqual({
      pdf: { format: 'pdf', status: 'ready', textMatched: true },
      docx: { format: 'docx', status: 'ready', textMatched: true },
    });
  });
});
