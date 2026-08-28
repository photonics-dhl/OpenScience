import { createHash } from 'node:crypto';
import {
  parseDocumentSourceMap,
  type DocumentBlock,
  type DocumentBlockKind,
  type DocumentParserMetadata,
  type DocumentSourceMap,
} from '@openscience/domain';
import { canonicalLayoutReadingOrder } from './layout-parser';

const MAX_TEI_CHARACTERS = 2_000_000;
const MAX_XML_ELEMENTS = 20_000;
const MAX_XML_DEPTH = 128;
const MAX_CANDIDATES = 2_000;
const GROBID_CONFIDENCE = 0.9;
const TEI_NAMESPACE = 'http://www.tei-c.org/ns/1.0';

export type GrobidErrorCode = 'malformed_xml' | 'timeout' | 'unavailable';

export type GrobidEnrichmentResult =
  | { status: 'succeeded'; parser: DocumentParserMetadata; tei: string }
  | { status: 'failed'; errorCode: GrobidErrorCode };

interface XmlNode {
  qualifiedName: string;
  name: string;
  namespaceUri?: string;
  namespaceBindings: Map<string, string>;
  attributes: Map<string, string>;
  text: string[];
}

interface GrobidCandidate {
  kind: Extract<DocumentBlockKind, 'heading' | 'reference'>;
  page: number;
  text: string;
  boundingBox: DocumentBlock['boundingBox'];
}

interface QualifiedName {
  prefix?: string;
  local: string;
}

function qualifiedName(value: string): QualifiedName {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/.test(value)) {
    throw new Error('malformed XML qualified name');
  }
  const separator = value.indexOf(':');
  return separator === -1
    ? { local: value.toLowerCase() }
    : { prefix: value.slice(0, separator).toLowerCase(), local: value.slice(separator + 1).toLowerCase() };
}

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    const normalized = body.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    const point = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    if (!Number.isSafeInteger(point) || point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
      throw new Error('malformed XML entity');
    }
    return String.fromCodePoint(point);
  }).replace(/&[^;\s]{1,100};/g, () => {
    throw new Error('unsupported XML entity');
  });
}

function normalizedText(value: string): string {
  return decodeXmlText(value).replace(/\s+/g, ' ').trim();
}

