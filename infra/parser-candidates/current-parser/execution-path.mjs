import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertDedicatedEvaluationSource(actualSource, expectedSource) {
  if (typeof actualSource !== 'string' || typeof expectedSource !== 'string'
    || !actualSource.startsWith('/') || !expectedSource.startsWith('/')) {
    throw new Error('invalid evaluation source path');
  }
  const actual = posix.normalize(actualSource);
  const expected = posix.normalize(expectedSource);
  if (!expected.startsWith('/opt/openscience-evals/document-parser/')
    || !expected.endsWith('/source') || actual !== expected) {
    throw new Error('execution requires the dedicated evaluation checkout');
  }
  return actual;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [actualSource, expectedSource] = process.argv.slice(2);
  if (!actualSource || !expectedSource || process.argv.length !== 4) process.exit(64);
  assertDedicatedEvaluationSource(actualSource, expectedSource);
}
