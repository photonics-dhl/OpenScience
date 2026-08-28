import { createHash } from 'node:crypto';
import { createBlockSourceLocator, resolveSourceLocator } from '@openscience/domain';
import { createDefaultIngestionAdapters, parseIngestionWithAdapters, type ParsedIngestion } from './ingestion-parser';
import { sourceMapToManuscriptText } from './extractor';
import type { ParserCascadeRunner } from './index';

const EXPECTED_TEXT = 'OpenScience evidence document';
const EXPECTED_SCAN_TEXT = 'OCR 42 FS';

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

const SCAN_FIXTURE = Buffer.from(
  // 305x55 grayscale PNG: opaque black 5x7 glyphs spelling "OCR 42 FS" on white.
  'iVBORw0KGgoAAAANSUhEUgAAATEAAAA3CAAAAABBICIdAAAAu0lEQVR42u3ZSwqAMAwFwN7/0roW2pr0g6jztpLQzCYEyyG5FATEiBEjRkyIESP2arFyTbWkkujX8LO6ZYPtSyu5AYkRI0bsO2LN4ugg0S7RuVa3H3x9e1cSI0aMGLF1I+WNiREjRozYo2Kbz5jpLZw6A4kRI0aM2JZ9t2WtTVdUDYgRI0aM2GxFfrgtTYkRI0bsh2KBCyFwbEz/GelX5A+p1TceMWLEiH1NTG7dERAjRowYMSFGjNircgLBi0PCBIe/PAAAAABJRU5ErkJggg==',
  'base64',
);

export function createParserSelfTestFixtures(): { pdf: Buffer; docx: Buffer } {
  return {
    pdf: Buffer.from(PDF_FIXTURE),
    docx: Buffer.from(DOCX_FIXTURE),
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

type ScanSelfTestItem = SelfTestItem & { locatorMatched: boolean };

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
  const candidateFallbackDisabled = Object.values(parserCascade.featureFlags).every((enabled) => !enabled);
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
    parserCascade(parserInput('self-test-scan', SCAN_FIXTURE, 'image/png'), authorization),
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
      return { format: 'png', status: 'needs_review', textMatched: false, locatorMatched: false };
    }
    const block = scan.sourceMap.pages
      .flatMap((page) => page.blocks)
      .find((candidate) => candidate.text?.includes(EXPECTED_SCAN_TEXT));
    if (!block) return { format: 'png', status: 'ready', textMatched: false, locatorMatched: false };
    let locatorMatched = false;
    try {
      const locator = createBlockSourceLocator(scan.sourceMap, block.id, {
        charRange: {
          start: block.text!.indexOf(EXPECTED_SCAN_TEXT),
          end: block.text!.indexOf(EXPECTED_SCAN_TEXT) + EXPECTED_SCAN_TEXT.length,
        },
      });
      locatorMatched = resolveSourceLocator(scan.sourceMap, locator).id === block.id;
    } catch {
      locatorMatched = false;
    }
    return { format: 'png', status: 'ready', textMatched: true, locatorMatched };
  })();
  if (!pdfSummary.textMatched || !docxSummary.textMatched) {
    throw new Error('parser cascade self-test failed: native text missing');
  }
  if (!scanSummary.textMatched || !scanSummary.locatorMatched) {
    throw new Error('parser cascade self-test failed: scan OCR text/locator missing');
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
