export const EXTRACTION_BLOCK_CODES = ['rights_unknown', 'malware', 'limit_exceeded'] as const;
export type ExtractionBlockCode = (typeof EXTRACTION_BLOCK_CODES)[number];

export type ExtractionResult<TSourceMap> =
  | { status: 'succeeded'; sourceMap: TSourceMap; warnings: string[] }
  | { status: 'needs_review'; sourceMap: TSourceMap; reasons: string[] }
  | { status: 'blocked'; code: ExtractionBlockCode; message: string }
  | { status: 'failed'; retryable: boolean; provider: string; message: string };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ExtractionResult must be an object');
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`ExtractionResult has unknown field "${unknown}"`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_000) {
    throw new Error(`ExtractionResult ${label} must be a non-empty string`);
  }
  return value;
}

function stringList(value: unknown, label: string, requireEntry: boolean): string[] {
  if (!Array.isArray(value) || (requireEntry && value.length < 1) || value.length > 100
    || value.some((entry) => typeof entry !== 'string' || !entry.trim() || entry.length > 500)) {
    throw new Error(`ExtractionResult ${label} must be an array of non-empty strings`);
  }
  return value as string[];
}

export function serializeExtractionResult<TSourceMap>(
  result: ExtractionResult<TSourceMap>,
  parseSourceMap: (value: unknown) => TSourceMap,
): string {
  const json = JSON.stringify(result);
  const normalized = parseExtractionResult(json, parseSourceMap);
  return JSON.stringify(normalized);
}

export function parseExtractionResult<TSourceMap>(
  json: string,
  parseSourceMap: (value: unknown) => TSourceMap,
): ExtractionResult<TSourceMap> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('ExtractionResult JSON is invalid');
  }
  const value = record(parsed);

  if (value.status === 'succeeded') {
    onlyKeys(value, ['status', 'sourceMap', 'warnings']);
    return {
      status: 'succeeded',
      sourceMap: parseSourceMap(value.sourceMap),
      warnings: stringList(value.warnings, 'warnings', false),
    };
  }
  if (value.status === 'needs_review') {
    onlyKeys(value, ['status', 'sourceMap', 'reasons']);
    return {
      status: 'needs_review',
      sourceMap: parseSourceMap(value.sourceMap),
      reasons: stringList(value.reasons, 'reasons', true),
    };
  }
  if (value.status === 'blocked') {
    onlyKeys(value, ['status', 'code', 'message']);
    if (typeof value.code !== 'string' || !EXTRACTION_BLOCK_CODES.includes(value.code as ExtractionBlockCode)) {
      throw new Error('ExtractionResult blocked code is invalid');
    }
    return {
      status: 'blocked',
      code: value.code as ExtractionBlockCode,
      message: requiredString(value.message, 'message'),
    };
  }
  if (value.status === 'failed') {
    onlyKeys(value, ['status', 'retryable', 'provider', 'message']);
    if (typeof value.retryable !== 'boolean') throw new Error('ExtractionResult retryable must be boolean');
    return {
      status: 'failed',
      retryable: value.retryable,
      provider: requiredString(value.provider, 'provider'),
      message: requiredString(value.message, 'message'),
    };
  }

  throw new Error('ExtractionResult status is invalid');
}
