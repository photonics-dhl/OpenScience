import { createHash } from 'node:crypto';
import { createBlockSourceLocator, resolveSourceLocator } from '@openscience/domain';
import { createDefaultIngestionAdapters, parseIngestionWithAdapters, type ParsedIngestion } from './ingestion-parser';
import { sourceMapToManuscriptText } from './extractor';
import { reproduceAcceptanceLocator } from './parser-acceptance-contract';
import type { ParserCascadeRunner } from './index';

const EXPECTED_TEXT = 'OpenScience evidence document';
const EXPECTED_SCAN_TEXT = 'PULSE 42 FS';

// Small deterministic fixtures generated from the ISO PDF and OOXML container structures.
// They contain no user data and let the deployed worker prove its native parser runtime.
const PDF_FIXTURE = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNjAgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3MjAgVGQgKE9wZW5TY2llbmNlIGV2aWRlbmNlIGRvY3VtZW50KSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzExIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDIxCiUlRU9GCg==',
  'base64',
);

const DOCX_FIXTURE = Buffer.from(
  'UEsDBBQAAAAIAAO4CV15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgAA7gJXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAAO4CV025I2sqwAAAPEAAAARAAAAd29yZC9kb2N1bWVudC54bWxFjk0OgjAQha/SdC9FF8YQwJ1bTdQD1HaEJnSGdCrI7W0xxs2b/29efXz7QUwQ2BE2cluUUgAasg67Rt5vp81BCo4arR4IoZELsDy29VxZMi8PGEUCIFdzI/sYx0opNj14zQWNgGn2pOB1TGXo1EzBjoEMMCe+H9SuLPfKa4cyIx9klxzHLCFLbM+JcjUueQIBk7Nr8vtdq7ySNay6HjKYeAlqbXyJ6u+2/QBQSwECFAAUAAAACAADuAldeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIAAO4CV2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUABQAAAAIAAO4CV025I2sqwAAAPEAAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADJAgAAAAA=',
  'base64',
);

const RASTER_GLYPHS: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};

function buildPdf(objects: Buffer[]): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'), object, Buffer.from('\nendobj\n', 'ascii'),
    ]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xrefOffset = length;
  const xrefRows = offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
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

function rasterizeText(text: string): { width: number; height: number; pixels: Buffer } {
  const scale = 3;
  const margin = 2;
  const width = margin * 2 + text.length * 6 * scale;
  const height = margin * 2 + 7 * scale;
  const pixels = Buffer.alloc(width * height, 0xff);
  [...text].forEach((character, characterIndex) => {
    const glyph = RASTER_GLYPHS[character];
    if (!glyph) throw new Error(`unsupported raster glyph: ${character}`);
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel !== '1') return;
        for (let y = 0; y < scale; y += 1) {
          for (let x = 0; x < scale; x += 1) {
            const targetX = margin + characterIndex * 6 * scale + columnIndex * scale + x;
            const targetY = margin + rowIndex * scale + y;
            pixels[targetY * width + targetX] = 0;
          }
        }
      });
    });
  });
  return { width, height, pixels };
}

function createScannedTextPdf(): Buffer {
  const raster = rasterizeText(EXPECTED_SCAN_TEXT);
  const content = Buffer.from('q 360 0 0 45 72 600 cm /Im0 Do Q', 'ascii');
  return buildPdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 6 0 R >> >> /Contents 5 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'ascii'),
    pdfStream(content),
    pdfStream(
      raster.pixels,
      `/Type /XObject /Subtype /Image /Width ${raster.width} /Height ${raster.height} /ColorSpace /DeviceGray /BitsPerComponent 8 `,
    ),
  ]);
}

const SCANNED_PDF_FIXTURE = createScannedTextPdf();

export function createParserSelfTestFixtures(): { pdf: Buffer; docx: Buffer; scanPdf: Buffer } {
  return {
    pdf: Buffer.from(PDF_FIXTURE),
    docx: Buffer.from(DOCX_FIXTURE),
    scanPdf: Buffer.from(SCANNED_PDF_FIXTURE),
  };
}

function parserInput(artifactId: string, content: Buffer, mediaType: string) {
  return {
    artifactId,
    contentHash: createHash('sha256').update(content).digest('hex'),
    content: Buffer.from(content),
    mediaType,
  };
}

type SelfTestItem = {
  format: string;
  status: ParsedIngestion['status'];
  textMatched: boolean;
};

type ScanSelfTestItem = SelfTestItem & {
  locatorMatched: boolean;
  tesseractMatched: boolean;
  confidenceMatched: boolean;
  boundingBoxMatched: boolean;
};

function summarize(parsed: ParsedIngestion): SelfTestItem {
  return {
    format: parsed.format,
    status: parsed.status,
    textMatched: parsed.status === 'ready' && parsed.text.includes(EXPECTED_TEXT),
  };
}

