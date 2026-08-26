import { createHash } from 'node:crypto';

import {
  createDefaultIngestionAdapters,
  parseIngestionWithAdapters,
  type ParsedIngestion,
} from '../../src/ingestion-parser';
import { createParserSelfTestFixtures } from '../../src/parser-self-test';

export type ResearchCorpusFeature =
  | 'native_text'
  | 'scan'
  | 'dual_column'
  | 'docx'
  | 'markdown'
  | 'tex'
  | 'table'
  | 'formula'
  | 'references'
  | 'csv'
  | 'xlsx'
  | 'notebook'
  | 'code';

export type ResearchExpectedLocator =
  | { kind: 'file' }
  | { kind: 'page-text'; page: number; quote: string }
  | { kind: 'page-region'; page: number; bbox: [number, number, number, number] }
  | { kind: 'paragraph-text'; paragraph: number; quote: string }
  | { kind: 'line-text'; line: number; quote: string }
  | { kind: 'table-cell'; row: number; column: number; quote: string; sheet?: string }
  | { kind: 'notebook-cell'; cell: number; quote: string };

export interface ResearchCorpusCase {
  id: string;
  filename: string;
  content: Buffer;
  language: 'en' | 'zh' | 'mixed';
  features: ResearchCorpusFeature[];
  rights: 'self-authored';
  expectedLocators: ResearchExpectedLocator[];
  expectedCurrentStatus: ParsedIngestion['status'];
  expectedText?: string;
}

const fixtures = createParserSelfTestFixtures();

function buildPdf(objects: Buffer[]): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [0];
  let length = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'),
      object,
      Buffer.from('\nendobj\n', 'ascii'),
    ]);
    chunks.push(chunk);
    length += chunk.length;
  });

  const xrefOffset = length;
  const xrefRows = offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  chunks.push(Buffer.from(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefRows}`
      + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
      + `startxref\n${xrefOffset}\n%%EOF\n`,
    'ascii',
  ));
  return Buffer.concat(chunks);
}

function pdfStream(content: Buffer, dictionary = ''): Buffer {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary}/Length ${content.length} >>\nstream\n`, 'ascii'),
    content,
    Buffer.from('\nendstream', 'ascii'),
  ]);
}

function createDualColumnPdf(): Buffer {
  const content = Buffer.from([
    'BT /F1 12 Tf 54 720 Td (Left claim: reproducible pulse.) Tj ET',
    'BT /F1 12 Tf 320 720 Td (Right evidence: calibrated trace.) Tj ET',
  ].join('\n'), 'ascii');
  return buildPdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'ascii'),
    pdfStream(content),
  ]);
}

function createImageOnlyPdf(): Buffer {
  const content = Buffer.from('q 100 0 0 100 72 600 cm /Im0 Do Q', 'ascii');
  return buildPdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 6 0 R >> >> /Contents 5 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'ascii'),
    pdfStream(content),
    pdfStream(Buffer.from([0x80]), '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 '),
  ]);
}

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; content: string }>): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content, 'utf8');
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localChunks.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralChunks.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localChunks, centralDirectory, end]);
}

function createMinimalXlsx(): Buffer {
  return createStoredZip([
    {
      name: '[Content_Types].xml',
      content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      content: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Evidence" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Claim</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>pulse_width_fs</t></is></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>',
    },
  ]);
}

