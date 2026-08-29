import type { DocumentParserMetadata, DocumentSourceMap, ExtractionResult } from '@openscience/domain';

/** Immutable artifact identity and bytes supplied to a document parser. */
export interface ParserInput {
  artifactId: string;
  contentHash: string;
  content: Buffer;
  mediaType: string;
}

/** Provider-neutral parser seam; implementations must return the domain contract exactly. */
export interface DocumentParser {
  metadata: DocumentParserMetadata;
  supports(input: ParserInput): boolean | Promise<boolean>;
  parse(input: ParserInput): Promise<ExtractionResult<DocumentSourceMap>>;
}
