import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function source(file) { return readFileSync(path.join(root, file), 'utf8'); }
function load(file, dependencies = {}) {
  const output = ts.transpileModule(source(file), { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual((output.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error), []);
  const module = { exports: {} };
  vm.runInNewContext(output.outputText, { module, exports: module.exports, require: (name) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, URL, DOMException }, { filename: file });
  return module.exports;
}
const policy = load('apps/api/src/routes/journal-draft-policy.ts');
const model = load('apps/web/lib/journal-workbench-model.ts');
const rights = load('apps/web/lib/journal-rights-form.ts');
const article = { id: 'a', revision: 1, contentState: 'active', reviewState: 'draft', jobs: [], releases: [] };
test('draft deletion permits only editable unsubmitted work', () => { assert.equal(policy.draftDeletionBlock({ ...article, releaseCount: 0, activeJobCount: 0 }), null); for (const change of [{ releaseCount: 1 }, { activeJobCount: 1 }, { reviewState: 'submitted' }, { reviewState: 'approved' }, { contentState: 'restricted' }, { contentState: 'withdrawn' }]) assert.equal(typeof policy.draftDeletionBlock({ ...article, releaseCount: 0, activeJobCount: 0, ...change }), 'string'); });
test('archive marker is revision-bound and rejects malformed values', () => { assert.equal(policy.archivedAtRevision({ revision: 2 }, 2), true); for (const item of [null, [], {}, { revision: '2' }, { revision: 1 }]) assert.equal(policy.archivedAtRevision(item, 2), false); });
test('reviewer cannot delete and active jobs block deletion', () => { assert.equal(model.canDeleteDraft(article, 'editor'), true); assert.equal(model.canDeleteDraft(article, 'reviewer'), false); assert.equal(model.canDeleteDraft({ ...article, jobs: [{ state: 'running' }] }, 'owner'), false); });
test('completed and published are independent per-paper views', () => { const done = { ...article, processingCompleted: true, publicInterpretation: false }; assert.equal(model.matchesWorkbenchView(done, 'completed'), true); assert.equal(model.matchesWorkbenchView(done, 'published'), false); assert.equal(model.matchesWorkbenchView({ ...done, publicInterpretation: true }, 'published'), true); });
test('archived drafts stay outside the draft box', () => { assert.equal(model.matchesWorkbenchView({ ...article, draftArchived: true }, 'drafts'), false); assert.equal(model.matchesWorkbenchView({ ...article, draftArchived: true }, 'archived'), true); });
test('unknown OA is not classified as closed access', () => { const items = [{ id: 'a', nameZh: 'A', subjects: ['Optics'], publicArticleCount: 2 }, { id: 'b', nameZh: 'B', subjects: [], publicArticleCount: 1, openAccess: false }]; assert.equal(model.selectDirectory(items, { query: '', subject: '', access: 'closed', sort: 'az' }).length, 1); assert.equal(model.selectDirectory(items, { query: '', subject: '', access: 'unknown', sort: 'az' })[0].id, 'a'); });
test('URL policy rejects script schemes and embedded credentials', () => { assert.equal(model.safePublicUrl('javascript:alert(1)'), null); assert.equal(model.safePublicUrl('https://user:pass@example.com'), null); assert.equal(model.safePublicUrl('https://doi.org/10.1/example'), 'https://doi.org/10.1/example'); });
test('pagination collects all pages without duplicate articles', async () => { const result = await model.collectAllPages(async (cursor) => cursor ? { items: [{ id: 'a' }, { id: 'b' }], nextCursor: null } : { items: [{ id: 'a' }], nextCursor: 'next' }); assert.equal(result.length, 2); });
test('pagination refuses repeated cursors and incomplete totals', async () => { await assert.rejects(() => model.collectAllPages(async () => ({ items: [], nextCursor: 'same' }))); await assert.rejects(() => model.collectAllPages(async () => ({ items: [], nextCursor: 'next' }), { maxPages: 1 })); });
test('status changes do not implicitly grant processing rights', () => { const value = rights.limitPermissions('full_public_processing_allowed', rights.emptySourcePermissions()); assert.equal(Object.values(value).every((item) => item === false), true); });
test('Hermes processing consent does not grant publication', () => { const value = rights.setHermesConsent('full_public_processing_allowed', rights.emptySourcePermissions(), true); assert.equal(value.externalProcessing, true); assert.equal(value.internalProcessing, true); assert.equal(value.publicDerivative, false); assert.equal(value.figureReuse, false); });
test('editing evidence preserves historical expiry', () => { const previous = { statement: 'before', expiresAt: '2026-12-01T00:00:00Z' }; const value = rights.editSourceEvidence(previous, 'new evidence', 'Written permission'); assert.equal(value.expiresAt, previous.expiresAt); assert.throws(() => rights.editSourceEvidence(previous, ' ', 'Written permission')); });
function guardHarness(archived = false, assigned = true) {
  let hook; let touched = 0;
  class JournalError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const guard = load('apps/api/src/routes/journal-draft-guard.ts', {
    '@openscience/domain': { JournalError, journalScope: async () => { touched++; return { membership: { role: assigned ? 'editor' : 'reviewer' } }; }, journalArticleInScope: async () => ({ revision: 2, assignedReviewerId: 'another' }) },
    './session-guard': { requireCurrentUser: async () => ({ userId: 'u' }) }, './journal-draft-policy': policy,
  });
  guard.registerJournalDraftGuard({ addHook: (_name, fn) => { hook = fn; } }, { prisma: { journalEvent: { findFirst: async () => archived ? { after: { revision: 2 } } : null } } });
  const params = { id: '11111111-1111-4111-8111-111111111111', articleId: '22222222-2222-4222-8222-222222222222' };
  return { run: (route, method = 'POST') => hook({ method, routeOptions: { url: route }, params }, { header() { return this; } }), touched: () => touched };
}
test('unmatched Fastify route is harmless (TS18048 regression)', async () => { const h = guardHarness(); await h.run(undefined); assert.equal(h.touched(), 0); });
test('archived work is blocked through legacy writes but can reach restore', async () => { const h = guardHarness(true); await assert.rejects(() => h.run('/journals/:id/articles/:articleId/ai-drafts'), (error) => error.code === 'INVALID_STATE'); await h.run('/journals/:id/articles/:articleId/draft/restore'); });
test('unassigned reviewers are denied before archive inspection', async () => { const h = guardHarness(false, false); await assert.rejects(() => h.run('/journals/:id/articles/:articleId/review'), (error) => error.code === 'JOURNAL_NOT_FOUND'); });
const files = ['apps/api/src/routes/journals.ts', 'apps/api/src/routes/journal-workbench.ts', 'apps/web/lib/journal-workbench-api.ts', 'apps/web/components/landing/SiteHeader.tsx', 'apps/web/components/journals/JournalDirectory.tsx', 'apps/web/components/journals/JournalDirectoryActions.tsx', 'apps/web/components/journals/JournalShareButton.tsx', 'apps/web/components/journals/JournalDoiImport.tsx', 'apps/web/components/journals/JournalGovernance.tsx', 'apps/web/components/journals/JournalManagementWorkbench.tsx', 'apps/web/components/journals/JournalSourceRightsMatrix.tsx', 'apps/web/components/journals/JournalProcessingQueue.tsx', 'apps/web/app/journals/page.tsx', 'apps/web/app/journals/[slug]/page.tsx', 'apps/web/app/journals/manage/[id]/processing/page.tsx'];
test('ported TypeScript and TSX files have no transpilation syntax errors', () => { for (const file of files) { const result = ts.transpileModule(source(file), { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }); assert.equal((result.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0, file); } });
// These tests do not replace full application typechecking, HTTP/DB tests or browser acceptance.
