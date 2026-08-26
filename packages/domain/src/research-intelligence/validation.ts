import { RESEARCH_IDENTITIES, type ResearchIdentityProfile, type SourceLocator } from './types';

export type ResearchIntelligenceValidationCode =
  | 'INVALID_IDENTITY_PROFILE'
  | 'INVALID_SOURCE_LOCATOR'
  | 'INVALID_CLAIM_GRAPH';

export class ResearchIntelligenceValidationError extends Error {
  constructor(
    public readonly code: ResearchIntelligenceValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'ResearchIntelligenceValidationError';
  }
}

function plainObject(value: unknown, label: string, code: ResearchIntelligenceValidationCode): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResearchIntelligenceValidationError(code, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  code: ResearchIntelligenceValidationCode,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new ResearchIntelligenceValidationError(code, `${label} has unknown field "${unknown}"`);
}

function nonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validateStringList(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', `${label} must be an array`);
  }
  if (value.some((entry) => !nonEmptyString(entry, 160))) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', `${label} contains an invalid value`);
  }
  if (new Set(value).size !== value.length) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', `${label} contains duplicates`);
  }
}

export function validateResearchIdentityProfile(value: unknown): ResearchIdentityProfile {
  const profile = plainObject(value, 'ResearchIdentityProfile', 'INVALID_IDENTITY_PROFILE');
  assertOnlyKeys(
    profile,
    ['identities', 'primaryIdentity', 'disciplines', 'methods', 'topics', 'languages'],
    'ResearchIdentityProfile',
    'INVALID_IDENTITY_PROFILE',
  );

  if (!Array.isArray(profile.identities) || profile.identities.length < 1 || profile.identities.length > RESEARCH_IDENTITIES.length) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', 'identities must contain 1-7 values');
  }
  const allowed = new Set<string>(RESEARCH_IDENTITIES);
  if (profile.identities.some((identity) => typeof identity !== 'string' || !allowed.has(identity))) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', 'identities contains an unsupported value');
  }
  if (new Set(profile.identities).size !== profile.identities.length) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', 'identities contains duplicates');
  }
  if (typeof profile.primaryIdentity !== 'string' || !allowed.has(profile.primaryIdentity)) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', 'primaryIdentity is invalid');
  }
  if (!profile.identities.includes(profile.primaryIdentity)) {
    throw new ResearchIntelligenceValidationError('INVALID_IDENTITY_PROFILE', 'primaryIdentity must be included in identities');
  }

  validateStringList(profile.disciplines, 'disciplines');
  validateStringList(profile.methods, 'methods');
  validateStringList(profile.topics, 'topics');
  validateStringList(profile.languages, 'languages');

  return value as ResearchIdentityProfile;
}

function validateBoundingBox(value: unknown, hasPage: boolean): void {
  const box = plainObject(value, 'boundingBox', 'INVALID_SOURCE_LOCATOR');
  assertOnlyKeys(box, ['x', 'y', 'width', 'height'], 'boundingBox', 'INVALID_SOURCE_LOCATOR');
  if (!hasPage) throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'boundingBox requires page');
  const values = [box.x, box.y, box.width, box.height];
  if (values.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'boundingBox values must be finite numbers');
  }
  if ((box.x as number) < 0 || (box.y as number) < 0 || (box.width as number) <= 0 || (box.height as number) <= 0) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'boundingBox origin must be non-negative and dimensions positive');
  }
}

function validateCharRange(value: unknown): void {
  const range = plainObject(value, 'charRange', 'INVALID_SOURCE_LOCATOR');
  assertOnlyKeys(range, ['start', 'end'], 'charRange', 'INVALID_SOURCE_LOCATOR');
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || (range.start as number) < 0 || (range.end as number) <= (range.start as number)) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'charRange must be an increasing non-negative half-open range');
  }
}

function validateTableCell(value: unknown): void {
  const cell = plainObject(value, 'tableCell', 'INVALID_SOURCE_LOCATOR');
  assertOnlyKeys(cell, ['sheet', 'row', 'column'], 'tableCell', 'INVALID_SOURCE_LOCATOR');
  if (cell.sheet !== undefined && !nonEmptyString(cell.sheet, 200)) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'tableCell sheet is invalid');
  }
  if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column) || (cell.row as number) < 0 || (cell.column as number) < 0) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'tableCell row and column must be non-negative integers');
  }
}

function validateCodeRange(value: unknown): void {
  const range = plainObject(value, 'codeRange', 'INVALID_SOURCE_LOCATOR');
  assertOnlyKeys(range, ['commit', 'path', 'startLine', 'endLine'], 'codeRange', 'INVALID_SOURCE_LOCATOR');
  if (!nonEmptyString(range.commit, 200) || !nonEmptyString(range.path, 1_000)) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'codeRange commit and path are required');
  }
  if (!Number.isInteger(range.startLine) || !Number.isInteger(range.endLine) || (range.startLine as number) < 1 || (range.endLine as number) < (range.startLine as number)) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'codeRange lines must be increasing one-based integers');
  }
}

export function validateSourceLocator(value: unknown): SourceLocator {
  const locator = plainObject(value, 'SourceLocator', 'INVALID_SOURCE_LOCATOR');
  assertOnlyKeys(
    locator,
    ['artifactId', 'contentHash', 'page', 'boundingBox', 'charRange', 'tableCell', 'codeRange'],
    'SourceLocator',
    'INVALID_SOURCE_LOCATOR',
  );
  if (!nonEmptyString(locator.artifactId, 200)) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'artifactId is required');
  }
  if (typeof locator.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(locator.contentHash)) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'contentHash must be a SHA-256 hex digest');
  }

  const hasPage = locator.page !== undefined;
  const hasPosition = hasPage || locator.boundingBox !== undefined || locator.charRange !== undefined
    || locator.tableCell !== undefined || locator.codeRange !== undefined;
  if (!hasPosition) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'SourceLocator requires a deterministic position');
  }
  if (hasPage && (!Number.isInteger(locator.page) || (locator.page as number) < 1)) {
    throw new ResearchIntelligenceValidationError('INVALID_SOURCE_LOCATOR', 'page must be a positive integer');
  }
  if (locator.boundingBox !== undefined) validateBoundingBox(locator.boundingBox, hasPage);
  if (locator.charRange !== undefined) validateCharRange(locator.charRange);
  if (locator.tableCell !== undefined) validateTableCell(locator.tableCell);
  if (locator.codeRange !== undefined) validateCodeRange(locator.codeRange);

  return value as SourceLocator;
}
