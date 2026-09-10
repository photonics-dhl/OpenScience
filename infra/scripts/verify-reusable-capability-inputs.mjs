#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SHA = /^[0-9a-f]{40}$/u;
const MANIFEST_NAME = '.release-inputs.sha256';
const CAPABILITY_PREFIXES = Object.freeze({
  embedding: ['apps/embedding-worker'],
  scansci: ['apps/scansci-mcp'],
});

function fail(message) {
  throw new Error(`capability image reuse rejected: ${message}`);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || values.has(flag)) fail('invalid arguments');
    values.set(flag, value);
  }
  const expected = ['--current-root', '--current-sha', '--previous-root', '--previous-sha', '--capability'];
  if (values.size !== expected.length || expected.some((flag) => !values.has(flag))) fail('invalid arguments');
  return Object.fromEntries(expected.map((flag) => [flag.slice(2), values.get(flag)]));
}

function readManifest(root, expectedSha) {
  if (!SHA.test(expectedSha)) fail('invalid release SHA');
  const manifest = JSON.parse(readFileSync(join(resolve(root), MANIFEST_NAME), 'utf8'));
  if (manifest?.schemaVersion !== 2 || manifest?.sourceSha !== expectedSha || !Array.isArray(manifest?.entries)) {
    fail('release input manifest identity mismatch');
  }
  return manifest;
}

function selectedEntries(manifest, prefixes) {
  const selected = manifest.entries.filter(({ path }) => prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  ));
  if (selected.length === 0) fail('capability inputs are absent from release manifest');
  return selected;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const prefixes = CAPABILITY_PREFIXES[options.capability];
  if (!prefixes) fail('unknown capability');
  const current = readManifest(options['current-root'], options['current-sha']);
  const previous = readManifest(options['previous-root'], options['previous-sha']);
  if (JSON.stringify(selectedEntries(current, prefixes)) !== JSON.stringify(selectedEntries(previous, prefixes))) {
    fail(`${options.capability} build inputs changed`);
  }
  process.stdout.write(`CAPABILITY_INPUTS_UNCHANGED=${options.capability}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'capability image reuse rejected');
  process.exit(1);
}
