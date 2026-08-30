type SourceRetrieveRetryPayloadParityCase = {
  readonly name: string;
  readonly eligible: boolean;
  readonly storageApplicability: 'postgresql-jsonb' | 'javascript-only';
  readonly payload: Readonly<Record<string, unknown>>;
};

export const SOURCE_RETRIEVE_RETRY_PAYLOAD_PARITY_CASES = [
  {
    name: 'metadata acquisition',
    eligible: true,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'attosecond dynamics', providers: ['semantic_scholar', 'tavily'],
      limit: 10, includeFullText: false, retryContractVersion: 1,
    },
  },
  {
    name: 'DOI full text acquisition',
    eligible: true,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.1038/NATURE12373', retryContractVersion: 1,
    },
  },
  {
    name: 'versioned arXiv full text acquisition',
    eligible: true,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: 'arXiv:2401.01234v2', retryContractVersion: 1,
    },
  },
  {
    name: 'historical unmarked task',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.1038/nature12373',
    },
  },
  {
    name: 'marker-only malformed task',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: { query: 'Paper', retryContractVersion: 1 },
  },
  {
    name: 'unknown durable field',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.1038/nature12373', retryContractVersion: 1, injected: true,
    },
  },
  {
    name: 'unnormalized query',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: ' Paper ', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.1038/nature12373', retryContractVersion: 1,
    },
  },
  {
    name: 'tab-wrapped query',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: '\tPaper\t', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.1038/nature12373', retryContractVersion: 1,
    },
  },
  {
    name: 'metadata provider order mismatch',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['tavily', 'semantic_scholar'],
      limit: 10, includeFullText: false, retryContractVersion: 1,
    },
  },
  {
    name: 'metadata identifier injection',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['semantic_scholar', 'tavily'], limit: 10,
      includeFullText: false, identifier: '10.1038/nature12373', retryContractVersion: 1,
    },
  },
  {
    name: 'metadata undefined identifier key',
    eligible: false,
    storageApplicability: 'javascript-only',
    payload: {
      query: 'Paper', providers: ['semantic_scholar', 'tavily'], limit: 10,
      includeFullText: false, identifier: undefined, retryContractVersion: 1,
    },
  },
  {
    name: 'malformed DOI',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: '10.12/nope', retryContractVersion: 1,
    },
  },
  {
    name: 'unnormalized identifier',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['scansci'], limit: 1, includeFullText: true,
      identifier: ' 10.1038/nature12373 ', retryContractVersion: 1,
    },
  },
  {
    name: 'wrong JSON scalar types',
    eligible: false,
    storageApplicability: 'postgresql-jsonb',
    payload: {
      query: 'Paper', providers: ['scansci'], limit: '1', includeFullText: true,
      identifier: '10.1038/nature12373', retryContractVersion: 1,
    },
  },
] as const satisfies readonly SourceRetrieveRetryPayloadParityCase[];
