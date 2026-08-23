import assert from 'node:assert/strict';
import test from 'node:test';

import { validateHermesRendererIndex } from './hermes-renderer-index.mjs';

const current = '| `docs/specs/2026-08-19-hermes-wanko-live2d-design.md` | Wanko | **CURRENT Hermes visual/guide design** |';
const foundation = '| `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` | motion | **IMPLEMENTED FOUNDATION / VISUAL SUPERSEDED** |';
const deprecatedMesh = '| `docs/specs/2026-08-16-hermes-articulated-mesh-pet-design.md` | mesh | **DEPRECATED** |';
const rejected = '| `docs/specs/2026-08-15-hermes-2d-pet-design.md` | old | **DEPRECATED / VISUAL NO-GO** |';

test('accepts Wanko as the only current Hermes design and keeps the companion contract as implemented foundation', () => {
  assert.deepEqual(validateHermesRendererIndex(`${rejected}\n${deprecatedMesh}\n${foundation}\n${current}`), []);
});

test('rejects the deprecated PNG renderer when it is promoted back to current', () => {
  const issues = validateHermesRendererIndex(`${rejected.replace('DEPRECATED / VISUAL NO-GO', 'CURRENT Hermes visual/guide design')}\n${deprecatedMesh}\n${foundation}\n${current}`);
  assert.ok(issues.some((issue) => issue.includes('旧 Hermes renderer')));
  assert.ok(issues.some((issue) => issue.includes('只能有一个')));
});

test('rejects a missing Wanko current design', () => {
  assert.ok(validateHermesRendererIndex(`${rejected}\n${deprecatedMesh}\n${foundation}`).some((issue) => issue.includes('Wanko')));
});

test('rejects the articulated mesh predecessor when it remains current', () => {
  const promotedMesh = deprecatedMesh.replace('DEPRECATED', 'CURRENT Hermes visual/guide design');
  const issues = validateHermesRendererIndex(`${rejected}\n${promotedMesh}\n${foundation}\n${current}`);
  assert.ok(issues.some((issue) => issue.includes('articulated-mesh predecessor')));
  assert.ok(issues.some((issue) => issue.includes('只能有一个')));
});

test('rejects the workspace companion foundation when it is promoted back to current', () => {
  const promotedFoundation = foundation.replace('IMPLEMENTED FOUNDATION / VISUAL SUPERSEDED', 'CURRENT Hermes visual/guide design');
  const issues = validateHermesRendererIndex(`${rejected}\n${deprecatedMesh}\n${promotedFoundation}\n${current}`);
  assert.ok(issues.some((issue) => issue.includes('workspace-companion foundation')));
  assert.ok(issues.some((issue) => issue.includes('只能有一个')));
});
