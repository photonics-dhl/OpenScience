import { describe, expect, it } from 'vitest';
import { createDefaultIngestionAdapters, parseIngestion, parseIngestionWithAdapters } from '../src/ingestion-parser';
import { runParserSelfTest } from '../src/parser-self-test';

describe('parseIngestion', () => {
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

  it('使用受控 PDF adapter 返回正文，并拒绝过大输入', async () => {
    const adapters = { pdf: async (content: Buffer) => `PDF:${content.length}` };
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.from('%PDF-1.7'), adapters)).resolves.toMatchObject({ status: 'ready', format: 'pdf', text: 'PDF:8' });
    await expect(parseIngestionWithAdapters('paper.pdf', Buffer.alloc(20 * 1024 * 1024 + 1), adapters)).resolves.toMatchObject({ status: 'needs_review', reason: 'parser-input-too-large' });
  });

  it('图片优先使用本地 OCR adapter', async () => {
    const adapters = { image: async () => 'Measured signal and fitted curve' };
    await expect(parseIngestionWithAdapters('figure.png', Buffer.from('\x89PNG\r\n\x1a\n'), adapters)).resolves.toMatchObject({ status: 'ready', format: 'png', text: 'Measured signal and fitted curve' });
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
  it('extracts deterministic text from realistic PDF and DOCX fixtures', async () => {
    await expect(runParserSelfTest()).resolves.toEqual({
      pdf: { format: 'pdf', status: 'ready', textMatched: true },
      docx: { format: 'docx', status: 'ready', textMatched: true },
    });
  });
});
