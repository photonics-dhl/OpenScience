import { expect, test } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';

const records = [
  {
    publicId: 'OSR-DEMO-000001', title: 'WrightTools · multidimensional spectroscopy',
    url: '/research/OSR-DEMO-000001', latestVersion: 1, publishedAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z', insight: 'Public multidimensional spectroscopy methods and provenance.',
    fields: ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'],
    artifactTypes: ['document'], authors: ['OpenScience Demonstration Catalog'],
  },
  {
    publicId: 'OSR-DEMO-000004', title: 'BSCCM · blood-cell microscopy',
    url: '/research/OSR-DEMO-000004', latestVersion: 1, publishedAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z', insight: 'Microscopy data represented as a provenance-safe demonstration.',
    fields: ['problem', 'insight', 'method'], artifactTypes: ['document'],
    authors: ['OpenScience Demonstration Catalog'],
  },
];

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`public Research Index is readable and filterable at ${viewport.name} width`, async ({ page }) => {
    const requests: URL[] = [];
    await page.setViewportSize(viewport);
    await page.route('**/api/explore**', async (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const filtered = url.searchParams.get('query') === 'microscopy' ? records.slice(1) : records;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: filtered, nextCursor: null }) });
    });

    await page.goto(`${baseUrl}/explore`);
    await expect(page.locator('[data-explore-index="true"]')).toBeVisible();
    await expect(page.getByText('01', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /WrightTools/ })).toHaveAttribute('href', '/research/OSR-DEMO-000001');
    await expect(page.locator('.rounded-card')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await page.screenshot({ path: `test/visual/out/explore-index-${viewport.name}.png`, fullPage: true });

    await page.getByRole('searchbox').fill('microscopy');
    await page.getByRole('button', { name: /apply|应用/i }).click();
    await expect(page.getByRole('link', { name: /BSCCM/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /WrightTools/ })).toHaveCount(0);
    expect(requests.at(-1)?.searchParams.get('query')).toBe('microscopy');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}
