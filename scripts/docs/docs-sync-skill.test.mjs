import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const skill = readFileSync('.agents/skills/docs-sync/SKILL.md', 'utf8');
const agents = readFileSync('AGENTS.md', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

test('docs-sync resolves the active version before trusting task prose', () => {
  assert.match(skill, /git worktree list --porcelain/);
  assert.match(skill, /git branch --sort=-committerdate/);
  assert.match(skill, /CURRENT handoff/);
  assert.match(skill, /DEPRECATED|NO-GO/);
});

test('docs-sync keeps one compact current truth and demotes stale claims', () => {
  assert.match(skill, /one CURRENT handoff per topic/i);
  assert.match(skill, /active-memory surface/i);
  assert.match(skill, /progress.*latest entry/i);
  assert.match(skill, /do not delete historical files/i);
});

test('docs-sync records a reproducible version tuple before handoff or deploy', () => {
  assert.match(skill, /branch.*HEAD.*release.*rollback/is);
  assert.match(skill, /git status --short/);
  assert.match(skill, /git diff --check/);
});

test('docs-sync uses bounded reads instead of loading history by default', () => {
  assert.match(skill, /first 80 lines/i);
  assert.match(skill, /rg.*CURRENT/i);
  assert.match(skill, /do not copy full test matrices/i);
});

test('project memory rules route sessions through bounded CURRENT reads', () => {
  assert.match(agents, /progress\.md.*first 80 lines/i);
  assert.match(agents, /rg.*CURRENT.*project_index\.md/i);
  assert.match(agents, /branch.*HEAD.*release.*rollback/is);
});

test('canonical lint cannot bypass the docs-sync skill contract', () => {
  assert.match(packageJson.scripts.lint, /audit:docs-sync/);
});
