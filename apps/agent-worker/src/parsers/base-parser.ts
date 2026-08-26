import { createHash } from 'node:crypto';
import {
  parseDocumentSourceMap,
  parseExtractionResult,
  type DocumentParserMetadata,
  type DocumentSourceMap,
  type ExtractionResult,
} from '@openscience/domain';
import type { DocumentParser, ParserInput } from './types';

export class ParserContractError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ParserContractError';
  }
}

function requireNonEmptyString(value: string, label: string): void {
  if (!value.trim()) throw new ParserContractError(`${label} must be a non-empty string`);
}

function equalMetadata(actual: DocumentParserMetadata, expected: DocumentParserMetadata): boolean {
  return actual.name === expected.name
    && actual.version === expected.version
    && actual.modelHash === expected.modelHash;
}

function validateInput(input: ParserInput): void {
  requireNonEmptyString(input.artifactId, 'ParserInput artifactId');
  requireNonEmptyString(input.mediaType, 'ParserInput mediaType');
  const actualHash = createHash('sha256').update(input.content).digest('hex');
  if (input.contentHash !== actualHash) throw new ParserContractError('ParserInput contentHash does not match content');
}

function parseResult(value: ExtractionResult<DocumentSourceMap>): ExtractionResult<DocumentSourceMap> {
  try {
    return parseExtractionResult(JSON.stringify(value), parseDocumentSourceMap);
  } catch (error) {
    throw new ParserContractError('Document parser returned an invalid extraction result', { cause: error });
  }
}

function validateSourceMapIdentity(sourceMap: DocumentSourceMap, input: ParserInput, metadata: DocumentParserMetadata): void {
  if (sourceMap.artifactId !== input.artifactId) throw new ParserContractError('DocumentSourceMap artifactId does not match parser input');
  if (sourceMap.contentHash !== input.contentHash) throw new ParserContractError('DocumentSourceMap contentHash does not match parser input');
  if (!equalMetadata(sourceMap.parser, metadata)) throw new ParserContractError('DocumentSourceMap parser metadata does not match selected parser');
}

/**
 * Executes an untrusted parser behind the strict domain contract.
 * Provider failures are left intact; only output contract violations become ParserContractError.
 */
export async function runDocumentParser(
  input: ParserInput,
  parser: DocumentParser,
): Promise<ExtractionResult<DocumentSourceMap>> {
  validateInput(input);
  if (!await parser.supports(input)) throw new ParserContractError('Document parser does not support this input');

  const result = parseResult(await parser.parse(input));
  if (result.status !== 'succeeded' && result.status !== 'needs_review') return result;

  validateSourceMapIdentity(result.sourceMap, input, parser.metadata);
  if (result.status === 'succeeded' && result.sourceMap.pages.every((page) => page.blocks.length === 0)) {
    throw new ParserContractError('Succeeded DocumentSourceMap must contain at least one block');
  }
  return result;
}
