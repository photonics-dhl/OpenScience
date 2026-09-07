export type SuggestionEvidenceLocation =
  | { status: 'located'; blockId: string; page?: number }
  | { status: 'ambiguous' | 'cross_block' | 'missing' | 'unverified' };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasOnlyKeys(record: JsonRecord, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isNonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidEvidenceIdentity(value: unknown): value is JsonRecord {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['artifactId', 'contentHash'])
  ) {
    return false;
  }
  return (
    hasOwn(value, 'artifactId') &&
    hasOwn(value, 'contentHash') &&
    isNonblank(value.artifactId) &&
    value.artifactId.length <= 200 &&
    typeof value.contentHash === 'string' &&
    /^[0-9a-f]{64}$/.test(value.contentHash)
  );
}

function isValidCharRange(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['start', 'end']) &&
    hasOwn(value, 'start') &&
    hasOwn(value, 'end') &&
    isSafeInteger(value.start) &&
    isSafeInteger(value.end) &&
    value.start >= 0 &&
    value.start < value.end
  );
}

function isValidBoundingBox(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['x', 'y', 'width', 'height']) &&
    ['x', 'y', 'width', 'height'].every((key) => hasOwn(value, key)) &&
    isFiniteNumber(value.x) &&
    value.x >= 0 &&
    isFiniteNumber(value.y) &&
    value.y >= 0 &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0
  );
}

/**
 * Normalizes display metadata from the same extraction result.
 * This does not resolve source maps, authorize actions, or verify scientific claims.
 */
export function getSuggestionEvidenceLocation(
  field: string,
  quote: unknown,
  canonicalContext?: unknown,
): SuggestionEvidenceLocation {
  if (
    ![
      'problem',
      'insight',
      'method',
      'results',
      'limitations',
      'reproducibility',
    ].includes(field) ||
    !isNonblank(quote) ||
    !isRecord(canonicalContext) ||
    !hasOwn(canonicalContext, 'sourceMapIdentity') ||
    !isValidEvidenceIdentity(canonicalContext.sourceMapIdentity) ||
    !hasOwn(canonicalContext, 'evidence') ||
    !isRecord(canonicalContext.evidence) ||
    !hasOwn(canonicalContext.evidence, field) ||
    !hasOwn(canonicalContext, 'evidenceLocation') ||
    !isRecord(canonicalContext.evidenceLocation) ||
    !hasOwn(canonicalContext.evidenceLocation, field)
  ) {
    return { status: 'unverified' };
  }

  const evidence = canonicalContext.evidence[field];
  const location = canonicalContext.evidenceLocation[field];
  const reference = canonicalContext.sourceMapIdentity;

  if (
    !isRecord(evidence) ||
    !hasOwn(evidence, 'quote') ||
    evidence.quote !== quote ||
    !isRecord(location) ||
    !hasOwn(location, 'status')
  ) {
    return { status: 'unverified' };
  }

  switch (location.status) {
    case 'ambiguous':
    case 'cross_block':
    case 'missing':
      return { status: location.status };
    case 'located':
      break;
    default:
      return { status: 'unverified' };
  }

  if (!hasOwn(location, 'sourceLocator')) {
    return { status: 'unverified' };
  }

  const locator = location.sourceLocator;

  if (
    !isRecord(locator) ||
    !hasOnlyKeys(locator, [
      'artifactId',
      'contentHash',
      'blockId',
      'page',
      'charRange',
      'boundingBox',
    ]) ||
    !hasOwn(locator, 'artifactId') ||
    locator.artifactId !== reference.artifactId ||
    !hasOwn(locator, 'contentHash') ||
    locator.contentHash !== reference.contentHash ||
    !hasOwn(locator, 'blockId') ||
    !isNonblank(locator.blockId) ||
    (hasOwn(locator, 'charRange') && !isValidCharRange(locator.charRange)) ||
    (hasOwn(locator, 'boundingBox') && !isValidBoundingBox(locator.boundingBox))
  ) {
    return { status: 'unverified' };
  }

  if (hasOwn(locator, 'page')) {
    if (!isSafeInteger(locator.page) || locator.page <= 0) {
      return { status: 'unverified' };
    }

    return {
      status: 'located',
      blockId: locator.blockId,
      page: locator.page,
    };
  }

  return { status: 'located', blockId: locator.blockId };
}
