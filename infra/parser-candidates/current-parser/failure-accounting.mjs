import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ERROR_CODES = new Set(['parser_exit', 'timeout', 'limit_exceeded', 'invalid_output']);
const MAX_INPUT_BYTES = 65_536;

function nonnegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a nonnegative integer`);
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = nonnegativeInteger(value, name);
  if (parsed === 0) throw new Error(`${name} must be positive`);
  return parsed;
}

function validatedMeasurement(value) {
  if (!value || Array.isArray(value)) return undefined;
  const allowed = new Set(['status', 'locatorMatches', 'elapsedMs', 'peakRssBytes', 'errorCode']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  if (!['succeeded', 'needs_review', 'failed'].includes(value.status)) return undefined;
  for (const key of ['locatorMatches', 'elapsedMs', 'peakRssBytes']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return undefined;
  }
  return value;
}

export function accountFailedRun({ errorCode, externalElapsedMs, externalPeakRssBytes, runnerOutcome }) {
  if (!ERROR_CODES.has(errorCode)) throw new Error('invalid failure code');
  const elapsed = nonnegativeInteger(externalElapsedMs, 'external elapsed');
  const peak = positiveInteger(externalPeakRssBytes, 'external peak RSS');
  const measured = validatedMeasurement(runnerOutcome);
  return {
    status: 'failed',
    locatorMatches: 0,
    elapsedMs: Math.max(1, elapsed, measured?.elapsedMs ?? 0),
    peakRssBytes: Math.max(peak, measured?.peakRssBytes ?? 0),
    errorCode,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const input = readFileSync(0);
  if (input.length > MAX_INPUT_BYTES) throw new Error('runner measurement input exceeded bound');
  let runnerOutcome;
  if (input.length > 0) {
    try {
      runnerOutcome = JSON.parse(input.toString('utf8'));
    } catch {
      runnerOutcome = undefined;
    }
  }
  const value = accountFailedRun({
    errorCode: process.argv[2],
    externalElapsedMs: process.argv[3],
    externalPeakRssBytes: process.argv[4],
    runnerOutcome,
  });
  process.stdout.write(JSON.stringify(value));
}
