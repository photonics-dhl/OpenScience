import { extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import type { Readable } from 'node:stream';
import type { Archiver, ZipOptions } from 'archiver';
import katex from 'katex';
import { VIRTUAL_LINE_HEIGHT, VIRTUAL_PAGE_WIDTH } from '@openscience/domain/virtual-page';
import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  parseParserStageResult,
  SafeParserWarningCode,
  type ParserStageResult,
  type StagePage,
} from './parsers/job-protocol';
import type { DocumentParser, ParserInput } from './parsers/types';

export type ParsedIngestion =
  | { status: 'ready'; text: string; format: string }
  | { status: 'needs_review'; format: string; reason: string };

export interface IngestionAdapters {
  pdf?: (content: Buffer) => Promise<ParserStageResult>;
  docx?: (content: Buffer) => Promise<string>;
  pptx?: (content: Buffer) => Promise<ParserStageResult>;
  html?: (content: Buffer) => Promise<ParserStageResult>;
  image?: (content: Buffer) => Promise<string>;
  xlsx?: (content: Buffer) => Promise<ParserStageResult>;
}

type DoclingRecord = Record<string, unknown>;

const loadRuntimeModule = createRequire(__filename);
// Match ScientificText's per-expression rendering budget; compatibility is not
// a claim that the recognised formula is scientifically correct.
const MAX_DOCLING_FORMULA_CHARS = 4_000;

function formulaBody(text: string): string {
  if ((text.startsWith('\\[') && text.endsWith('\\]'))
    || (text.startsWith('\\(') && text.endsWith('\\)'))
    || (text.startsWith('$$') && text.endsWith('$$'))) {
    return text.slice(2, -2);
  }
  if (text.startsWith('$') && text.endsWith('$')) return text.slice(1, -1);
  return text;
}

function isRendererCompatibleFormula(text: string): boolean {
  if (!text || text.includes('\uFFFD') || text.length > MAX_DOCLING_FORMULA_CHARS) return false;
  const body = formulaBody(text);
  if (!body.trim()) return false;
  try {
    katex.renderToString(body, {
      displayMode: true,
      throwOnError: true,
      strict: 'error',
      trust: false,
      maxExpand: 200,
      maxSize: 10,
      output: 'html',
    });
    return true;
  } catch {
    return false;
  }
}

function record(value: unknown): DoclingRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DoclingRecord : undefined;
}

function doclingPageSize(document: DoclingRecord, pageNumber: number): { width: number; height: number } {
  const pages = record(document.pages);
  const page = record(pages?.[String(pageNumber)] ?? (Array.isArray(document.pages) ? document.pages[pageNumber - 1] : undefined));
  const size = record(page?.size);
  const width = typeof size?.width === 'number' && size.width > 0 ? size.width : 612;
  const height = typeof size?.height === 'number' && size.height > 0 ? size.height : 792;
  return { width, height };
}

function doclingBoundingBox(value: unknown, page: { width: number; height: number }) {
  const bbox = record(value);
  const values = Array.isArray(value) && value.length === 4 ? value : undefined;
  const left = typeof bbox?.l === 'number' ? bbox.l : typeof values?.[0] === 'number' ? values[0] : 0;
  const top = typeof bbox?.t === 'number' ? bbox.t : typeof values?.[1] === 'number' ? values[1] : page.height;
  const right = typeof bbox?.r === 'number' ? bbox.r : typeof values?.[2] === 'number' ? values[2] : page.width;
  const bottom = typeof bbox?.b === 'number' ? bbox.b : typeof values?.[3] === 'number' ? values[3] : 0;
  const origin = typeof bbox?.coord_origin === 'string' ? bbox.coord_origin : 'BOTTOMLEFT';
  const x = Math.max(0, Math.min(page.width - 0.001, Math.min(left, right)));
  const width = Math.max(0.001, Math.min(page.width - x, Math.abs(right - left)));
  const rawY = origin === 'TOPLEFT' ? Math.min(top, bottom) : page.height - Math.max(top, bottom);
  const y = Math.max(0, Math.min(page.height - 0.001, rawY));
  const height = Math.max(0.001, Math.min(page.height - y, Math.abs(top - bottom)));
  return { x, y, width, height };
}

function doclingKind(label: unknown): 'heading' | 'paragraph' | 'equation' | 'caption' | 'reference' {
  if (label === 'title' || label === 'section_header') return 'heading';
  if (label === 'formula') return 'equation';
  if (label === 'caption') return 'caption';
  if (label === 'reference') return 'reference';
  return 'paragraph';
}

function doclingResult(payload: unknown, formulaEnrichment: boolean): ParserStageResult {
  const response = record(payload);
  const documentResponse = record(response?.document);
  const document = record(documentResponse?.json_content);
  if (!response || !documentResponse || !document || !['success', 'partial_success'].includes(String(response.status))) {
    throw new Error('Docling returned no usable document');
  }
  const byPage = new Map<number, StagePage['blocks']>();
  let unreadableFormula = false;
  const append = (itemValue: unknown, forcedKind?: 'table' | 'figure') => {
    const item = record(itemValue);
    const provenance = Array.isArray(item?.prov) ? item.prov : [];
    const recognizedText = typeof item?.text === 'string' ? item.text.trim() : '';
    let text = recognizedText || (typeof item?.orig === 'string' && item.orig.trim() ? item.orig.trim() : undefined);
    let unreliableFormula = false;
    if (item?.label === 'formula') {
      unreliableFormula = !formulaEnrichment || !isRendererCompatibleFormula(recognizedText);
      if (unreliableFormula) {
        text = typeof item.orig === 'string' && item.orig.trim() ? item.orig.trim() : undefined;
        // Keep the native source fallback and its page/bbox; never guess missing symbols.
        unreadableFormula = true;
      } else if (!(recognizedText.startsWith('\\[') && recognizedText.endsWith('\\]'))
        && !(recognizedText.startsWith('$$') && recognizedText.endsWith('$$'))
        && !(recognizedText.startsWith('\\(') && recognizedText.endsWith('\\)'))
        && !(recognizedText.startsWith('$') && recognizedText.endsWith('$'))) {
        // Docling's enabled formula stage writes LaTeX to TextItem.text.
        // Delimit it for downstream understanding/display without changing the expression.
        text = `\\[${recognizedText}\\]`;
      }
    }
    for (const provenanceValue of provenance) {
      const prov = record(provenanceValue);
      const pageNumber = typeof prov?.page_no === 'number' && Number.isInteger(prov.page_no) && prov.page_no > 0 ? prov.page_no : 1;
      const page = doclingPageSize(document, pageNumber);
      const kind = forcedKind ?? doclingKind(item?.label);
      const block = {
        kind,
        ...(text ? { text } : {}),
        boundingBox: doclingBoundingBox(prov?.bbox, page),
        ...(unreliableFormula ? { confidence: 0 } : {}),
      };
      byPage.set(pageNumber, [...(byPage.get(pageNumber) ?? []), block]);
    }
  };
  for (const item of Array.isArray(document.texts) ? document.texts : []) append(item);
  for (const item of Array.isArray(document.tables) ? document.tables : []) append(item, 'table');
  for (const item of Array.isArray(document.pictures) ? document.pictures : []) append(item, 'figure');
  if (byPage.size === 0 && typeof documentResponse.text_content === 'string' && documentResponse.text_content.trim()) {
    byPage.set(1, [{ kind: 'paragraph', text: documentResponse.text_content.trim(), boundingBox: { x: 0, y: 0, width: 612, height: 792 } }]);
  }
  if (byPage.size === 0) throw new Error('Docling produced no source-located content');
  const pages = [...byPage.entries()].sort(([left], [right]) => left - right).map(([pageNumber, blocks]) => {
    const size = doclingPageSize(document, pageNumber);
    return { page: pageNumber, ...size, blocks };
  });
  return parseParserStageResult({
    schemaVersion: 2,
    parser: { name: 'docling-serve-cpu', version: '1.30.0' },
    pages,
    warnings: [
      ...(response.status === 'partial_success' ? ['partial_result'] : []),
      ...(unreadableFormula ? ['low_confidence'] : []),
    ],
  });
}

