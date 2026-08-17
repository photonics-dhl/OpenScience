import assert from 'node:assert/strict';
import test from 'node:test';

import { validateHermesRendererIndex } from './hermes-renderer-index.mjs';

const current = '| `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` | motion | **CURRENT Hermes visual/guide design** |';
const deprecatedMesh = '| `docs/specs/2026-08-16-hermes-articulated-mesh-pet-design.md` | mesh | **DEPRECATED** |';
const rejected = '| `docs/specs/2026-08-15-hermes-2d-pet-design.md` | old | **DEPRECATED / VISUAL NO-GO** |';

test('accepts the workspace companion as the only current Hermes design and keeps both predecessors deprecated', () => {
  assert.deepEqual(validateHermesRendererIndex(`${rejected}\n${deprecatedMesh}\n${current}`), []);
});

test('rejects the deprecated PNG renderer when it is promoted back to current', () => {
  const issues = validateHermesRendererIndex(`${rejected.replace('DEPRECATED / VISUAL NO-GO', 'CURRENT Hermes visual/guide design')}\n${deprecatedMesh}\n${current}`);
  assert.ok(issues.some((issue) => issue.includes('旧 Hermes renderer')));
  assert.ok(issues.some((issue) => issue.includes('只能有一个')));
});

test('rejects a missing workspace companion current design', () => {
  assert.ok(validateHermesRendererIndex(`${rejected}\n${deprecatedMesh}`).some((issue) => issue.includes('workspace-companion')));
});

test('rejects the articulated mesh predecessor when it remains current', () => {
  const promotedMesh = deprecatedMesh.replace('DEPRECATED', 'CURRENT Hermes visual/guide design');
  const issues = validateHermesRendererIndex(`${rejected}\n${promotedMesh}\n${current}`);
  assert.ok(issues.some((issue) => issue.includes('articulated-mesh predecessor')));
  assert.ok(issues.some((issue) => issue.includes('只能有一个')));
});
