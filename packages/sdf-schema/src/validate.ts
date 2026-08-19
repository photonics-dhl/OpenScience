import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { coreSchema, draftCoreSchema } from './core';
import { manifestSchema } from './manifest';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv); // date-time 等格式校验（manifest.publishedAt）

export interface ValidationResult {
  ok: boolean;
  errors: ErrorObject[];
}

/** 模块级编译缓存（compile 一次，避免每次校验重编译）。 */
const coreValidate = ajv.compile(coreSchema);

export function validateSdfCore(doc: unknown): ValidationResult {
  const ok = coreValidate(doc);
  return { ok, errors: coreValidate.errors ?? [] };
}

const draftCoreValidate = ajv.compile(draftCoreSchema);

export function validateSdfDraftCore(doc: unknown): ValidationResult {
  const ok = draftCoreValidate(doc);
  return { ok, errors: draftCoreValidate.errors ?? [] };
}

const manifestValidate = ajv.compile(manifestSchema);

export function validateManifest(doc: unknown): ValidationResult {
  const ok = manifestValidate(doc);
  return { ok, errors: manifestValidate.errors ?? [] };
}