function parseAttributes(value: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /\s*([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;
  let cursor = 0;
  while (cursor < value.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(value);
    if (!match) {
      if (value.slice(cursor).trim()) throw new Error('malformed XML attributes');
      break;
    }
    const name = match[1]!.toLowerCase();
    if (attributes.has(name)) throw new Error('duplicate XML attribute');
    qualifiedName(name);
    attributes.set(name, decodeXmlText(match[2] ?? match[3] ?? ''));
    cursor = pattern.lastIndex;
  }
  return attributes;
}

function bindNamespaces(parent: Map<string, string> | undefined, attributes: Map<string, string>): Map<string, string> {
  const bindings = new Map(parent);
  for (const [name, value] of attributes) {
    const qualified = qualifiedName(name);
    if (name === 'xmlns') bindings.set('', value);
    else if (qualified.prefix === 'xmlns') bindings.set(qualified.local, value);
  }
  return bindings;
}

function resolveNamespace(name: QualifiedName, bindings: Map<string, string>): string | undefined {
  if (name.prefix === 'xml') return 'http://www.w3.org/XML/1998/namespace';
  return bindings.get(name.prefix ?? '');
}

function coordinateAttribute(node: XmlNode): string | undefined {
  let coordinates: string | undefined;
  for (const [name, value] of node.attributes) {
    const qualified = qualifiedName(name);
    if (qualified.local !== 'coords') continue;
    if (qualified.prefix && resolveNamespace(qualified, node.namespaceBindings) !== TEI_NAMESPACE) continue;
    if (coordinates !== undefined) throw new Error('duplicate GROBID coordinates');
    coordinates = value;
  }
  return coordinates;
}

function readTag(xml: string, start: number): { token: string; next: number } {
  let quote: '"' | "'" | undefined;
  for (let cursor = start + 1; cursor < xml.length; cursor += 1) {
    const character = xml[cursor];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '>') return { token: xml.slice(start, cursor + 1), next: cursor + 1 };
  }
  throw new Error('unterminated XML tag');
}

function coordinateCandidates(
  value: string | undefined,
  kind: GrobidCandidate['kind'],
  text: string,
): GrobidCandidate[] {
  if (!value || !text) return [];
  const byPage = new Map<number, DocumentBlock['boundingBox']>();
  for (const fragment of value.split(';')) {
    const rawFields = fragment.split(',').map((entry) => entry.trim());
    if (rawFields.length !== 5 || rawFields.some((entry) => (
      entry.length === 0 || entry.length > 50 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(entry)
    ))) {
      throw new Error('malformed GROBID coordinates');
    }
    const fields = rawFields.map(Number);
    if (!fields.every(Number.isFinite)) throw new Error('malformed GROBID coordinates');
    const [page, x, y, width, height] = fields as [number, number, number, number, number];
    if (!Number.isSafeInteger(page) || page < 1 || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new Error('invalid GROBID coordinates');
    }
    const existing = byPage.get(page);
    if (!existing) {
      byPage.set(page, { x, y, width, height });
      continue;
    }
    const right = Math.max(existing.x + existing.width, x + width);
    const bottom = Math.max(existing.y + existing.height, y + height);
    existing.x = Math.min(existing.x, x);
    existing.y = Math.min(existing.y, y);
    existing.width = right - existing.x;
    existing.height = bottom - existing.y;
  }
  return [...byPage.entries()].map(([page, boundingBox]) => ({ kind, page, text, boundingBox }));
}

function parseTei(xml: string): GrobidCandidate[] {
  if (typeof xml !== 'string' || !xml.trim() || xml.length > MAX_TEI_CHARACTERS) throw new Error('invalid TEI size');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD and entities are forbidden');
  const stack: XmlNode[] = [];
  const candidates: GrobidCandidate[] = [];
  let cursor = 0;
  let elements = 0;
  let rootSeen = false;
  while (cursor < xml.length) {
    if (xml[cursor] !== '<') {
      const next = xml.indexOf('<', cursor);
      const text = xml.slice(cursor, next === -1 ? xml.length : next);
      if (stack.length === 0 && text.trim()) throw new Error('text outside XML root');
      if (stack.length > 0 && text) stack[stack.length - 1]!.text.push(` ${text} `);
      cursor = next === -1 ? xml.length : next;
      continue;
    }
    if (xml.startsWith('<!--', cursor)) {
      const end = xml.indexOf('-->', cursor + 4);
      if (end === -1) throw new Error('unterminated XML comment');
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', cursor)) {
      const end = xml.indexOf('?>', cursor + 2);
      if (end === -1) throw new Error('unterminated processing instruction');
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', cursor)) {
      const end = xml.indexOf(']]>', cursor + 9);
      if (end === -1 || stack.length === 0) throw new Error('invalid CDATA');
      stack[stack.length - 1]!.text.push(xml.slice(cursor + 9, end));
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<!', cursor)) throw new Error('unsupported XML declaration');
    const { token, next } = readTag(xml, cursor);
    const closing = /^<\//.test(token);
    const selfClosing = /\/\s*>$/.test(token);
    const match = token.match(closing
      ? /^<\/\s*([^\s>]+)\s*>$/
      : /^<\s*([^\s/>]+)([\s\S]*?)(?:\/\s*>|>)$/);
    if (!match) throw new Error('malformed XML tag');
    const rawName = match[1]!.toLowerCase();
    const parsedName = qualifiedName(rawName);
    const name = parsedName.local;
    if (closing) {
      const node = stack.pop();
      if (!node || node.qualifiedName !== rawName) throw new Error('mismatched XML close tag');
      const text = normalizedText(node.text.join(''));
      if (stack.length > 0 && text) stack[stack.length - 1]!.text.push(` ${text} `);
      const kind = node.namespaceUri === TEI_NAMESPACE
        ? node.name === 'head' ? 'heading' : node.name === 'biblstruct' ? 'reference' : undefined
        : undefined;
      if (kind && text) candidates.push(...coordinateCandidates(coordinateAttribute(node), kind, text));
    } else {
      elements += 1;
      if (elements > MAX_XML_ELEMENTS || stack.length >= MAX_XML_DEPTH) throw new Error('TEI structure limit exceeded');
      const rawAttributes = (match[2] ?? '').replace(/\/\s*$/, '');
      const attributes = parseAttributes(rawAttributes);
      const namespaceBindings = bindNamespaces(stack[stack.length - 1]?.namespaceBindings, attributes);
      const namespaceUri = resolveNamespace(parsedName, namespaceBindings);
      if (!rootSeen) {
        if (name !== 'tei' || namespaceUri !== TEI_NAMESPACE) throw new Error('TEI root namespace is required');
        rootSeen = true;
      } else if (stack.length === 0) {
        throw new Error('multiple XML roots');
      }
      const node: XmlNode = {
        qualifiedName: rawName,
        name,
        ...(namespaceUri === undefined ? {} : { namespaceUri }),
        namespaceBindings,
        attributes,
        text: [],
      };
      if (selfClosing) {
        const kind = node.namespaceUri === TEI_NAMESPACE
          ? node.name === 'head' ? 'heading' : node.name === 'biblstruct' ? 'reference' : undefined
          : undefined;
        if (kind) candidates.push(...coordinateCandidates(coordinateAttribute(node), kind, ''));
      } else {
        stack.push(node);
      }
    }
    if (candidates.length > MAX_CANDIDATES) throw new Error('GROBID candidate limit exceeded');
    cursor = next;
  }
  if (!rootSeen || stack.length !== 0) throw new Error('incomplete XML document');
  return candidates;
}

function validMetadata(value: DocumentParserMetadata): boolean {
  return typeof value?.name === 'string' && !!value.name.trim() && value.name.length <= 200
    && typeof value.version === 'string' && !!value.version.trim() && value.version.length <= 200
    && (value.modelHash === undefined || (typeof value.modelHash === 'string' && !!value.modelHash.trim() && value.modelHash.length <= 200));
}

function intersectionRatio(left: DocumentBlock['boundingBox'], right: DocumentBlock['boundingBox']): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = width * height;
  return intersection / Math.min(left.width * left.height, right.width * right.height);
}

function sameText(left: string | undefined, right: string): boolean {
  return left?.replace(/\s+/g, ' ').trim().toLowerCase() === right.replace(/\s+/g, ' ').trim().toLowerCase();
}

function candidateId(contentHash: string, candidate: GrobidCandidate): string {
  const digest = createHash('sha256')
    .update(contentHash)
    .update('\0')
    .update(String(candidate.page))
    .update('\0')
    .update(candidate.kind)
    .update('\0')
    .update(candidate.text)
    .update('\0')
    .update(JSON.stringify(candidate.boundingBox))
    .digest('hex');
  return `block:grobid:${digest}`;
}

function withinPage(candidate: GrobidCandidate, page: DocumentSourceMap['pages'][number]): boolean {
  const box = candidate.boundingBox;
  const xTolerance = Number.EPSILON * Math.max(Math.abs(box.x), box.width, page.width) * 16;
  const yTolerance = Number.EPSILON * Math.max(Math.abs(box.y), box.height, page.height) * 16;
  return box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width - page.width <= xTolerance
    && box.y + box.height - page.height <= yTolerance;
}

function processorCopy(parser: DocumentParserMetadata): DocumentParserMetadata {
  return {
    name: parser.name,
    version: parser.version,
    ...(parser.modelHash === undefined ? {} : { modelHash: parser.modelHash }),
  };
}

/** Fail-closed enrichment: any invalid/failed provider result preserves the layout map exactly. */
export function enrichWithGrobid(
  sourceMap: DocumentSourceMap,
  result: GrobidEnrichmentResult,
): DocumentSourceMap {
  if (result.status === 'failed' || !validMetadata(result.parser)) return sourceMap;
  let candidates: GrobidCandidate[];
  try {
    candidates = parseTei(result.tei);
  } catch {
    return sourceMap;
  }
  if (candidates.length === 0) return sourceMap;
  const parser = processorCopy(result.parser);
  const pages = sourceMap.pages.map((page) => ({ ...page, blocks: [...page.blocks] }));
  for (const candidate of candidates) {
    const page = pages.find(({ page: pageNumber }) => pageNumber === candidate.page);
    if (!page || !withinPage(candidate, page)) continue;
    const overlaps = page.blocks.filter((block) => intersectionRatio(block.boundingBox, candidate.boundingBox) >= 0.5);
    const matching = overlaps.find((block) => sameText(block.text, candidate.text));
    if (matching) {
      if (matching.kind !== candidate.kind && (matching.confidence ?? 0) <= GROBID_CONFIDENCE) {
        const index = page.blocks.indexOf(matching);
        page.blocks[index] = {
          ...matching,
          kind: candidate.kind,
          confidence: Math.max(matching.confidence ?? 0, GROBID_CONFIDENCE),
          transformations: [
            ...matching.transformations,
            { stage: 'classify', processor: processorCopy(parser) },
          ],
        };
      }
      continue;
    }
    if (overlaps.length > 0) continue;
    const block: DocumentBlock = {
      id: candidateId(sourceMap.contentHash, candidate),
      kind: candidate.kind,
      text: candidate.text,
      boundingBox: { ...candidate.boundingBox },
      confidence: GROBID_CONFIDENCE,
      parser: processorCopy(parser),
      transformations: [
        { stage: 'classify', processor: processorCopy(parser) },
        { stage: 'merge', processor: processorCopy(parser) },
      ],
    };
    if (page.blocks.some(({ id }) => id === block.id)) continue;
    const insertAt = page.blocks.findIndex((existing) => existing.boundingBox.y > block.boundingBox.y);
    if (insertAt === -1) page.blocks.push(block);
    else page.blocks.splice(insertAt, 0, block);
  }
  const enriched = {
    artifactId: sourceMap.artifactId,
    contentHash: sourceMap.contentHash,
    parser: sourceMap.parser,
    pages: pages.map((page) => ({
      ...page,
      blocks: canonicalLayoutReadingOrder(page.blocks, page.width),
    })),
  };
  try {
    return parseDocumentSourceMap(enriched);
  } catch {
    return sourceMap;
  }
}
