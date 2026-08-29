import {
  createBlockSourceLocator,
  createCodeSourceLocator,
  createTableCellSourceLocator,
  deserializeDocumentSourceMap,
  deserializeSourceLocator,
  resolveSourceLocator,
  serializeDocumentSourceMap,
  serializeSourceLocator,
  type DocumentSourceMap,
} from '@openscience/domain';
import { deepStrictEqual } from 'node:assert';

const CONTENT_HASH = 'a'.repeat(64);

function fixture(): DocumentSourceMap {
  return {
    artifactId: 'self-test-artifact',
    contentHash: CONTENT_HASH,
    parser: { name: 'self-test-parser', version: '1.0.0' },
    pages: [{
      page: 1,
      width: 612.25,
      height: 792.5,
      blocks: [
        {
          id: 'paragraph-1', kind: 'paragraph', text: 'Measured pulse width is 42 fs.',
          boundingBox: { x: 72.125, y: 600.25, width: 310.5, height: 18.75 },
          confidence: 0.975, parser: { name: 'self-test-parser', version: '1.0.0' },
          transformations: [{ stage: 'extract_text', processor: { name: 'self-test-parser', version: '1.0.0' } }],
        },
        {
          id: 'table-1', kind: 'table',
          boundingBox: { x: 72.125, y: 400.25, width: 310.5, height: 100.75 },
          parser: { name: 'self-test-parser', version: '1.0.0' }, transformations: [],
        },
        {
          id: 'figure-1', kind: 'figure',
          boundingBox: { x: 72.125, y: 250.5, width: 310.5, height: 120.25 },
          parser: { name: 'self-test-parser', version: '1.0.0' }, transformations: [],
        },
      ],
    }],
  };
}

/** Executes deterministic source-map and locator round trips without external parser providers. */
export function runDocumentParserContractSelfTest(): void {
  const expectedMap = fixture();
  const sourceMap = deserializeDocumentSourceMap(serializeDocumentSourceMap(expectedMap));
  deepStrictEqual(sourceMap, expectedMap);

  const expectedBlockLocator = {
    artifactId: 'self-test-artifact', contentHash: CONTENT_HASH, blockId: 'paragraph-1', page: 1,
    boundingBox: { x: 72.125, y: 600.25, width: 310.5, height: 18.75 }, charRange: { start: 0, end: 8 },
  };
  const expectedFigureLocator = {
    artifactId: 'self-test-artifact', contentHash: CONTENT_HASH, blockId: 'figure-1', page: 1,
    boundingBox: { x: 72.125, y: 250.5, width: 310.5, height: 120.25 },
  };
  const expectedTableLocator = {
    artifactId: 'self-test-artifact', contentHash: CONTENT_HASH, blockId: 'table-1', page: 1,
    boundingBox: { x: 72.125, y: 400.25, width: 310.5, height: 100.75 }, tableCell: { sheet: 'Evidence', row: 2, column: 2 },
  };
  const expectedCodeLocator = {
    artifactId: 'self-test-artifact', contentHash: CONTENT_HASH,
    codeRange: { commit: 'a'.repeat(40), path: 'analysis.py', startLine: 1, endLine: 2 },
  };
  const blockLocator = createBlockSourceLocator(sourceMap, 'paragraph-1', { charRange: { start: 0, end: 8 } });
  const figureLocator = createBlockSourceLocator(sourceMap, 'figure-1');
  const tableLocator = createTableCellSourceLocator(sourceMap, 'table-1', { sheet: 'Evidence', row: 2, column: 2 });
  const codeLocator = createCodeSourceLocator(sourceMap.artifactId, sourceMap.contentHash, { commit: 'a'.repeat(40), path: 'analysis.py', startLine: 1, endLine: 2 });
  deepStrictEqual(blockLocator, expectedBlockLocator);
  deepStrictEqual(figureLocator, expectedFigureLocator);
  deepStrictEqual(tableLocator, expectedTableLocator);
  deepStrictEqual(codeLocator, expectedCodeLocator);
  deepStrictEqual(deserializeSourceLocator(serializeSourceLocator(blockLocator)), expectedBlockLocator);
  deepStrictEqual(deserializeSourceLocator(serializeSourceLocator(figureLocator)), expectedFigureLocator);
  deepStrictEqual(deserializeSourceLocator(serializeSourceLocator(tableLocator)), expectedTableLocator);
  deepStrictEqual(deserializeSourceLocator(serializeSourceLocator(codeLocator)), expectedCodeLocator);
  deepStrictEqual(resolveSourceLocator(sourceMap, blockLocator), sourceMap.pages[0]?.blocks[0]);
  deepStrictEqual(resolveSourceLocator(sourceMap, figureLocator), sourceMap.pages[0]?.blocks[2]);
  deepStrictEqual(resolveSourceLocator(sourceMap, tableLocator), sourceMap.pages[0]?.blocks[1]);
}

if (require.main === module) {
  try {
    runDocumentParserContractSelfTest();
    process.stdout.write('DOCUMENT_PARSER_CONTRACT_OK\n');
  } catch {
    process.stderr.write('DOCUMENT_PARSER_CONTRACT_FAILED\n');
    process.exitCode = 1;
  }
}
