import { expect, test } from 'playwright/test';

for (const outcome of ['lost-response', '409', '408', '429', '503', 'before-post'] as const) {
test(`parser recovery preserves only uncertain submitted requests: ${outcome}`, async ({ page }) => {
  const ro = '10000000-0000-4000-8000-000000000001';
  const runId = '50000000-0000-4000-8000-000000000001';
  const run = {
    id: runId, researchObjectId: ro, actorId: 'author', versionId: null, version: 2,
    profile: 'visual-narrative-v1', maxAgentTasks: 9, sourceClaimIds: [], status: 'awaiting_source_review', error: null,
    createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z',
    canRetryGeneration: true, generationRecovery: 'source-parser', chargeableAttempts: 0,
    sourceParsing: { status: 'needs_review', ingestionTaskId: 'source-task', agentTaskId: 'extract-task', unresolvedPageNumbers: [18], providerChargeMayApply: true },
    steps: [{ id: 'source-step', stage: 'source_ingestion', ordinal: 0, status: 'succeeded', ingestionTaskId: 'source-task', agentTaskId: 'extract-task', error: null }],
  };
  const writes: Array<{ key: string; body: unknown }> = [];
  let refreshedAfterLoss = false;
  let holdIdentity = false;
  let identityPending = false;
  let releaseIdentity!: () => void;
  const identityReleased = new Promise<void>(resolve => { releaseIdentity = resolve; });
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') {
      if (holdIdentity) { identityPending = true; await identityReleased; }
      return json({ userId: 'author', platformRole: 'user', status: 'email_verified', level: 'free' });
    }
    if (path === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (path === '/api/workspaces') return json({ workspaces: [{ id: 'workspace', name: 'Research', type: 'team', role: 'author', status: 'active', createdAt: run.createdAt }] });
    if (path === `/api/research-objects/${ro}`) return json({ researchObject: { id: ro, workspaceId: 'workspace', title: 'Source parsing recovery', version: 1, status: 'draft', visibility: 'private', sdf: { core: {}, nodes: [] } } });
    if (path.endsWith('/versions')) return json({ versions: [] });
    if (path.endsWith('/ingestion')) return json({ tasks: [] });
    if (path.endsWith(`/hermes-runs/${runId}`)) {
      if (writes.length || identityPending) refreshedAfterLoss = true;
      return json({ run: { ...run, version: refreshedAfterLoss ? 9 : 2,
        sourceParsing: { ...run.sourceParsing, unresolvedPageNumbers: refreshedAfterLoss ? [18, 19] : [18] } } });
    }
    if (request.method() === 'POST') {
      expect(path).toBe(`/api/research-objects/${ro}/hermes-runs/${runId}/retry-generation`);
      writes.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
      if (writes.length === 1 && outcome !== 'before-post') {
        if (outcome === 'lost-response') return route.abort('failed');
        return json({ error: { code: outcome === '409' ? 'CONCURRENT_UPDATE' : 'TEMPORARY_FAILURE', message: 'Parser recovery response requires another explicit action.' } }, Number(outcome));
      }
      return json({ run: { ...run, version: 10, status: 'running', canRetryGeneration: false, sourceParsing: undefined, generationRecovery: undefined,
        steps: run.steps.map(step => ({ ...step, status: 'running' })) } });
    }
    return json({});
  });
  await page.goto(`/research-objects/${ro}/hermes?run=${runId}`);
  await expect(page.getByText('Source parsing is incomplete', { exact: true })).toBeVisible();
  await expect(page.getByText('Pages awaiting parsing: 18', { exact: true })).toBeVisible();
  await expect(page.getByText(/timed-out attempt may already have incurred charges/)).toBeVisible();
  expect(writes).toHaveLength(0);
  const retry = page.getByRole('button', { name: 'Continue unfinished page parsing', exact: true });
  holdIdentity = outcome === 'before-post';
  await retry.click();
  await expect.poll(() => refreshedAfterLoss, { timeout: 12_000 }).toBe(true);
  // The changed diagnostic proves the new version has reached React before the identity check resumes.
  await expect(page.getByText('Pages awaiting parsing: 18, 19', { exact: true })).toBeVisible();
  if (outcome === 'before-post') {
    expect(writes).toHaveLength(0);
    holdIdentity = false;
    releaseIdentity();
    await expect(page.getByRole('alert')).toBeVisible();
  } else expect(writes).toHaveLength(1);
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect.poll(() => writes.length).toBe(outcome === 'before-post' ? 1 : 2);
  expect(writes[0]!.key).toBeTruthy();
  if (outcome === 'before-post') expect(writes[0]!.body).toEqual({ expectedVersion: 9 });
  else if (outcome === '409') {
    expect(writes[1]!.key).not.toBe(writes[0]!.key);
    expect(writes[1]!.body).toEqual({ expectedVersion: 9 });
  } else {
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[1]!.body).toEqual({ expectedVersion: 2 });
  }
  await expect(retry).toHaveCount(0);
});
}
