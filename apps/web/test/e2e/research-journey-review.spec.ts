import { test, expect } from 'playwright/test';
import path from 'node:path';

const review = '/_visual/research-journey';
const output = path.resolve('test/visual/out/research-journey');

for (const width of [1440, 390]) {
  test(`connected research prototype at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    const writes: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url());
    });
    await page.goto(review);
    await expect(page.getByTestId('research-journey')).toHaveAttribute('data-view', 'desk');
    await expect(page.getByTestId('journey-wanko')).toHaveCount(1);
    await expect(page.locator('[data-hermes-rig-status="ready"]')).toBeVisible({ timeout: 30000 });
    await page.locator('[data-live2d-instance="wanko"]').evaluate(canvas => canvas.setAttribute('data-test-original-canvas', 'true'));
    await page.getByRole('button', { name: '安静陪伴', exact: true }).click();
    await expect(page.getByTestId('journey-wanko')).toHaveAttribute('data-quiet', 'true');
    await page.getByRole('button', { name: '恢复轻动效', exact: true }).click();
    await expect(page.locator('[data-test-original-canvas="true"]')).toHaveCount(1);
    await expect(page.locator('[data-hermes-rig-status="ready"]')).toBeVisible();
    await expect.poll(() => page.locator('img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(output, `desk-${width}.png`), fullPage: true });
    await page.getByTestId('journey-start').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('journey-start')).toBeFocused();
    await page.getByTestId('journey-start').click();
    await page.getByTestId('journey-use-sample').click();
    await expect(page).toHaveURL(/view=overview/);
    await page.goBack();
    await expect(page.locator('#journey-title')).toBeFocused();
    await page.getByTestId('journey-continue').click();
    await expect(page.locator('#journey-title')).toBeFocused();
    await expect(page).toHaveURL(/view=overview/);
    await page.screenshot({ path: path.join(output, `overview-${width}.png`), fullPage: true });
    await page.getByTestId('journey-evidence').locator('summary').click();
    await expect(page.getByRole('link', { name: '阅读原始论文' })).toHaveAttribute('href', 'https://doi.org/10.1126/science.aat8084');
    await expect(page.getByText('机制演示 · 解释性生成图，不是论文实验图')).toBeVisible();
    await page.getByTestId('journey-play').click();
    await expect(page.locator('video')).toHaveAttribute('src', /animated-restored-v1/);
    await expect(page.locator('video')).not.toHaveAttribute('autoplay', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.getByTestId('journey-play')).toBeFocused();
    await page.getByTestId('journey-open-hermes').click();
    await expect(page).toHaveURL(/view=hermes/);
    await expect(page.locator('[data-test-original-canvas="true"]')).toHaveCount(1);
    if (width < 900) {
      const rect = await page.getByRole('dialog').boundingBox();
      expect(rect?.y).toBe(0);
      expect(rect?.height).toBe(1000);
    }
    await expect(page.getByTestId('journey-wanko')).toHaveCount(1);
    await page.getByTestId('journey-prompt').fill('');
    await page.getByTestId('journey-preview').click();
    await expect(page.getByRole('status')).toHaveText('请输入修改要求，再预览示例。');
    await page.getByTestId('journey-suggestion').click();
    await page.getByTestId('journey-preview').click();
    await expect(page.getByTestId('journey-diff')).toBeVisible();
    await page.getByTestId('journey-prompt').fill('');
    await expect(page.getByTestId('journey-diff')).toHaveCount(0);
    await page.getByTestId('journey-preview').click();
    await expect(page.getByTestId('journey-diff')).toHaveCount(0);
    await page.getByTestId('journey-suggestion').click();
    await page.getByTestId('journey-preview').click();
    await page.screenshot({ path: path.join(output, `hermes-${width}.png`), fullPage: width >= 900 });
    const original = await page.getByTestId('journey-narrative').textContent();
    await page.getByTestId('journey-apply').click();
    await expect(page.getByTestId('journey-narrative')).not.toHaveText(original!);
    await page.getByTestId('journey-undo').click();
    await expect(page.getByTestId('journey-narrative')).toHaveText(original!);
    if (width < 900) {
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('journey-open-hermes')).toBeFocused();
    } else {
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(page.getByTestId('journey-open-hermes')).toBeFocused();
    }
    await page.goBack();
    await expect(page.getByTestId('research-journey')).toHaveAttribute('data-view', 'overview');
    await page.goto(`${review}?view=overview`);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Teaching light to recognize' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}


test('Wanko companion opens the contextual assistant and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(review);
  await page.getByTestId('journey-companion').click();
  await expect(page).toHaveURL(/view=hermes/);
  await expect(page.getByTestId('journey-wanko')).toHaveCount(1);
  await expect(page.getByTestId('journey-wanko')).toHaveAttribute('data-quiet', 'true');
  await expect(page.getByTestId('journey-prompt')).not.toBeEmpty();
});
