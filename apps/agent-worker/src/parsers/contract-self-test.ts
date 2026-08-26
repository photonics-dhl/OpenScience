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
      ],
    }],
  };
}

/** Executes deterministic source-map and locator round trips without external parser providers. */
export function runDocumentParserContractSelfTest(): void {
  const sourceMap = deserializeDocumentSourceMap(serializeDocumentSourceMap(fixture()));
  const blockLocator = deserializeSourceLocator(serializeSourceLocator(
    createBlockSourceLocator(sourceMap, 'paragraph-1', { charRange: { start: 0, end: 8 } }),
  ));
  const tableLocator = deserializeSourceLocator(serializeSourceLocator(
    createTableCellSourceLocator(sourceMap, 'table-1', { sheet: 'Evidence', row: 2, column: 2 }),
  ));
  const codeLocator = deserializeSourceLocator(serializeSourceLocator(
    createCodeSourceLocator(sourceMap.artifactId, sourceMap.contentHash, { commit: 'a'.repeat(40), path: 'analysis.py', startLine: 1, endLine: 2 }),
  ));
  if (resolveSourceLocator(sourceMap, blockLocator).id !== 'paragraph-1'
    || resolveSourceLocator(sourceMap, tableLocator).id !== 'table-1'
    || codeLocator.codeRange?.path !== 'analysis.py') {
    throw new Error('document parser contract self-test failed');
  }
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
