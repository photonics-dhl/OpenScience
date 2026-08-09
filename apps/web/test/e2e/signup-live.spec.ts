import { expect, test } from 'playwright/test';

test('compiled Next signup page completes through the real Fastify auth route', async ({ page }) => {
  const email = `browser-${Date.now()}@example.com`;
  await page.goto('/auth/register?returnTo=%2Fdashboard');
  await page.getByLabel(/display name/i).fill('Browser Researcher');
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^password$/i).fill('Method123');
  await page.getByRole('button', { name: /send verification code/i }).click();

  const codeResponse = await page.request.get(`/api/test/latest-code?email=${encodeURIComponent(email)}`);
  expect(codeResponse.ok()).toBe(true);
  const { code } = await codeResponse.json() as { code: string };
  await page.getByLabel(/verification code/i).fill(code);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  const me = await page.request.get('/api/auth/me');
  expect(me.ok()).toBe(true);
  await expect(me.json()).resolves.toMatchObject({ email, status: 'email_verified' });
});
