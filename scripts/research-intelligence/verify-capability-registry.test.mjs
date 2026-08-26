import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { verifyCapabilityRegistry } from './verify-capability-registry.mjs';

test('CURRENT registry has complete rows and no credential-shaped values', async () => {
  const markdown = await readFile('docs/runbooks/hermes-capability-registry.md', 'utf8');
  const result = verifyCapabilityRegistry(markdown);

  assert.ok(result.rows >= 20);
  assert.ok(result.capabilities.includes('BGE-M3'));
  assert.ok(result.capabilities.includes('ScanSci PDF'));
  assert.ok(result.capabilities.includes('Semantic Scholar MCP/API'));
});

test('rejects incomplete rows, invalid statuses, and credential-shaped values', () => {
  const header = [
    '| Capability | Purpose | Current state | Auth/cost policy | Runtime/install boundary | Retention gate |',
    '|---|---|---|---|---|---|',
  ].join('\n');

  assert.throws(
    () => verifyCapabilityRegistry(`${header}\n| Demo | Purpose | \`UNKNOWN\` | Auth | Runtime | Gate |`),
    /BAD_STATUS:Demo/,
  );
  assert.throws(
    () => verifyCapabilityRegistry(`${header}\n| Demo | Purpose | \`BLOCKED\` | Auth | Runtime | |`),
    /INCOMPLETE_ROW:Demo/,
  );
  assert.throws(
    () => verifyCapabilityRegistry(`${header}\n| Demo | Purpose | \`BLOCKED\` | s2k-example | Runtime | Gate |`),
    /CREDENTIAL_SHAPED_VALUE/,
  );
});