export async function runParserSelfTest(): Promise<{ pdf: SelfTestItem; docx: SelfTestItem }> {
  const adapters = createDefaultIngestionAdapters();
  const fixtures = createParserSelfTestFixtures();
  const [pdf, docx] = await Promise.all([
    parseIngestionWithAdapters('fixture.pdf', fixtures.pdf, adapters),
    parseIngestionWithAdapters('fixture.docx', fixtures.docx, adapters),
  ]);
  return { pdf: summarize(pdf), docx: summarize(docx) };
}

export async function runParserCascadeSelfTest(parserCascade: ParserCascadeRunner): Promise<{
  schemaVersion: 2;
  pdf: SelfTestItem;
  docx: SelfTestItem;
  scan: ScanSelfTestItem;
  candidateFallbackDisabled: boolean;
}> {
  const candidateFallbackDisabled = parserCascade.featureFlags.localOcr
    && !parserCascade.featureFlags.detectLayout
    && !parserCascade.featureFlags.grobid
    && !parserCascade.featureFlags.llmOcr;
  if (!candidateFallbackDisabled) throw new Error('parser cascade self-test failed: candidate fallback enabled');
  const fixtures = createParserSelfTestFixtures();
  const authorization = {
    trustedAuthorizationContext: {
      taskId: 'parser-self-test', workspaceId: 'parser-self-test', actorId: 'parser-self-test',
    },
    externalProcessingEligible: false,
  };
  const [pdf, docx, scan] = await Promise.all([
    parserCascade(parserInput('self-test-pdf', fixtures.pdf, 'application/pdf'), authorization),
    parserCascade(parserInput(
      'self-test-docx',
      fixtures.docx,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ), authorization),
    parserCascade(parserInput('self-test-scan', fixtures.scanPdf, 'application/pdf'), authorization),
  ]);
  const summarizeCascade = (
    result: Awaited<ReturnType<ParserCascadeRunner>>,
    format: string,
  ): SelfTestItem => {
    const text = result.status === 'succeeded' ? sourceMapToManuscriptText(result.sourceMap) : '';
    return {
      format,
      status: result.status === 'succeeded' ? 'ready' : 'needs_review',
      textMatched: text.includes(EXPECTED_TEXT),
    };
  };
  const pdfSummary = summarizeCascade(pdf, 'pdf');
  const docxSummary = summarizeCascade(docx, 'docx');
  const scanSummary: ScanSelfTestItem = (() => {
    if (scan.status !== 'succeeded') {
      return {
        format: 'pdf', status: 'needs_review', textMatched: false, locatorMatched: false,
        tesseractMatched: false, confidenceMatched: false, boundingBoxMatched: false,
      };
    }
    const blocks = scan.sourceMap.pages.flatMap((page) => page.blocks);
    const tesseractBlocks = blocks.filter((block) => block.parser.name === 'tesseract');
    const textMatched = reproduceAcceptanceLocator(scan.sourceMap, {
      kind: 'page-text', page: 1, quote: EXPECTED_SCAN_TEXT,
    });
    const locatorMatched = textMatched && tesseractBlocks.length > 0 && tesseractBlocks.every((block) => {
      try {
        const locator = createBlockSourceLocator(scan.sourceMap, block.id);
        return resolveSourceLocator(scan.sourceMap, locator).id === block.id;
      } catch {
        return false;
      }
    });
    return {
      format: 'pdf', status: 'ready', textMatched, locatorMatched,
      tesseractMatched: tesseractBlocks.length > 0
        && tesseractBlocks.every((block) => block.parser.version === '5.3.0'),
      confidenceMatched: tesseractBlocks.length > 0 && tesseractBlocks.every((block) =>
        typeof block.confidence === 'number' && block.confidence > 0 && block.confidence <= 1),
      boundingBoxMatched: tesseractBlocks.length > 0
        && tesseractBlocks.every((block) => block.boundingBox.width > 0 && block.boundingBox.height > 0),
    };
  })();
  if (!pdfSummary.textMatched || !docxSummary.textMatched) {
    throw new Error('parser cascade self-test failed: native text missing');
  }
  if (!scanSummary.textMatched || !scanSummary.locatorMatched || !scanSummary.tesseractMatched
    || !scanSummary.confidenceMatched || !scanSummary.boundingBoxMatched) {
    const failedChecks = Object.entries(scanSummary)
      .filter(([, value]) => value === false)
      .map(([name]) => name)
      .join(',');
    throw new Error(`parser cascade self-test failed: scan OCR text/locator missing (${failedChecks})`);
  }
  return {
    schemaVersion: 2,
    pdf: pdfSummary,
    docx: docxSummary,
    scan: scanSummary,
    candidateFallbackDisabled,
  };
}

if (require.main === module) {
  void runParserSelfTest().then((result) => {
    if (!result.pdf.textMatched || !result.docx.textMatched) {
      console.error('PARSER_SELF_TEST_FAILED');
      process.exitCode = 1;
      return;
    }
    console.log('PARSER_SELF_TEST_OK pdf=ready docx=ready');
  }).catch(() => {
    console.error('PARSER_SELF_TEST_FAILED');
    process.exitCode = 1;
  });
}
