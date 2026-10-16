import Ajv from 'ajv';
import { SDF_CORE_FIELDS, type SdfCore } from './core';
import { validateSdfCore, validateSdfDraftCore, type ValidationResult } from './validate';

/** Snapshot reading capability; fresh writers continue to use SDF_CORE_VERSION. */
export const SDF_READABLE_CORE_VERSION = '0.2.0';
export type SdfField = (typeof SDF_CORE_FIELDS)[number];
export type SdfFieldFormat = 'plain' | 'markdown';
export type FormattedSdfCore = Omit<SdfCore, 'schemaVersion'> & {
  schemaVersion: typeof SDF_READABLE_CORE_VERSION;
  fieldFormats?: Partial<Record<SdfField, SdfFieldFormat>>;
};
export type ReadableSdfCore = SdfCore | FormattedSdfCore;

function formattedCoreSchema(full: boolean) {
  return {
    type: 'object',
    required: ['schemaVersion', ...SDF_CORE_FIELDS],
    properties: {
      schemaVersion: { const: SDF_READABLE_CORE_VERSION },
      ...Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, { type: 'string', ...(full ? { minLength: 1 } : {}) }])),
      fieldFormats: {
        type: 'object',
        properties: Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, { enum: ['plain', 'markdown'] }])),
        additionalProperties: false,
      },
    },
  };
}

const ajv = new Ajv({ allErrors: true });
const fullValidate = ajv.compile(formattedCoreSchema(true));
const draftValidate = ajv.compile(formattedCoreSchema(false));

function isFormattedIdentity(doc: unknown): boolean {
  return !!doc && typeof doc === 'object' && !Array.isArray(doc)
    && (doc as { schemaVersion?: unknown }).schemaVersion === SDF_READABLE_CORE_VERSION;
}

/** Full frozen snapshot validation, including the original nonempty legacy rules. */
export function validateReadableSdfCore(doc: unknown): ValidationResult {
  if (!isFormattedIdentity(doc)) return validateSdfCore(doc);
  const ok = fullValidate(doc);
  return { ok, errors: fullValidate.errors ?? [] };
}

/** Readable drafts retain explicit unresolved fields; fields may not be missing. */
export function validateReadableSdfDraftCore(doc: unknown): ValidationResult {
  if (!isFormattedIdentity(doc)) return validateSdfDraftCore(doc);
  const ok = draftValidate(doc);
  return { ok, errors: draftValidate.errors ?? [] };
}

/** Never normalize, strip metadata, or substitute an editable empty legacy core. */
export function parseReadableSdfCore(doc: unknown): ReadableSdfCore | null {
  return validateReadableSdfDraftCore(doc).ok ? doc as ReadableSdfCore : null;
}
