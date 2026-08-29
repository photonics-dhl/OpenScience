import assert from 'node:assert/strict';
import { test } from 'node:test';

test('evaluation archive target is confined to its exact SHA source directory', async () => {
  let buildEvaluationSourceMaterializeCommand;
  try {
    ({ buildEvaluationSourceMaterializeCommand } = await import('./evaluation-source-sync-command.mjs'));
  } catch {
    assert.fail('evaluation source sync command builder is missing');
  }

  const sha = '4eabdf76dd245a64c23d196e14f89469439e0ba6';
  const target = `/opt/openscience-evals/document-parser/${sha}/source`;
  const result = buildEvaluationSourceMaterializeCommand(target, sha);

  assert.equal(result.target, target);
  assert.equal(result.stage, `/opt/openscience-evals/document-parser/${sha}/source.stage`);
  assert.match(result.command, /evaluation-source/);
  assert.equal(result.command.includes('/opt/openscience-releases'), false);
  assert.throws(
    () => buildEvaluationSourceMaterializeCommand(`/opt/openscience-releases/${sha}`, sha),
    /evaluation source target/,
  );
  assert.throws(
    () => buildEvaluationSourceMaterializeCommand('/opt/openscience/source', sha),
    /evaluation source target/,
  );
  assert.throws(
    () => buildEvaluationSourceMaterializeCommand(
      '/opt/openscience-evals/document-parser/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/source',
      sha,
    ),
    /evaluation source target/,
  );
});
