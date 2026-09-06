import { test, expect } from 'playwright/test';

for (const width of [1440, 1280, 1024, 390]) {
  test(`real overview and scoped Hermes at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
    let submitted: { payload: { target: string; context: { researchObjects: Array<{ id: string }> } } } | undefined;
    await page.route('**/api/**', async route => {
      const u = new URL(route.request().url());
      const path = u.pathname;
      let body: unknown = {};
      if (path === '/api/research-objects/ro-overview') body = { researchObject: { id: 'ro-overview', title: 'Optical research', workspaceId: 'ws', version: 3, status: 'draft', visibility: 'private', sdf: { core: { problem: 'A research problem', insight: 'Full mechanism explanation. '.repeat(30), method: 'A numerical method', results: 'Measured results', limitations: 'Fixed optical layers', reproducibility: 'Read the original source' } } } };
      else if (path.endsWith('/versions')) body = { versions: [{ versionId: 'old', versionNo: 1, status: 'published' }, { versionId: 'current', versionNo: 2, status: 'draft' }] };
      else if (path.endsWith('/presentation-assets')) {
        expect(path).toContain('/versions/current/');
        body = { assets: [
          { id: 'approved', researchObjectId: 'ro-overview', versionId: 'current', kind: 'image', status: 'approved', label: 'presentation_not_evidence' },
          { id: 'draft', researchObjectId: 'ro-overview', versionId: 'current', kind: 'image', status: 'draft', label: 'Draft mechanism' },
          { id: 'foreign', researchObjectId: 'other', versionId: 'current', kind: 'image', status: 'approved', label: 'Other research' },
        ] };
      } else if (path.endsWith('/content')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#edf4f4"/></svg>' });
      else if (path === '/api/csrf-token') body = { csrfToken: 'test' };
      else if (path === '/api/agent/sessions') { expect(route.request().postDataJSON().researchObjectId).toBe('ro-overview'); body = { session: { id: 'session' } }; }
      else if (path === '/api/agent/tasks' && route.request().method() === 'POST') {
        submitted = route.request().postDataJSON(); body = { task: { id: 'task', status: 'succeeded', kind: 'workspace.guide', researchObjectId: 'ro-overview', result: { summary: 'Scoped response', nextSteps: [], needsMoreInformation: false } } };
      } else if (path.includes('/tasks')) body = { tasks: [] };
      await route.fulfill({ json: body });
    });
    await page.goto('/research-objects/ro-overview/overview');
    await expect(page.locator('[data-research-overview="ro-overview"]')).toBeVisible();
    await expect(page.locator('[data-overview-asset]')).toHaveCount(1);
    await expect(page.getByAltText('Mechanism illustration')).toHaveAttribute('src', /versions\/current\/presentation-assets\/approved\/content/);
    await expect(page.getByText('From committed version v2; the text may include later edits.')).toBeVisible();
    await expect(page.getByText('presentation_not_evidence')).toHaveCount(0);
    await expect(page.locator('#overview-insight')).toContainText('Full mechanism explanation. '.repeat(30).trim());
    expect(await page.locator('#overview-insight > p').evaluate(e => getComputedStyle(e).webkitLineClamp)).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-hermes-dock-anchor]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-hermes-rig-status="ready"]')).toBeVisible({ timeout: 30000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1280) {
      const mapItems = page.locator('[data-workspace-plane="19"] li');
      await expect(mapItems).toHaveCount(6);
      expect(await mapItems.evaluateAll(items => items.every(item => item.scrollWidth <= item.clientWidth))).toBe(true);
    }
    await page.screenshot({ path: `test/visual/out/research-journey/real-overview-${width}.png`, fullPage: true });
    if (width === 1440) {
      let failContent = true;
      await page.route('**/presentation-assets/approved/content*', async route => {
        if (failContent) { failContent = false; await route.fulfill({ status: 503, body: 'Unavailable' }); }
        else await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
      });
      await page.getByAltText('Mechanism illustration').evaluate(image => { (image as HTMLImageElement).src += '?failure-probe'; });
      await expect(page.locator('[data-overview-asset="approved"] [role="status"]')).toBeVisible();
      await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
      await expect.poll(() => page.getByAltText('Mechanism illustration').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await page.getByTestId('overview-discuss-method').click();
    await page.locator('textarea').fill('Explain the numerical method');
    await page.locator('form').filter({ has: page.locator('textarea') }).locator('button[type="submit"]').click();
    await expect.poll(() => submitted?.payload.target).toBe('sdf-method');
    expect(submitted?.payload.context.researchObjects.map(x => x.id)).toEqual(['ro-overview']);
    await expect(page.getByText('Scoped response')).toBeVisible();
  });
}



test('uncommitted object never requests an invented media version', async ({ page }) => {
  let mediaReads = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { tasks: [] };
    if (path === '/api/research-objects/unversioned') body = { researchObject: { id: 'unversioned', title: 'Uncommitted changes', version: 3, status: 'draft', sdf: { core: { insight: 'Current unsaved narrative' } } } };
    if (path.endsWith('/versions')) body = { versions: [] };
    if (path.endsWith('/presentation-assets')) mediaReads++;
    await route.fulfill({ json: body });
  });
  await page.goto('/research-objects/unversioned/overview');
  await expect(page.locator('[data-research-overview="unversioned"]')).toBeVisible();
  await expect(page.locator('[data-overview-asset]')).toHaveCount(0);
  expect(mediaReads).toBe(0);
});