async function runDoclingDocument(
  content: Buffer,
  serviceUrl: string,
  input: { format: 'pdf' | 'pptx' | 'html'; mediaType: string; filename: string },
): Promise<ParserStageResult> {
  const formulaEnrichment = input.format === 'pdf' && process.env.DOCLING_FORMULA_ENRICHMENT === 'true';
  const doclingContent = input.format === 'html' ? sanitizeHtmlForDocling(content)
    : input.format === 'pptx' ? await sanitizePptxForDocling(content) : content;
  const form = new FormData();
  form.append('files', new Blob([doclingContent], { type: input.mediaType }), input.filename);
  form.append('from_formats', input.format);
  form.append('to_formats', 'json');
  form.append('to_formats', 'text');
  form.append('image_export_mode', 'placeholder');
  if (input.format === 'pdf') {
    form.append('pdf_backend', 'dlparse_v2');
    // Born-digital PDFs use Docling layout/text. Existing page-quality routing invokes
    // isolated Tesseract or authorized vision OCR only for unreadable pages.
    form.append('do_ocr', 'false');
    form.append('force_ocr', 'false');
  }
  form.append('do_table_structure', 'true');
  form.append('do_formula_enrichment', formulaEnrichment ? 'true' : 'false');
  form.append('abort_on_error', 'false');
  const baseUrl = serviceUrl.replace(/\/$/u, '');
  const submission = await fetch(`${baseUrl}/v1/convert/file/async`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(60_000),
  });
  if (!submission.ok) throw new Error(`Docling submission failed: ${submission.status}`);
  const task = record(await submission.json());
  if (typeof task?.task_id !== 'string' || !task.task_id) throw new Error('Docling returned no task id');
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${baseUrl}/v1/status/poll/${encodeURIComponent(task.task_id)}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!statusResponse.ok) throw new Error(`Docling status failed: ${statusResponse.status}`);
    const status = record(await statusResponse.json());
    if (status?.task_status === 'failure') throw new Error('Docling task failed');
    if (status?.task_status === 'success') {
      const result = await fetch(`${baseUrl}/v1/result/${encodeURIComponent(task.task_id)}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!result.ok) throw new Error(`Docling result failed: ${result.status}`);
      return doclingResult(await result.json(), formulaEnrichment);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Docling task timed out');
}

export type LegacyIngestionAdapters = Omit<IngestionAdapters, 'pdf'> & {
  pdf?: (content: Buffer) => Promise<string | ParserStageResult>;
};

const PARSER_TIMEOUT_MS = 60_000;
const MAX_PARSED_TEXT_CHARS = 5 * 1024 * 1024;
const ISOLATED_PARSER_SOURCE = `
(async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const content = Buffer.concat(chunks);
  const kind = process.argv[1];
  if (kind !== 'docx') throw new Error('unsupported isolated parser');
  const text = (await require('mammoth').extractRawText({ buffer: content })).value;
  if (text.length > ${MAX_PARSED_TEXT_CHARS}) throw new Error('parsed text too large');
  process.stdout.write(text);
})().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`;
const ISOLATED_TYPESCRIPT_STAGE_SOURCE = `
(async () => {
  const { readFileSync } = require('node:fs');
  const ts = require('typescript');
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    module._compile(ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText, filename);
  };
  const modulePath = process.argv[1];
  const stage = process.argv[2];
  const maxInput = Number(process.argv[3]);
  const maxOutput = Number(process.argv[4]);
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxInput) throw new Error('xlsx parser input too large');
    chunks.push(chunk);
  }
  const parser = require(modulePath);
  const parse = stage === 'pdf' ? parser.parseStructuredPdfResult
    : stage === 'xlsx' ? parser.parseStructuredXlsxResult : undefined;
  if (typeof parse !== 'function') throw new Error('unsupported structured parser stage');
  const serialized = JSON.stringify(await parse(Buffer.concat(chunks, size)));
  if (Buffer.byteLength(serialized) > maxOutput) throw new Error('xlsx parser output too large');
  process.stdout.write(serialized);
})().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`;
const MAX_ZIP_ENTRIES = 256;
const MAX_ZIP_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_EXPANDED_BYTES = 24 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const MAX_PPTX_ZIP_ENTRIES = 4_096;
const MAX_PPTX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_PPTX_EXPANDED_BYTES = 384 * 1024 * 1024;
const MAX_PPTX_RELATIONSHIP_BYTES = 512 * 1024;
const MAX_PPTX_RELATIONSHIP_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_PPTX_SANITIZED_XML_BYTES = 4 * 1024 * 1024;
const MAX_PPTX_SANITIZED_XML_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_PPTX_SANITIZED_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_SHARED_STRINGS = 100_000;
const MAX_XLSX_CELLS = 9_900;
const MAX_XLSX_BLOCKS = 10_000;
const MAX_XML_ENTITIES = 100_000;
const MAX_XML_NODES = 200_000;
const MAX_XML_NAMESPACE_DECLARATIONS = 4_096;
const MAX_XLSX_COLUMN = 16_384;
const MAX_XLSX_ROW = 1_048_576;
const XLSX_TRANSITION_PARSER_METADATA = Object.freeze({ name: 'v1-text-transition', version: '2.0.0' });
const MAX_XLSX_CELL_TEXT_CHARS = 32 * 1024;
const MAX_XLSX_MATERIALIZED_TEXT_CHARS = 4 * 1024 * 1024;
const MAX_XLSX_MATERIALIZED_OUTPUT_BYTES = PARSER_JOB_RESPONSE_MAX_BYTES - 1024;

interface ZipEntry {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  generalPurposeBitFlag: number;
}

interface ZipFile {
  entryCount: number;
  readEntry(): void;
  close(): void;
  on(event: 'entry', listener: (entry: ZipEntry) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  openReadStream(
    entry: ZipEntry,
    callback: (error: Error | null, stream?: Readable) => void,
  ): void;
}

interface YauzlModule {
  fromBuffer(
    content: Buffer,
    options: { lazyEntries: boolean; decodeStrings: boolean; validateEntrySizes: boolean },
    callback: (error: Error | null, zipFile?: ZipFile) => void,
  ): void;
}

export class XlsxParsingLimitError extends Error {}

const yauzl = loadRuntimeModule('yauzl') as YauzlModule;
const archiverFactory = loadRuntimeModule('archiver') as (format: 'zip', options?: ZipOptions) => Archiver;

function decodeUtf8(content: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
}

function sanitizeHtmlForDocling(content: Buffer): Buffer {
  const text = decodeUtf8(content);
  const withoutHtml5Doctype = text.replace(/<!doctype\s+html\s*>/giu, '');
  if (!text.trim() || text.includes('\u0000')
    || /<!DOCTYPE|<!ENTITY|<script\b|on[a-z]+\s*=|<(?:iframe|object|embed)\b/iu.test(withoutHtml5Doctype)) {
    throw new Error('active or externally linked HTML is not accepted');
  }
  let unmatched = withoutHtml5Doctype;
  for (const match of withoutHtml5Doctype.matchAll(/\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu)) {
    const raw = match[1]!;
    const target = (raw.startsWith('"') || raw.startsWith("'")) ? raw.slice(1, -1).trim() : raw.trim();
    if (target.startsWith('\\\\') || target.startsWith('//')) throw new Error('unsafe HTML link target');
    const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(target)?.[1]?.toLowerCase();
    if (scheme && !['http', 'https', 'mailto'].includes(scheme)) throw new Error('unsafe HTML link target');
    unmatched = unmatched.replace(match[0], '');
  }
  if (/\bhref\s*=/iu.test(unmatched)) throw new Error('malformed HTML link target');
  const inert = text
    .replace(/<style\b[^>]*>[\s\S]*?(?:<\/style\s*>|$)/giu, '')
    .replace(/<(?:meta|link|base)\b[^>]*>/giu, '')
    .replace(/\s+(?:(?:xlink:)?href|src|srcset|action|formaction|poster|background|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '');
  return Buffer.from(inert, 'utf8');
}

function readZipEntry(zipFile: ZipFile, entry: ZipEntry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('ZIP entry stream unavailable'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > entry.uncompressedSize || size > MAX_ZIP_ENTRY_BYTES) {
          stream.destroy(new XlsxParsingLimitError());
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.once('error', reject);
      stream.once('end', () => {
        if (size !== entry.uncompressedSize) reject(new Error('ZIP entry size mismatch'));
        else resolve(Buffer.concat(chunks, size));
      });
    });
  });
}

function isRelevantXlsxEntry(fileName: string): boolean {
  return fileName === 'xl/workbook.xml'
    || fileName === 'xl/_rels/workbook.xml.rels'
    || fileName === 'xl/sharedStrings.xml'
    || /^xl\/worksheets\/[^/]+\.xml$/u.test(fileName);
}

function readBoundedXlsxEntries(content: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(content, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
    }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('ZIP unavailable'));
        return;
      }
      let settled = false;
      let entryCount = 0;
      let expandedBytes = 0;
      const entries = new Map<string, Buffer>();
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };
      if (zipFile.entryCount > MAX_ZIP_ENTRIES) {
        fail(new XlsxParsingLimitError());
        return;
      }
      zipFile.on('error', fail);
      zipFile.on('entry', (entry) => {
        void (async () => {
          entryCount += 1;
          if (entryCount > MAX_ZIP_ENTRIES || (entry.generalPurposeBitFlag & 0x1) !== 0) {
            throw new XlsxParsingLimitError();
          }
          if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new XlsxParsingLimitError();
          expandedBytes += entry.uncompressedSize;
          if (expandedBytes > MAX_ZIP_EXPANDED_BYTES) throw new XlsxParsingLimitError();
          if (entry.uncompressedSize > 0
            && entry.uncompressedSize / Math.max(1, entry.compressedSize) > MAX_ZIP_COMPRESSION_RATIO) {
            throw new XlsxParsingLimitError();
          }
          if (!entry.fileName.endsWith('/') && isRelevantXlsxEntry(entry.fileName)) {
            if (entries.has(entry.fileName)) throw new Error('duplicate XLSX ZIP member');
            entries.set(entry.fileName, await readZipEntry(zipFile, entry));
          }
          zipFile.readEntry();
        })().catch(fail);
      });
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });
      zipFile.readEntry();
    });
  });
}

function openZipEntryStream(zipFile: ZipFile, entry: ZipEntry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error('ZIP entry stream unavailable'));
      else resolve(stream);
    });
  });
}

interface PptxSanitizationPlan {
  relationshipReplacements: Map<string, Buffer>;
  hyperlinkIdsByOwner: Map<string, Set<string>>;
}

function relationshipOwnerPath(path: string): string | undefined {
  const match = /^(.*\/)?_rels\/([^/]+)\.rels$/u.exec(path);
  return match ? `${match[1] ?? ''}${match[2]}` : undefined;
}

function inspectBoundedPptxContainer(content: Buffer): Promise<PptxSanitizationPlan> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(content, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (openError, zipFile) => {
      if (openError || !zipFile) { reject(openError ?? new Error('PPTX ZIP unavailable')); return; }
      let settled = false;
      let count = 0;
      let expandedBytes = 0;
      let relationshipBytes = 0;
      let hasContentTypes = false;
      let hasPresentation = false;
      const names = new Set<string>();
      const relationshipReplacements = new Map<string, Buffer>();
      const hyperlinkIdsByOwner = new Map<string, Set<string>>();
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };
      if (zipFile.entryCount > MAX_PPTX_ZIP_ENTRIES) { fail(new XlsxParsingLimitError()); return; }
      zipFile.on('error', fail);
      zipFile.on('entry', (entry) => {
        void (async () => {
          count += 1;
          if (count > MAX_PPTX_ZIP_ENTRIES || (entry.generalPurposeBitFlag & 0x1) !== 0
            || entry.uncompressedSize > MAX_PPTX_ENTRY_BYTES
            || entry.fileName.includes('\\') || entry.fileName.startsWith('/')
            || entry.fileName.split('/').includes('..') || names.has(entry.fileName)) throw new XlsxParsingLimitError();
          names.add(entry.fileName);
          expandedBytes += entry.uncompressedSize;
          if (expandedBytes > MAX_PPTX_EXPANDED_BYTES
            || (entry.uncompressedSize > 0 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > MAX_ZIP_COMPRESSION_RATIO)) {
            throw new XlsxParsingLimitError();
          }
          if (entry.fileName === '[Content_Types].xml') hasContentTypes = true;
          if (entry.fileName === 'ppt/presentation.xml') hasPresentation = true;
          if (!entry.fileName.endsWith('/') && entry.fileName.endsWith('.rels')) {
            relationshipBytes += entry.uncompressedSize;
            if (entry.uncompressedSize > MAX_PPTX_RELATIONSHIP_BYTES
              || relationshipBytes > MAX_PPTX_RELATIONSHIP_TOTAL_BYTES) throw new XlsxParsingLimitError();
            const sanitized = sanitizePptxRelationshipXml(await readZipEntry(zipFile, entry));
            if (sanitized.removedIds.size) {
              const owner = relationshipOwnerPath(entry.fileName);
              if (!owner) throw new Error('PPTX external hyperlink has no package owner');
              relationshipReplacements.set(entry.fileName, sanitized.content);
              hyperlinkIdsByOwner.set(owner, sanitized.removedIds);
            }
          }
          zipFile.readEntry();
        })().catch(fail);
      });
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        if (!hasContentTypes || !hasPresentation) reject(new Error('PPTX container is missing required members'));
        else resolve({ relationshipReplacements, hyperlinkIdsByOwner });
      });
      zipFile.readEntry();
    });
  });
}

interface XmlNode {
  name: string;
  localName: string;
  namespaceUri: string | undefined;
  attributes: ReadonlyMap<string, string>;
  attributeNamespaces: ReadonlyMap<string, string | undefined>;
  children: XmlNode[];
  text: string;
}

interface XmlParseFrame {
  node: XmlNode;
  pushedPrefixes: string[];
}

const XML_NAME = /^(?:[A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*$/u;
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const SPREADSHEETML_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WORKSHEET_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';

function isXml10Character(value: number): boolean {
  return value === 0x9 || value === 0xa || value === 0xd
    || (value >= 0x20 && value <= 0xd7ff)
    || (value >= 0xe000 && value <= 0xfffd)
    || (value >= 0x10000 && value <= 0x10ffff);
}

function assertXml10Characters(text: string): void {
  for (const character of text) {
    if (!isXml10Character(character.codePointAt(0)!)) throw new Error('invalid XML 1.0 character');
  }
}

function decodeXmlText(text: string): string {
  let decoded = '';
  for (let cursor = 0; cursor < text.length;) {
    const ampersand = text.indexOf('&', cursor);
    if (ampersand === -1) return decoded + text.slice(cursor);
    decoded += text.slice(cursor, ampersand);
    const semicolon = text.indexOf(';', ampersand + 1);
    if (semicolon === -1 || semicolon - ampersand > 41) throw new Error('malformed XML entity');
    const code = text.slice(ampersand + 1, semicolon);
    if (code === 'amp') decoded += '&';
    else if (code === 'lt') decoded += '<';
    else if (code === 'gt') decoded += '>';
    else if (code === 'quot') decoded += '"';
    else if (code === 'apos') decoded += "'";
    else {
      const numeric = /^#x([\da-f]+)$/iu.exec(code) ?? /^#(\d+)$/u.exec(code);
      if (!numeric) throw new Error('unsupported XML entity');
      const value = Number.parseInt(numeric[1]!, code[1]!.toLowerCase() === 'x' ? 16 : 10);
      if (!Number.isInteger(value) || !isXml10Character(value)) {
        throw new Error('invalid XML entity');
      }
      decoded += String.fromCodePoint(value);
    }
    cursor = semicolon + 1;
  }
  return decoded;
}

function boundedXml(content: Buffer): string {
  const xml = decodeUtf8(content);
  assertXml10Characters(xml);
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/iu.test(xml)) throw new XlsxParsingLimitError();
  let entityCount = 0;
  for (let start = xml.indexOf('&'); start !== -1; start = xml.indexOf('&', start + 1)) {
    const end = xml.indexOf(';', start + 1);
    if (end === -1 || end - start > 41) throw new XlsxParsingLimitError();
    entityCount += 1;
    if (entityCount > MAX_XML_ENTITIES) throw new XlsxParsingLimitError();
    start = end;
  }
  return xml;
}

function xmlLocalName(name: string): string {
  if (!XML_NAME.test(name)) throw new Error('malformed XML name');
  return name.slice(name.lastIndexOf(':') + 1);
}

function xmlPrefix(name: string): string | undefined {
  const separator = name.indexOf(':');
  return separator === -1 ? undefined : name.slice(0, separator);
}

function pushNamespaceDeclarations(
  attributes: ReadonlyMap<string, string>,
  namespaceStacks: Map<string, string[]>,
  declarationCount: number,
): { pushedPrefixes: string[]; declarationCount: number } {
  let additions = 0;
  for (const [name, value] of attributes) {
    if (name !== 'xmlns' && !name.startsWith('xmlns:')) continue;
    additions += 1;
    const prefix = name === 'xmlns' ? '' : name.slice('xmlns:'.length);
    if ((name !== 'xmlns' && !prefix) || prefix === 'xmlns'
      || (prefix === 'xml' && value !== XML_NAMESPACE) || !value) {
      throw new Error('invalid XML namespace binding');
    }
  }
  if (declarationCount + additions > MAX_XML_NAMESPACE_DECLARATIONS) throw new XlsxParsingLimitError();
  const pushedPrefixes: string[] = [];
  for (const [name, value] of attributes) {
    if (name !== 'xmlns' && !name.startsWith('xmlns:')) continue;
    const prefix = name === 'xmlns' ? '' : name.slice('xmlns:'.length);
    const values = namespaceStacks.get(prefix) ?? [];
    values.push(value);
    namespaceStacks.set(prefix, values);
    pushedPrefixes.push(prefix);
  }
  return { pushedPrefixes, declarationCount: declarationCount + additions };
}

function rollbackNamespaceDeclarations(
  namespaceStacks: Map<string, string[]>,
  pushedPrefixes: readonly string[],
): void {
  for (let index = pushedPrefixes.length - 1; index >= 0; index -= 1) {
    const prefix = pushedPrefixes[index]!;
    const values = namespaceStacks.get(prefix);
    if (!values) throw new Error('XML namespace scope mismatch');
    values.pop();
    if (values.length === 0) namespaceStacks.delete(prefix);
  }
}

function namespaceForName(
  name: string,
  namespaceStacks: ReadonlyMap<string, readonly string[]>,
  attribute = false,
): string | undefined {
  const prefix = xmlPrefix(name);
  if (prefix === undefined) return attribute ? undefined : namespaceStacks.get('')?.at(-1);
  const namespaceUri = namespaceStacks.get(prefix)?.at(-1);
  if (!namespaceUri) throw new Error('unbound XML namespace prefix');
  return namespaceUri;
}

function xmlTagEnd(xml: string, start: number): number {
  let quote = '';
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index]!;
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  throw new Error('unterminated XML tag');
}

function parseXmlStartTag(
  source: string,
  remainingNamespaceDeclarations: number,
): { name: string; attributes: Map<string, string>; selfClosing: boolean } {
  const body = source.trim();
  const selfClosing = body.endsWith('/');
  const content = selfClosing ? body.slice(0, -1).trimEnd() : body;
  const nameMatch = /^([^\s/>]+)/u.exec(content);
  if (!nameMatch || !XML_NAME.test(nameMatch[1]!)) throw new Error('malformed XML opening tag');
  const name = nameMatch[1]!;
  const attributes = new Map<string, string>();
  let namespaceDeclarations = 0;
  let cursor = name.length;
  while (cursor < content.length) {
    while (/\s/u.test(content[cursor]!)) cursor += 1;
    if (cursor === content.length) break;
    const attributeMatch = /^([^\s=/>]+)\s*=\s*/u.exec(content.slice(cursor));
    if (!attributeMatch || !XML_NAME.test(attributeMatch[1]!)) throw new Error('malformed XML attribute');
    const attributeName = attributeMatch[1]!;
    if (attributeName === 'xmlns' || attributeName.startsWith('xmlns:')) {
      namespaceDeclarations += 1;
      if (namespaceDeclarations > remainingNamespaceDeclarations) throw new XlsxParsingLimitError();
    }
    cursor += attributeMatch[0].length;
    const quote = content[cursor];
    if (quote !== '"' && quote !== "'") throw new Error('XML attribute must be quoted');
    const end = content.indexOf(quote, cursor + 1);
    if (end === -1) throw new Error('unterminated XML attribute');
    const rawValue = content.slice(cursor + 1, end);
    if (rawValue.includes('<')) throw new Error('raw less-than in XML attribute');
    if (attributes.has(attributeName)) throw new Error('duplicate XML attribute');
    attributes.set(attributeName, decodeXmlText(rawValue));
    cursor = end + 1;
  }
  return { name, attributes, selfClosing };
}

function parseStrictXml(content: Buffer): XmlNode {
  const xml = boundedXml(content);
  const stack: XmlParseFrame[] = [];
  const namespaceStacks = new Map<string, string[]>([['xml', [XML_NAMESPACE]]]);
  let root: XmlNode | undefined;
  let cursor = 0;
  let nodeCount = 0;
  let declarationCount = 0;
  const appendText = (text: string) => {
    if (!text) return;
    if (text.includes(']]>')) throw new Error('forbidden XML text terminator');
    if (stack.length === 0) {
      if (text.trim()) throw new Error('XML content outside root element');
      return;
    }
    stack[stack.length - 1]!.node.text += decodeXmlText(text);
  };
  while (cursor < xml.length) {
    const opening = xml.indexOf('<', cursor);
    if (opening === -1) {
      appendText(xml.slice(cursor));
      break;
    }
    appendText(xml.slice(cursor, opening));
    if (xml.startsWith('<?', opening)) {
      const close = xml.indexOf('?>', opening + 2);
      if (close === -1 || stack.length > 0 || root) throw new Error('invalid XML processing instruction');
      cursor = close + 2;
      continue;
    }
    if (xml.startsWith('<!', opening)) throw new Error('unsupported XML declaration');
    const close = xmlTagEnd(xml, opening + 1);
    const tag = xml.slice(opening + 1, close);
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      if (!XML_NAME.test(name) || stack.length === 0 || stack[stack.length - 1]!.node.name !== name) {
        throw new Error('mismatched XML closing tag');
      }
      const frame = stack.pop()!;
      rollbackNamespaceDeclarations(namespaceStacks, frame.pushedPrefixes);
      declarationCount -= frame.pushedPrefixes.length;
    } else {
      if (root && stack.length === 0) throw new Error('multiple XML root elements');
      if (nodeCount >= MAX_XML_NODES) throw new XlsxParsingLimitError();
      const parsed = parseXmlStartTag(tag, MAX_XML_NAMESPACE_DECLARATIONS - declarationCount);
      const pushed = pushNamespaceDeclarations(parsed.attributes, namespaceStacks, declarationCount);
      declarationCount = pushed.declarationCount;
      const attributeNamespaces = new Map<string, string | undefined>();
      for (const name of parsed.attributes.keys()) {
        if (name !== 'xmlns' && !name.startsWith('xmlns:')) {
          attributeNamespaces.set(name, namespaceForName(name, namespaceStacks, true));
        }
      }
      const node: XmlNode = {
        name: parsed.name,
        localName: xmlLocalName(parsed.name),
        namespaceUri: namespaceForName(parsed.name, namespaceStacks),
        attributes: parsed.attributes,
        attributeNamespaces,
        children: [],
        text: '',
      };
      nodeCount += 1;
      if (stack.length === 0) root = node;
      else stack[stack.length - 1]!.node.children.push(node);
      if (!parsed.selfClosing) stack.push({ node, pushedPrefixes: pushed.pushedPrefixes });
      else {
        rollbackNamespaceDeclarations(namespaceStacks, pushed.pushedPrefixes);
        declarationCount -= pushed.pushedPrefixes.length;
      }
    }
    cursor = close + 1;
  }
  if (!root || stack.length) throw new Error('malformed XML document');
  return root;
}

function xmlEscape(value: string, attribute = false): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(attribute ? /"/gu : /$^/gu, '&quot;').replace(attribute ? /'/gu : /$^/gu, '&apos;');
}

function serializeStrictXml(node: XmlNode): string {
  const attributes = [...node.attributes].map(([name, value]) => ` ${name}="${xmlEscape(value, true)}"`).join('');
  const body = `${xmlEscape(node.text)}${node.children.map(serializeStrictXml).join('')}`;
  return body ? `<${node.name}${attributes}>${body}</${node.name}>` : `<${node.name}${attributes}/>`;
}

function sanitizePptxRelationshipXml(content: Buffer): { content: Buffer; removedIds: Set<string> } {
  const root = parseStrictXml(content);
  assertElement(root, 'Relationships', PACKAGE_RELATIONSHIPS_NAMESPACE);
  assertAttributes(root, []);
  assertOnlyChildren(root, ['Relationship'], PACKAGE_RELATIONSHIPS_NAMESPACE);
  const ids = new Set<string>();
  const removedIds = new Set<string>();
  for (const relationship of root.children) {
    assertAttributes(relationship, ['Id', 'Type', 'Target', 'TargetMode']);
    if (relationship.children.length || relationship.text.trim()) throw new Error('relationship must be empty');
    const id = relationship.attributes.get('Id');
    const type = relationship.attributes.get('Type');
    const target = relationship.attributes.get('Target');
    const mode = relationship.attributes.get('TargetMode');
    if (!id || !type || !target || ids.has(id)
      || (mode !== undefined && mode !== 'External' && mode !== 'Internal')) {
      throw new Error('malformed PPTX relationship');
    }
    ids.add(id);
    if (mode !== 'External') {
      if (/^[a-z][a-z\d+.-]*:/iu.test(target) || target.startsWith('//') || target.includes('\\')) {
        throw new Error('unsupported PPTX internal relationship target');
      }
      continue;
    }
    if (!type.endsWith('/hyperlink') || /[\u0000-\u001f\u007f\\]/u.test(target)
      || !/^(?:https?:\/\/|mailto:)/iu.test(target)) {
      throw new Error('unsupported PPTX external relationship');
    }
    removedIds.add(id);
  }
  root.children = root.children.filter((relationship) => !removedIds.has(relationship.attributes.get('Id') ?? ''));
  const sanitized = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${serializeStrictXml(root)}`, 'utf8');
  if (sanitized.byteLength > MAX_PPTX_RELATIONSHIP_BYTES) throw new XlsxParsingLimitError();
  return { content: sanitized, removedIds };
}

