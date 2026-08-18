import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const skill = readFileSync('.agents/skills/docs-sync/SKILL.md', 'utf8');
const agents = readFileSync('AGENTS.md', 'utf8');
const handoff = readFileSync('docs/handoff/2026-08-16-hermes-2d-pet-handoff.md', 'utf8');
const progress = readFileSync('docs/progress.md', 'utf8');
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
  assert.match(skill, /progress.*CURRENT progress window/i);
  assert.match(skill, /do not delete historical files/i);
});

test('docs-sync records a reproducible version tuple before handoff or deploy', () => {
  assert.match(skill, /branch.*HEAD.*release.*rollback/is);
  assert.match(skill, /git status --short/);
  assert.match(skill, /git diff --check/);
});

test('docs-sync uses bounded reads instead of loading history by default', () => {
  assert.match(skill, /progress.*120 lines/i);
  assert.match(skill, /rg.*CURRENT/i);
  assert.match(skill, /do not copy full test matrices/i);
});

test('project memory rules route sessions through bounded CURRENT reads', () => {
  assert.match(agents, /CURRENT handoff.*progress\.md/is);
  assert.match(agents, /rg.*CURRENT.*project_index\.md/i);
  assert.match(agents, /branch.*HEAD.*release.*rollback/is);
});

test('canonical lint cannot bypass the docs-sync skill contract', () => {
  assert.match(packageJson.scripts.lint, /audit:docs-sync/);
});

test('active memory documents stay physically bounded', () => {
  assert.ok(progress.split(/\r?\n/).length <= 120, 'docs/progress.md must be a compact CURRENT window');
  assert.ok(Buffer.byteLength(progress) <= 16 * 1024, 'docs/progress.md must stay within 16 KiB');
  assert.ok(handoff.split(/\r?\n/).length <= 80, 'CURRENT handoff must stay within 80 lines');
  assert.ok(Buffer.byteLength(handoff) <= 16 * 1024, 'CURRENT handoff must stay within 16 KiB');
  assert.ok(agents.split(/\r?\n/).length <= 100, 'AGENTS.md must contain durable rules only');
  assert.ok(Buffer.byteLength(agents) <= 16 * 1024, 'AGENTS.md must stay within 16 KiB');
});

test('docs-sync rotates progress history out of the default read path', () => {
  assert.match(skill, /progress.*(?:120 lines|120 行)/i);
  assert.match(skill, /git history|archive/i);
  assert.match(skill, /never default-read|不得默认读取/i);
  assert.doesNotMatch(agents, /progress\.md.*first 80 lines/i);
  assert.match(agents, /CURRENT handoff.*progress\.md/is);
});
