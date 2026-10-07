import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './main-entry.mjs';

test('main-module detection resolves real paths and rejects missing entries', () => {
  const modulePath = fileURLToPath(import.meta.url);
  assert.equal(isMainModule(modulePath, modulePath), true);
  assert.equal(isMainModule(`${modulePath}.missing`, modulePath), false);
  assert.equal(isMainModule(undefined, modulePath), false);
});
