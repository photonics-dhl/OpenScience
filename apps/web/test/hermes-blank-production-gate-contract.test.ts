import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'test/visual/hermes-blank-ro-production-gate.mjs'), 'utf8');

describe('public blank RO acceptance safety and evidence contract', () => {
  it('pins the production origin, acceptance workspace, and deployed release before installing a session', () => {
    expect(source).toContain("const canonicalOrigin = 'https://openscience.428312321.xyz'");
    expect(source).toContain('OPENSCIENCE_ACCEPTANCE_WORKSPACE_ID');
    expect(source).toContain('OPENSCIENCE_E2E_ADMIN_AUTH');
    expect(source).toContain('OPENSCIENCE_EXPECTED_RELEASE');
    expect(source).toContain('fetch(`${canonicalOrigin}/__release`');
    expect(source).toContain('request.newContext');
    expect(source).not.toContain('headers: { authorization: adminAuth }');
  });

  it('observes interception use and verifies credit, audit, and immutable committed snapshot facts', () => {
    expect(source).not.toContain('const networkInterceptions = 0');
    expect(source).toContain('networkInterceptions += 1');
    expect(source).toContain("browserJson('/api/usage')");
    expect(source).toContain('created.researchObject.workspaceId');
    expect(source).toContain('[data-proposal-evidence]');
    expect(source).toContain('[data-hermes-companion-bubble]');
    expect(source).toContain("action=agent.task.submit");
    expect(source).toContain('`/api/versions/${committed.commit.versionId}`');
  });

  it('records bounded hashes instead of generated field text in metrics', () => {
    expect(source).toContain("createHash('sha256')");
    expect(source).toContain('fieldHashes');
    expect(source).not.toContain('persistedAfterReload,\n    committedVersionId');
  });
});
