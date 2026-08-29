import { extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { VIRTUAL_LINE_HEIGHT, VIRTUAL_PAGE_WIDTH } from '@openscience/domain';
import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  parseParserStageResult,
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
  image?: (content: Buffer) => Promise<string>;
  xlsx?: (content: Buffer) => Promise<ParserStageResult>;
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
const MAX_SHARED_STRINGS = 100_000;
const MAX_XLSX_CELLS = 9_900;
const MAX_XLSX_BLOCKS = 10_000;
const MAX_XML_ENTITIES = 100_000;
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
    callback: (error: Error | null, stream?: NodeJS.ReadableStream & { destroy(error?: Error): void }) => void,
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

const loadRuntimeModule = createRequire(__filename);
const yauzl = loadRuntimeModule('yauzl') as YauzlModule;

function decodeUtf8(content: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
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

interface XmlNode {
  name: string;
  localName: string;
  namespaceUri: string | undefined;
  attributes: ReadonlyMap<string, string>;
  attributeNamespaces: ReadonlyMap<string, string | undefined>;
  namespaceBindings: ReadonlyMap<string, string>;
  children: XmlNode[];
  text: string;
}

const XML_NAME = /^(?:[A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*$/u;
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const SPREADSHEETML_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WORKSHEET_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';

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
      if (!Number.isInteger(value) || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)
        || (value < 0x20 && value !== 0x9 && value !== 0xa && value !== 0xd)) {
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

function namespaceBindingsFor(
  parent: ReadonlyMap<string, string> | undefined,
  attributes: ReadonlyMap<string, string>,
): Map<string, string> {
  const bindings = new Map(parent ?? [['xml', XML_NAMESPACE]]);
  for (const [name, value] of attributes) {
    if (name !== 'xmlns' && !name.startsWith('xmlns:')) continue;
    const prefix = name === 'xmlns' ? '' : name.slice('xmlns:'.length);
    if ((name !== 'xmlns' && !prefix) || prefix === 'xmlns'
      || (prefix === 'xml' && value !== XML_NAMESPACE) || !value) {
      throw new Error('invalid XML namespace binding');
    }
    bindings.set(prefix, value);
  }
  return bindings;
}

function namespaceForName(
  name: string,
  bindings: ReadonlyMap<string, string>,
  attribute = false,
): string | undefined {
  const prefix = xmlPrefix(name);
  if (prefix === undefined) return attribute ? undefined : bindings.get('');
  const namespaceUri = bindings.get(prefix);
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

function parseXmlStartTag(source: string): { name: string; attributes: Map<string, string>; selfClosing: boolean } {
  const body = source.trim();
  const selfClosing = body.endsWith('/');
  const content = selfClosing ? body.slice(0, -1).trimEnd() : body;
  const nameMatch = /^([^\s/>]+)/u.exec(content);
  if (!nameMatch || !XML_NAME.test(nameMatch[1]!)) throw new Error('malformed XML opening tag');
  const name = nameMatch[1]!;
  const attributes = new Map<string, string>();
  let cursor = name.length;
  while (cursor < content.length) {
    while (/\s/u.test(content[cursor]!)) cursor += 1;
    if (cursor === content.length) break;
    const attributeMatch = /^([^\s=/>]+)\s*=\s*/u.exec(content.slice(cursor));
    if (!attributeMatch || !XML_NAME.test(attributeMatch[1]!)) throw new Error('malformed XML attribute');
    const attributeName = attributeMatch[1]!;
    cursor += attributeMatch[0].length;
    const quote = content[cursor];
    if (quote !== '"' && quote !== "'") throw new Error('XML attribute must be quoted');
    const end = content.indexOf(quote, cursor + 1);
    if (end === -1) throw new Error('unterminated XML attribute');
    if (attributes.has(attributeName)) throw new Error('duplicate XML attribute');
    attributes.set(attributeName, decodeXmlText(content.slice(cursor + 1, end)));
    cursor = end + 1;
  }
  return { name, attributes, selfClosing };
}

function parseStrictXml(content: Buffer): XmlNode {
  const xml = boundedXml(content);
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let cursor = 0;
  let nodeCount = 0;
  const appendText = (text: string) => {
    if (!text) return;
    if (stack.length === 0) {
      if (text.trim()) throw new Error('XML content outside root element');
      return;
    }
    stack[stack.length - 1]!.text += decodeXmlText(text);
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
      if (!XML_NAME.test(name) || stack.length === 0 || stack[stack.length - 1]!.name !== name) {
        throw new Error('mismatched XML closing tag');
      }
      stack.pop();
    } else {
      if (root && stack.length === 0) throw new Error('multiple XML root elements');
      const parsed = parseXmlStartTag(tag);
      const namespaceBindings = namespaceBindingsFor(stack.at(-1)?.namespaceBindings, parsed.attributes);
      const attributeNamespaces = new Map<string, string | undefined>();
      for (const name of parsed.attributes.keys()) {
        if (name !== 'xmlns' && !name.startsWith('xmlns:')) {
          attributeNamespaces.set(name, namespaceForName(name, namespaceBindings, true));
        }
      }
      const node: XmlNode = {
        name: parsed.name,
        localName: xmlLocalName(parsed.name),
        namespaceUri: namespaceForName(parsed.name, namespaceBindings),
        attributes: parsed.attributes,
        attributeNamespaces,
        namespaceBindings,
        children: [],
        text: '',
      };
      nodeCount += 1;
      if (nodeCount > 200_000) throw new XlsxParsingLimitError();
      if (stack.length === 0) root = node;
      else stack[stack.length - 1]!.children.push(node);
      if (!parsed.selfClosing) stack.push(node);
    }
    cursor = close + 1;
  }
  if (!root || stack.length) throw new Error('malformed XML document');
  return root;
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
  return {
    pdf: (content) => parseStructuredStageIsolated('pdf', content),
    docx: (content) => parseBinaryIsolated('docx', content),
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