function sanitizePptxOwnerXml(content: Buffer, removedIds: ReadonlySet<string>): Buffer {
  if (content.byteLength > MAX_PPTX_SANITIZED_XML_BYTES) throw new XlsxParsingLimitError();
  const root = parseStrictXml(content);
  const removeReferences = (node: XmlNode): void => {
    node.children = node.children.filter((child) => {
      const relationshipId = [...child.attributes].find(([name]) => (
        name === 'r:id' || (child.attributeNamespaces.get(name) === OFFICE_RELATIONSHIPS_NAMESPACE && xmlLocalName(name) === 'id')
      ))?.[1];
      return !(['hlinkClick', 'hlinkHover'].includes(child.localName) && relationshipId && removedIds.has(relationshipId));
    });
    node.children.forEach(removeReferences);
  };
  removeReferences(root);
  const sanitized = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${serializeStrictXml(root)}`, 'utf8');
  if (sanitized.byteLength > MAX_PPTX_SANITIZED_XML_BYTES) throw new XlsxParsingLimitError();
  return sanitized;
}

async function sanitizePptxForDocling(content: Buffer): Promise<Buffer> {
  const plan = await inspectBoundedPptxContainer(content);
  if (plan.relationshipReplacements.size === 0) return content;

  const archive: Archiver = archiverFactory('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  let outputBytes = 0;
  let outputSettled = false;
  let outputError: unknown;
  let settleOutput!: () => void;
  const outputDone = new Promise<void>((resolve) => {
    settleOutput = resolve;
    archive.on('data', (chunk: Buffer) => {
      if (outputSettled) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_PPTX_SANITIZED_ARCHIVE_BYTES) {
        outputSettled = true;
        outputError = new XlsxParsingLimitError();
        archive.abort();
        resolve();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    archive.once('error', (error) => {
      if (outputSettled) return;
      outputSettled = true;
      outputError = error;
      resolve();
    });
    archive.once('end', () => {
      if (outputSettled) return;
      outputSettled = true;
      resolve();
    });
  });

  const seenRelationships = new Set<string>();
  const seenOwners = new Set<string>();
  let sanitizedXmlBytes = 0;
  let currentZipFile: ZipFile | undefined;
  const rewriteEntries = new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(content, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (openError, zipFile) => {
      if (openError || !zipFile) { reject(openError ?? new Error('PPTX ZIP unavailable')); return; }
      currentZipFile = zipFile;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };
      zipFile.on('error', fail);
      zipFile.on('entry', (entry) => {
        void (async () => {
          if (entry.fileName.endsWith('/')) {
            zipFile.readEntry();
            return;
          }

          const relationshipReplacement = plan.relationshipReplacements.get(entry.fileName);
          if (relationshipReplacement) {
            seenRelationships.add(entry.fileName);
            archive.append(relationshipReplacement, { name: entry.fileName });
            zipFile.readEntry();
            return;
          }

          const removedIds = plan.hyperlinkIdsByOwner.get(entry.fileName);
          if (removedIds) {
            sanitizedXmlBytes += entry.uncompressedSize;
            if (entry.uncompressedSize > MAX_PPTX_SANITIZED_XML_BYTES
              || sanitizedXmlBytes > MAX_PPTX_SANITIZED_XML_TOTAL_BYTES) throw new XlsxParsingLimitError();
            seenOwners.add(entry.fileName);
            archive.append(sanitizePptxOwnerXml(await readZipEntry(zipFile, entry), removedIds), { name: entry.fileName });
            zipFile.readEntry();
            return;
          }

          const stream = await openZipEntryStream(zipFile, entry);
          const streamEnd = once(stream, 'end');
          archive.append(stream, { name: entry.fileName });
          await Promise.race([
            streamEnd,
            outputDone.then(() => {
              if (outputError) throw outputError;
            }),
          ]);
          zipFile.readEntry();
        })().catch(fail);
      });
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        if (seenRelationships.size !== plan.relationshipReplacements.size
          || seenOwners.size !== plan.hyperlinkIdsByOwner.size) {
          reject(new Error('PPTX hyperlink owner is missing'));
        } else resolve();
      });
      zipFile.readEntry();
    });
  });

  try {
    await rewriteEntries;
    await archive.finalize();
    await outputDone;
    if (outputError) throw outputError;
    return Buffer.concat(chunks, outputBytes);
  } catch (error) {
    currentZipFile?.close();
    archive.abort();
    if (!outputSettled) {
      outputSettled = true;
      outputError = error;
      settleOutput();
    }
    await outputDone;
    throw error;
  }
}

function assertAttributes(node: XmlNode, allowed: readonly string[]): void {
  const permitted = new Set(allowed);
  for (const name of node.attributes.keys()) {
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
    if (!permitted.has(name)) throw new Error(`unsupported XML attribute: ${name}`);
    const expectedNamespace = name.startsWith('r:') ? OFFICE_RELATIONSHIPS_NAMESPACE
      : name.startsWith('xml:') ? XML_NAMESPACE : undefined;
    if (node.attributeNamespaces.get(name) !== expectedNamespace) {
      throw new Error(`invalid XML attribute namespace: ${name}`);
    }
  }
}

function assertElement(node: XmlNode, localName: string, namespaceUri: string): void {
  if (node.localName !== localName || node.namespaceUri !== namespaceUri) {
    throw new Error(`invalid ${localName} XML namespace`);
  }
}

function assertOnlyChildren(node: XmlNode, allowed: readonly string[], namespaceUri: string): void {
  const permitted = new Set(allowed);
  for (const child of node.children) {
    if (child.namespaceUri !== namespaceUri || !permitted.has(child.localName)) {
      throw new Error(`unsupported ${node.localName} child`);
    }
  }
  if (node.text.trim()) throw new Error(`unexpected text in ${node.localName}`);
}

function exactlyOneChild(node: XmlNode, localName: string, namespaceUri: string): XmlNode {
  const matching = node.children.filter((child) => child.localName === localName && child.namespaceUri === namespaceUri);
  if (matching.length !== 1 || node.children.length !== 1 || node.text.trim()) {
    throw new Error(`expected one ${localName} element`);
  }
  return matching[0]!;
}

function textOnly(node: XmlNode): string {
  if (node.children.length) throw new Error(`unsupported nested XML in ${node.localName}`);
  return node.text;
}

function sharedStrings(root: XmlNode | undefined): string[] {
  if (!root) return [];
  assertElement(root, 'sst', SPREADSHEETML_NAMESPACE);
  assertAttributes(root, ['count', 'uniqueCount']);
  assertOnlyChildren(root, ['si'], SPREADSHEETML_NAMESPACE);
  const strings: string[] = [];
  for (const item of root.children) {
    assertAttributes(item, []);
    assertOnlyChildren(item, ['t', 'r'], SPREADSHEETML_NAMESPACE);
    let value = '';
    for (const child of item.children) {
      if (child.localName === 't') {
        assertAttributes(child, ['xml:space']);
        value += textOnly(child);
      } else {
        assertAttributes(child, []);
        assertOnlyChildren(child, ['t'], SPREADSHEETML_NAMESPACE);
        for (const text of child.children) {
          assertAttributes(text, ['xml:space']);
          value += textOnly(text);
        }
      }
    }
    if (value.length > MAX_XLSX_CELL_TEXT_CHARS) throw new XlsxParsingLimitError();
    strings.push(value);
    if (strings.length > MAX_SHARED_STRINGS) throw new XlsxParsingLimitError();
  }
  return strings;
}

function workbookSheets(workbook: XmlNode, relationshipsDocument: XmlNode): Array<{ name: string; path: string }> {
  assertElement(relationshipsDocument, 'Relationships', PACKAGE_RELATIONSHIPS_NAMESPACE);
  assertAttributes(relationshipsDocument, []);
  assertOnlyChildren(relationshipsDocument, ['Relationship'], PACKAGE_RELATIONSHIPS_NAMESPACE);
  const relationships = new Map<string, string>();
  for (const relationship of relationshipsDocument.children) {
    assertAttributes(relationship, ['Id', 'Target', 'Type', 'TargetMode']);
    if (relationship.children.length || relationship.text.trim()) throw new Error('relationship must be empty');
    const id = relationship.attributes.get('Id');
    const target = relationship.attributes.get('Target');
    const type = relationship.attributes.get('Type');
    if (!id || !target || !type || relationship.attributes.has('TargetMode') || relationships.has(id)) {
      throw new Error('malformed workbook relationship');
    }
    if (type !== WORKSHEET_RELATIONSHIP_TYPE) throw new Error('unsupported workbook relationship');
    if (!/^worksheets\/[^/\\]+\.xml$/u.test(target)) throw new Error('malformed workbook relationship target');
    relationships.set(id, `xl/${target}`);
  }
  assertElement(workbook, 'workbook', SPREADSHEETML_NAMESPACE);
  assertAttributes(workbook, []);
  const sheetsElement = exactlyOneChild(workbook, 'sheets', SPREADSHEETML_NAMESPACE);
  assertAttributes(sheetsElement, []);
  assertOnlyChildren(sheetsElement, ['sheet'], SPREADSHEETML_NAMESPACE);
  const sheets: Array<{ name: string; path: string }> = [];
  const names = new Set<string>();
  for (const sheet of sheetsElement.children) {
    assertAttributes(sheet, ['name', 'sheetId', 'r:id']);
    if (sheet.children.length || sheet.text.trim()) throw new Error('sheet must be empty');
    const name = sheet.attributes.get('name');
    const relationshipId = sheet.attributes.get('r:id');
    const path = relationshipId ? relationships.get(relationshipId) : undefined;
    if (!name || !relationshipId || !path || names.has(name)) throw new Error('malformed workbook relationship');
    names.add(name);
    sheets.push({ name, path });
    if (sheets.length > 10_000) throw new XlsxParsingLimitError();
  }
  return sheets;
}

function parseCellReference(reference: string): { row: number; column: number } {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/u.exec(reference);
  if (!match) throw new Error('malformed cell reference');
  let column = 0;
  for (const letter of match[1]!) column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number.parseInt(match[2]!, 10);
  if (!Number.isSafeInteger(column) || column < 1 || column > MAX_XLSX_COLUMN
    || !Number.isSafeInteger(row) || row < 1 || row > MAX_XLSX_ROW) {
    throw new Error('cell reference outside XLSX bounds');
  }
  return { row, column };
}

interface XlsxMaterializationBudget {
  totalCells: number;
  textChars: number;
  outputBytes: number;
}

function addMaterializedText(budget: XlsxMaterializationBudget, text: string): void {
  if (text.length > MAX_XLSX_CELL_TEXT_CHARS) throw new XlsxParsingLimitError();
  budget.textChars += text.length;
  if (budget.textChars > MAX_XLSX_MATERIALIZED_TEXT_CHARS) throw new XlsxParsingLimitError();
  if (text.trim()) {
    budget.outputBytes += Buffer.byteLength(text, 'utf8') + 320;
    if (budget.outputBytes > MAX_XLSX_MATERIALIZED_OUTPUT_BYTES) throw new XlsxParsingLimitError();
  }
}

function worksheetCells(worksheet: XmlNode, strings: readonly string[], budget: XlsxMaterializationBudget): Array<{ row: number; column: number; text: string }> {
  assertElement(worksheet, 'worksheet', SPREADSHEETML_NAMESPACE);
  assertAttributes(worksheet, []);
  const sheetData = exactlyOneChild(worksheet, 'sheetData', SPREADSHEETML_NAMESPACE);
  assertAttributes(sheetData, []);
  assertOnlyChildren(sheetData, ['row'], SPREADSHEETML_NAMESPACE);
  const cells: Array<{ row: number; column: number; text: string }> = [];
  const references = new Set<string>();
  for (const row of sheetData.children) {
    assertAttributes(row, ['r']);
    assertOnlyChildren(row, ['c'], SPREADSHEETML_NAMESPACE);
    const rowReference = row.attributes.get('r');
    if (!/^[1-9]\d{0,6}$/u.test(rowReference ?? '')) throw new Error('missing or malformed worksheet row reference');
    const rowNumber = Number(rowReference);
    if (!Number.isSafeInteger(rowNumber) || rowNumber > MAX_XLSX_ROW) {
      throw new Error('worksheet row reference outside XLSX bounds');
    }
    for (const cell of row.children) {
      assertAttributes(cell, ['r', 't']);
      const reference = cell.attributes.get('r');
      if (!reference || references.has(reference)) throw new Error('duplicate or missing cell reference');
      references.add(reference);
      const coordinates = parseCellReference(reference);
      if (coordinates.row !== rowNumber) throw new Error('worksheet row/cell reference mismatch');
      const type = cell.attributes.get('t');
      if (type !== undefined && type !== 'inlineStr' && type !== 's') throw new Error('XLSX cell type is unsupported');
      let text = '';
      if (type === 'inlineStr') {
        const inline = exactlyOneChild(cell, 'is', SPREADSHEETML_NAMESPACE);
        assertAttributes(inline, []);
        assertOnlyChildren(inline, ['t'], SPREADSHEETML_NAMESPACE);
        for (const textNode of inline.children) {
          assertAttributes(textNode, ['xml:space']);
          text += textOnly(textNode);
        }
      } else if (type === 's') {
        const value = exactlyOneChild(cell, 'v', SPREADSHEETML_NAMESPACE);
        assertAttributes(value, []);
        const indexText = textOnly(value);
        if (!/^(?:0|[1-9]\d*)$/u.test(indexText)) throw new Error('shared string index invalid');
        const index = Number(indexText);
        if (!Number.isSafeInteger(index) || index >= strings.length) throw new Error('shared string index invalid');
        text = strings[index]!;
      } else if (cell.children.length === 0) {
        if (cell.text.trim()) throw new Error('unexpected cell text');
      } else {
        const value = exactlyOneChild(cell, 'v', SPREADSHEETML_NAMESPACE);
        assertAttributes(value, []);
        text = textOnly(value);
        if (!/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/u.test(text)
          || !Number.isFinite(Number(text))) {
          throw new Error('untyped XLSX value is not a finite number');
        }
      }
      budget.totalCells += 1;
      if (budget.totalCells > MAX_XLSX_CELLS) throw new XlsxParsingLimitError();
      addMaterializedText(budget, text);
      if (text.trim()) cells.push({ ...coordinates, text });
    }
  }
  return cells;
}

export async function parseStructuredXlsxPages(content: Buffer): Promise<StagePage[]> {
  const entries = await readBoundedXlsxEntries(content);
  const workbook = entries.get('xl/workbook.xml');
  const relationships = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new Error('workbook manifest missing');
  const sharedStringsEntry = entries.get('xl/sharedStrings.xml');
  const strings = sharedStrings(sharedStringsEntry ? parseStrictXml(sharedStringsEntry) : undefined);
  const sheets = workbookSheets(parseStrictXml(workbook), parseStrictXml(relationships));
  if (sheets.length === 0) throw new Error('workbook has no sheets');
  const budget: XlsxMaterializationBudget = { totalCells: 0, textChars: 0, outputBytes: 0 };
  const pages: StagePage[] = [];
  for (const [pageIndex, sheet] of sheets.entries()) {
    const worksheet = entries.get(sheet.path);
    if (!worksheet) throw new Error('worksheet missing');
    budget.outputBytes += Buffer.byteLength(sheet.name, 'utf8') + 320;
    if (budget.outputBytes > MAX_XLSX_MATERIALIZED_OUTPUT_BYTES) throw new XlsxParsingLimitError();
    const cells = worksheetCells(parseStrictXml(worksheet), strings, budget);
    if (budget.totalCells + sheets.length > MAX_XLSX_BLOCKS) {
      throw new XlsxParsingLimitError();
    }
    const columnCount = Math.max(1, ...cells.map((cell) => cell.column));
    const maxRow = Math.max(0, ...cells.map((cell) => cell.row));
    const cellWidth = VIRTUAL_PAGE_WIDTH / columnCount;
    pages.push({
      page: pageIndex + 1,
      width: VIRTUAL_PAGE_WIDTH,
      height: Math.max(VIRTUAL_LINE_HEIGHT, (maxRow + 1) * VIRTUAL_LINE_HEIGHT),
      blocks: [
        {
          kind: 'heading',
          text: sheet.name,
          boundingBox: { x: 0, y: 0, width: VIRTUAL_PAGE_WIDTH, height: VIRTUAL_LINE_HEIGHT },
        },
        ...cells.map((cell) => ({
          kind: 'table' as const,
          text: cell.text,
          boundingBox: {
            x: (cell.column - 1) * cellWidth,
            y: cell.row * VIRTUAL_LINE_HEIGHT,
            width: cellWidth,
            height: VIRTUAL_LINE_HEIGHT,
          },
        })),
      ],
    });
  }
  return pages;
}

export async function parseStructuredXlsxResult(content: Buffer): Promise<ParserStageResult> {
  return parseParserStageResult({
    schemaVersion: 2,
    parser: XLSX_TRANSITION_PARSER_METADATA,
    pages: await parseStructuredXlsxPages(content),
    warnings: [],
  });
}

function parseBinaryIsolated(kind: 'docx', content: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=256', '-e', ISOLATED_PARSER_SOURCE, kind], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let outputSize = 0;
    let errorText = '';
    let settled = false;
    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(text ?? '');
    };
    const timer = setTimeout(() => finish(new Error(`${kind} parser timeout`)), PARSER_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > MAX_PARSED_TEXT_CHARS * 4) {
        finish(new Error(`${kind} parser output too large`));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorText.length < 4096) errorText += chunk.toString('utf8', 0, 4096 - errorText.length);
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) finish(undefined, Buffer.concat(chunks).toString('utf8'));
      else finish(new Error(errorText || `${kind} parser exited ${code ?? 'unknown'}`));
    });
    child.stdin.once('error', (error) => finish(error));
    child.stdin.end(content);
  });
}

export async function runTesseractOcr(
  content: Buffer,
  spawnProcess: typeof spawn = spawn,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.env.TESSERACT_BIN ?? 'tesseract', ['stdin', 'stdout', '-l', process.env.TESSERACT_LANGS ?? 'eng+chi_sim'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    let settled = false;
    const settle = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(text ?? '');
    };
    const terminate = (error: Error) => {
      if (!failure) failure = error;
      if (child.exitCode === null) child.kill('SIGKILL');
    };
    const timer = setTimeout(() => terminate(new Error('OCR timeout')), 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) { terminate(new Error('OCR output too large')); return; }
      chunks.push(chunk);
    });
    child.once('error', (error) => settle(error));
    child.once('close', (code) => {
      if (failure || code !== 0) settle(failure ?? new Error(`OCR exited ${code}`));
      else settle(undefined, Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.once('error', (error) => terminate(new Error(
      `OCR input failed: ${(error as NodeJS.ErrnoException).code ?? 'write_failed'}`,
    )));
    child.stdin.end(content);
  });
}

function parseStructuredStageIsolated(kind: 'pdf' | 'xlsx', content: Buffer): Promise<ParserStageResult> {
  return new Promise((resolve, reject) => {
    const modulePath = kind === 'pdf'
      ? join(__dirname, 'parsers', `native-pdf-text-items${extname(__filename)}`)
      : __filename;
    const childArguments = extname(modulePath) === '.ts'
      ? [
        '--max-old-space-size=256',
        '-e',
        ISOLATED_TYPESCRIPT_STAGE_SOURCE,
        modulePath,
        kind,
        String(MAX_PARSER_INPUT),
        String(PARSER_JOB_RESPONSE_MAX_BYTES),
      ]
      : ['--max-old-space-size=256', modulePath, `--${kind}-stage-child`];
    const child = spawn(process.execPath, childArguments, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure = '';
    let settled = false;
    const finish = (error?: Error, value?: ParserStageResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      if (error) reject(error);
      else if (value) resolve(value);
      else reject(new Error(`${kind} parser result missing`));
    };
    const timer = setTimeout(() => finish(new Error(`${kind} parser timeout`)), PARSER_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > PARSER_JOB_RESPONSE_MAX_BYTES) finish(new Error(`${kind} parser output too large`));
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { if (failure.length < 1024) failure += chunk.toString('utf8', 0, 1024 - failure.length); });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code !== 0) {
        finish(new Error(failure || `${kind} parser exited ${code}`));
        return;
      }
      try {
        finish(undefined, parseParserStageResult(JSON.parse(Buffer.concat(chunks, size).toString('utf8'))));
      } catch {
        finish(new Error(`${kind} parser returned an invalid V2 stage result`));
      }
    });
    child.stdin.once('error', (error) => finish(error));
    child.stdin.end(content);
  });
}

async function runStructuredXlsxStageChild(): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_PARSER_INPUT) throw new XlsxParsingLimitError();
    chunks.push(Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks, size);
  const serialized = JSON.stringify(await parseStructuredXlsxResult(content));
  if (Buffer.byteLength(serialized) > PARSER_JOB_RESPONSE_MAX_BYTES) throw new XlsxParsingLimitError();
  process.stdout.write(serialized);
}

export function createDefaultIngestionAdapters(): IngestionAdapters {
  const doclingUrl = process.env.DOCLING_SERVE_URL?.trim();
  return {
    pdf: async (content) => {
      if (doclingUrl) {
        try {
          return await runDoclingDocument(content, doclingUrl, { format: 'pdf', mediaType: 'application/pdf', filename: 'document.pdf' });
        } catch (error) {
          console.error('advanced PDF parser failed; using native fallback', error instanceof Error ? error.message : String(error));
          const fallback = await parseStructuredStageIsolated('pdf', content);
          return { ...fallback, warnings: [...new Set([...fallback.warnings, SafeParserWarningCode.PARTIAL_RESULT, SafeParserWarningCode.LOW_CONFIDENCE])] };
        }
      }
      return parseStructuredStageIsolated('pdf', content);
    },
    docx: (content) => parseBinaryIsolated('docx', content),
    ...(doclingUrl ? {
      pptx: (content: Buffer) => runDoclingDocument(content, doclingUrl, {
        format: 'pptx', mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', filename: 'presentation.pptx',
      }),
      html: (content: Buffer) => runDoclingDocument(content, doclingUrl, {
        format: 'html', mediaType: 'text/html', filename: 'document.html',
      }),
    } : {}),
    image: runTesseractOcr,
    xlsx: (content) => parseStructuredStageIsolated('xlsx', content),
  };
}

export const MAX_PARSER_INPUT = 50 * 1024 * 1024;

/** Canonical execution path for provider-neutral DocumentParser implementations. */
export async function executeDocumentParser(parser: DocumentParser, input: ParserInput) {
  // Keep the legacy sidecar's ingestion-parser module graph loadable without
  // packaging the worker-only DocumentParser contract into that image.
  const { runDocumentParser } = await import('./parsers/base-parser.js');
  return runDocumentParser(input, parser);
}

/**
 * 将已通过上传内容门禁的 Blob 转成 Hermes 可消费的正文。
 * 文本格式在 worker 内完成确定性解码；PDF/DOC/DOCX/图片先保留为
 * needs_review，等待部署环境挂载受控解析器（不得把二进制当正文送给模型）。
 */
export function parseIngestion(filename: string, content: Buffer): ParsedIngestion {
  const extension = extname(filename).toLowerCase();
  if (extension === '.md' || extension === '.markdown' || extension === '.tex') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content).trim();
    if (!text) return { status: 'needs_review', format: extension.slice(1), reason: 'empty-text' };
    return { status: 'ready', text, format: extension === '.tex' ? 'tex' : 'md' };
  }
  return {
    status: 'needs_review',
    format: extension.slice(1) || 'unknown',
    reason: 'binary-parser-not-mounted',
  };
}

/** Controlled binary parser seam. Adapters are injected by the worker composition root. */
export async function parseIngestionWithAdapters(
  filename: string,
  content: Buffer,
  adapters: LegacyIngestionAdapters,
): Promise<ParsedIngestion> {
  if (content.byteLength > MAX_PARSER_INPUT) {
    return { status: 'needs_review', format: extname(filename).slice(1).toLowerCase() || 'unknown', reason: 'parser-input-too-large' };
  }
  const extension = extname(filename).toLowerCase();
  const adapter = extension === '.pdf'
    ? adapters.pdf
    : extension === '.docx'
      ? adapters.docx
      : ['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(extension)
        ? adapters.image
        : undefined;
  if (!adapter) return parseIngestion(filename, content);
  let parsed: string | ParserStageResult;
  try {
    parsed = await adapter(content);
  } catch {
    return { status: 'needs_review', format: extension.slice(1), reason: 'parser-failed' };
  }
  const text = typeof parsed === 'string'
    ? parsed
    : parseParserStageResult(parsed).pages
      .flatMap(({ blocks }) => blocks.flatMap(({ text: blockText }) => blockText === undefined ? [] : [blockText]))
      .join('\n');
  const meaningfulText = text
    .replace(/-- \d+ of \d+ --/gu, '')
    .replace(/[\p{C}\p{Z}]/gu, '');
  if (!/[\p{L}\p{N}]/u.test(meaningfulText)) {
    return { status: 'needs_review', format: extension.slice(1), reason: 'empty-parsed-text' };
  }
  return { status: 'ready', text, format: extension.slice(1) };
}

if (require.main === module && process.argv[2] === '--xlsx-stage-child') {
  void runStructuredXlsxStageChild().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : 'xlsx parser failed');
    process.exitCode = 1;
  });
}
