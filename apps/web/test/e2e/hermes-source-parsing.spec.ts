import { expect, test } from 'playwright/test';

for (const scenario of [
  { recovery: 'source-composition', outcome: 'lost-response' },
  { recovery: 'source-composition', outcome: '409' },
  { recovery: 'source-review-saved', outcome: 'lost-response' },
  { recovery: 'source-review-independent', outcome: 'lost-response' },
  { recovery: 'source-review-independent', outcome: '409' },
  { recovery: 'source-review-not-submitted', outcome: 'lost-response' },
  { recovery: 'source-review-not-submitted', outcome: '409' },
]) {
test(`${scenario.recovery} preserves the correct operation after ${scenario.outcome}`, async ({ page }) => {
  const ro = '10000000-0000-4000-8000-000000000001';
  const runId = '50000000-0000-4000-8000-000000000001';
  const run = { id: runId, researchObjectId: ro, actorId: 'author', versionId: null, version: 2,
    profile: 'visual-narrative-v1', maxAgentTasks: 9, sourceClaimIds: [], status: 'failed', error: 'review output incomplete',
    createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z',
    canRetryGeneration: true, generationRecovery: scenario.recovery, chargeableAttempts: scenario.recovery === 'source-review-not-submitted' ? 0 : 1,
    steps: [{ id: 'review-step', stage: scenario.recovery === 'source-composition' ? 'source_composition' : 'source_review',
      ordinal: scenario.recovery === 'source-composition' ? 0 : 1, status: 'failed', ingestionTaskId: 'source-task', agentTaskId: 'review-task', error: null }] };
  const writes: Array<{ key: string; body: unknown }> = [];
  let refreshedAfterFailure = false;
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ userId: 'author', email: 'author@example.invalid', displayName: 'Researcher', platformRole: 'user', status: 'email_verified', level: 'free' });
    if (path === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (path === '/api/workspaces') return json({ workspaces: [{ id: 'workspace', name: 'Research', type: 'team', role: 'author', status: 'active', createdAt: run.createdAt }] });
    if (path === `/api/research-objects/${ro}`) return json({ researchObject: { id: ro, workspaceId: 'workspace', title: 'Saved source review', version: 1, status: 'draft', visibility: 'private', sdf: { core: {}, nodes: [] } } });
    if (path.endsWith('/versions')) return json({ versions: [] });
    if (path.endsWith('/ingestion')) return json({ tasks: [] });
    if (path.endsWith(`/hermes-runs/${runId}`)) {
      refreshedAfterFailure ||= writes.length > 0;
      return json({ run: { ...run, version: writes.length ? 9 : 2 } });
    }
    if (request.method() === 'POST') {
      expect(path).toBe(`/api/research-objects/${ro}/hermes-runs/${runId}/retry-generation`);
      writes.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
      if (writes.length === 1) return scenario.outcome === '409'
        ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'The run changed.' } }) })
        : route.abort('failed');
      return json({ run: { ...run, version: 10, status: 'running', canRetryGeneration: false, error: null } });
    }
    return json({});
  });
  await page.goto(`/research-objects/${ro}/hermes?run=${runId}`);
  if (scenario.recovery === 'source-composition') {
    await expect(page.getByText(/already-read source, without parsing it again/)).toBeVisible();
    await expect(page.getByText(/uses 1 platform task credit/)).toBeVisible();
  } else if (scenario.recovery === 'source-review-independent') {
    await expect(page.getByText(/ChatGPT Web 6 Pro/)).toBeVisible();
    await expect(page.getByText(/platform task credits and ChatGPT subscription usage/)).toBeVisible();
  } else if (scenario.recovery === 'source-review-not-submitted') {
    await expect(page.getByText(/Reuses the original platform task credit without another debit/)).toBeVisible();
    await expect(page.getByText(/ChatGPT subscription usage still applies/)).toBeVisible();
  } else {
    await expect(page.getByText(/This adds one charged task/)).toBeVisible();
    await expect(page.getByText(/earlier requests may already have been billed/)).toBeVisible();
  }
  const retry = page.getByRole('button', { name: scenario.recovery === 'source-composition' ? 'Finish the paper summary' : scenario.recovery === 'source-review-not-submitted'
    ? 'Continue independent review' : scenario.recovery === 'source-review-independent'
    ? 'Review independently and continue' : 'Correct saved review and continue', exact: true });
  await retry.click();
  await expect.poll(() => writes.length).toBe(1);
  if (scenario.outcome === '409') await expect.poll(() => refreshedAfterFailure).toBe(true);
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0]!.key).toBeTruthy();
  if (scenario.outcome === '409') {
    expect(writes[1]!.key).not.toBe(writes[0]!.key);
    expect(writes[1]!.body).toEqual({ expectedVersion: 9 });
  } else {
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[1]!.body).toEqual({ expectedVersion: 2 });
  }
  await expect(retry).toHaveCount(0);
});
}

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
      return json({ userId: 'author', email: 'author@example.invalid', displayName: 'Researcher', platformRole: 'user', status: 'email_verified', level: 'free' });
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