export const RESEARCH_INTELLIGENCE_CORPUS: ResearchCorpusCase[] = [
  {
    id: 'corrupt-pdf-en',
    filename: 'corrupt.pdf',
    content: Buffer.from('%PDF-1.7\nOpenScience self-authored intentionally incomplete fixture\n', 'utf8'),
    language: 'en',
    features: ['native_text'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'file' }],
    expectedCurrentStatus: 'needs_review',
  },
  {
    id: 'markdown-mixed',
    filename: 'claim.md',
    content: Buffer.from('# Claim\n\nOpenScience evidence supports 可复核的科研叙事。\n\n| Metric | Value |\n|---|---:|\n| pulse width | 42 fs |\n', 'utf8'),
    language: 'mixed',
    features: ['native_text', 'markdown', 'table'],
    rights: 'self-authored',
    expectedLocators: [
      { kind: 'line-text', line: 3, quote: 'OpenScience evidence supports' },
      { kind: 'table-cell', row: 2, column: 2, quote: '42 fs' },
    ],
    expectedCurrentStatus: 'ready',
    expectedText: 'OpenScience evidence supports',
  },
  {
    id: 'native-docx-en',
    filename: 'fixture.docx',
    content: fixtures.docx,
    language: 'en',
    features: ['native_text', 'docx'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'paragraph-text', paragraph: 1, quote: 'OpenScience evidence document' }],
    expectedCurrentStatus: 'ready',
    expectedText: 'OpenScience evidence document',
  },
  {
    id: 'native-pdf-en',
    filename: 'fixture.pdf',
    content: fixtures.pdf,
    language: 'en',
    features: ['native_text'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'page-text', page: 1, quote: 'OpenScience evidence document' }],
    expectedCurrentStatus: 'ready',
    expectedText: 'OpenScience evidence document',
  },
  {
    id: 'scan-png-empty',
    filename: 'scan.png',
    content: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
    language: 'en',
    features: ['scan'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'page-region', page: 1, bbox: [0, 0, 1, 1] }],
    expectedCurrentStatus: 'needs_review',
  },
  {
    id: 'tex-formula-en',
    filename: 'method.tex',
    content: Buffer.from('\\section{Method}\nThe fitted signal is $I(t)=I_0 e^{-t/\\tau}$.\n', 'utf8'),
    language: 'en',
    features: ['native_text', 'tex', 'formula'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'line-text', line: 2, quote: 'I_0 e^{-t/\\tau}' }],
    expectedCurrentStatus: 'ready',
    expectedText: 'I_0 e^{-t/\\tau}',
  },
  {
    id: 'dual-column-pdf-en',
    filename: 'dual-column.pdf',
    content: createDualColumnPdf(),
    language: 'en',
    features: ['native_text', 'dual_column'],
    rights: 'self-authored',
    expectedLocators: [
      { kind: 'page-text', page: 1, quote: 'Left claim: reproducible pulse.' },
      { kind: 'page-text', page: 1, quote: 'Right evidence: calibrated trace.' },
    ],
    expectedCurrentStatus: 'ready',
    expectedText: 'Left claim: reproducible pulse.',
  },
  {
    id: 'references-markdown-en',
    filename: 'references.md',
    content: Buffer.from('# References\n\n[1] OpenScience Team. Reproducible evidence object. 2026.\n', 'utf8'),
    language: 'en',
    features: ['native_text', 'markdown', 'references'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'line-text', line: 3, quote: 'Reproducible evidence object' }],
    expectedCurrentStatus: 'ready',
    expectedText: 'Reproducible evidence object',
  },
  {
    id: 'scan-pdf-image-only',
    filename: 'scan.pdf',
    content: createImageOnlyPdf(),
    language: 'en',
    features: ['scan'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'page-region', page: 1, bbox: [72, 600, 172, 700] }],
    expectedCurrentStatus: 'ready',
  },
  {
    id: 'table-csv-mixed',
    filename: 'evidence.csv',
    content: Buffer.from('metric,value,unit\npulse_width,42,fs\n样本数,8,count\n', 'utf8'),
    language: 'mixed',
    features: ['table', 'csv'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'table-cell', row: 2, column: 2, quote: '42' }],
    expectedCurrentStatus: 'needs_review',
  },
  {
    id: 'table-xlsx-en',
    filename: 'evidence.xlsx',
    content: createMinimalXlsx(),
    language: 'en',
    features: ['table', 'xlsx'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'table-cell', sheet: 'Evidence', row: 2, column: 2, quote: '42' }],
    expectedCurrentStatus: 'needs_review',
  },
  {
    id: 'notebook-en',
    filename: 'analysis.ipynb',
    content: Buffer.from(JSON.stringify({
      cells: [{ cell_type: 'code', execution_count: 1, metadata: {}, outputs: [], source: ['pulse_width_fs = 42\n'] }],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    }), 'utf8'),
    language: 'en',
    features: ['notebook', 'code'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'notebook-cell', cell: 1, quote: 'pulse_width_fs = 42' }],
    expectedCurrentStatus: 'needs_review',
  },
  {
    id: 'python-code-en',
    filename: 'analysis.py',
    content: Buffer.from('# Self-authored corpus fixture\npulse_width_fs = 42\n', 'utf8'),
    language: 'en',
    features: ['code'],
    rights: 'self-authored',
    expectedLocators: [{ kind: 'line-text', line: 2, quote: 'pulse_width_fs = 42' }],
    expectedCurrentStatus: 'needs_review',
  },
];

export function buildResearchIntelligenceManifest() {
  return {
    schemaVersion: 1,
    cases: [...RESEARCH_INTELLIGENCE_CORPUS]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((corpusCase) => ({
        id: corpusCase.id,
        filename: corpusCase.filename,
        language: corpusCase.language,
        features: corpusCase.features,
        rights: corpusCase.rights,
        expectedLocators: corpusCase.expectedLocators,
        expectedCurrentStatus: corpusCase.expectedCurrentStatus,
        sha256: createHash('sha256').update(corpusCase.content).digest('hex'),
      })),
  };
}

export function parseResearchCorpusCase(corpusCase: ResearchCorpusCase): Promise<ParsedIngestion> {
  return parseIngestionWithAdapters(
    corpusCase.filename,
    corpusCase.content,
    createDefaultIngestionAdapters(),
  );
}

export async function buildCurrentParserBaseline() {
  const cases = [];

  for (const corpusCase of RESEARCH_INTELLIGENCE_CORPUS) {
    const rssBefore = process.memoryUsage().rss;
    const startedAt = performance.now();
    const parsed = await parseResearchCorpusCase(corpusCase);
    const elapsedMs = performance.now() - startedAt;
    const rssDeltaBytes = process.memoryUsage().rss - rssBefore;

    cases.push({
      id: corpusCase.id,
      contentHash: createHash('sha256').update(corpusCase.content).digest('hex'),
      status: parsed.status,
      reason: parsed.status === 'needs_review' ? parsed.reason : undefined,
      textMatched: corpusCase.expectedText
        ? parsed.status === 'ready' && parsed.text.includes(corpusCase.expectedText)
        : undefined,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      rssDeltaBytes,
    });
  }

  return {
    schemaVersion: 1,
    runtime: 'current-agent-worker',
    cases,
  } as const;
}
