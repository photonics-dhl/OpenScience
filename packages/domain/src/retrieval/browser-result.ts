/** Browser-safe retrieval DTO and identifier grammar; no database or Node imports. */
export interface BrowserSourceRetrieveResult {
  sources: Array<{ id: string; provider: string; title: string; sourceUrl: string; identifiers: { doi?: string; arxiv?: string }; rights: Record<string, unknown>; temporaryDocumentId?: string; expiresAt?: string }>;
  providers: Array<{ provider: string; status: string; code?: string }>;
}

const SOURCE_RETRIEVE_IDENTIFIER = /^(?:10\.\d{4,9}\/[-._;()/:a-z0-9]+|(?:arxiv:)?\d{4}\.\d{4,5}(?:v\d+)?)$/iu;

export function isSourceRetrieveIdentifier(value: string): boolean {
  return SOURCE_RETRIEVE_IDENTIFIER.test(value.trim());
}

export function toBrowserSourceRetrieveResult(value: { sources: Array<{ id: string; provider: string; title: string; sourceUrl: string; identifiers?: { doi?: string; arxiv?: string }; rights: Record<string, unknown>; temporaryDocumentId?: string; expiresAt?: Date | string }>; providers: Array<{ provider: string; status: string; code?: string }> }): BrowserSourceRetrieveResult {
  return {
    sources: value.sources.map((source) => ({
      id: source.id, provider: source.provider, title: source.title, sourceUrl: source.sourceUrl, identifiers: source.identifiers ?? {}, rights: source.rights,
      ...(source.temporaryDocumentId && source.expiresAt ? { temporaryDocumentId: source.temporaryDocumentId, expiresAt: source.expiresAt instanceof Date ? source.expiresAt.toISOString() : source.expiresAt } : {}),
    })),
    providers: value.providers.map((provider) => ({ ...provider })),
  };
}
